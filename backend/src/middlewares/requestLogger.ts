import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger.js";
import { incrementCounter, observeHistogram } from "../utils/metrics.js";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const incomingRequestId = req.header("x-request-id");
  const requestId =
    incomingRequestId && incomingRequestId.length <= 128 ? incomingRequestId : crypto.randomUUID();
  const startedAt = Date.now();

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    const statusCode = res.statusCode;
    const labels = {
      method: req.method,
      status: statusCode,
    };

    incrementCounter("http_requests_total", labels);
    observeHistogram("http_request_duration_ms", durationMs, labels);
    logger.info("http_request", {
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode,
      durationMs,
      userId: req.user?.id,
    });
  });

  next();
}
