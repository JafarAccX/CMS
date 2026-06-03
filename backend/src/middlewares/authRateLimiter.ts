import type { Request, Response, NextFunction } from "express";
import { redisIncr, redisExpire } from "../utils/redis.js";

interface AuthRateLimitOptions {
  /** Namespace for the Redis keys (e.g. "login", "otp-send"). */
  prefix: string;
  /** Sliding window length in seconds. */
  windowSeconds: number;
  /** Max requests per IP within the window. */
  max: number;
  /**
   * Optional extractor for a per-target key (email/phone/identifier) so a single
   * account can't be brute-forced from many IPs. The per-identifier limit is
   * stricter (half the IP allowance, min 5).
   */
  identifier?: (req: Request) => string | undefined;
}

async function hit(key: string, windowSeconds: number, max: number): Promise<boolean> {
  const count = await redisIncr(key);
  // redisIncr returns 0 only when the store is unavailable → fail open so a cache
  // outage never takes down authentication.
  if (count === 0) return false;
  if (count === 1) await redisExpire(key, windowSeconds);
  return count > max;
}

/**
 * Redis-backed rate limiter for sensitive auth endpoints. Keys by IP and,
 * optionally, by a request-derived identifier. Fails open on any error so it can
 * never lock users out due to an infrastructure problem. Works in local dev via
 * the in-memory Redis fallback.
 */
export function authRateLimiter(opts: AuthRateLimitOptions) {
  const idMax = Math.max(5, Math.ceil(opts.max / 2));

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      const checks: Promise<boolean>[] = [
        hit(`authrl:${opts.prefix}:ip:${ip}`, opts.windowSeconds, opts.max),
      ];

      const rawId = opts.identifier?.(req);
      const id = typeof rawId === "string" ? rawId.trim().toLowerCase() : "";
      if (id) {
        checks.push(hit(`authrl:${opts.prefix}:id:${id}`, opts.windowSeconds, idMax));
      }

      const blocked = (await Promise.all(checks)).some(Boolean);
      if (blocked) {
        res.setHeader("Retry-After", String(opts.windowSeconds));
        res.status(429).json({ error: "Too many attempts. Please wait a moment and try again." });
        return;
      }

      next();
    } catch {
      // Never let the limiter itself break auth.
      next();
    }
  };
}

// ── Common identifier extractors (body is already JSON-parsed at this point) ──
export const byEmail = (req: Request): string | undefined => req.body?.email;

export const byLoginIdentifier = (req: Request): string | undefined =>
  req.body?.identifier ?? req.body?.email ?? req.body?.phoneNumber ?? req.body?.phone;
