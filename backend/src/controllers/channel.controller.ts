import type { Request, Response, NextFunction } from "express";
import * as channelService from "../services/channel.service.js";
import { createChannelSchema, renameChannelSchema } from "../validators/index.js";
import { requireParam } from "../utils/params.js";

export async function listChannels(req: Request, res: Response, next: NextFunction) {
  try {
    const batchId = requireParam(req.params.id, "id");
    const channels = await channelService.listChannels(batchId, req.user!.id);
    res.status(200).json(channels);
  } catch (err) {
    next(err);
  }
}

export async function getChannel(req: Request, res: Response, next: NextFunction) {
  try {
    const channelId = requireParam(req.params.id, "id");
    const channel = await channelService.getChannel(channelId, req.user!.id);
    res.status(200).json(channel);
  } catch (err) {
    next(err);
  }
}

export async function createChannel(req: Request, res: Response, next: NextFunction) {
  try {
    const batchId = requireParam(req.params.id, "id");
    const data = createChannelSchema.parse(req.body);
    const channel = await channelService.createChannel(batchId, data.name, req.user!.id);
    res.status(201).json(channel);
  } catch (err) {
    next(err);
  }
}

export async function renameChannel(req: Request, res: Response, next: NextFunction) {
  try {
    const channelId = requireParam(req.params.id, "id");
    const data = renameChannelSchema.parse(req.body);
    const channel = await channelService.renameChannel(channelId, data.name, req.user!.id);
    res.status(200).json(channel);
  } catch (err) {
    next(err);
  }
}

export async function deleteChannel(req: Request, res: Response, next: NextFunction) {
  try {
    const channelId = requireParam(req.params.id, "id");
    await channelService.deleteChannel(channelId, req.user!.id);
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function toggleChannelPin(req: Request, res: Response, next: NextFunction) {
  try {
    const channelId = requireParam(req.params.id, "id");
    const channel = await channelService.toggleChannelPin(channelId, req.user!.id);
    res.status(200).json(channel);
  } catch (err) {
    next(err);
  }
}

export async function toggleBatchPin(req: Request, res: Response, next: NextFunction) {
  try {
    const batchId = requireParam(req.params.id, "id");
    const batch = await channelService.toggleBatchPin(batchId, req.user!.id);
    res.status(200).json(batch);
  } catch (err) {
    next(err);
  }
}

export async function listPinned(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await channelService.listPinnedForUser(req.user!.id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
