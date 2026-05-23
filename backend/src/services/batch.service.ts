import prisma from "../utils/prisma.js";
import { NotFoundError } from "../utils/errors.js";
import { canAccessBatch } from "../utils/permissions.js";
import type { CreateBatchInput, UpdateBatchInput } from "../validators/index.js";
import { logAdminAction } from "./admin.service.js";

export async function listBatches(user: NonNullable<Express.Request["user"]>) {
  const fullUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

  const isLearner = fullUser.role === "learner";

  const batches = await prisma.batch.findMany({
    where: isLearner
      ? {
          OR: [
            // CRM-synced batches where learner is enrolled
            {
              memberships: { some: { user_id: user.id } },
              description: { startsWith: "Auto-synced from CRM" },
            },
            // General community rooms open to all learners
            { type: "general" },
          ],
        }
      : undefined, // admins/mentors see all
    include: {
      batch_settings: true,
      memberships: { select: { user_id: true, role_in_batch: true } },
      _count: { select: { channels: true, memberships: true } },
    },
    orderBy: { created_at: "asc" },
  });

  return batches.map((batch) => {
    const membership = batch.memberships.find((m) => m.user_id === user.id) || null;
    const hasAccess = canAccessBatch(fullUser, batch, membership as any);
    return {
      ...batch,
      hasAccess,
      userMembership: membership,
    };
  });
}

export async function createBatch(data: CreateBatchInput, actorId: string) {
  let orgId = data.org_id;
  
  if (!orgId) {
    let org = await prisma.organization.findFirst();
    if (!org) {
      org = await prisma.organization.create({ data: { name: "Acme Learning", slug: "acme" } });
    }
    orgId = org.id;
  }

  const batch = await prisma.batch.create({
    data: {
      name: data.name,
      description: data.description,
      type: data.type as any,
      is_paid: data.is_paid ?? (data.type === "paid"),
      org_id: orgId!,
      created_by: actorId,
    },
  });


  await prisma.batchSettings.create({
    data: {
      batch_id: batch.id,
      allow_guests: data.allow_guests ?? false,
      max_members: data.max_members,
    },
  });

  // Auto-create default "channel1" for every new batch
  await prisma.channel.create({
    data: {
      batch_id: batch.id,
      name: "channel1",
      created_by: actorId,
    },
  });

  await logAdminAction(actorId, batch.id, "create_batch", { batchName: data.name });

  return prisma.batch.findUniqueOrThrow({
    where: { id: batch.id },
    include: { batch_settings: true, channels: true },
  });
}

export async function getBatchById(batchId: string, userId?: string) {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: {
      batch_settings: true,
      organization: true,
      _count: { select: { channels: true, memberships: true } },
    },
  });
  if (!batch) throw new NotFoundError("Batch not found");

  // If a user is supplied, attach their access flag + membership for this batch.
  if (userId) {
    const [user, membership] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.membership.findUnique({
        where: { user_id_batch_id: { user_id: userId, batch_id: batchId } },
        select: { user_id: true, role_in_batch: true },
      }),
    ]);
    const hasAccess = user ? canAccessBatch(user, batch, membership as any) : false;
    return { ...batch, hasAccess, userMembership: membership };
  }

  return batch;
}

export async function updateBatch(batchId: string, data: UpdateBatchInput, actorId: string) {
  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch) throw new NotFoundError("Batch not found");

  const { allow_guests, max_members, ...batchData } = data;

  const updated = await prisma.batch.update({
    where: { id: batchId },
    data: batchData,
    include: { batch_settings: true },
  });

  if (allow_guests !== undefined || max_members !== undefined) {
    await prisma.batchSettings.upsert({
      where: { batch_id: batchId },
      update: {
        ...(allow_guests !== undefined && { allow_guests }),
        ...(max_members !== undefined && { max_members }),
      },
      create: {
        batch_id: batchId,
        allow_guests: allow_guests ?? false,
        max_members: max_members ?? null,
      },
    });
  }

  await logAdminAction(actorId, batchId, "update_batch", data);

  return updated;
}

export async function archiveBatch(batchId: string, actorId: string) {
  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch) throw new NotFoundError("Batch not found");

  await prisma.batchSettings.upsert({
    where: { batch_id: batchId },
    update: { is_archived: true },
    create: { batch_id: batchId, is_archived: true },
  });

  await logAdminAction(actorId, batchId, "archive_batch", { batchName: batch.name });

  return { success: true };
}
