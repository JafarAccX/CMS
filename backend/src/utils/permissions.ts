import type { User, Batch, Membership, BatchSettings } from "@prisma/client";

type BatchWithSettings = Batch & { batch_settings: BatchSettings | null };

/**
 * Check if a user can access a batch.
 * - guest: only general batches with allow_guests = true
 * - learner/mentor: must have a membership row
 * - paid batch: subscription_status must be "active"
 * - admin: always true
 */
export function canAccessBatch(
  user: User,
  batch: BatchWithSettings,
  membership?: Membership | null
): boolean {
  // Admin can access everything
  if (user.role === "admin") return true;

  // Guest: only general batches with allow_guests
  if (user.role === "guest") {
    return batch.type === "general" && (batch.batch_settings?.allow_guests ?? false);
  }

  // Public/General batches are accessible to all registered users
  if (batch.type === "public" || batch.type === "general") {
    return true;
  }

  // Must have membership for private/paid/hidden batches
  if (!membership) return false;

  return true;
}

/**
 * Check if a user can send a message in a batch.
 * - must not be banned
 * - must satisfy canAccessBatch
 * - guest: read-only (always false)
 */
export function canSendMessage(
  user: User,
  batch: BatchWithSettings,
  membership?: Membership | null
): boolean {
  if (user.is_banned) return false;
  if (user.role === "guest") return false;
  if (!canAccessBatch(user, batch, membership)) return false;
  return true;
}

/**
 * Check if user can moderate (admin or moderator role in batch).
 */
export function canModerate(user: User, membership?: Membership | null): boolean {
  if (user.role === "admin") return true;
  if (membership && membership.role_in_batch === "moderator") return true;
  return false;
}

/**
 * Check if user is admin.
 */
export function canAdmin(user: User): boolean {
  return user.role === "admin";
}

/**
 * Check if user can escalate a mod queue item.
 * - moderators and admins can escalate
 * - learners/mentors cannot
 */
export function canEscalate(user: User, membership?: Membership | null): boolean {
  return canModerate(user, membership);
}
