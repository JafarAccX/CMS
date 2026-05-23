import prisma from "../utils/prisma.js";
import { NotFoundError, ForbiddenError } from "../utils/errors.js";
import { canAccessBatch, canSendMessage, canModerate } from "../utils/permissions.js";
import { logAdminAction } from "./admin.service.js";

/**
 * Resolve a channel + parent batch + caller's membership for permission checks.
 */
async function loadChannelContext(channelId: string, userId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: { batch: { include: { batch_settings: true } } },
  });
  if (!channel) throw new NotFoundError("Channel not found");

  const [user, membership] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.membership.findUnique({
      where: { user_id_batch_id: { user_id: userId, batch_id: channel.batch_id } },
    }),
  ]);

  return { channel, user, membership };
}

export async function listMessages(channelId: string, userId: string, cursor?: string, limit = 50) {
  const { channel, user, membership } = await loadChannelContext(channelId, userId);

  if (!canAccessBatch(user, channel.batch, membership)) {
    throw new ForbiddenError("You do not have access to this channel");
  }

  const messages = await prisma.message.findMany({
    where: { channel_id: channelId },
    take: limit,
    ...(cursor && {
      skip: 1,
      cursor: { id: cursor },
    }),
    orderBy: { created_at: "desc" },
    include: {
      sender: {
        select: { id: true, username: true, role: true, is_banned: true },
      },
      attachments: true,
      reactions: {
        select: { id: true, emoji: true, user_id: true, user: { select: { username: true } } },
      },
      parent: {
        select: {
          id: true,
          content: true,
          sender: { select: { id: true, username: true } },
        },
      },
    },
  });

  const nextCursor = messages.length === limit ? messages[messages.length - 1].id : null;

  return {
    messages: messages.reverse(),
    nextCursor,
    hasMore: messages.length === limit,
  };
}

export async function createMessage(
  channelId: string,
  senderId: string,
  content: string,
  messageType: "text" | "file" | "system" = "text",
  parentId?: string,
  attachments?: { file_url: string; file_name: string; file_size: number; mime_type: string }[]
) {
  const { channel, user, membership } = await loadChannelContext(channelId, senderId);

  if (!canSendMessage(user, channel.batch, membership)) {
    throw new ForbiddenError("You cannot send messages in this channel");
  }

  // Validate parent message if threading
  if (parentId) {
    const parent = await prisma.message.findUnique({ where: { id: parentId } });
    if (!parent || parent.channel_id !== channelId) {
      throw new NotFoundError("Parent message not found in this channel");
    }
  }

  const message = await prisma.message.create({
    data: {
      channel_id: channelId,
      sender_id: senderId,
      content,
      message_type: messageType,
      parent_id: parentId,
      ...(attachments &&
        attachments.length > 0 && {
          attachments: {
            create: attachments,
          },
        }),
    },
    include: {
      sender: {
        select: { id: true, username: true, role: true },
      },
      attachments: true,
      parent: {
        select: {
          id: true,
          content: true,
          sender: { select: { id: true, username: true } },
        },
      },
    },
  });

  // Handle mentions (resolved against the parent batch's members)
  const mentionedIds = await parseMentions(content, channel.batch_id);
  for (const targetId of mentionedIds) {
    if (targetId === senderId) continue;
    await prisma.notification.create({
      data: {
        user_id: targetId,
        type: "mention",
        ref_id: message.id,
        sender_id: senderId,
        content_preview: content,
      },
    }).catch(err => console.error("Mention notification error:", err));
  }

  return message;
}


export async function softDeleteMessage(messageId: string, userId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { channel: { include: { batch: { include: { batch_settings: true } } } } },
  });
  if (!message) throw new NotFoundError("Message not found");

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const membership = await prisma.membership.findUnique({
    where: { user_id_batch_id: { user_id: userId, batch_id: message.channel.batch_id } },
  });

  // Sender, moderator, or admin can soft delete
  const isSender = message.sender_id === userId;
  const isMod = canModerate(user, membership);
  if (!isSender && !isMod) {
    throw new ForbiddenError("You cannot delete this message");
  }

  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { is_deleted: true, deleted_at: new Date() },
  });

  if (!isSender) {
    await logAdminAction(userId, messageId, "delete_message", {
      channelId: message.channel_id,
      batchId: message.channel.batch_id,
    });
  }

  return updated;
}

export async function hardDeleteMessage(messageId: string, actorId: string) {
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message) throw new NotFoundError("Message not found");

  // Delete attachments first
  await prisma.messageAttachment.deleteMany({ where: { message_id: messageId } });
  // Delete pinned references
  await prisma.pinnedMessage.deleteMany({ where: { message_id: messageId } });
  // Delete mod queue references
  await prisma.modQueue.deleteMany({ where: { message_id: messageId } });
  // Nullify parent_id on child replies to avoid FK constraint
  await prisma.message.updateMany({ where: { parent_id: messageId }, data: { parent_id: null } });
  // Delete the message
  await prisma.message.delete({ where: { id: messageId } });

  await logAdminAction(actorId, messageId, "hard_delete_message", {
    channelId: message.channel_id,
  });

  return { success: true };
}

export async function pinMessage(messageId: string, userId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { channel: true },
  });
  if (!message) throw new NotFoundError("Message not found");

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const membership = await prisma.membership.findUnique({
    where: { user_id_batch_id: { user_id: userId, batch_id: message.channel.batch_id } },
  });

  if (!canModerate(user, membership)) {
    throw new ForbiddenError("Only moderators and admins can pin messages");
  }

  const pinned = await prisma.pinnedMessage.create({
    data: {
      channel_id: message.channel_id,
      message_id: messageId,
      pinned_by: userId,
    },
    include: {
      message: {
        include: { sender: { select: { id: true, username: true } } },
      },
    },
  });

  return pinned;
}

export async function unpinMessage(messageId: string, userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const pinned = await prisma.pinnedMessage.findFirst({
    where: { message_id: messageId },
    include: { channel: true },
  });
  if (!pinned) throw new NotFoundError("Pinned message not found");

  const membership = await prisma.membership.findUnique({
    where: { user_id_batch_id: { user_id: userId, batch_id: pinned.channel.batch_id } },
  });

  if (!canModerate(user, membership)) {
    throw new ForbiddenError("Only moderators and admins can unpin messages");
  }

  await prisma.pinnedMessage.delete({ where: { id: pinned.id } });
  return { success: true };
}

export async function flagMessage(
  messageId: string,
  reportedBy: string,
  priority: "low" | "medium" | "high" = "low",
  notes?: string
) {
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message) throw new NotFoundError("Message not found");

  const queueItem = await prisma.modQueue.create({
    data: {
      channel_id: message.channel_id,
      message_id: messageId,
      reported_by: reportedBy,
      priority,
      notes,
    },
    include: {
      message: {
        include: { sender: { select: { id: true, username: true } } },
      },
      reporter: { select: { id: true, username: true } },
    },
  });

  return queueItem;
}

export async function getPinnedMessages(channelId: string) {
  return prisma.pinnedMessage.findMany({
    where: { channel_id: channelId },
    include: {
      message: {
        include: { sender: { select: { id: true, username: true } } },
      },
      pinner: { select: { id: true, username: true } },
    },
    orderBy: { pinned_at: "desc" },
  });
}

/**
 * Parse @mentions from message content and return user IDs.
 * Mentions are resolved against the parent batch's members (channels share members with their batch).
 */
export async function parseMentions(content: string, batchId: string): Promise<string[]> {
  const mentionRegex = /@([a-zA-Z0-9_.-]+)/g;
  const mentions: string[] = [];
  let match;

  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push(match[1]);
  }

  if (mentions.length === 0) return [];

  const users = await prisma.user.findMany({
    where: {
      username: { in: mentions },
      memberships: { some: { batch_id: batchId } },
    },
    select: { id: true },
  });

  return users.map((u) => u.id);
}
