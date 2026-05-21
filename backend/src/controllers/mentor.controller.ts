import type { Request, Response, NextFunction } from "express";
import prisma from "../utils/prisma.js";
import { requireParam } from "../utils/params.js";

export async function listAssignedBatches(req: Request, res: Response, next: NextFunction) {
  try {
    const memberships = await prisma.membership.findMany({
      where: { user_id: req.user!.id, role_in_batch: "mentor" },
      include: {
        batch: {
          include: {
            _count: { select: { memberships: true, messages: true } },
          },
        },
      },
    });

    const batches = memberships.map((m) => m.batch);
    res.status(200).json(batches);
  } catch (err) {
    next(err);
  }
}

export async function listBatchMembers(req: Request, res: Response, next: NextFunction) {
  try {
    const batchId = requireParam(req.params.id, "id");
    // Check if mentor is assigned to this batch
    const membership = await prisma.membership.findUnique({
      where: { user_id_batch_id: { user_id: req.user!.id, batch_id: batchId } },
    });

    if (!membership || membership.role_in_batch !== "mentor") {
      res.status(403).json({ error: "You are not assigned as a mentor to this batch" });
      return;
    }

    const members = await prisma.membership.findMany({
      where: { batch_id: batchId },
      include: {
        user: { select: { id: true, username: true, email: true, role: true } },
      },
      orderBy: { joined_at: "asc" },
    });

    res.status(200).json(members);
  } catch (err) {
    next(err);
  }
}
