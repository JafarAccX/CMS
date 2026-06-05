import { Prisma, type BatchType, type User, type Batch } from "@prisma/client";
import prisma from "../utils/prisma.js";
import { ConflictError } from "../utils/errors.js";
import { redisDelIfValue, redisSetNx } from "../utils/redis.js";
import {
  getBatchStudents,
  listCrmBatchMentorAssignments,
  listCrmBatches,
  listCrmMentors,
  type CrmBatch,
  type CrmBatchStudent,
  type CrmMentor,
} from "./crm.client.js";

const CRM_MANAGED_PASSWORD = "CRM_MANAGED";
const CRM_SYNC_LOCK_KEY = "lock:admin:sync-crm";
const CRM_SYNC_LOCK_TTL_SECONDS = 30 * 60;

export type CrmSyncResult = {
  batches: { created: number; updated: number; skipped: number };
  students: { created: number; updated: number; memberships: number };
  mentors: { created: number; updated: number; memberships: number };
  errors: string[];
};

type BatchSyncContext = {
  orgId: string;
  actorId: string;
};

export async function syncCrmBatchesAndPeople(actorId: string): Promise<CrmSyncResult> {
  const lockToken = `${actorId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const lockAcquired = await redisSetNx(CRM_SYNC_LOCK_KEY, lockToken, CRM_SYNC_LOCK_TTL_SECONDS);
  if (!lockAcquired) {
    throw new ConflictError("CRM sync is already running");
  }

  try {
    return await runCrmBatchesAndPeopleSync(actorId);
  } finally {
    await redisDelIfValue(CRM_SYNC_LOCK_KEY, lockToken);
  }
}

async function runCrmBatchesAndPeopleSync(actorId: string): Promise<CrmSyncResult> {
  const result: CrmSyncResult = {
    batches: { created: 0, updated: 0, skipped: 0 },
    students: { created: 0, updated: 0, memberships: 0 },
    mentors: { created: 0, updated: 0, memberships: 0 },
    errors: [],
  };

  const context = await getSyncContext(actorId);

  const [crmBatches, crmMentors, crmAssignments] = await Promise.all([
    listCrmBatches(),
    listCrmMentors(),
    listCrmBatchMentorAssignments(),
  ]);

  // Sync all batches concurrently (8 at a time) — each does 3-5 DB queries
  // so serial iteration was the main wall-time bottleneck for large CRM orgs.
  // JS is single-threaded so result counter increments are safe across workers.
  const batchByCrmId = new Map<string, Batch>();
  await mapWithConcurrency(crmBatches, 8, async (crmBatch) => {
    try {
      if (crmBatch.Deleted === true) {
        result.batches.skipped += 1;
        return;
      }
      const syncedBatch = await syncBatch(crmBatch, context, result);
      if (syncedBatch && crmBatch.Id) {
        batchByCrmId.set(crmBatch.Id, syncedBatch);
      }
    } catch (err) {
      result.batches.skipped += 1;
      result.errors.push(`Batch ${crmBatch.Id || crmBatch.Batch || "unknown"}: ${(err as Error).message}`);
    }
  });

  await mapWithConcurrency(crmBatches, 12, async (crmBatch) => {
    const cmsBatch = crmBatch.Id ? batchByCrmId.get(crmBatch.Id) : null;
    if (!cmsBatch) return;

    try {
      const students = await getBatchStudents(crmBatch.Id);
      await mapWithConcurrency(students, 10, async (student) => {
        try {
          const { user, created, updated } = await syncStudent(student);
          if (created) result.students.created += 1;
          if (updated) result.students.updated += 1;
          if (await ensureMembership(user.id, cmsBatch.id, "member")) {
            result.students.memberships += 1;
          }
        } catch (err) {
          result.errors.push(`Student in ${crmBatch.Batch || crmBatch.Id}: ${(err as Error).message}`);
        }
      });
    } catch (err) {
      result.errors.push(`Students for ${crmBatch.Batch || crmBatch.Id}: ${(err as Error).message}`);
    }
  });

  // Sync mentors concurrently (10 at a time).
  const mentorByCrmId = new Map<string, User>();
  await mapWithConcurrency(crmMentors, 10, async (crmMentor) => {
    try {
      if (crmMentor.Active === false) return;
      const { user, created, updated } = await syncMentor(crmMentor);
      if (created) result.mentors.created += 1;
      if (updated) result.mentors.updated += 1;
      mentorByCrmId.set(crmMentor.Id, user);
    } catch (err) {
      result.errors.push(`Mentor ${crmMentor.Id || crmMentor.Email || "unknown"}: ${(err as Error).message}`);
    }
  });

  // Wire mentor assignments concurrently (10 at a time).
  await mapWithConcurrency(crmAssignments, 10, async (assignment) => {
    try {
      if (assignment.Active === false || assignment.Deleted === true) return;
      const batch = batchByCrmId.get(assignment.BatchId);
      const mentor = mentorByCrmId.get(assignment.MentorId);
      if (!batch || !mentor) return;
      if (await ensureMembership(mentor.id, batch.id, "mentor", true)) {
        result.mentors.memberships += 1;
      }
    } catch (err) {
      result.errors.push(`Mentor assignment ${assignment.Id || "unknown"}: ${(err as Error).message}`);
    }
  });

  await prisma.adminLog.create({
    data: {
      actor_id: actorId,
      target_id: null,
      action_type: "sync_crm",
      metadata: result,
    },
  });

  return result;
}

async function getSyncContext(actorId: string): Promise<BatchSyncContext> {
  const actor = await prisma.user.findUnique({ where: { id: actorId } });
  if (!actor) throw new Error("Admin user not found");

  let org = await prisma.organization.findFirst({ orderBy: { created_at: "asc" } });
  if (!org) {
    org = await prisma.organization.create({
      data: { name: "Acme Learning", slug: "acme" },
    });
  }

  return { actorId: actor.id, orgId: org.id };
}

async function syncBatch(
  crmBatch: CrmBatch,
  context: BatchSyncContext,
  result: CrmSyncResult
): Promise<Batch | null> {
  const crmBatchId = asString(crmBatch.Id);
  const name = asString(crmBatch.Batch);
  if (!crmBatchId || !name) {
    result.batches.skipped += 1;
    return null;
  }

  const mapped = mapBatchType(crmBatch);
  let batch = await prisma.batch.findUnique({ where: { crm_batch_id: crmBatchId } });

  if (!batch) {
    batch = await prisma.batch.findFirst({
      where: {
        crm_batch_id: null,
        name: { equals: name, mode: "insensitive" },
      },
    });
  }

  const metadata = {
    name,
    type: mapped.type,
    is_paid: mapped.isPaid,
    crm_batch_id: crmBatchId,
    crm_course: nullishString(crmBatch.Course),
    crm_course_id: nullishString(crmBatch.CourseId),
    crm_start_date: parseCrmDate(crmBatch.StartDate),
    crm_end_date: parseCrmDate(crmBatch.EndDate),
    crm_active: crmBatch.Active ?? null,
    crm_deleted: crmBatch.Deleted ?? null,
    crm_batch_type: nullishString(crmBatch.BatchType),
    crm_image: nullishString(crmBatch.Image),
    crm_last_synced_at: new Date(),
  };

  if (batch) {
    const updated = await prisma.batch.update({
      where: { id: batch.id },
      data: metadata,
    });
    await ensureBatchDefaults(updated.id, context.actorId);
    result.batches.updated += 1;
    return updated;
  }

  const created = await prisma.batch.create({
    data: {
      ...metadata,
      org_id: context.orgId,
      created_by: context.actorId,
      description: `Auto-synced from CRM${crmBatch.Course ? ` (Course: ${crmBatch.Course})` : ""}`,
    },
  });
  await ensureBatchDefaults(created.id, context.actorId);
  result.batches.created += 1;
  return created;
}

async function syncStudent(student: CrmBatchStudent): Promise<{ user: User; created: boolean; updated: boolean }> {
  const crmCustomerId = asString(student.CustId);
  if (!crmCustomerId) throw new Error("missing CustId");

  const email = normalizeEmail(student.Email) ?? `cust-${crmCustomerId}@crm.local`;
  const phone = student.Mobile ? String(student.Mobile) : null;
  const usernameBase =
    [student.FirstName, student.LastName].filter(Boolean).join(" ").trim() ||
    email.split("@")[0] ||
    `learner-${crmCustomerId}`;

  let user = await findUserByCrmOrContact({ crmCustomerId, email, phone });

  if (!user) {
    try {
      user = await createStudentUser({
        email,
        usernameBase,
        phone,
        avatarUrl: nullishString(student.ProfilePicture),
        crmCustomerId,
      });
      await ensureSubscription(user.id);
      return { user, created: true, updated: false };
    } catch (err) {
      if (!isUniqueConstraintError(err)) throw err;
      user = await findUserByCrmOrContact({ crmCustomerId, email, phone });
      if (!user) throw err;
    }
  }

  const data: Partial<User> = {
    provider: "crm",
    crm_customer_id: user.crm_customer_id ?? crmCustomerId,
  };
  if (user.role === "guest") data.role = "learner";
  if (!user.phone && phone) data.phone = phone;
  if (!user.avatar_url && student.ProfilePicture) data.avatar_url = student.ProfilePicture;
  if (user.email !== email && (await isEmailAvailableForUser(email, user.id))) data.email = email;

  const updated = await updateUserIfChanged(user, data);
  await ensureSubscription(updated.id);
  return { user: updated, created: false, updated: updated.updated_at.getTime() !== user.updated_at.getTime() };
}

async function syncMentor(crmMentor: CrmMentor): Promise<{ user: User; created: boolean; updated: boolean }> {
  const crmMentorId = asString(crmMentor.Id);
  const email = normalizeEmail(crmMentor.Email);
  if (!crmMentorId) throw new Error("missing Id");
  if (!email) throw new Error("missing Email");

  const usernameBase = asString(crmMentor.Name) || email.split("@")[0];
  const phone = crmMentor.Mobile ? String(crmMentor.Mobile) : null;
  const bio = [
    nullishString(crmMentor.Designation),
    nullishString(crmMentor.Education),
    nullishString(crmMentor.AdditionalInfo),
  ].filter(Boolean).join(" | ") || null;

  let user =
    (await prisma.user.findUnique({ where: { crm_mentor_id: crmMentorId } })) ??
    (await prisma.user.findUnique({ where: { email } }));

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        username: await ensureUniqueUsername(usernameBase),
        phone,
        bio,
        password_hash: CRM_MANAGED_PASSWORD,
        role: "mentor",
        provider: "crm",
        crm_mentor_id: crmMentorId,
      },
    });
    await ensureSubscription(user.id);
    return { user, created: true, updated: false };
  }

  const data: Partial<User> = {
    provider: "crm",
    crm_mentor_id: user.crm_mentor_id ?? crmMentorId,
  };
  if (user.role !== "admin") data.role = "mentor";
  if (!user.phone && phone) data.phone = phone;
  if (!user.bio && bio) data.bio = bio;

  const updated = await updateUserIfChanged(user, data);
  await ensureSubscription(updated.id);
  return { user: updated, created: false, updated: updated.updated_at.getTime() !== user.updated_at.getTime() };
}

async function ensureBatchDefaults(batchId: string, actorId: string) {
  await prisma.batchSettings.upsert({
    where: { batch_id: batchId },
    update: {},
    create: { batch_id: batchId, allow_guests: false },
  });

  const existingChannel = await prisma.channel.findFirst({ where: { batch_id: batchId } });
  if (!existingChannel) {
    await prisma.channel.create({
      data: { batch_id: batchId, name: "channel1", created_by: actorId },
    });
  }
}

async function ensureMembership(
  userId: string,
  batchId: string,
  role: "member" | "mentor",
  promote = false
) {
  const existing = await prisma.membership.findUnique({
    where: { user_id_batch_id: { user_id: userId, batch_id: batchId } },
  });

  if (!existing) {
    await prisma.membership.create({
      data: { user_id: userId, batch_id: batchId, role_in_batch: role },
    });
    return true;
  }

  if (promote && existing.role_in_batch !== role) {
    await prisma.membership.update({
      where: { id: existing.id },
      data: { role_in_batch: role },
    });
    return true;
  }

  return false;
}

async function ensureSubscription(userId: string) {
  try {
    await prisma.subscription.upsert({
      where: { user_id: userId },
      update: {},
      create: { user_id: userId, plan: "free", status: "active", started_at: new Date() },
    });
  } catch (err) {
    if (!isUniqueConstraintError(err)) throw err;
  }
}

async function findUserByCrmOrContact({
  crmCustomerId,
  email,
  phone,
}: {
  crmCustomerId: string;
  email: string;
  phone: string | null;
}) {
  // Fire all three lookups in parallel — they are independent DB reads.
  // Previously they ran sequentially, wasting 2 round-trips even when the
  // first lookup was a hit.
  const [byCrm, byEmail, byPhone] = await Promise.all([
    prisma.user.findUnique({ where: { crm_customer_id: crmCustomerId } }),
    prisma.user.findUnique({ where: { email } }),
    phone ? prisma.user.findFirst({ where: { phone } }) : null,
  ]);
  return byCrm ?? byEmail ?? byPhone ?? null;
}

async function createStudentUser({
  email,
  usernameBase,
  phone,
  avatarUrl,
  crmCustomerId,
}: {
  email: string;
  usernameBase: string;
  phone: string | null;
  avatarUrl: string | null;
  crmCustomerId: string;
}) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const usernameSeed = attempt === 0 ? usernameBase : `${usernameBase} ${attempt + 1}`;
    try {
      return await prisma.user.create({
        data: {
          email,
          username: await ensureUniqueUsername(usernameSeed),
          phone,
          avatar_url: avatarUrl,
          password_hash: CRM_MANAGED_PASSWORD,
          role: "learner",
          provider: "crm",
          crm_customer_id: crmCustomerId,
        },
      });
    } catch (err) {
      if (!isUniqueConstraintError(err) || !uniqueTargetIncludes(err, "username")) {
        throw err;
      }
    }
  }

  return prisma.user.create({
    data: {
      email,
      username: await ensureUniqueUsername(`${usernameBase} ${crmCustomerId.slice(0, 8)}`),
      phone,
      avatar_url: avatarUrl,
      password_hash: CRM_MANAGED_PASSWORD,
      role: "learner",
      provider: "crm",
      crm_customer_id: crmCustomerId,
    },
  });
}

async function updateUserIfChanged(user: User, data: Partial<User>) {
  const changed = Object.entries(data).some(([key, value]) => user[key as keyof User] !== value);
  if (!changed) return user;
  return prisma.user.update({ where: { id: user.id }, data });
}

async function isEmailAvailableForUser(email: string, userId: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  return !existing || existing.id === userId;
}

async function ensureUniqueUsername(base: string): Promise<string> {
  const sanitized = base.replace(/\s+/g, " ").trim().slice(0, 45) || "user";
  let candidate = sanitized;
  let suffix = 1;

  while (await prisma.user.findUnique({ where: { username: candidate } })) {
    suffix += 1;
    candidate = `${sanitized.slice(0, 40)} ${suffix}`;
  }

  return candidate;
}

function mapBatchType(crmBatch: CrmBatch): { type: BatchType; isPaid: boolean } {
  const crmType = asString(crmBatch.BatchType).toUpperCase();
  if (crmType === "FREE" || crmBatch.IsFree === true) return { type: "public", isPaid: false };
  if (crmType === "TEST") return { type: "hidden", isPaid: false };
  return { type: "private", isPaid: true };
}

function parseCrmDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeEmail(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function nullishString(value: unknown) {
  const str = asString(value);
  return str || null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function isUniqueConstraintError(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function uniqueTargetIncludes(err: unknown, field: string) {
  if (!isUniqueConstraintError(err)) return false;
  const target = err.meta?.target;
  return Array.isArray(target) && target.includes(field);
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await worker(current);
    }
  });

  await Promise.all(workers);
}
