import express from "express";
import http from "http";
import cors from "cors";
import cookieParser from "cookie-parser";
import { Server } from "socket.io";
import path from "path";
import fs from "fs";

import { createAdapter } from "@socket.io/redis-adapter";

import routes from "./routes/index.js";
import integrationRoutes from "./routes/integration.routes.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { requestLogger } from "./middlewares/requestLogger.js";
import { initSockets } from "./sockets/index.js";
import { startOutboxRelay } from "./services/outbox.service.js";
import { startDeletedMessagePurgeJob } from "./services/retention.service.js";
import { createAdapterPair } from "./utils/redis.js";

const app = express();
const server = http.createServer(app);

// Trust the reverse proxy (Cloudflare / Vercel / Nginx) so `req.ip` reflects the
// real client IP rather than the proxy's. This is required for accurate per-IP
// rate limiting — without it every request appears to come from one address.
// Configurable via TRUST_PROXY ("1", a hop count, "true", or a subnet); defaults
// to trusting one hop in production.
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy !== undefined) {
  app.set(
    "trust proxy",
    /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy === "true" ? true : trustProxy
  );
} else if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

const envOrigins = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(",").map((o) => o.trim())
  : ["http://localhost:5173"];

const allowedOrigins = Array.from(
  new Set([...envOrigins, "http://localhost:5173", "http://localhost:5174", "http://localhost:5175"])
);

console.log("CLIENT_ORIGIN from env:", process.env.CLIENT_ORIGIN);
console.log("Parsed allowed origins:", allowedOrigins);

// Socket.io
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],

    credentials: true,
  },
});
initSockets(io);
app.set("io", io);

// ── Multi-node Socket.IO via Redis adapter ──────────────────
// Without this, room broadcasts only reach clients on the SAME node. With it,
// broadcasts propagate across all nodes through Redis pub/sub. Falls back to
// single-node mode when Redis is unavailable (e.g. local dev memory cache).
async function setupSocketScaling() {
  const pair = createAdapterPair();
  if (!pair) {
    console.log("ℹ️  Socket.IO single-node mode (no Redis adapter)");
    return;
  }
  const { pub, sub } = pair;
  pub.on("error", (err) => console.warn("⚠️  Redis adapter (pub) error:", err.message));
  sub.on("error", (err) => console.warn("⚠️  Redis adapter (sub) error:", err.message));
  try {
    await Promise.all([pub.connect(), sub.connect()]);
    io.adapter(createAdapter(pub, sub));
    console.log("✅ Socket.IO Redis adapter enabled (multi-node ready)");
  } catch (err) {
    console.warn("⚠️  Redis adapter unavailable — single-node mode:", (err as Error).message);
    pub.disconnect();
    sub.disconnect();
  }
}
void setupSocketScaling();

// ── Transactional outbox relay ──────────────────────────────
// Safety net that re-publishes any real-time event that was committed to the DB
// but not yet emitted (e.g. the process crashed between commit and emit).
startOutboxRelay(io);
startDeletedMessagePurgeJob();

// Middlewares
app.use(requestLogger);
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// Allow the LMS to embed CMS responses in an iframe (Community screen). The
// framed *frontend* HTML is what strictly needs this (served by Vite/nginx),
// but we set it defensively here too — e.g. for framed /uploads — and make sure
// no default X-Frame-Options blocks framing. FRAME_ANCESTORS is a space/comma-
// separated list of allowed LMS origins.
const frameAncestors = (process.env.FRAME_ANCESTORS || "")
  .split(/[\s,]+/)
  .filter(Boolean);
app.use((_req, res, next) => {
  res.removeHeader("X-Frame-Options");
  if (frameAncestors.length) {
    res.setHeader("Content-Security-Policy", `frame-ancestors 'self' ${frameAncestors.join(" ")}`);
  }
  next();
});

// Static file serving for uploads
const uploadDir = process.env.UPLOAD_DIR || "./uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use("/uploads", express.static(path.resolve(uploadDir)));

// Integration Routes (no auth required - uses API key)
app.use("/api/integration", integrationRoutes);

// API Routes
app.use("/api", routes);

// Error Handling (Must be last)
app.use(errorHandler);

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`🚀 Server ready at http://localhost:${PORT}`);
  console.log(`🔌 Socket.io ready`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server");
  server.close(() => {
    console.log("HTTP server closed");
  });
});
