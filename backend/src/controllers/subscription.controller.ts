import type { Request, Response, NextFunction } from "express";
import * as subscriptionService from "../services/subscription.service.js";

export async function getSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    const sub = await subscriptionService.getMySubscription(req.user!.id);
    res.status(200).json(sub);
  } catch (err) {
    next(err);
  }
}

export async function upgrade(req: Request, res: Response, next: NextFunction) {
  try {
    const sub = await subscriptionService.upgradeSubscription(req.user!.id);
    res.status(200).json(sub);
  } catch (err) {
    next(err);
  }
}

export async function cancel(req: Request, res: Response, next: NextFunction) {
  try {
    const sub = await subscriptionService.cancelSubscription(req.user!.id);
    res.status(200).json(sub);
  } catch (err) {
    next(err);
  }
}
