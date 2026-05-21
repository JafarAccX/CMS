import prisma from "../utils/prisma.js";
import bcrypt from "bcrypt";
import type { UserRole } from "@prisma/client";

export async function logAdminAction(actorId: string, targetId: string | null, actionType: string, metadata?: any) {
  prisma.adminLog.create({
    data: { actor_id: actorId, target_id: targetId, action_type: actionType, metadata },
  }).catch((err) => console.error("Failed to log admin action:", err));
}

export async function listUsers(page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      skip, take: limit, orderBy: { created_at: "desc" },
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
    prisma.user.count(),
  ]);
  return { users, total, page, totalPages: Math.ceil(total / limit) };
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
  const updated = await prisma.user.update({ where: { id: userId }, data: { is_banned: !user.is_banned } });
  await logAdminAction(actorId, userId, user.is_banned ? "unban_user" : "ban_user", { username: user.username });
  return { id: updated.id, is_banned: updated.is_banned, username: updated.username };
}

export async function updateUserRole(userId: string, role: UserRole, actorId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const updated = await prisma.user.update({ where: { id: userId }, data: { role } });
  await logAdminAction(actorId, userId, "update_user_role", { username: user.username, oldRole: user.role, newRole: role });
  return updated;
}


export async function listAdminLogs(page = 1, limit = 20, actionType?: string) {
  const skip = (page - 1) * limit;
  const where = actionType ? { action_type: actionType } : {};
  const [logs, total] = await Promise.all([
    prisma.adminLog.findMany({
      where, skip, take: limit, orderBy: { created_at: "desc" },
      include: { actor: { select: { id: true, username: true } } },
    }),
    prisma.adminLog.count({ where }),
  ]);
  return { logs, total, page, totalPages: Math.ceil(total / limit) };
}

export async function getAdminStats() {
  const [totalUsers, totalMentors, totalLearners, totalBatches] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "mentor" } }),
    prisma.user.count({ where: { role: "learner" } }),
    prisma.batch.count(),
  ]);

  return { totalUsers, totalMentors, totalLearners, totalBatches };
}

export async function broadcastMessage(content: string, senderId: string) {
  // Get all non-archived batches
  const batches = await prisma.batch.findMany({
    where: {
      batch_settings: { is_archived: false }
    },
    select: { id: true, name: true }
  });

  const messages = [];
  for (const batch of batches) {
    const msg = await prisma.message.create({
      data: {
        batch_id: batch.id,
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
    messages.push({ ...msg, batchId: batch.id });
  }

  await logAdminAction(senderId, null, "broadcast_message", { content, batchCount: batches.length });
  return messages;
}
