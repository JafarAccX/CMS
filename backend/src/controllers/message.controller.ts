import type { Request, Response, NextFunction } from "express";
import * as messageService from "../services/message.service.js";
import { sendMessageSchema, flagMessageSchema } from "../validators/index.js";
import { requireParam } from "../utils/params.js";
import { BadRequestError } from "../utils/errors.js";

export async function listMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const channelId = (req.query.channel_id as string) || (req.query.channelId as string);
    const cursor = req.query.cursor as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    if (!channelId) {
      res.status(400).json({ error: "channel_id is required" });
      return;
    }

    const result = await messageService.listMessages(channelId, req.user!, cursor, limit);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function createMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const attachments: any[] = [];

    // Handle uploaded files
    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files) {
        attachments.push({
          file_url: `/uploads/${file.filename}`,
          file_name: file.originalname,
          file_size: file.size,
          mime_type: file.mimetype,
        });
      }
    }

    const data = sendMessageSchema.parse(req.body);
    const content = data.content?.trim() || "";
    if (!content && attachments.length === 0) {
      throw new BadRequestError("Message must contain text or an attachment");
    }

    const message = await messageService.createMessage(
      data.channel_id,
      req.user!.id,
      content,
      data.message_type || (attachments.length > 0 ? "file" : "text"),
      data.parent_id,
      attachments
    );

    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
}

export async function softDeleteMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const messageId = requireParam(req.params.id, "id");
    await messageService.softDeleteMessage(messageId, req.user!.id);
    res.status(200).json({ message: "Message deleted" });
  } catch (err) {
    next(err);
  }
}

export async function pinMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const messageId = requireParam(req.params.id, "id");
    const pinned = await messageService.pinMessage(messageId, req.user!.id);
    res.status(201).json(pinned);
  } catch (err) {
    next(err);
  }
}

export async function unpinMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const messageId = requireParam(req.params.id, "id");
    await messageService.unpinMessage(messageId, req.user!.id);
    res.status(200).json({ message: "Message unpinned" });
  } catch (err) {
    next(err);
  }
}

export async function flagMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const data = flagMessageSchema.parse(req.body);
    const messageId = requireParam(req.params.id, "id");
    const flagged = await messageService.flagMessage(messageId, req.user!.id, data.priority, data.notes);
    res.status(201).json(flagged);
  } catch (err) {
    next(err);
  }
}
