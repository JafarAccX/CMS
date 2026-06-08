import type { User, Batch, Membership, BatchSettings } from "@prisma/client";

type BatchWithSettings = Batch & { batch_settings: BatchSettings | null };

/**
 * Check if a user can access a batch.
 *
 * Access model:
 *   - admin              → always allowed
 *   - guest              → only `general` batches that explicitly allow guests
 *   - public / general   → any registered user
 *   - private / paid / hidden → must hold a Membership row
 *
 * Paid-batch note:
 *   Payment is enforced by the CRM sync — the CRM only provisions a Membership
 *   for learners who are legitimately enrolled (i.e. have paid). The Membership
 *   row IS the proof of payment; no separate in-app subscription_status check is
 *   needed here. If a future in-app paywall is added (e.g. Razorpay gate), add:
 *     if (batch.is_paid && user.subscription_status !== "active") return false;
 *   Do NOT add that check yet — it would immediately lock out all CRM-synced
 *   learners whose subscription_status stays "free" by default.
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

  // Mentors only access restricted batches assigned to them as mentor.
  if (user.role === "mentor") {
    return membership?.role_in_batch === "mentor";
  }

  // private / paid / hidden: membership (CRM-granted or admin-granted) is required.
  // Membership presence is the access credential — see paid-batch note above.
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
