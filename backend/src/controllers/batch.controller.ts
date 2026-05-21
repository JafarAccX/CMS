import type { Request, Response, NextFunction } from "express";
import * as batchService from "../services/batch.service.js";
import { createBatchSchema, updateBatchSchema } from "../validators/index.js";
import { requireParam } from "../utils/params.js";

export async function listBatches(req: Request, res: Response, next: NextFunction) {
  try {
    const batches = await batchService.listBatches(req.user!);
    res.status(200).json(batches);
  } catch (err) {
    next(err);
  }
}

export async function createBatch(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createBatchSchema.parse(req.body);
    const batch = await batchService.createBatch(data, req.user!.id);
    res.status(201).json(batch);
  } catch (err) {
    next(err);
  }
}

export async function getBatch(req: Request, res: Response, next: NextFunction) {
  try {
    const batchId = requireParam(req.params.id, "id");
    const batch = await batchService.getBatchById(batchId);
    res.status(200).json(batch);
  } catch (err) {
    next(err);
  }
}

export async function updateBatch(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateBatchSchema.parse(req.body);
    const batchId = requireParam(req.params.id, "id");
    const batch = await batchService.updateBatch(batchId, data, req.user!.id);
    res.status(200).json(batch);
  } catch (err) {
    next(err);
  }
}

export async function archiveBatch(req: Request, res: Response, next: NextFunction) {
  try {
    const batchId = requireParam(req.params.id, "id");
    await batchService.archiveBatch(batchId, req.user!.id);
    res.status(200).json({ message: "Batch archived successfully" });
  } catch (err) {
    next(err);
  }
}
