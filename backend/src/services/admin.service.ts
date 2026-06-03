import prisma from "../utils/prisma.js";
import bcrypt from "bcrypt";
import type { Prisma, UserRole } from "@prisma/client";
import { revokeAllUserSessions } from "./session.service.js";

const USER_ROLES: UserRole[] = ["admin", "mentor", "batch_moderator", "learner", "guest"];

export async function logAdminAction(actorId: string, targetId: string | null, actionType: string, metadata?: any) {
  prisma.adminLog.create({
    data: { actor_id: actorId, target_id: targetId, action_type: actionType, metadata },
  }).catch((err) => console.error("Failed to log admin action:", err));
}

export async function listUsers(page = 1, limit = 20, role?: string, search?: string) {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(Math.max(1, limit), 100);
  const normalizedRole = role && USER_ROLES.includes(role as UserRole) ? (role as UserRole) : undefined;
  const normalizedSearch = search?.trim();
  const where: Prisma.UserWhereInput = {
    ...(normalizedRole ? { role: normalizedRole } : {}),
    ...(normalizedSearch
      ? {
          OR: [
            { username: { contains: normalizedSearch, mode: "insensitive" } },
            { email: { contains: normalizedSearch, mode: "insensitive" } },
            { phone: { contains: normalizedSearch, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
      orderBy: { created_at: "desc" },
      select: { 
        id: true, 
        username: true, 
        email: true, 
        role: true, 
        provider: true, 
        subscription_status: true, 
        is_banned: true, 
        created_at: true,
        memberships: { select: { batch: { select: { name: true } } } }
      },
    }),
    prisma.user.count({ where }),
  ]);
  return { users, total, page: safePage, totalPages: Math.ceil(total / safeLimit) };
}

export async function createUser(data: { username: string; email: string; phone: string; password: string; role: string }, actorId: string) {
  const hashedPassword = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({
    data: {
      username: data.username,
      email: data.email,
      phone: data.phone,
      password_hash: hashedPassword,
      role: data.role as any,
      provider: "website",
    },
  });
  
  await logAdminAction(actorId, user.id, "create_user", { username: user.username, role: user.role });
  return user;
}

export async function toggleBanUser(userId: string, actorId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const banning = !user.is_banned;
  const updated = await prisma.user.update({ where: { id: userId }, data: { is_banned: banning } });

  // Immediately invalidate all active sessions when an account is banned.
  if (banning) {
    await revokeAllUserSessions(userId);
  }

  await logAdminAction(actorId, userId, banning ? "ban_user" : "unban_user", { username: user.username });
  return { id: updated.id, is_banned: updated.is_banned, username: updated.username };
}

export async function updateUserRole(userId: string, role: UserRole, actorId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const updated = await prisma.user.update({ where: { id: userId }, data: { role } });
  await logAdminAction(actorId, userId, "update_user_role", { username: user.username, oldRole: user.role, newRole: role });
  return updated;
}


export async function listAdminLogs(page = 1, limit = 20, actionType?: string) {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(Math.max(1, limit), 100);
  const skip = (safePage - 1) * safeLimit;
  const where = actionType ? { action_type: actionType } : {};
  const [logs, total] = await Promise.all([
    prisma.adminLog.findMany({
      where, skip, take: safeLimit, orderBy: { created_at: "desc" },
      include: { actor: { select: { id: true, username: true } } },
    }),
    prisma.adminLog.count({ where }),
  ]);
  return { logs, total, page: safePage, totalPages: Math.ceil(total / safeLimit) };
}

export async function getAdminStats() {
  const [totalUsers, totalMentors, totalLearners, totalBatches, totalChannels] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "mentor" } }),
    prisma.user.count({ where: { role: "learner" } }),
    prisma.batch.count(),
    prisma.channel.count(),
  ]);

  return { totalUsers, totalMentors, totalLearners, totalBatches, totalChannels };
}

/**
 * Admin panel: list ONLY pinned batches (with their channels) and pinned channels
 * whose parent batch is NOT pinned (grouped by batch).
 */
export async function listPinnedForAdmin() {
  const pinnedBatches = await prisma.batch.findMany({
    where: { is_pinned: true },
    orderBy: { created_at: "asc" },
    include: {
      batch_settings: true,
      _count: { select: { channels: true, memberships: true } },
      channels: {
        orderBy: [{ is_pinned: "desc" }, { created_at: "asc" }],
        include: { _count: { select: { messages: true } } },
      },
    },
  });

  const pinnedChannels = await prisma.channel.findMany({
    where: {
      is_pinned: true,
      batch: { is_pinned: false },
    },
    orderBy: { created_at: "asc" },
    include: {
      _count: { select: { messages: true } },
      batch: { select: { id: true, name: true, type: true } },
    },
  });

  const groups = new Map<string, { batch: any; channels: any[] }>();
  for (const ch of pinnedChannels) {
    const key = ch.batch.id;
    if (!groups.has(key)) groups.set(key, { batch: ch.batch, channels: [] });
    groups.get(key)!.channels.push(ch);
  }

  return {
    pinnedBatches,
    pinnedChannelGroups: Array.from(groups.values()),
  };
}

export async function listBroadcastChannels() {
  return prisma.channel.findMany({
    where: { batch: { batch_settings: { is_archived: false } } },
    orderBy: [{ batch: { name: "asc" } }, { created_at: "asc" }],
    select: {
      id: true,
      name: true,
      batch_id: true,
      batch: { select: { id: true, name: true } },
      _count: { select: { messages: true } },
    },
  });
}

/**
 * Broadcast a system message to selected channels (or all channels in non-archived
 * batches when no channelIds are provided).
 */
export async function broadcastMessage(content: string, senderId: string, channelIds?: string[]) {
  let channels: { id: string; batch_id: string; name: string }[];

  if (channelIds && channelIds.length > 0) {
    channels = await prisma.channel.findMany({
      where: { id: { in: channelIds } },
      select: { id: true, batch_id: true, name: true },
    });
  } else {
    channels = await prisma.channel.findMany({
      where: { batch: { batch_settings: { is_archived: false } } },
      select: { id: true, batch_id: true, name: true },
    });
  }

  const messages = [];
  for (const ch of channels) {
    const msg = await prisma.message.create({
      data: {
        channel_id: ch.id,
        sender_id: senderId,
        content: `📢 **BROADCAST**: ${content}`,
        message_type: "system",
      },
      include: {
        sender: { select: { id: true, username: true, role: true } },
        attachments: true,
        reactions: { select: { id: true, emoji: true, user_id: true, user: { select: { username: true } } } },
      },
    });
    messages.push({ ...msg, channelId: ch.id });
  }

  await logAdminAction(senderId, null, "broadcast_message", {
    content,
    channelCount: channels.length,
    targeted: !!(channelIds && channelIds.length > 0),
  });
  return messages;
}
