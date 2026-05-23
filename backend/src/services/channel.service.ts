import prisma from "../utils/prisma.js";
import { NotFoundError, ForbiddenError } from "../utils/errors.js";
import { canAccessBatch } from "../utils/permissions.js";
import { logAdminAction } from "./admin.service.js";

/**
 * Permission helpers for channel operations.
 *
 * - admin                       → full control
 * - batch_moderator             → can create + rename channels in batches they moderate
 * - others                      → read-only
 */
async function getActor(userId: string) {
  return prisma.user.findUniqueOrThrow({ where: { id: userId } });
}

async function getMembership(userId: string, batchId: string) {
  return prisma.membership.findUnique({
    where: { user_id_batch_id: { user_id: userId, batch_id: batchId } },
  });
}

function isAdmin(user: { role: string }) {
  return user.role === "admin";
}

function isBatchModerator(user: { role: string }, membership: { role_in_batch: string } | null) {
  return user.role === "batch_moderator" || membership?.role_in_batch === "moderator";
}

/**
 * List channels in a batch the user has access to.
 */
export async function listChannels(batchId: string, userId: string) {
  const [user, batch, membership] = await Promise.all([
    getActor(userId),
    prisma.batch.findUniqueOrThrow({
      where: { id: batchId },
      include: { batch_settings: true },
    }),
    getMembership(userId, batchId),
  ]);

  if (!canAccessBatch(user, batch, membership)) {
    throw new ForbiddenError("You do not have access to this batch");
  }

  return prisma.channel.findMany({
    where: { batch_id: batchId },
    orderBy: [{ is_pinned: "desc" }, { created_at: "asc" }],
    include: {
      _count: { select: { messages: true } },
    },
  });
}

/**
 * Get a single channel (with batch access check).
 */
export async function getChannel(channelId: string, userId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: { batch: { include: { batch_settings: true } } },
  });
  if (!channel) throw new NotFoundError("Channel not found");

  const [user, membership] = await Promise.all([
    getActor(userId),
    getMembership(userId, channel.batch_id),
  ]);

  if (!canAccessBatch(user, channel.batch, membership)) {
    throw new ForbiddenError("You do not have access to this channel");
  }

  return channel;
}

/**
 * Create a channel. Allowed: admin, batch_moderator (in their batch).
 */
export async function createChannel(batchId: string, name: string, actorId: string) {
  const [user, membership] = await Promise.all([
    getActor(actorId),
    getMembership(actorId, batchId),
  ]);

  if (!isAdmin(user) && !isBatchModerator(user, membership)) {
    throw new ForbiddenError("Only admins and batch moderators can create channels");
  }

  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch) throw new NotFoundError("Batch not found");

  const channel = await prisma.channel.create({
    data: {
      batch_id: batchId,
      name: name.trim(),
      created_by: actorId,
    },
  });

  await logAdminAction(actorId, channel.id, "create_channel", { batchId, name });
  return channel;
}

/**
 * Rename a channel. Allowed: admin, batch_moderator.
 */
export async function renameChannel(channelId: string, newName: string, actorId: string) {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) throw new NotFoundError("Channel not found");

  const [user, membership] = await Promise.all([
    getActor(actorId),
    getMembership(actorId, channel.batch_id),
  ]);

  if (!isAdmin(user) && !isBatchModerator(user, membership)) {
    throw new ForbiddenError("Only admins and batch moderators can rename channels");
  }

  const updated = await prisma.channel.update({
    where: { id: channelId },
    data: { name: newName.trim() },
  });

  await logAdminAction(actorId, channelId, "rename_channel", {
    oldName: channel.name,
    newName,
  });
  return updated;
}

/**
 * Delete a channel. Admin only.
 */
export async function deleteChannel(channelId: string, actorId: string) {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) throw new NotFoundError("Channel not found");

  const user = await getActor(actorId);
  if (!isAdmin(user)) {
    throw new ForbiddenError("Only admins can delete channels");
  }

  // Cascade delete via Prisma (channel → messages, pinned, mod_queue)
  await prisma.channel.delete({ where: { id: channelId } });

  await logAdminAction(actorId, channelId, "delete_channel", {
    batchId: channel.batch_id,
    name: channel.name,
  });
  return { success: true };
}

/**
 * Toggle pin status on a channel. Admin only.
 */
export async function toggleChannelPin(channelId: string, actorId: string) {
  const user = await getActor(actorId);
  if (!isAdmin(user)) {
    throw new ForbiddenError("Only admins can pin channels");
  }

  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) throw new NotFoundError("Channel not found");

  const updated = await prisma.channel.update({
    where: { id: channelId },
    data: { is_pinned: !channel.is_pinned },
  });

  await logAdminAction(
    actorId,
    channelId,
    updated.is_pinned ? "pin_channel" : "unpin_channel",
    { name: channel.name }
  );
  return updated;
}

/**
 * Toggle pin status on a batch. Admin only.
 */
export async function toggleBatchPin(batchId: string, actorId: string) {
  const user = await getActor(actorId);
  if (!isAdmin(user)) {
    throw new ForbiddenError("Only admins can pin batches");
  }

  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch) throw new NotFoundError("Batch not found");

  const updated = await prisma.batch.update({
    where: { id: batchId },
    data: { is_pinned: !batch.is_pinned },
  });

  await logAdminAction(
    actorId,
    batchId,
    updated.is_pinned ? "pin_batch" : "unpin_batch",
    { name: batch.name }
  );
  return updated;
}

/**
 * List pinned batches and pinned channels visible to the given user.
 * Used by the dashboard's "Active rooms" section.
 *
 * Visibility rules:
 *   - admin sees all pinned items
 *   - everyone else sees pinned items in batches they're a member of OR general batches
 */
export async function listPinnedForUser(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const isAdminUser = user.role === "admin";

  // ── Pinned batches the user can see ────────────────────────
  const batchAccessFilter = isAdminUser
    ? {}
    : {
        OR: [
          { memberships: { some: { user_id: userId } } },
          { type: "general" as const },
        ],
      };

  const pinnedBatchesRaw = await prisma.batch.findMany({
    where: { is_pinned: true, ...batchAccessFilter },
    include: {
      batch_settings: true,
      _count: { select: { channels: true, memberships: true } },
      memberships: {
        where: { user_id: userId },
        select: { user_id: true, role_in_batch: true },
      },
    },
    orderBy: { created_at: "asc" },
  });

  const pinnedBatches = pinnedBatchesRaw.map((b) => {
    const userMembership = b.memberships[0] || null;
    const { memberships, ...rest } = b;
    return { ...rest, hasAccess: true, userMembership };
  });

  // ── Pinned channels the user can see (skip channels whose batch
  //    is already in pinnedBatches to avoid visual duplication) ─
  const pinnedBatchIds = new Set(pinnedBatches.map((b) => b.id));

  const pinnedChannels = await prisma.channel.findMany({
    where: {
      is_pinned: true,
      batch: {
        is_pinned: false, // batch's own pin would already surface it
        ...(isAdminUser
          ? {}
          : {
              OR: [
                { memberships: { some: { user_id: userId } } },
                { type: "general" as const },
              ],
            }),
      },
    },
    include: {
      _count: { select: { messages: true } },
      batch: { select: { id: true, name: true, type: true } },
    },
    orderBy: { created_at: "asc" },
  });

  // Defensive: drop any channels whose batch ended up in pinnedBatches anyway
  const filteredPinnedChannels = pinnedChannels.filter(
    (c) => !pinnedBatchIds.has(c.batch.id)
  );

  return {
    pinnedBatches,
    pinnedChannels: filteredPinnedChannels,
  };
}
