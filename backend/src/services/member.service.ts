import prisma from "../utils/prisma.js";
import { NotFoundError, ForbiddenError, ConflictError } from "../utils/errors.js";
import { logAdminAction } from "./admin.service.js";
import { canAccessBatch } from "../utils/permissions.js";
import type { UserRole } from "@prisma/client";

const MEMBER_BASIC_USER_SELECT = {
  id: true,
  username: true,
  role: true,
  avatar_url: true,
} as const;

const MEMBER_PRIVILEGED_USER_SELECT = {
  ...MEMBER_BASIC_USER_SELECT,
  email: true,
  is_banned: true,
  subscription_status: true,
  bio: true,
  phone: true,
  created_at: true,
  memberships: { select: { batch: { select: { id: true, name: true } } } },
} as const;

function memberUserSelect(role: UserRole) {
  return role === "admin" || role === "mentor" || role === "batch_moderator"
    ? MEMBER_PRIVILEGED_USER_SELECT
    : MEMBER_BASIC_USER_SELECT;
}

export async function listMembers(batchId: string, requesterId: string, requesterRole: UserRole) {
  const [batch, requester, requesterMembership] = await Promise.all([
    prisma.batch.findUnique({ where: { id: batchId }, include: { batch_settings: true } }),
    prisma.user.findUniqueOrThrow({ where: { id: requesterId } }),
    prisma.membership.findUnique({
      where: { user_id_batch_id: { user_id: requesterId, batch_id: batchId } },
    }),
  ]);
  if (!batch) throw new NotFoundError("Batch not found");
  if (!canAccessBatch(requester, batch, requesterMembership)) {
    throw new ForbiddenError("You do not have access to this batch");
  }

  return prisma.membership.findMany({
    where: { batch_id: batchId },
    include: {
      user: {
        select: memberUserSelect(requesterRole),
      },
    },
    orderBy: { joined_at: "asc" },
  });
}

export async function addMember(
  batchId: string,
  userId: string,
  roleInBatch: "member" | "mentor" | "moderator",
  actorId: string
) {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: { batch_settings: true },
  });
  if (!batch) throw new NotFoundError("Batch not found");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("User not found");

  // Check max members
  if (batch.batch_settings?.max_members) {
    const currentCount = await prisma.membership.count({ where: { batch_id: batchId } });
    if (currentCount >= batch.batch_settings.max_members) {
      throw new ForbiddenError("Batch has reached maximum member capacity");
    }
  }

  const existing = await prisma.membership.findUnique({
    where: { user_id_batch_id: { user_id: userId, batch_id: batchId } },
  });
  if (existing) throw new ConflictError("User is already a member of this batch");

  const membership = await prisma.membership.create({
    data: {
      user_id: userId,
      batch_id: batchId,
      role_in_batch: roleInBatch,
    },
    include: {
      user: {
        select: { id: true, username: true, email: true, role: true, bio: true, phone: true, created_at: true, memberships: { select: { batch: { select: { id: true, name: true } } } } },
      },
    },
  });

  await logAdminAction(actorId, userId, "add_member", {
    batchId,
    roleInBatch,
  });

  return membership;
}

export async function removeMember(batchId: string, userId: string, actorId: string) {
  const membership = await prisma.membership.findUnique({
    where: { user_id_batch_id: { user_id: userId, batch_id: batchId } },
  });
  if (!membership) throw new NotFoundError("Membership not found");

  await prisma.membership.delete({ where: { id: membership.id } });

  await logAdminAction(actorId, userId, "remove_member", { batchId });

  return { success: true };
}

export async function updateMemberRole(
  batchId: string,
  userId: string,
  roleInBatch: "member" | "mentor" | "moderator",
  actorId: string
) {
  const membership = await prisma.membership.findUnique({
    where: { user_id_batch_id: { user_id: userId, batch_id: batchId } },
  });
  if (!membership) throw new NotFoundError("Membership not found");

  const updated = await prisma.membership.update({
    where: { id: membership.id },
    data: { role_in_batch: roleInBatch },
    include: {
      user: {
        select: { id: true, username: true, email: true, role: true, bio: true, phone: true, created_at: true, memberships: { select: { batch: { select: { id: true, name: true } } } } },
      },
    },
  });

  await logAdminAction(actorId, userId, "update_member_role", {
    batchId,
    newRole: roleInBatch,
  });

  return updated;
}
