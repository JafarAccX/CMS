import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as authService from "../services/auth.service.js";
import { registerSchema, loginSchema, strongPassword } from "../validators/index.js";
import { setRefreshCookie, clearRefreshCookie } from "../utils/cookies.js";
import { revokeRefreshSession } from "../services/session.service.js";

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const data = registerSchema.parse(req.body);
    const result = await authService.registerUser(data);

    setRefreshCookie(res, result.refreshToken);

    res.status(201).json({
      user: result.user,
      accessToken: result.accessToken,
    });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const data = loginSchema.parse(req.body);
    const result = await authService.loginUser(data);

    setRefreshCookie(res, result.refreshToken);

    res.status(200).json({
      user: result.user,
      accessToken: result.accessToken,
      sources: (result as any).sources ?? null,
    });
  } catch (err) {
    next(err);
  }
}

const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    const result = await authService.requestPasswordReset(email);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

const resetPasswordSchema = z.object({
  token: z.string().min(20),
  password: strongPassword,
});

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { token, password } = resetPasswordSchema.parse(req.body);
    const result = await authService.resetPassword(token, password);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

const learnerLoginSchema = z.object({
  phone: z.string().regex(/^\d{10}$/, "Phone must be 10 digits"),
  email: z.string().email("Enter a valid email address"),
});

export async function learnerLogin(req: Request, res: Response, next: NextFunction) {
  try {
    const { phone, email } = learnerLoginSchema.parse(req.body);
    const result = await authService.learnerLogin(phone, email);

    setRefreshCookie(res, result.refreshToken);

    res.status(200).json({
      user: result.user,
      accessToken: result.accessToken,
      sources: (result as any).sources ?? null,
    });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const refreshTokenCookie = req.cookies?.refreshToken;
    const result = await authService.refreshAccessToken(refreshTokenCookie, {
      userAgent: req.headers["user-agent"] ?? null,
      ip: req.ip ?? null,
    });

    // Rotation issues a new refresh token — replace the cookie.
    setRefreshCookie(res, result.refreshToken);

    res.status(200).json({
      accessToken: result.accessToken,
    });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    await revokeRefreshSession(req.cookies?.refreshToken);
    clearRefreshCookie(res);
    res.status(200).json({ message: "Logged out successfully" });
  } catch (err) {
    next(err);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    res.status(200).json({ user: req.user });
  } catch (err) {
    next(err);
  }
}
