import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import prisma from "../utils/prisma.js";
import { generateAccessToken } from "../utils/jwt.js";
import { createRefreshSession } from "../services/session.service.js";
import { setRefreshCookie } from "../utils/cookies.js";
import { sendOtp, verifyOtp } from "../services/otp.service.js";
import {
  findCrmCustomerByContact,
  getCustomerEnrollments,
} from "../services/crm.client.js";
import { fetchEnrichedData } from "../services/auth.service.js";
import {
  findOrCreateLearner,
  syncBatchMemberships,
} from "../services/learner.provisioning.service.js";
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  AppError,
} from "../utils/errors.js";
import { incrementCounter } from "../utils/metrics.js";

// ── Zod schemas ───────────────────────────────────────────────────────────────

const sendOtpSchema = z
  .object({
    phoneNumber: z.string().regex(/^\d{10}$/, "Phone must be 10 digits").optional(),
    email: z.string().email().optional(),
    provider: z.enum(["website", "crm"]),
  })
  .refine((d) => d.phoneNumber || d.email, { message: "Phone number or email is required" });

const verifyOtpSchema = z
  .object({
    phoneNumber: z.string().regex(/^\d{10}$/).optional(),
    email: z.string().email().optional(),
    otpCode: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
    requestId: z.string().optional(),
    provider: z.enum(["website", "crm"]),
  })
  .refine((d) => d.phoneNumber || d.email, { message: "Phone number or email is required" });

// ── Helpers ───────────────────────────────────────────────────────────────────

function crmError(err: any): AppError {
  const isTimeout = err?.name === "AbortError" || err?.message?.includes("abort");
  return new AppError(
    isTimeout
      ? "Could not reach AcceleratorX servers. Please try again."
      : "CRM service unavailable. Please try again.",
    503
  );
}

// ── Handlers ──────────────────────────────────────────────────────────────────

export async function handleSendOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const data = sendOtpSchema.parse(req.body);
    const identifier = data.email ? data.email.trim().toLowerCase() : data.phoneNumber!.trim();
    const method = data.email ? "email" : "phone";

    if (data.provider === "crm") {
      let customer;
      try {
        customer = await findCrmCustomerByContact(identifier);
      } catch (err) {
        throw crmError(err);
      }
      if (!customer) throw new NotFoundError("No account found with this credential in CRM.");
      if (!customer.Active) throw new ForbiddenError("Your CRM account is inactive.");
    }

    if (data.provider === "website") {
      let user;
      if (data.email) {
        user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
      } else {
        user = await prisma.user.findFirst({ where: { phone: data.phoneNumber } });
      }
      if (!user) {
        // Website learners may have a CRM account — they'll be auto-provisioned on verify.
        const customer = await findCrmCustomerByContact(identifier).catch(() => null);
        if (!customer) {
          throw new NotFoundError("No account found. Please register first.");
        }
      }
    }

    const result = await sendOtp(identifier, method);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function handleVerifyOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const data = verifyOtpSchema.parse(req.body);
    const identifier = data.email ? data.email.trim().toLowerCase() : data.phoneNumber!.trim();

    const otpResult = await verifyOtp(identifier, data.otpCode, data.requestId);
    if (!otpResult.success) {
      incrementCounter("otp_verify_total", {
        provider: data.provider,
        result: otpResult.message?.startsWith("Too many attempts") ? "locked" : "failed",
      });
      throw new UnauthorizedError(otpResult.message ?? "Invalid OTP");
    }
    incrementCounter("otp_verify_total", { provider: data.provider, result: "success" });

    let user;
    let crmCustomer = null;

    if (data.provider === "crm") {
      let customer;
      try {
        customer = await findCrmCustomerByContact(identifier);
      } catch (err) {
        throw crmError(err);
      }
      if (!customer || !customer.Active) {
        throw new UnauthorizedError("CRM account not found or inactive.");
      }
      crmCustomer = customer;
      user = await findOrCreateLearner(customer, "OTP_MANAGED");

      const _userId = user.id;
      const _custId = customer.CustId;
      setImmediate(() => {
        getCustomerEnrollments(_custId)
          .then((enrollments) => syncBatchMemberships(_userId, enrollments))
          .catch((err) => console.error("[bg] OTP CRM batch sync failed:", err));
      });
    } else {
      // Website provider
      if (data.email) {
        user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
      } else {
        user = await prisma.user.findFirst({ where: { phone: data.phoneNumber } });
      }

      if (!user) {
        const customer = await findCrmCustomerByContact(identifier).catch(() => null);
        if (customer && customer.Active) {
          crmCustomer = customer;
          user = await findOrCreateLearner(customer, "OTP_MANAGED");
          const _uid = user.id;
          const _cid = customer.CustId;
          setImmediate(() => {
            getCustomerEnrollments(_cid)
              .then((e) => syncBatchMemberships(_uid, e))
              .catch(() => {});
          });
        } else {
          throw new UnauthorizedError("No account found.");
        }
      }
    }

    if (user.is_banned) throw new ForbiddenError("Your account has been banned.");

    // Issue tokens immediately — enriched CRM/LMS data fires in background.
    const accessToken = generateAccessToken(user as any);
    const refreshToken = await createRefreshSession(user.id);

    setRefreshCookie(res, refreshToken);

    const { password_hash: _, ...userWithoutPassword } = user as any;
    res.status(200).json({ user: userWithoutPassword, accessToken, sources: null });

    // Background: pre-warm enriched data (CRM enrollments + LMS profile).
    if (crmCustomer) {
      setImmediate(() => {
        fetchEnrichedData(crmCustomer!).catch(() => {});
      });
    }
  } catch (err) {
    next(err);
  }
}
