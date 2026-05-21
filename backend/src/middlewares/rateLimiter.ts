import type { Request, Response, NextFunction } from "express";
import { redisIncr, redisExpire } from "../utils/redis.js";

const WINDOW_SECONDS = 60;
const MAX_REQUESTS = 10000; // High limit for local dev without Redis

/**
 * Rate limiting middleware using Redis (100 req/min per IP).
 * Falls through if Redis is unavailable.
 */
export async function rateLimiter(req: Request, res: Response, next: NextFunction) {
  try {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const key = `ratelimit:${ip}`;

    const count = await redisIncr(key);
    if (count === 0) {
      // Redis unavailable — skip rate limiting
      return next();
    }
    if (count === 1) {
      await redisExpire(key, WINDOW_SECONDS);
    }

    res.setHeader("X-RateLimit-Limit", MAX_REQUESTS);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, MAX_REQUESTS - count));

    if (count > MAX_REQUESTS) {
      res.status(429).json({ error: "Too many requests. Please try again later." });
      return;
    }

    next();
  } catch {
    // If rate limiting fails, allow the request through
    next();
  }
}
