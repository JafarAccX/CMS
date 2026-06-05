import type { Request, Response, NextFunction } from "express";
import type { UserRole } from "@prisma/client";
import { verifyAccessToken, type JwtPayload } from "../utils/jwt.js";
import { UnauthorizedError, ForbiddenError } from "../utils/errors.js";
import prisma from "../utils/prisma.js";
import { redisGet, redisSet, redisDel } from "../utils/redis.js";

// Cache the user row in Redis for 30 s to avoid a DB lookup on every request.
// The dashboard fires 4 parallel requests on load — this converts 4 DB lookups
// for the same user row into 1 DB lookup + 3 Redis reads (~0.5 ms each).
const AUTH_USER_CACHE_TTL = 30;
export function authUserCacheKey(userId: string) {
  return `auth:user:${userId}`;
}

/** Call after ban or role change so the stale cached row is evicted immediately. */
export async function clearAuthUserCache(userId: string) {
  await redisDel(authUserCacheKey(userId));
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: UserRole;
        username: string;
        is_banned: boolean;
        subscription_status: string;
        provider: string;
      };
    }
  }
}

/**
 * JWT authentication middleware.
 * Reads Bearer token from Authorization header and attaches user to req.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedError("No token provided");
    }

    const token = authHeader.split(" ")[1];
    let payload: JwtPayload;

    try {
      payload = verifyAccessToken(token);
    } catch {
      throw new UnauthorizedError("Invalid or expired token");
    }

    // ── Redis cache check ──────────────────────────────────────────
    const cacheKey = authUserCacheKey(payload.userId);
    const cached = await redisGet(cacheKey);
    if (cached) {
      const cachedUser = JSON.parse(cached) as NonNullable<Request["user"]>;
      if (cachedUser.is_banned) throw new UnauthorizedError("Your account has been banned");
      req.user = cachedUser;
      return next();
    }

    // ── Cache miss: DB lookup ──────────────────────────────────────
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        role: true,
        username: true,
        is_banned: true,
        subscription_status: true,
        provider: true,
      },
    });

    if (!user) {
      throw new UnauthorizedError("User not found");
    }
    if (user.is_banned) {
      throw new UnauthorizedError("Your account has been banned");
    }

    // Cache for next requests (fire-and-forget — don't block the response)
    void redisSet(cacheKey, JSON.stringify(user), AUTH_USER_CACHE_TTL);

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Role-based access control middleware.
 * Returns 403 if req.user.role is not in the allowed roles.
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError("Authentication required"));
    }
    if (!roles.includes(req.user.role as UserRole)) {
      return next(new ForbiddenError("Insufficient permissions"));
    }
    next();
  };
}
