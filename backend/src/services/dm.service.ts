import prisma from "../utils/prisma.js";
import { NotFoundError, ForbiddenError } from "../utils/errors.js";
import { redisGet } from "../utils/redis.js";

/**
 * Get or create a conversation between two users.
 * Always stores the smaller UUID as user_a to guarantee uniqueness.
 */
export async function getOrCreateConversation(userId1: string, userId2: string) {
  if (userId1 === userId2) throw new ForbiddenError("Cannot message yourself");

  // Ensure consistent ordering for the unique constraint
  const [userAId, userBId] = userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];

  let conversation = await prisma.conversation.findUnique({
    where: { user_a_id_user_b_id: { user_a_id: userAId, user_b_id: userBId } },
    include: {
      user_a: { select: { id: true, username: true, role: true, bio: true, phone: true, email: true, created_at: true, memberships: { select: { batch: { select: { id: true, name: true } } } } } },
      user_b: { select: { id: true, username: true, role: true, bio: true, phone: true, email: true, created_at: true, memberships: { select: { batch: { select: { id: true, name: true } } } } } },
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
        user_a: { select: { id: true, username: true, role: true, bio: true, phone: true, email: true, created_at: true, memberships: { select: { batch: { select: { id: true, name: true } } } } } },
        user_b: { select: { id: true, username: true, role: true, bio: true, phone: true, email: true, created_at: true, memberships: { select: { batch: { select: { id: true, name: true } } } } } },
        _count: { select: { messages: true } },
      },
    });
  }

  return conversation;
}

/**
 * List all conversations for a user with last message preview.
 */
export async function listConversations(userId: string) {
  const conversations = await prisma.conversation.findMany({
    where: { OR: [{ user_a_id: userId }, { user_b_id: userId }] },
    include: {
      user_a: { select: { id: true, username: true, role: true, bio: true, phone: true, email: true, created_at: true, memberships: { select: { batch: { select: { id: true, name: true } } } } } },
      user_b: { select: { id: true, username: true, role: true, bio: true, phone: true, email: true, created_at: true, memberships: { select: { batch: { select: { id: true, name: true } } } } } },
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
 * NOTE: Notification creation is handled by the socket handler to avoid duplicates.
 */
export async function sendDirectMessage(
  conversationId: string, 
  senderId: string, 
  content?: string, 
  attachments?: { file_url: string; file_name: string; file_size: number; mime_type: string }[]
) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) throw new NotFoundError("Conversation not found");

  // Verify sender is part of the conversation
  if (conversation.user_a_id !== senderId && conversation.user_b_id !== senderId) {
    throw new ForbiddenError("You are not part of this conversation");
  }

  const message = await prisma.directMessage.create({
    data: { 
      conversation_id: conversationId, 
      sender_id: senderId, 
      content: content || "",
      ...(attachments && attachments.length > 0 && {
        attachments: {
          create: attachments.map(a => ({
            file_url: a.file_url,
            file_name: a.file_name,
            file_size: a.file_size,
            mime_type: a.mime_type
          }))
        }
      })
    },
    include: { 
      sender: { select: { id: true, username: true, role: true, bio: true, phone: true, email: true, created_at: true, memberships: { select: { batch: { select: { id: true, name: true } } } } } },
      attachments: true
    },
  });

  // Touch conversation's updated_at
  await prisma.conversation.update({ where: { id: conversationId }, data: { updated_at: new Date() } });

  return message;
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
    orderBy: { created_at: "desc" },
    include: { sender: { select: { id: true, username: true, role: true, bio: true, phone: true, email: true, created_at: true, memberships: { select: { batch: { select: { id: true, name: true } } } } } }, attachments: true },
  });

  // Mark unread messages from the OTHER user as read
  await prisma.directMessage.updateMany({
    where: { conversation_id: conversationId, sender_id: { not: userId }, is_read: false },
    data: { is_read: true },
  });

  return { messages: messages.reverse(), nextCursor: messages.length === limit ? messages[0]?.id : null };
}

/**
 * List all users available for DM (everyone except banned users and self).
 */
export async function listDmUsers(currentUserId: string) {
  return prisma.user.findMany({
    where: { id: { not: currentUserId }, is_banned: false },
    select: { id: true, username: true, role: true, email: true, bio: true, phone: true, created_at: true, memberships: { select: { batch: { select: { id: true, name: true } } } } },
    orderBy: { username: "asc" },
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
  const result: Record<string, boolean> = {};
  await Promise.all(
    userIds.map(async (id) => {
      result[id] = await checkUserOnline(id);
    })
  );
  return result;
}
