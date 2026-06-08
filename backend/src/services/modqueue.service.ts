import prisma from "../utils/prisma.js";
import { NotFoundError, ForbiddenError } from "../utils/errors.js";
import { canModerate, canEscalate } from "../utils/permissions.js";
import { logAdminAction } from "./admin.service.js";

/**
 * List mod-queue items. Optional filters by channel or batch.
 */
export async function listModQueue(filters?: { channelId?: string; batchId?: string }, userId?: string, userRole?: string) {
  const assignedMentorBatchIds = userRole === "mentor" && userId
    ? (await prisma.membership.findMany({
        where: { user_id: userId, role_in_batch: "mentor" },
        select: { batch_id: true },
      })).map((membership) => membership.batch_id)
    : null;
  const scopedBatchId = assignedMentorBatchIds
    ? filters?.batchId
      ? assignedMentorBatchIds.filter((batchId) => batchId === filters.batchId)
      : assignedMentorBatchIds
    : null;

  return prisma.modQueue.findMany({
    where: {
      ...(filters?.channelId && { channel_id: filters.channelId }),
      ...((filters?.batchId || scopedBatchId) && {
        channel: {
          batch_id: scopedBatchId ? { in: scopedBatchId } : filters!.batchId,
        },
      }),
    },
    include: {
      message: {
        include: { sender: { select: { id: true, username: true } } },
      },
      reporter: { select: { id: true, username: true } },
      reviewer: { select: { id: true, username: true } },
      channel: {
        select: {
          id: true,
          name: true,
          batch: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [
      { priority: "desc" },
      { created_at: "desc" },
    ],
  });
}

export async function updateModQueueItem(
  queueId: string,
  userId: string,
  status: "pending" | "resolved" | "escalated",
  notes?: string
) {
  const queueItem = await prisma.modQueue.findUnique({
    where: { id: queueId },
    include: { channel: true },
  });
  if (!queueItem) throw new NotFoundError("Mod queue item not found");

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const membership = await prisma.membership.findUnique({
    where: { user_id_batch_id: { user_id: userId, batch_id: queueItem.channel.batch_id } },
  });

  if (!canModerate(user, membership)) {
    throw new ForbiddenError("Only moderators and admins can update mod queue");
  }

  if (status === "escalated" && !canEscalate(user, membership)) {
    throw new ForbiddenError("You cannot escalate this item");
  }

  const updated = await prisma.modQueue.update({
    where: { id: queueId },
    data: {
      status,
      notes: notes ?? queueItem.notes,
      reviewed_by: userId,
    },
    include: {
      message: {
        include: { sender: { select: { id: true, username: true } } },
      },
      reporter: { select: { id: true, username: true } },
      reviewer: { select: { id: true, username: true } },
    },
  });

  await logAdminAction(userId, queueId, `mod_queue_${status}`, {
    channelId: queueItem.channel_id,
    batchId: queueItem.channel.batch_id,
    messageId: queueItem.message_id,
  });

  return updated;
}
