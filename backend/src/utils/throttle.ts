import { redisGet, redisSet, redisDel } from "./redis.js";

/**
 * Per-target cooldown used to prevent email / OTP bombing of a single recipient.
 *
 * Returns `true` if the action is allowed (and records the cooldown), or `false`
 * if the target is still cooling down. Backed by Redis (with the in-memory
 * fallback in dev). The get-then-set is not strictly atomic, but for a spam
 * cooldown the worst case is one extra message — acceptable.
 */
export async function consumeCooldown(key: string, ttlSeconds: number): Promise<boolean> {
  const existing = await redisGet(key);
  if (existing) return false;
  await redisSet(key, "1", ttlSeconds);
  return true;
}

/**
 * Clear a cooldown early — e.g. after a send failed, so the user can retry
 * immediately instead of waiting out the window.
 */
export async function clearCooldown(key: string): Promise<void> {
  await redisDel(key);
}
