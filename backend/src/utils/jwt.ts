import jwt, { type SignOptions } from "jsonwebtoken";
import type { User } from "@prisma/client";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "changeme_access";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "changeme_refresh";
const ACCESS_EXPIRES = (process.env.JWT_ACCESS_EXPIRES || "15m") as SignOptions["expiresIn"];
const REFRESH_EXPIRES = (process.env.JWT_REFRESH_EXPIRES || "7d") as SignOptions["expiresIn"];

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

export function generateAccessToken(user: User): string {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role } as JwtPayload,
    ACCESS_SECRET,
    { expiresIn: ACCESS_EXPIRES }
  );
}

export function generateRefreshToken(user: User): string {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role } as JwtPayload,
    REFRESH_SECRET,
    { expiresIn: REFRESH_EXPIRES }
  );
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, ACCESS_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, REFRESH_SECRET) as JwtPayload;
}
