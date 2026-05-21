import type { Request, Response, NextFunction } from "express";
import * as dmService from "../services/dm.service.js";
import { z } from "zod";
import { requireParam } from "../utils/params.js";

const sendDmSchema = z.object({ content: z.string().min(1).max(5000) });
const startDmSchema = z.object({ targetUserId: z.string().uuid() });

export async function listConversations(req: Request, res: Response, next: NextFunction) {
  try {
    const conversations = await dmService.listConversations(req.user!.id);
    res.status(200).json(conversations);
  } catch (err) { next(err); }
}

export async function startConversation(req: Request, res: Response, next: NextFunction) {
  try {
    const { targetUserId } = startDmSchema.parse(req.body);
    const conversation = await dmService.getOrCreateConversation(req.user!.id, targetUserId);
    res.status(200).json(conversation);
  } catch (err) { next(err); }
}

export async function getMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const cursor = req.query.cursor as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const conversationId = requireParam(req.params.id, "id");
    const result = await dmService.getDirectMessages(conversationId, req.user!.id, cursor, limit);
    res.status(200).json(result);
  } catch (err) { next(err); }
}

export async function sendMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const { content } = sendDmSchema.parse(req.body);
    const conversationId = requireParam(req.params.id, "id");
    const message = await dmService.sendDirectMessage(conversationId, req.user!.id, content);
    res.status(201).json(message);
  } catch (err) { next(err); }
}

export async function listDmUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const users = await dmService.listDmUsers(req.user!.id);
    res.status(200).json(users);
  } catch (err) { next(err); }
}

export async function getUserStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireParam(req.params.userId, "userId");
    const isOnline = await dmService.checkUserOnline(userId);
    res.status(200).json({ userId, isOnline });
  } catch (err) { next(err); }
}

export async function getUsersStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const userIds = (req.query.ids as string || "").split(",").filter(Boolean);
    if (userIds.length === 0) return res.status(200).json({});
    const statuses = await dmService.checkUsersOnline(userIds);
    res.status(200).json(statuses);
  } catch (err) { next(err); }
}
