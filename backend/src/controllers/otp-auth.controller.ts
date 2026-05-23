import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import prisma from "../utils/prisma.js";
import { generateAccessToken, generateRefreshToken } from "../utils/jwt.js";
import { sendOtp, verifyOtp } from "../services/otp.service.js";
import {
  findCrmCustomerByContact,
  getCustomerEnrollments,
} from "../services/crm.client.js";
import { fetchEnrichedData } from "../services/auth.service.js";
import { UnauthorizedError } from "../utils/errors.js";

const sendOtpSchema = z.object({
  phoneNumber: z.string().regex(/^\d{10}$/, "Phone must be 10 digits").optional(),
  email: z.string().email().optional(),
  provider: z.enum(["website", "crm"]),
}).refine((d) => d.phoneNumber || d.email, {
  message: "Phone number or email is required",
});

const verifyOtpSchema = z.object({
  phoneNumber: z.string().regex(/^\d{10}$/).optional(),
  email: z.string().email().optional(),
  otpCode: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
  requestId: z.string().optional(),
  provider: z.enum(["website", "crm"]),
}).refine((d) => d.phoneNumber || d.email, {
  message: "Phone number or email is required",
});

export async function handleSendOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const data = sendOtpSchema.parse(req.body);
    const identifier = data.email
      ? data.email.trim().toLowerCase()
      : data.phoneNumber!.trim();
    const method = data.email ? "email" : "phone";

    // For CRM provider, verify the user exists in CRM first
    if (data.provider === "crm") {
      let customer;
      try {
        customer = await findCrmCustomerByContact(identifier);
      } catch (crmErr: any) {
        const isTimeout = crmErr?.name === "AbortError" || crmErr?.message?.includes("abort");
        res.status(503).json({
          error: isTimeout
            ? "Could not reach AcceleratorX servers. Please try again."
            : "CRM service unavailable. Please try again.",
        });
        return;
      }
      if (!customer) {
        res.status(404).json({ error: "No account found with this credential in CRM." });
        return;
      }
      if (!customer.Active) {
        res.status(403).json({ error: "Your CRM account is inactive." });
        return;
      }
    }

    // For website provider, check if user exists locally
    if (data.provider === "website") {
      let user;
      if (data.email) {
        user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
      } else {
        user = await prisma.user.findFirst({ where: { phone: data.phoneNumber } });
      }
      if (!user) {
        // For website learners with CRM accounts, still allow — they'll be auto-provisioned
        const customer = await findCrmCustomerByContact(identifier).catch(() => null);
        if (!customer) {
          res.status(404).json({ error: "No account found. Please register first." });
          return;
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
    const identifier = data.email
      ? data.email.trim().toLowerCase()
      : data.phoneNumber!.trim();

    // Verify the OTP
    const otpResult = await verifyOtp(identifier, data.otpCode, data.requestId);
    if (!otpResult.success) {
      res.status(401).json({ error: otpResult.message });
      return;
    }

    // Find or create user
    let user;

    let crmCustomer = null;

    if (data.provider === "crm") {
      // Look up customer in CRM and auto-provision
      let customer;
      try {
        customer = await findCrmCustomerByContact(identifier);
      } catch (crmErr: any) {
        const isTimeout = crmErr?.name === "AbortError" || crmErr?.message?.includes("abort");
        res.status(503).json({
          error: isTimeout
            ? "Could not reach AcceleratorX servers. Please try again."
            : "CRM service unavailable. Please try again.",
        });
        return;
      }
      if (!customer || !customer.Active) {
        res.status(401).json({ error: "CRM account not found or inactive." });
        return;
      }
      crmCustomer = customer;
      user = await findOrCreateFromCrm(customer);

      // Sync enrollments (best-effort)
      try {
        const enrollments = await getCustomerEnrollments(customer.CustId);
        await syncBatchMemberships(user.id, enrollments);
      } catch (err) {
        console.error("CRM batch sync failed during OTP login:", err);
      }
    } else {
      // Website provider
      if (data.email) {
        user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
      } else {
        user = await prisma.user.findFirst({ where: { phone: data.phoneNumber } });
      }

      if (!user) {
        // Auto-provision from CRM if customer exists
        const customer = await findCrmCustomerByContact(identifier).catch(() => null);
        if (customer && customer.Active) {
          crmCustomer = customer;
          user = await findOrCreateFromCrm(customer);
          try {
            const enrollments = await getCustomerEnrollments(customer.CustId);
            await syncBatchMemberships(user.id, enrollments);
          } catch {}
        } else {
          res.status(401).json({ error: "No account found." });
          return;
        }
      }
    }

    if (user.is_banned) {
      res.status(403).json({ error: "Your account has been banned." });
      return;
    }

    // Fetch enriched CRM + LMS data for the response (best-effort)
    const sources = await fetchEnrichedData(crmCustomer).catch(() => null);

    const accessToken = generateAccessToken(user as any);
    const refreshToken = generateRefreshToken(user as any);

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const { password_hash: _, ...userWithoutPassword } = user as any;
    res.status(200).json({
      user: userWithoutPassword,
      accessToken,
      sources,
    });
  } catch (err) {
    next(err);
  }
}

// --- Helpers ---

async function findOrCreateFromCrm(customer: {
  Id: string;
  CustId: string;
  Email?: string | null;
  Mobile: string;
  FirstName?: string | null;
  LastName?: string | null;
}) {
  const email = customer.Email?.toLowerCase() ?? null;
  const phone = String(customer.Mobile);

  let user = email
    ? await prisma.user.findUnique({ where: { email } })
    : null;

  if (!user) {
    user = await prisma.user.findFirst({ where: { phone } });
  }

  if (user) return user;

  // Auto-provision
  const fullName =
    [customer.FirstName, customer.LastName].filter(Boolean).join(" ").trim() ||
    (email ? email.split("@")[0] : `learner-${customer.CustId}`);

  const finalEmail = email ?? `cust-${customer.CustId}@crm.local`;
  const username = await ensureUniqueUsername(fullName);

  const created = await prisma.user.create({
    data: {
      email: finalEmail,
      username,
      phone,
      password_hash: "OTP_MANAGED",
      role: "learner",
      provider: "crm",
    },
  });

  await prisma.subscription.create({
    data: { user_id: created.id, plan: "free", status: "active", started_at: new Date() },
  });

  return created;
}

async function ensureUniqueUsername(base: string): Promise<string> {
  const sanitized = base.replace(/\s+/g, " ").trim().slice(0, 45) || "user";
  let candidate = sanitized;
  let suffix = 1;
  while (await prisma.user.findUnique({ where: { username: candidate } })) {
    suffix += 1;
    candidate = `${sanitized.slice(0, 40)} ${suffix}`;
  }
  return candidate;
}

async function syncBatchMemberships(
  userId: string,
  enrollments: { BatchId: string; Active: boolean; Batch: { Batch: string; Course?: string } }[]
) {
  if (!enrollments.length) return;

  const defaultOrg = await prisma.organization.findFirst();
  const defaultAdmin = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!defaultOrg || !defaultAdmin) return;

  for (const enr of enrollments) {
    if (!enr.Active || !enr.Batch?.Batch) continue;

    let batch = await prisma.batch.findFirst({
      where: { name: { equals: enr.Batch.Batch, mode: "insensitive" } },
    });

    if (!batch) {
      batch = await prisma.batch.create({
        data: {
          name: enr.Batch.Batch,
          type: "private",
          org_id: defaultOrg.id,
          created_by: defaultAdmin.id,
          description: `Auto-synced from CRM (Course: ${enr.Batch.Course ?? "—"})`,
        },
      });
      await prisma.channel.create({
        data: { batch_id: batch.id, name: "channel1", created_by: defaultAdmin.id },
      });
    }

    await prisma.membership.upsert({
      where: { user_id_batch_id: { user_id: userId, batch_id: batch.id } },
      update: {},
      create: { user_id: userId, batch_id: batch.id, role_in_batch: "member" },
    });
  }
}
