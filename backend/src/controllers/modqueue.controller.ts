import type { Request, Response, NextFunction } from "express";
import * as modqueueService from "../services/modqueue.service.js";
import { updateModQueueSchema } from "../validators/index.js";
import { requireParam } from "../utils/params.js";

export async function listModQueue(req: Request, res: Response, next: NextFunction) {
  try {
    const batchId = req.query.batch_id as string | undefined;
    const channelId = req.query.channel_id as string | undefined;
    const queue = await modqueueService.listModQueue({ batchId, channelId }, req.user!.id);
    res.status(200).json(queue);
  } catch (err) {
    next(err);
  }
}

export async function updateModQueue(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateModQueueSchema.parse(req.body);
    const itemId = requireParam(req.params.id, "id");
    const updated = await modqueueService.updateModQueueItem(itemId, req.user!.id, data.status, data.notes);
    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}
