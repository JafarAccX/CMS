import type { Request, Response, NextFunction } from "express";
import * as notificationService from "../services/notification.service.js";
import { requireParam } from "../utils/params.js";

export async function getNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    const notifications = await notificationService.getUserNotifications(req.user!.id);
    res.status(200).json(notifications);
  } catch (err) {
    next(err);
  }
}

export async function markRead(req: Request, res: Response, next: NextFunction) {
  try {
    const notificationId = requireParam(req.params.id, "id");
    await notificationService.markNotificationRead(notificationId, req.user!.id);
    res.status(200).json({ message: "Notification marked as read" });
  } catch (err) {
    next(err);
  }
}

export async function markAllRead(req: Request, res: Response, next: NextFunction) {
  try {
    await notificationService.markAllNotificationsRead(req.user!.id);
    res.status(200).json({ message: "All notifications marked as read" });
  } catch (err) {
    next(err);
  }
}
