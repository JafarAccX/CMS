import type { Request, Response, NextFunction } from "express";
import { getUserClasses } from "../services/classes.service.js";

export async function getMyClasses(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getUserClasses(req.user!.id);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}
