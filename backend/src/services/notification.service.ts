import prisma from "../utils/prisma.js";

export async function createNotification(
  userId: string,
  type: "new_message" | "mention" | "admin_action" | "mod_action",
  refId?: string,
  senderId?: string,
  contentPreview?: string
) {
  // Fire and forget — don't block the response
  prisma.notification
    .create({
      data: {
        user_id: userId,
        type,
        ref_id: refId,
        sender_id: senderId,
        content_preview: contentPreview?.substring(0, 50),
      },
    })
    .catch((err) => {
      console.error("Failed to create notification:", err);
    });
}


export async function getUserNotifications(userId: string) {
  return prisma.notification.findMany({
    where: { user_id: userId, is_read: false },
    orderBy: { created_at: "desc" },
    take: 50,
  });
}

export async function markNotificationRead(notificationId: string, userId: string) {
  return prisma.notification.updateMany({
    where: { id: notificationId, user_id: userId },
    data: { is_read: true },
  });
}

export async function markAllNotificationsRead(userId: string) {
  return prisma.notification.updateMany({
    where: { user_id: userId, is_read: false },
    data: { is_read: true },
  });
}
