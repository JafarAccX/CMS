import crypto from "crypto";
import prisma from "../utils/prisma.js";
import { UnauthorizedError } from "../utils/errors.js";

const REFRESH_TOKEN_BYTES = 48;
const REFRESH_TTL_DAYS = 7;

export interface SessionMeta {
  userAgent?: string | null;
  ip?: string | null;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function refreshExpiry(): Date {
  return new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Create a new refresh session and return the raw (unhashed) token to set in the
 * cookie. Only the SHA-256 hash is stored, so a DB leak can't reuse tokens.
 */
export async function createRefreshSession(userId: string, meta: SessionMeta = {}): Promise<string> {
  const raw = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
  await prisma.refreshToken.create({
    data: {
      user_id: userId,
      token_hash: hashToken(raw),
      expires_at: refreshExpiry(),
      user_agent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
    },
  });
  return raw;
}

export interface RotateResult {
  userId: string;
  refreshToken: string;
}

/**
 * Validate and rotate a refresh token: the presented token is revoked and a fresh
 * one is issued (rotation). If a token that was already rotated/revoked is
 * presented again, that's a replay (likely theft) — every session for the user is
 * revoked as a defensive response.
 */
export async function rotateRefreshSession(rawToken: string, meta: SessionMeta = {}): Promise<RotateResult> {
  const tokenHash = hashToken(rawToken);
  const existing = await prisma.refreshToken.findUnique({ where: { token_hash: tokenHash } });

  if (!existing) {
    throw new UnauthorizedError("Invalid refresh token");
  }

  if (existing.revoked_at) {
    // Reuse of a revoked token → assume compromise and kill all sessions.
    await revokeAllUserSessions(existing.user_id);
    throw new UnauthorizedError("Refresh token has already been used");
  }

  if (existing.expires_at.getTime() < Date.now()) {
    await prisma.refreshToken.update({ where: { id: existing.id }, data: { revoked_at: new Date() } });
    throw new UnauthorizedError("Refresh token expired");
  }

  const raw = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
  const replacement = await prisma.refreshToken.create({
    data: {
      user_id: existing.user_id,
      token_hash: hashToken(raw),
      expires_at: refreshExpiry(),
      user_agent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
    },
  });
  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revoked_at: new Date(), replaced_by: replacement.id },
  });

  return { userId: existing.user_id, refreshToken: raw };
}

/** Revoke a single session (logout). No-op if the token is unknown/already revoked. */
export async function revokeRefreshSession(rawToken: string | undefined | null): Promise<void> {
  if (!rawToken) return;
  await prisma.refreshToken.updateMany({
    where: { token_hash: hashToken(rawToken), revoked_at: null },
    data: { revoked_at: new Date() },
  });
}

/** Revoke every active session for a user (password reset, ban, "log out everywhere"). */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { user_id: userId, revoked_at: null },
    data: { revoked_at: new Date() },
  });
}
