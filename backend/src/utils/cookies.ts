import type { CookieOptions, Response } from "express";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const isProd = process.env.NODE_ENV === "production";

// SameSite controls whether the refresh cookie is sent on cross-site requests.
// If the frontend and backend are on different sites (e.g. Vercel frontend +
// separate API domain), this MUST be "none" (which also forces Secure) or the
// browser won't send the cookie to /auth/refresh. Default "strict" for same-site.
const sameSite = ((process.env.COOKIE_SAMESITE || "strict").toLowerCase()) as "strict" | "lax" | "none";

const refreshCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: sameSite === "none" ? true : isProd,
  sameSite,
  path: "/",
};

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie("refreshToken", token, { ...refreshCookieOptions, maxAge: SEVEN_DAYS_MS });
}

export function clearRefreshCookie(res: Response): void {
  // clearCookie must use matching attributes (path/sameSite/secure) to delete.
  res.clearCookie("refreshToken", refreshCookieOptions);
}
