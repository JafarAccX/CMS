/**
 * Shared learner provisioning helpers used by auth.service, otp-auth.controller,
 * and any future auto-provisioning path.
 *
 * Having one copy eliminates the subtle drift that existed between auth.service and
 * otp-auth.controller (different password_hash placeholder strings, slightly
 * different username-generation logic, different Membership filter conditions).
 */
import prisma from "../utils/prisma.js";
import type { CrmEnrollmentWithBatch } from "./crm.client.js";

// ── Username allocation ───────────────────────────────────────────────────────

/**
 * Find an unused username by appending an incrementing suffix. Resolves on the
 * first or second iteration in the vast majority of cases.
 */
export async function ensureUniqueUsername(base: string): Promise<string> {
  const sanitized = base.replace(/\s+/g, " ").trim().slice(0, 45) || "user";
  let candidate = sanitized;
  let suffix = 1;
  while (await prisma.user.findUnique({ where: { username: candidate } })) {
    suffix += 1;
    candidate = `${sanitized.slice(0, 40)} ${suffix}`;
  }
  return candidate;
}

// ── User provisioning ─────────────────────────────────────────────────────────

/** CRM customer shape shared across CRM client responses (minimum required fields). */
export interface CrmCustomerMinimal {
  CustId: string;
  Email?: string | null;
  Mobile: string | number;
  FirstName?: string | null;
  LastName?: string | null;
}

/**
 * Find an existing CMS user for a CRM customer (by email then phone), or create a
 * new learner account. The caller is responsible for credential verification.
 *
 * @param passwordHash  Pre-hashed password to use if a new row is created.
 *                      Pass a sentinel like "OTP_MANAGED" or "CRM_MANAGED" for
 *                      passwordless flows.
 */
export async function findOrCreateLearner(
  customer: CrmCustomerMinimal,
  passwordHash: string
) {
  const email = customer.Email?.toLowerCase() ?? null;
  const phone = String(customer.Mobile);

  // Prefer email lookup — phone numbers can change or be shared.
  let user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  if (!user) user = await prisma.user.findFirst({ where: { phone } });
  if (user) return user;

  // Auto-provision a new learner account.
  const fullName =
    [customer.FirstName, customer.LastName].filter(Boolean).join(" ").trim() ||
    (email ? email.split("@")[0] : `learner-${customer.CustId}`);

  const finalEmail = email ?? `cust-${customer.CustId}@crm.local`;
  const username = await ensureUniqueUsername(fullName);

  const created = await prisma.user.create({
    data: {
      email: finalEmail,
      username,
      phone,
      password_hash: passwordHash,
      role: "learner",
      provider: "crm",
    },
  });

  await prisma.subscription.create({
    data: { user_id: created.id, plan: "free", status: "active", started_at: new Date() },
  });

  return created;
}

// ── Batch membership sync ─────────────────────────────────────────────────────

/**
 * Upsert batch memberships for a learner based on their CRM enrollments.
 * Creates the batch (and a default channel) if it doesn't exist in CMS yet.
 * Always runs best-effort — any individual error is logged and skipped.
 */
export async function syncBatchMemberships(
  userId: string,
  enrollments: CrmEnrollmentWithBatch[]
): Promise<void> {
  if (!enrollments.length) return;

  const defaultOrg = await prisma.organization.findFirst();
  const defaultAdmin = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!defaultOrg || !defaultAdmin) {
    console.warn("[provisioning] Cannot sync batches: no default org or admin found");
    return;
  }

  for (const enr of enrollments) {
    const batchName = enr.Batch?.Batch;
    if (!batchName) continue;
    // Only sync active enrollments
    if (enr.Active === false) continue;

    try {
      let batch = await prisma.batch.findFirst({
        where: { name: { equals: batchName, mode: "insensitive" } },
      });

      if (!batch) {
        batch = await prisma.batch.create({
          data: {
            name: batchName,
            type: "private",
            org_id: defaultOrg.id,
            created_by: defaultAdmin.id,
            description: `Auto-synced from CRM (Course: ${enr.Batch?.Course ?? "—"})`,
          },
        });
        await prisma.channel.create({
          data: { batch_id: batch.id, name: "channel1", created_by: defaultAdmin.id },
        });
      }

      await prisma.membership.upsert({
        where: { user_id_batch_id: { user_id: userId, batch_id: batch.id } },
        update: {},
        create: { user_id: userId, batch_id: batch.id, role_in_batch: "member" },
      });
    } catch (err) {
      console.error(`[provisioning] Failed to sync batch "${batchName}" for user ${userId}:`, err);
    }
  }
}
