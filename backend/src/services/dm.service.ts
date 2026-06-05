import prisma from "../utils/prisma.js";
import { NotFoundError, ForbiddenError } from "../utils/errors.js";
import { redisGet, redisMGet } from "../utils/redis.js";
import { enqueueOutbox } from "./outbox.service.js";
import { allocateConversationMessageSeq } from "./message-sequence.service.js";
import type { UserRole } from "@prisma/client";

const DM_USER_BASIC_SELECT = {
  id: true,
  username: true,
  role: true,
  avatar_url: true,
} as const;

const DM_USER_PRIVILEGED_SELECT = {
  ...DM_USER_BASIC_SELECT,
  bio: true,
  phone: true,
  email: true,
  created_at: true,
  memberships: { select: { batch: { select: { id: true, name: true } } } },
} as const;

const DM_MESSAGE_SENDER_SELECT = {
  id: true,
  username: true,
  role: true,
  avatar_url: true,
} as const;

function canViewDmProfileDetails(role: UserRole) {
  return role === "admin" || role === "mentor" || role === "batch_moderator";
}

function dmUserSelect(role: UserRole) {
  return canViewDmProfileDetails(role) ? DM_USER_PRIVILEGED_SELECT : DM_USER_BASIC_SELECT;
}

/**
 * Get or create a conversation between two users.
 * Always stores the smaller UUID as user_a to guarantee uniqueness.
 */
export async function getOrCreateConversation(userId1: string, userId2: string, requesterRole: UserRole) {
  if (userId1 === userId2) throw new ForbiddenError("Cannot message yourself");

  // Ensure consistent ordering for the unique constraint
  const [userAId, userBId] = userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];

  let conversation = await prisma.conversation.findUnique({
    where: { user_a_id_user_b_id: { user_a_id: userAId, user_b_id: userBId } },
    include: {
      user_a: { select: dmUserSelect(requesterRole) },
      user_b: { select: dmUserSelect(requesterRole) },
      _count: { select: { messages: true } },
    },
  });

  if (!conversation) {
    // Verify both users exist
    const [a, b] = await Promise.all([
      prisma.user.findUnique({ where: { id: userAId } }),
      prisma.user.findUnique({ where: { id: userBId } }),
    ]);
    if (!a || !b) throw new NotFoundError("User not found");

    conversation = await prisma.conversation.create({
      data: { user_a_id: userAId, user_b_id: userBId },
      include: {
        user_a: { select: dmUserSelect(requesterRole) },
        user_b: { select: dmUserSelect(requesterRole) },
        _count: { select: { messages: true } },
      },
    });
  }

  return conversation;
}

/**
 * List all conversations for a user with last message preview.
 */
export async function listConversations(userId: string, requesterRole: UserRole) {
  const conversations = await prisma.conversation.findMany({
    where: { OR: [{ user_a_id: userId }, { user_b_id: userId }] },
    include: {
      user_a: { select: dmUserSelect(requesterRole) },
      user_b: { select: dmUserSelect(requesterRole) },
      messages: {
        orderBy: { created_at: "desc" },
        take: 1,
        select: { id: true, content: true, sender_id: true, is_read: true, created_at: true },
      },
      _count: { select: { messages: { where: { is_read: false, NOT: { sender_id: userId } } } } },
    },
    orderBy: { updated_at: "desc" },
  });

  return conversations.map((c) => {
    const otherUser = c.user_a_id === userId ? c.user_b : c.user_a;
    return {
      id: c.id,
      otherUser,
      lastMessage: c.messages[0] || null,
      unreadCount: c._count.messages,
      updated_at: c.updated_at,
    };
  });
}

/**
 * Send a direct message.
 *
 * The message, the conversation touch, and the real-time outbox event all commit
 * in ONE transaction — so the "receive_dm" event can never be lost even if the
 * process crashes right after the DB write. Returns the outbox row so the caller
 * can fast-path publish it; otherwise the outbox relay delivers it within ~2s.
 *
 * NOTE: Notification creation is handled by the socket handler to avoid duplicates.
 */
export async function sendDirectMessage(
  conversationId: string,
  senderId: string,
  content?: string,
  attachments?: { file_url: string; file_name: string; file_size: number; mime_type: string }[],
  tempId?: string
) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) throw new NotFoundError("Conversation not found");

  // Verify sender is part of the conversation
  if (conversation.user_a_id !== senderId && conversation.user_b_id !== senderId) {
    throw new ForbiddenError("You are not part of this conversation");
  }

  const otherId = conversation.user_a_id === senderId ? conversation.user_b_id : conversation.user_a_id;

  const { message, outboxEvent } = await prisma.$transaction(async (tx) => {
    const seqId = await allocateConversationMessageSeq(tx, conversationId);

    const message = await tx.directMessage.create({
      data: {
        conversation_id: conversationId,
        sender_id: senderId,
        content: content || "",
        seq_id: seqId,
        ...(attachments && attachments.length > 0 && {
          attachments: {
            create: attachments.map((a) => ({
              file_url: a.file_url,
              file_name: a.file_name,
              file_size: a.file_size,
              mime_type: a.mime_type,
            })),
          },
        }),
      },
      include: {
        sender: { select: DM_MESSAGE_SENDER_SELECT },
        attachments: true,
      },
    });

    // Touch conversation's updated_at (same transaction)
    await tx.conversation.update({ where: { id: conversationId }, data: { updated_at: new Date() } });

    const outboxEvent = await enqueueOutbox(tx, {
      aggregate: "dm",
      aggregateId: conversationId,
      event: "receive_dm",
      rooms: [`dm:${conversationId}`, `user:${otherId}`],
      payload: { ...message, tempId },
    });

    return { message, outboxEvent };
  });

  return { message, outboxEvent, otherId };
}


/**
 * Get messages for a conversation with cursor pagination.
 */
export async function getDirectMessages(conversationId: string, userId: string, cursor?: string, limit = 50) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) throw new NotFoundError("Conversation not found");
  if (conversation.user_a_id !== userId && conversation.user_b_id !== userId) {
    throw new ForbiddenError("You are not part of this conversation");
  }

  const messages = await prisma.directMessage.findMany({
    where: { conversation_id: conversationId },
    take: limit,
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
    orderBy: { seq_id: "desc" },
    include: { sender: { select: DM_MESSAGE_SENDER_SELECT }, attachments: true },
  });

  // Mark unread messages from the OTHER user as read
  await prisma.directMessage.updateMany({
    where: { conversation_id: conversationId, sender_id: { not: userId }, is_read: false },
    data: { is_read: true },
  });

  const nextCursor = messages.length === limit ? messages[messages.length - 1]?.id : null;
  return { messages: messages.reverse(), nextCursor };
}

/**
 * List all users available for DM (everyone except banned users and self).
 * When batchMentorsOnly=true, returns only mentors assigned to the same batches the current user belongs to.
 */
export async function listDmUsers(
  currentUserId: string,
  batchMentorsOnly = false,
  requesterRole: UserRole,
  search = ""
) {
  const searchFilter = search.trim()
    ? {
        OR: [
          { username: { contains: search.trim(), mode: "insensitive" as const } },
          { email:    { contains: search.trim(), mode: "insensitive" as const } },
        ],
      }
    : {};

  if (batchMentorsOnly) {
    const userMemberships = await prisma.membership.findMany({
      where: { user_id: currentUserId },
      select: { batch_id: true },
    });
    const batchIds = userMemberships.map((m) => m.batch_id);
    if (batchIds.length === 0) return [];

    const mentorMemberships = await prisma.membership.findMany({
      where: { batch_id: { in: batchIds }, role_in_batch: "mentor" },
      select: { user_id: true },
      distinct: ["user_id"],
    });
    const mentorIds = mentorMemberships.map((m) => m.user_id).filter((id) => id !== currentUserId);
    if (mentorIds.length === 0) return [];

    return prisma.user.findMany({
      where: { id: { in: mentorIds }, is_banned: false, ...searchFilter },
      select: dmUserSelect(requesterRole),
      orderBy: { username: "asc" },
    });
  }

  // Keep payloads bounded; the pg_trgm indexes keep broad searches fast.
  return prisma.user.findMany({
    where: { id: { not: currentUserId }, is_banned: false, ...searchFilter },
    select: dmUserSelect(requesterRole),
    orderBy: { username: "asc" },
    take: 100,
  });
}

/**
 * Check if a user is currently online via Redis.
 */
export async function checkUserOnline(userId: string): Promise<boolean> {
  const val = await redisGet(`user:online:${userId}`);
  return val !== null;
}

/**
 * Check online status for multiple users at once.
 */
export async function checkUsersOnline(userIds: string[]): Promise<Record<string, boolean>> {
  const values = await redisMGet(userIds.map((id) => `user:online:${id}`));
  return Object.fromEntries(userIds.map((id, index) => [id, values[index] !== null]));
}
