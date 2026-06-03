import jwt, { type SignOptions } from "jsonwebtoken";
import type { User } from "@prisma/client";

const IS_PROD = process.env.NODE_ENV === "production";
const WEAK_DEFAULTS = new Set(["changeme_access", "changeme_refresh"]);
const MIN_SECRET_LENGTH = 32;

/**
 * Resolve a JWT secret with a fail-fast guard. In production a missing, default,
 * or short (<32 char) secret means tokens could be forged — so we crash on boot
 * rather than run insecurely. In development we warn and fall back so local work
 * isn't blocked.
 */
function resolveSecret(
  name: "JWT_ACCESS_SECRET" | "JWT_REFRESH_SECRET",
  devFallback: string
): string {
  const value = process.env[name];
  const isWeak = !value || WEAK_DEFAULTS.has(value) || value.length < MIN_SECRET_LENGTH;

  if (isWeak) {
    if (IS_PROD) {
      throw new Error(
        `[FATAL] ${name} is missing or weak. Set a strong (>= ${MIN_SECRET_LENGTH} char) random ` +
          `secret in production. Generate one with: ` +
          `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
      );
    }
    console.warn(
      `⚠️  ${name} is missing or weak — using an INSECURE development fallback. Do not deploy like this.`
    );
    return value || devFallback;
  }

  return value;
}

const ACCESS_SECRET = resolveSecret("JWT_ACCESS_SECRET", "changeme_access");
const REFRESH_SECRET = resolveSecret("JWT_REFRESH_SECRET", "changeme_refresh");
const ACCESS_EXPIRES = (process.env.JWT_ACCESS_EXPIRES || "15m") as SignOptions["expiresIn"];
const REFRESH_EXPIRES = (process.env.JWT_REFRESH_EXPIRES || "7d") as SignOptions["expiresIn"];

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

export function generateAccessToken(user: User): string {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role } as JwtPayload,
    ACCESS_SECRET,
    { expiresIn: ACCESS_EXPIRES }
  );
}

export function generateRefreshToken(user: User): string {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role } as JwtPayload,
    REFRESH_SECRET,
    { expiresIn: REFRESH_EXPIRES }
  );
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, ACCESS_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, REFRESH_SECRET) as JwtPayload;
}
