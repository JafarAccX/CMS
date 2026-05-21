import type { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { AppError, ValidationError } from "../utils/errors.js";

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  // ── AppError (operational) ───────────────────────────────
  if (err instanceof ValidationError) {
    res.status(422).json({
      error: err.message,
      details: err.details,
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
    });
    return;
  }

  // ── Zod validation errors ───────────────────────────────
  if (err instanceof ZodError) {
    const fieldErrors = err.errors.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    }));
    res.status(422).json({
      error: "Validation error",
      details: fieldErrors,
    });
    return;
  }

  // ── Prisma errors ───────────────────────────────────────
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002":
        res.status(409).json({
          error: "A record with this value already exists",
          field: (err.meta?.target as string[])?.join(", "),
        });
        return;
      case "P2025":
        res.status(404).json({ error: "Record not found" });
        return;
      default:
        res.status(400).json({ error: "Database error" });
        return;
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({ error: "Invalid data provided" });
    return;
  }

  // ── Unhandled errors ─────────────────────────────────────
  console.error("Unhandled error:", err);
  const message =
    process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message || "Internal server error";
  res.status(500).json({ error: message });
}
