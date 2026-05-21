import prisma from "../utils/prisma.js";
import { NotFoundError } from "../utils/errors.js";

export async function getMySubscription(userId: string) {
  const sub = await prisma.subscription.findUnique({ where: { user_id: userId } });
  if (!sub) return { plan: "free", status: "active", started_at: new Date(), expires_at: null };
  return sub;
}

export async function upgradeSubscription(userId: string) {
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  const sub = await prisma.subscription.upsert({
    where: { user_id: userId },
    update: { plan: "pro", status: "active", started_at: new Date(), expires_at: expiresAt },
    create: { user_id: userId, plan: "pro", status: "active", started_at: new Date(), expires_at: expiresAt },
  });
  await prisma.user.update({ where: { id: userId }, data: { subscription_status: "active" } });
  return sub;
}

export async function cancelSubscription(userId: string) {
  const sub = await prisma.subscription.findUnique({ where: { user_id: userId } });
  if (!sub) throw new NotFoundError("No subscription found");
  const updated = await prisma.subscription.update({ where: { user_id: userId }, data: { status: "cancelled" } });
  await prisma.user.update({ where: { id: userId }, data: { subscription_status: "free" } });
  return updated;
}
