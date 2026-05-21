import type { Request, Response, NextFunction } from "express";
import * as memberService from "../services/member.service.js";
import { addMemberSchema, updateMemberRoleSchema } from "../validators/index.js";
import { requireParam } from "../utils/params.js";

export async function listMembers(req: Request, res: Response, next: NextFunction) {
  try {
    const batchId = requireParam(req.params.id, "id");
    const members = await memberService.listMembers(batchId);
    res.status(200).json(members);
  } catch (err) {
    next(err);
  }
}

export async function addMember(req: Request, res: Response, next: NextFunction) {
  try {
    const data = addMemberSchema.parse(req.body);
    const batchId = requireParam(req.params.id, "id");
    const membership = await memberService.addMember(batchId, data.user_id, data.role_in_batch, req.user!.id);
    res.status(201).json(membership);
  } catch (err) {
    next(err);
  }
}

export async function removeMember(req: Request, res: Response, next: NextFunction) {
  try {
    const batchId = requireParam(req.params.id, "id");
    const userId = requireParam(req.params.userId, "userId");
    await memberService.removeMember(batchId, userId, req.user!.id);
    res.status(200).json({ message: "Member removed successfully" });
  } catch (err) {
    next(err);
  }
}

export async function updateMemberRole(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateMemberRoleSchema.parse(req.body);
    const batchId = requireParam(req.params.id, "id");
    const userId = requireParam(req.params.userId, "userId");
    const membership = await memberService.updateMemberRole(batchId, userId, data.role_in_batch, req.user!.id);
    res.status(200).json(membership);
  } catch (err) {
    next(err);
  }
}
