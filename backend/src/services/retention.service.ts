import prisma from "../utils/prisma.js";
import { logger } from "../utils/logger.js";
import { incrementCounter } from "../utils/metrics.js";

const DEFAULT_DELETED_MESSAGE_RETENTION_DAYS = 90;
const PURGE_BATCH_SIZE = 500;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function deletedMessageRetentionDays() {
  const configured = Number(process.env.DELETED_MESSAGE_RETENTION_DAYS);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return DEFAULT_DELETED_MESSAGE_RETENTION_DAYS;
}

export async function purgeExpiredDeletedMessages(now = new Date()): Promise<number> {
  const retentionDays = deletedMessageRetentionDays();
  const cutoff = new Date(now.getTime() - retentionDays * ONE_DAY_MS);
  let totalDeleted = 0;

  while (true) {
    const messages = await prisma.message.findMany({
      where: {
        is_deleted: true,
        deleted_at: { lt: cutoff },
      },
      select: { id: true },
      take: PURGE_BATCH_SIZE,
      orderBy: { deleted_at: "asc" },
    });

    if (messages.length === 0) break;

    const messageIds = messages.map((message) => message.id);

    await prisma.$transaction([
      prisma.message.updateMany({
        where: { parent_id: { in: messageIds } },
        data: { parent_id: null },
      }),
      prisma.messageAttachment.deleteMany({ where: { message_id: { in: messageIds } } }),
      prisma.pinnedMessage.deleteMany({ where: { message_id: { in: messageIds } } }),
      prisma.modQueue.deleteMany({ where: { message_id: { in: messageIds } } }),
      prisma.messageReaction.deleteMany({ where: { message_id: { in: messageIds } } }),
      prisma.message.deleteMany({ where: { id: { in: messageIds } } }),
    ]);

    totalDeleted += messageIds.length;
    if (messageIds.length < PURGE_BATCH_SIZE) break;
  }

  if (totalDeleted > 0) {
    incrementCounter("deleted_messages_purged_total", undefined, totalDeleted);
    logger.info("deleted_messages_purged", {
      count: totalDeleted,
      retentionDays,
      cutoff: cutoff.toISOString(),
    });
  }

  return totalDeleted;
}

export function startDeletedMessagePurgeJob(intervalMs = ONE_DAY_MS): () => void {
  const run = () => {
    purgeExpiredDeletedMessages().catch((err) => {
      logger.error("deleted_message_purge_failed", {
        message: (err as Error).message,
      });
    });
  };

  const timer = setInterval(run, intervalMs);
  void run();
  return () => clearInterval(timer);
}
