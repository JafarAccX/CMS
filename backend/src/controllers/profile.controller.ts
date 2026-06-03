import type { Request, Response, NextFunction } from "express";
import prisma from "../utils/prisma.js";
import { updateProfileSchema, changePasswordSchema } from "../validators/index.js";
import bcrypt from "bcrypt";
import { UnauthorizedError } from "../utils/errors.js";
import { revokeAllUserSessions, createRefreshSession } from "../services/session.service.js";
import { setRefreshCookie } from "../utils/cookies.js";

export async function getProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        provider: true,
        subscription_status: true,
        is_banned: true,
        bio: true,
        phone: true,
        avatar_url: true,
        created_at: true,
      },
    });
    res.status(200).json(user);
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateProfileSchema.parse(req.body);
    const updated = await prisma.user.update({
      where: { id: req.user!.id },
      data,
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        bio: true,
        phone: true,
        avatar_url: true,
      },
    });
    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}

export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    const data = changePasswordSchema.parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });

    const isValid = await bcrypt.compare(data.currentPassword, user.password_hash);
    if (!isValid) throw new UnauthorizedError("Invalid current password");

    const password_hash = await bcrypt.hash(data.newPassword, 12);
    await prisma.user.update({ where: { id: req.user!.id }, data: { password_hash } });

    // Revoke every session (including potential attacker sessions), then issue a
    // fresh one for this device so the user stays logged in on the current browser.
    await revokeAllUserSessions(req.user!.id);
    const newRefreshToken = await createRefreshSession(req.user!.id);
    setRefreshCookie(res, newRefreshToken);

    res.status(200).json({ message: "Password updated successfully" });
  } catch (err) {
    next(err);
  }
}
