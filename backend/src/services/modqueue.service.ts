import prisma from "../utils/prisma.js";
import { NotFoundError, ForbiddenError } from "../utils/errors.js";
import { canModerate, canEscalate } from "../utils/permissions.js";
import { logAdminAction } from "./admin.service.js";

export async function listModQueue(batchId?: string, _userId?: string) {

  return prisma.modQueue.findMany({
    where: {
      ...(batchId && { batch_id: batchId }),
    },
    include: {
      message: {
        include: { sender: { select: { id: true, username: true } } },
      },
      reporter: { select: { id: true, username: true } },
      reviewer: { select: { id: true, username: true } },
      batch: { select: { id: true, name: true } },
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
  });
  if (!queueItem) throw new NotFoundError("Mod queue item not found");

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const membership = await prisma.membership.findUnique({
    where: { user_id_batch_id: { user_id: userId, batch_id: queueItem.batch_id } },
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
    batchId: queueItem.batch_id,
    messageId: queueItem.message_id,
  });

  return updated;
}
