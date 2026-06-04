import bcrypt from "bcrypt";
import crypto from "crypto";
import prisma from "../utils/prisma.js";
import { generateAccessToken } from "../utils/jwt.js";
import { UnauthorizedError, ConflictError, ForbiddenError } from "../utils/errors.js";
import {
  createRefreshSession,
  rotateRefreshSession,
  revokeAllUserSessions,
  type SessionMeta,
} from "./session.service.js";
import type { RegisterInput, LoginInput } from "../validators/index.js";
import {
  loginCrmStaff,
  findCrmCustomerByContact,
  findCrmCustomerByCustId,
  getCustomerEnrollments,
  type CrmCustomer,
  type CrmEnrollmentWithBatch,
} from "./crm.client.js";
import {
  getLmsLearnerData,
  type LmsLearnerData,
} from "./lms.client.js";
import { sendPasswordResetEmail } from "./email.service.js";
import { consumeCooldown } from "../utils/throttle.js";
import {
  ensureUniqueUsername,
  findOrCreateLearner,
  syncBatchMemberships,
} from "./learner.provisioning.service.js";

const BCRYPT_ROUNDS = 12;
const PASSWORD_RESET_TOKEN_BYTES = 32;
const PASSWORD_RESET_TTL_MINUTES = 30;
const PASSWORD_RESET_COOLDOWN_SECONDS = 60;

/**
 * A pre-computed bcrypt hash compared against on the "no such user" login paths.
 * Running a real compare for non-existent accounts keeps response timing similar
 * to the valid-account path, mitigating user-enumeration via timing analysis.
 */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("timing-equalizer-not-a-real-password", BCRYPT_ROUNDS);

export async function registerUser(data: RegisterInput) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: data.email }, { username: data.username }] },
  });
  if (existing) {
    throw new ConflictError("User with this email or username already exists");
  }

  const password_hash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      username: data.username,
      email: data.email,
      phone: data.phone,
      password_hash,
      role: data.role || "learner",
      provider: data.provider,
    },
    select: {
      id: true,
      username: true,
      email: true,
      phone: true,
      role: true,
      provider: true,
      subscription_status: true,
      is_banned: true,
      created_at: true,
    },
  });

  // Create default free subscription
  await prisma.subscription.create({
    data: {
      user_id: user.id,
      plan: "free",
      status: "active",
      started_at: new Date(),
    },
  });

  const fullUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const accessToken = generateAccessToken(fullUser);
  const refreshToken = await createRefreshSession(fullUser.id);

  return { user, accessToken, refreshToken };
}

type IdentifierType = "email" | "phone" | "crm_id";

function detectIdentifierType(identifier: string): IdentifierType {
  if (identifier.includes("@")) return "email";
  const digits = identifier.replace(/[\s\-()]/g, "");
  if (/^\+?\d{7,15}$/.test(digits)) return "phone";
  return "crm_id";
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/[\s\-()]/g, "").replace(/^\+/, "");
  if (digits.startsWith("91") && digits.length > 10) return digits.slice(2);
  return digits;
}

export async function loginUser(data: LoginInput) {
  const identifier = data.identifier.trim();
  if (!identifier) throw new UnauthorizedError("Email, phone, or CRM ID is required");

  const idType = detectIdentifierType(identifier);

  if (data.provider === "crm") {
    // 1) For email logins, always try CRM staff auth FIRST. This keeps the
    //    admin role in sync with CRM even if a stale local user record exists
    //    (e.g. user was previously synced as a learner customer).
    if (idType === "email") {
      try {
        const staff = await loginCrmStaff(identifier, data.password);
        if (staff) {
          const crmRole = (staff.user.role || "").toLowerCase();
          if (crmRole !== "admin") {
            throw new ForbiddenError(
              "Only CRM admins can sign in here. Other staff roles are not yet supported."
            );
          }
          return upsertAndIssueAdmin(staff);
        }
      } catch (err) {
        // Re-throw the explicit role rejection — don't fall back to customer flow
        if (err instanceof ForbiddenError) throw err;
        // Network/CRM unavailable: fall through to local-user / customer flow
        console.warn("CRM staff login attempt failed, trying local fallback:", (err as Error).message);
      }
    }

    // 2) Local user shortcut (only for users with a real password set).
    const localUser = await findLocalUser(identifier, idType);
    if (localUser && localUser.provider === "crm" && localUser.password_hash !== "CRM_MANAGED") {
      if (localUser.is_banned) throw new UnauthorizedError("Your account has been banned");
      const valid = await bcrypt.compare(data.password, localUser.password_hash);
      if (!valid) throw new UnauthorizedError("Invalid credentials");

      return issueTokens(localUser);
    }

    // 3) Fall through to CRM customer (learner) flow.
    return loginViaCrm(identifier, idType, data.password);
  }

  // Website provider — try local DB first, then fall back to CRM lookup
  const localUser = await findLocalUser(identifier, idType);
  if (localUser) {
    if (localUser.is_banned) throw new UnauthorizedError("Your account has been banned");
    const valid = await bcrypt.compare(data.password, localUser.password_hash);
    if (!valid) throw new UnauthorizedError("Invalid credentials");

    // Move all CRM/LMS enrichment to background — issue the token immediately.
    const customer = await findCrmCustomer(identifier, idType).catch(() => null);
    if (customer) {
      const updates: Record<string, unknown> = {};
      if (!localUser.phone && customer.Mobile) updates.phone = String(customer.Mobile);
      if (!localUser.avatar_url && customer.ProfilePicture) updates.avatar_url = customer.ProfilePicture;
      setImmediate(() => {
        const syncUser = Object.keys(updates).length > 0
          ? prisma.user.update({ where: { id: localUser.id }, data: updates }).catch(() => {})
          : Promise.resolve();
        syncUser.then(() =>
          getCustomerEnrollments(customer.CustId)
            .then((enrollments) => syncBatchMemberships(localUser.id, enrollments))
            .catch((err) => console.error("[bg] Batch sync failed:", err))
        );
        fetchEnrichedData(customer).catch(() => {});
      });
    }

    return issueTokens(localUser);
  }

  // Not in local DB — try CRM customer lookup (cross-system)
  const customer = await findCrmCustomer(identifier, idType);
  if (customer) {
    if (!customer.Active) throw new UnauthorizedError("Your CRM account is inactive");
    const cmsUser = await findOrCreateLearnerUser(customer, data.password);

    // Fire all CRM/LMS work in background — token issued immediately.
    setImmediate(() => {
      getCustomerEnrollments(customer.CustId)
        .then((enrollments) => syncBatchMemberships(cmsUser.id, enrollments))
        .catch((err) => console.error("[bg] CRM batch sync failed:", err));
      fetchEnrichedData(customer).catch(() => {});
    });

    return issueTokens(cmsUser);
  }

  // No local user and no CRM match. Run a dummy compare so response timing
  // matches the valid-account path, then return a generic error (no enumeration).
  await bcrypt.compare(data.password, DUMMY_PASSWORD_HASH);
  throw new UnauthorizedError("Invalid credentials");
}

// ─── Local user lookup (CMS database) ──────────────────────────────────────

async function findLocalUser(identifier: string, idType: IdentifierType) {
  if (idType === "email") {
    return prisma.user.findUnique({ where: { email: identifier } });
  }
  if (idType === "phone") {
    const normalized = normalizePhone(identifier);
    return prisma.user.findFirst({ where: { phone: normalized } }) ??
           prisma.user.findFirst({ where: { phone: identifier } });
  }
  // CRM ID — no direct field in local DB, skip
  return null;
}

// ─── CRM customer lookup across identifier types ───────────────────────────

async function findCrmCustomer(identifier: string, idType: IdentifierType) {
  try {
    if (idType === "crm_id") {
      return await findCrmCustomerByCustId(identifier);
    }
    return await findCrmCustomerByContact(identifier);
  } catch {
    return null;
  }
}

// ─── CRM-provider login ────────────────────────────────────────────────────

async function loginViaCrm(identifier: string, idType: IdentifierType, password: string) {
  // 1. Check if this identifier belongs to a CRM customer (learner).
  let customer;
  try {
    customer = await findCrmCustomer(identifier, idType);
  } catch (err) {
    throw new UnauthorizedError("CRM service is temporarily unavailable. Please try again later.");
  }

  if (customer) {
    if (!customer.Active) {
      throw new UnauthorizedError("Your CRM account is inactive");
    }

    const cmsUser = await findOrCreateLearnerUser(customer, password);
    const enriched = await fetchEnrichedData(customer).catch(() => null);

    setImmediate(() => {
      getCustomerEnrollments(customer.CustId)
        .then((enrollments) => syncBatchMemberships(cmsUser.id, enrollments))
        .catch((err) => console.error("[bg] CRM batch sync failed:", err));
    });

    return issueTokens(cmsUser, enriched);
  }

  // 2. Not a customer. Staff login is already handled by loginUser() before
  //    this function is called for emails, so getting here means: not a
  //    customer, and (if email) staff login also failed → no account.
  //    Use a generic error + dummy compare so we don't reveal account existence.
  await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
  throw new UnauthorizedError("Invalid credentials");
}

async function upsertAndIssueAdmin(staff: { user: { id: string; email: string; full_name?: string | null; mobile_number?: string | null } }) {
  const email = staff.user.email;
  const username =
    (staff.user.full_name && staff.user.full_name.trim()) || email.split("@")[0];

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        username: await ensureUniqueUsername(username),
        phone: staff.user.mobile_number ?? null,
        password_hash: "CRM_MANAGED",
        role: "admin",
        provider: "crm",
      },
    });
    await prisma.subscription.create({
      data: { user_id: user.id, plan: "free", status: "active", started_at: new Date() },
    });
  } else if (user.role !== "admin" || user.provider !== "crm") {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { role: "admin", provider: "crm" },
    });
  }

  if (user.is_banned) throw new UnauthorizedError("Your account has been banned");
  return issueTokens(user);
}

async function findOrCreateLearnerUser(
  customer: NonNullable<Awaited<ReturnType<typeof findCrmCustomerByContact>>>,
  passwordPlain: string
) {
  // Try to find an existing user first (by email then phone).
  const email = customer.Email?.toLowerCase() ?? null;
  const phone = String(customer.Mobile);

  let user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  if (!user) user = await prisma.user.findFirst({ where: { phone } });

  if (user) {
    if (user.is_banned) throw new UnauthorizedError("Your account has been banned");
    // CRM_MANAGED means first login — set a real password now.
    if (user.password_hash === "CRM_MANAGED" || user.password_hash === "OTP_MANAGED") {
      const newHash = await bcrypt.hash(passwordPlain, BCRYPT_ROUNDS);
      user = await prisma.user.update({ where: { id: user.id }, data: { password_hash: newHash } });
    } else {
      const ok = await bcrypt.compare(passwordPlain, user.password_hash);
      if (!ok) throw new UnauthorizedError("Invalid credentials");
    }
    return user;
  }

  // No existing record — provision via shared service, using a real hashed password.
  const password_hash = await bcrypt.hash(passwordPlain, BCRYPT_ROUNDS);
  return findOrCreateLearner(customer, password_hash);
}

// ensureUniqueUsername, syncBatchMemberships, and findOrCreateLearner are now
// provided by learner.provisioning.service.ts (imported at the top of this file).

// ─── Enriched data fetching ──────────────────────────────────────────────

export async function fetchEnrichedData(customer: CrmCustomer | null) {
  if (!customer) return { crm: null, lms: null, crmEnrollments: null };

  const custId = customer.CustId;

  const [crmEnrollments, lmsData] = await Promise.all([
    getCustomerEnrollments(custId).catch((err) => {
      console.error("Failed to fetch CRM enrollments for login response:", err);
      return [] as CrmEnrollmentWithBatch[];
    }),
    getLmsLearnerData(custId).catch((err) => {
      console.error("Failed to fetch LMS data for login response:", err);
      return { profile: null, courses: [] } as LmsLearnerData;
    }),
  ]);

  const crmProfile = {
    custId: customer.CustId,
    email: customer.Email,
    mobile: customer.Mobile,
    firstName: customer.FirstName,
    lastName: customer.LastName,
    active: customer.Active,
    profilePicture: customer.ProfilePicture,
  };

  const crmEnrollmentsMapped = crmEnrollments.map((e) => ({
    batchId: e.BatchId,
    batchName: e.Batch?.Batch,
    course: e.Batch?.Course,
    startDate: e.Batch?.StartDate,
    endDate: e.Batch?.EndDate,
    paymentStatus: e.PaymentStatus,
    completionStatus: e.CompletionStatus,
    active: e.Active,
  }));

  return {
    crm: crmProfile,
    lms: lmsData,
    crmEnrollments: crmEnrollmentsMapped,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

async function issueTokens(
  user: { id: string; email: string; role: string; password_hash: string; is_banned: boolean },
  enriched?: { crm: any; lms: any; crmEnrollments: any } | null
) {
  if (user.is_banned) throw new UnauthorizedError("Your account has been banned");
  const accessToken = generateAccessToken(user as any);
  const refreshToken = await createRefreshSession(user.id);
  const { password_hash: _ph, ...userWithoutPassword } = user as any;
  return {
    user: userWithoutPassword,
    accessToken,
    refreshToken,
    ...(enriched ? { sources: enriched } : {}),
  };
}

/**
 * Learner login: verify phone + email both match a CRM customer record.
 * No password required — CRM identity match is the credential.
 */
export async function learnerLogin(phone: string, email: string) {
  const normalizedPhone = normalizePhone(phone.trim());
  const submittedEmail = email.trim().toLowerCase();

  // 1. Find CRM customer by phone
  const customer = await findCrmCustomerByContact(normalizedPhone).catch(() => null);
  if (!customer) {
    throw new UnauthorizedError(
      "No account found with that phone number. Please use the number registered with AcceleratorX."
    );
  }
  if (!customer.Active) {
    throw new UnauthorizedError("Your account is inactive. Please contact support.");
  }

  // 2. Verify email matches CRM record — both fields must match
  const crmEmail = (customer.Email ?? "").toLowerCase();
  if (!crmEmail || crmEmail !== submittedEmail) {
    throw new UnauthorizedError(
      "Phone and email do not match our records. Please use the email registered with AcceleratorX."
    );
  }

  // 3. Find or create local CMS user (passwordless — identity proven by CRM match)
  let cmsUser = customer.Email
    ? await prisma.user.findUnique({ where: { email: customer.Email.toLowerCase() } })
    : null;

  if (!cmsUser) {
    cmsUser = await prisma.user.findFirst({ where: { phone: normalizedPhone } });
  }

  if (!cmsUser) {
    const fullName =
      [customer.FirstName, customer.LastName].filter(Boolean).join(" ").trim() ||
      (customer.Email ? customer.Email.split("@")[0] : `learner-${customer.CustId}`);

    const emailForDb = customer.Email ?? `cust-${customer.CustId}@crm.local`;

    cmsUser = await prisma.user.create({
      data: {
        email: emailForDb,
        username: await ensureUniqueUsername(fullName),
        phone: normalizedPhone,
        password_hash: "CRM_MANAGED",
        role: "learner",
        provider: "crm",
      },
    });
    await prisma.subscription.create({
      data: { user_id: cmsUser.id, plan: "free", status: "active", started_at: new Date() },
    });
  }

  if (cmsUser.is_banned) throw new UnauthorizedError("Your account has been banned.");

  // 4. Sync missing profile fields from CRM
  const profileUpdates: Record<string, unknown> = {};
  if (!cmsUser.phone) profileUpdates.phone = normalizedPhone;
  if (!cmsUser.avatar_url && customer.ProfilePicture) profileUpdates.avatar_url = customer.ProfilePicture;
  if (Object.keys(profileUpdates).length > 0) {
    cmsUser = await prisma.user.update({ where: { id: cmsUser.id }, data: profileUpdates });
  }

  // 5. Issue tokens immediately — don't block on enriched data or batch sync.
  // Both are fired in the background so the learner gets their token fast.
  // enrichedData (CRM enrollments + LMS profile) is nice-to-have for the
  // initial response payload; the client can re-fetch on next login if absent.
  const tokens = await issueTokens(cmsUser);

  setImmediate(() => {
    const _custId = customer!.CustId;
    const _userId = cmsUser!.id;
    // Batch membership sync
    getCustomerEnrollments(_custId)
      .then((enrollments) => syncBatchMemberships(_userId, enrollments))
      .catch((err) => console.error("[bg] Learner batch sync failed:", err));
    // Enriched data pre-warm (optional — silently discarded if slow)
    fetchEnrichedData(customer!).catch(() => {});
  });

  return tokens;
}

function hashResetToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getClientOrigin() {
  const explicit = process.env.FRONTEND_URL || process.env.CLIENT_URL || process.env.CLIENT_ORIGIN;
  return (explicit?.split(",")[0]?.trim() || "http://localhost:5173").replace(/\/$/, "");
}

export async function requestPasswordReset(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  // Always return the same public outcome so this endpoint cannot reveal accounts.
  if (!user || user.is_banned || normalizedEmail.endsWith("@crm.local")) {
    return { message: "If that email exists, a password reset link has been sent." };
  }

  // Throttle reset emails per target to prevent inbox bombing. Same neutral
  // response so the cooldown doesn't reveal that the account exists.
  if (!(await consumeCooldown(`cooldown:pwreset:${normalizedEmail}`, PASSWORD_RESET_COOLDOWN_SECONDS))) {
    return { message: "If that email exists, a password reset link has been sent." };
  }

  const token = crypto.randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString("base64url");
  const tokenHash = hashResetToken(token);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);

  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { user_id: user.id, used_at: null },
      data: { used_at: new Date() },
    }),
    prisma.passwordResetToken.deleteMany({
      where: { expires_at: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
    prisma.passwordResetToken.create({
      data: {
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
      },
    }),
  ]);

  const resetUrl = `${getClientOrigin()}/login?resetToken=${encodeURIComponent(token)}`;
  try {
    await sendPasswordResetEmail(user.email, resetUrl, user.username);
  } catch (err: any) {
    // Never surface mail-provider/transport failures to the client. Doing so would
    // (1) crash the flow on any provider hiccup, and (2) break the account-enumeration
    // guarantee — a 500 would only ever happen for real accounts, revealing which
    // emails exist. The reset token is already persisted; log loudly to diagnose.
    const detail = err?.response?.body ?? err?.response?.data ?? err?.message ?? err;
    console.error(`[AUTH] Failed to send password reset email to ${user.email}:`, detail);
  }

  return { message: "If that email exists, a password reset link has been sent." };
}

export async function resetPassword(token: string, newPassword: string) {
  const tokenHash = hashResetToken(token.trim());
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { token_hash: tokenHash },
    include: { user: true },
  });

  if (!resetToken || resetToken.used_at || resetToken.expires_at.getTime() < Date.now()) {
    throw new UnauthorizedError("This reset link is invalid or has expired.");
  }
  if (resetToken.user.is_banned) {
    throw new UnauthorizedError("Your account has been banned.");
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.user_id },
      data: { password_hash: passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { used_at: new Date() },
    }),
    prisma.passwordResetToken.updateMany({
      where: { user_id: resetToken.user_id, used_at: null },
      data: { used_at: new Date() },
    }),
    // Invalidate every existing session so a reset truly locks out any attacker
    // who already had access.
    prisma.refreshToken.updateMany({
      where: { user_id: resetToken.user_id, revoked_at: null },
      data: { revoked_at: new Date() },
    }),
  ]);

  return { message: "Password reset successfully. You can now sign in." };
}

export async function refreshAccessToken(refreshTokenCookie: string, meta: SessionMeta = {}) {
  if (!refreshTokenCookie) {
    throw new UnauthorizedError("No refresh token provided");
  }

  // Rotate the session: the presented token is revoked and a new one issued.
  const { userId, refreshToken } = await rotateRefreshSession(refreshTokenCookie, meta);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new UnauthorizedError("User not found");
  if (user.is_banned) {
    await revokeAllUserSessions(user.id);
    throw new UnauthorizedError("Your account has been banned");
  }

  const accessToken = generateAccessToken(user);
  return { accessToken, refreshToken };
}
