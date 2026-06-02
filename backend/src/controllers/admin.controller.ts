import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as adminService from "../services/admin.service.js";
import { syncCrmBatchesAndPeople } from "../services/crm-sync.service.js";
import * as messageService from "../services/message.service.js";
import { requireParam } from "../utils/params.js";
import prisma from "../utils/prisma.js";

export async function getStats(req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await adminService.getAdminStats();
    res.status(200).json(stats);
  } catch (err) {
    next(err);
  }
}

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const role = typeof req.query.role === "string" ? req.query.role : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const result = await adminService.listUsers(page, limit, role, search);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function createUser(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await adminService.createUser(req.body, req.user!.id);
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
}

export async function toggleBanUser(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireParam(req.params.id, "id");
    const user = await adminService.toggleBanUser(userId, req.user!.id);
    res.status(200).json(user);
  } catch (err) {
    next(err);
  }
}

export async function updateUserRole(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireParam(req.params.id, "id");
    const role = z.enum(["admin", "mentor", "batch_moderator", "learner", "guest"]).parse(req.body?.role);
    const user = await adminService.updateUserRole(userId, role, req.user!.id);
    res.status(200).json(user);
  } catch (err) {
    next(err);
  }
}


export async function listLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const actionType = req.query.actionType as string;
    const result = await adminService.listAdminLogs(page, limit, actionType);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function hardDeleteMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const messageId = requireParam(req.params.id, "id");
    await messageService.hardDeleteMessage(messageId, req.user!.id);
    res.status(200).json({ message: "Message permanently deleted" });
  } catch (err) {
    next(err);
  }
}

/**
 * One-time fix: set type="private" on all auto-synced CRM batches that
 * incorrectly defaulted to type="general", making them visible to all learners.
 */
export async function fixCrmBatchTypes(_req: Request, res: Response, next: NextFunction) {
  try {
    const result = await prisma.batch.updateMany({
      where: {
        type: "general",
        description: { startsWith: "Auto-synced from CRM" },
      },
      data: { type: "private" },
    });
    res.status(200).json({
      success: true,
      fixed: result.count,
      message: `Updated ${result.count} auto-synced batches from "general" to "private"`,
    });
  } catch (err) {
    next(err);
  }
}

export async function broadcast(req: Request, res: Response, next: NextFunction) {
  try {
    const { content, channelIds } = req.body;
    if (!content || !content.trim()) {
      res.status(400).json({ error: "Broadcast content is required" });
      return;
    }
    const ids = Array.isArray(channelIds) && channelIds.length > 0 ? channelIds : undefined;
    const messages = await adminService.broadcastMessage(content.trim(), req.user!.id, ids);

    // Emit to each channel room via Socket.io
    const io = req.app.get("io");
    if (io) {
      for (const msg of messages) {
        io.to(`channel:${msg.channelId}`).emit("receive_message", msg);
      }
    }

    res.status(200).json({ success: true, channelCount: messages.length });
  } catch (err) {
    next(err);
  }
}

export async function listPinned(_req: Request, res: Response, next: NextFunction) {
  try {
    const result = await adminService.listPinnedForAdmin();
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function syncCrm(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await syncCrmBatchesAndPeople(req.user!.id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
