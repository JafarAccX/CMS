import bcrypt from "bcrypt";
import crypto from "crypto";
import prisma from "../utils/prisma.js";
import { generateAccessToken } from "../utils/jwt.js";
import { UnauthorizedError, ConflictError } from "../utils/errors.js";
import {
  createRefreshSession,
  rotateRefreshSession,
  revokeAllUserSessions,
  type SessionMeta,
} from "./session.service.js";
import type { RegisterInput, LoginInput } from "../validators/index.js";
import {
  loginCrmStaff,
  verifyCrmMentorLogin,
  findCrmCustomerByContact,
  findCrmCustomerByCustId,
  findCrmMentorByContact,
  getCustomerEnrollments,
  type CrmCustomer,
  type CrmEnrollmentWithBatch,
  type CrmMentor,
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
    // 1) For email logins, always try CRM staff auth FIRST.
    if (idType === "email") {
      try {
        const staff = await loginCrmStaff(identifier, data.password);
        if (staff) {
          const crmRole = (staff.user.role || "").toLowerCase();
          if (crmRole === "admin") {
            return upsertAndIssueAdmin(staff);
          }
        }
      } catch (err) {
        console.warn("CRM staff login attempt failed, trying local fallback:", (err as Error).message);
      }

      try {
        const mentor = await verifyCrmMentorLogin(identifier, data.password);
        if (mentor) {
          if (mentor.Active === false) throw new UnauthorizedError("Your mentor account is inactive");
          return upsertAndIssueMentor(mentor);
        }
      } catch (err) {
        console.warn("CRM mentor login attempt failed, trying local fallback:", (err as Error).message);
      }
    }

    // 2) Local user shortcut (only for users with a real password set).
    const localUser = await findLocalUser(identifier, idType);
    if (
      localUser &&
      localUser.provider === "crm" &&
      localUser.password_hash !== "CRM_MANAGED" &&
      localUser.password_hash !== "OTP_MANAGED"
    ) {
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

    setImmediate(() => {
      getCustomerEnrollments(customer.CustId)
        .then((enrollments) => syncBatchMemberships(cmsUser.id, enrollments))
        .catch((err) => console.error("[bg] CRM batch sync failed:", err));
      fetchEnrichedData(customer).catch(() => {});
    });

    return issueTokens(cmsUser);
  }

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

async function upsertAndIssueMentor(crmMentor: CrmMentor) {
  const crmMentorId = String(crmMentor.Id || "").trim();
  const email = crmMentor.Email?.trim().toLowerCase();
  if (!crmMentorId || !email) throw new UnauthorizedError("Invalid mentor account");

  const usernameBase = crmMentor.Name?.trim() || email.split("@")[0];
  const phone = crmMentor.Mobile ? String(crmMentor.Mobile) : null;
  const bio = [
    crmMentor.Designation,
    crmMentor.Education,
    crmMentor.AdditionalInfo,
  ]
    .map((value) => (value == null ? "" : String(value).trim()))
    .filter(Boolean)
    .join(" | ") || null;

  let user =
    (await prisma.user.findUnique({ where: { crm_mentor_id: crmMentorId } })) ??
    (await prisma.user.findUnique({ where: { email } }));

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        username: await ensureUniqueUsername(usernameBase),
        phone,
        bio,
        password_hash: "CRM_MANAGED",
        role: "mentor",
        provider: "crm",
        crm_mentor_id: crmMentorId,
      },
    });
    await prisma.subscription.create({
      data: { user_id: user.id, plan: "free", status: "active", started_at: new Date() },
    });
  } else {
    const dataToUpdate: Record<string, unknown> = {
      provider: "crm",
      crm_mentor_id: user.crm_mentor_id ?? crmMentorId,
    };
    if (user.role !== "admin") dataToUpdate.role = "mentor";
    if (!user.phone && phone) dataToUpdate.phone = phone;
    if (!user.bio && bio) dataToUpdate.bio = bio;
    if (user.email !== email) dataToUpdate.email = email;

    const changed = Object.entries(dataToUpdate).some(
      ([key, value]) => (user as any)[key] !== value
    );
    if (changed) {
      user = await prisma.user.update({ where: { id: user.id }, data: dataToUpdate });
    }
  }

  if (user.is_banned) throw new UnauthorizedError("Your account has been banned");
  return issueTokens(user);
}

async function findOrCreateLearnerUser(
  customer: NonNullable<Awaited<ReturnType<typeof findCrmCustomerByContact>>>,
  passwordPlain: string
) {
  const email = customer.Email?.toLowerCase() ?? null;
  const phone = String(customer.Mobile);

  let user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  if (!user) user = await prisma.user.findFirst({ where: { phone } });

  if (user) {
    if (user.is_banned) throw new UnauthorizedError("Your account has been banned");
    if (user.password_hash === "CRM_MANAGED" || user.password_hash === "OTP_MANAGED") {
      const newHash = await bcrypt.hash(passwordPlain, BCRYPT_ROUNDS);
      user = await prisma.user.update({ where: { id: user.id }, data: { password_hash: newHash } });
    } else {
      const ok = await bcrypt.compare(passwordPlain, user.password_hash);
      if (!ok) throw new UnauthorizedError("Invalid credentials");
    }
    return user;
  }

  const password_hash = await bcrypt.hash(passwordPlain, BCRYPT_ROUNDS);
  return findOrCreateLearner(customer, password_hash);
}

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
 * Learner/Mentor SSO login: verify phone + email both match a CRM record.
 * No password required — CRM identity match is the credential.
 *
 * Flow (optimized):
 *   FAST PATH (known user):
 *     1. Look up user in local CMS DB by email.
 *     2. If found with matching phone + provider=crm → issue tokens immediately.
 *        CRM re-verification + batch sync run in the background.
 *
 *   SLOW PATH (new / unknown user):
 *     1. Try CRM customer (learner) lookup by phone.
 *     2. If found → verify email matches → provision learner CMS user.
 *     3. If NOT found as customer → try CRM mentor lookup by email.
 *     4. If found as mentor AND the phone matches → provision/update mentor CMS user.
 *
 * The fast path removes the ~300-700ms CRM round-trip for every repeat
 * community embed SSO call (which fires on every /community page visit).
 */
export async function learnerLogin(phone: string, email: string) {
  const normalizedPhone = normalizePhone(phone.trim());
  const submittedEmail = email.trim().toLowerCase();

  // ── FAST PATH: known user in local DB ────────────────────────────────────
  // If the user already exists with this exact email + phone we skip the CRM
  // round-trip entirely and issue tokens immediately (~5 ms vs ~500 ms).
  // CRM re-verification and batch-membership sync happen in the background so
  // the next visit is always up-to-date without blocking the response.
  const knownUser = await prisma.user.findUnique({ where: { email: submittedEmail } });
  if (knownUser && knownUser.provider === "crm" && !knownUser.is_banned) {
    const phoneMatches =
      !knownUser.phone ||                            // phone not yet stored — trust email alone
      knownUser.phone === normalizedPhone ||         // exact match
      knownUser.phone.slice(-10) === normalizedPhone; // strip country code variant

    if (phoneMatches) {
      // Issue tokens immediately — background re-verify ensures data freshness
      const tokens = await issueTokens(knownUser);

      setImmediate(() => {
        // Re-verify against CRM and refresh batch memberships in the background.
        // Uses the Redis-cached CRM customer (TTL 10 min) so it's usually instant.
        findCrmCustomerByContact(normalizedPhone)
          .then((customer) => {
            if (!customer) return;
            // Background batch sync — keeps room memberships current
            getCustomerEnrollments(customer.CustId)
              .then((enrollments) => syncBatchMemberships(knownUser.id, enrollments))
              .catch((err) => console.error("[bg fast-path] batch sync failed:", err));
            // Update avatar / profile if changed in CRM
            const updates: Record<string, unknown> = {};
            if (!knownUser.avatar_url && customer.ProfilePicture) updates.avatar_url = customer.ProfilePicture;
            if (!knownUser.phone) updates.phone = normalizedPhone;
            if (Object.keys(updates).length > 0) {
              prisma.user.update({ where: { id: knownUser.id }, data: updates }).catch(() => {});
            }
          })
          .catch(() => {}); // CRM down → silently skip; user is already authed
      });

      return tokens;
    }
  }

  // ── Path A: CRM customer (learner) — full verification for new users ──────
  const customer = await findCrmCustomerByContact(normalizedPhone).catch(() => null);

  if (customer) {
    if (!customer.Active) {
      throw new UnauthorizedError("Your account is inactive. Please contact support.");
    }

    // Verify email matches CRM record — both fields must match
    const crmEmail = (customer.Email ?? "").toLowerCase();
    if (!crmEmail || crmEmail !== submittedEmail) {
      throw new UnauthorizedError(
        "Phone and email do not match our records. Please use the email registered with AcceleratorX."
      );
    }

    // Find or create local CMS user (passwordless — identity proven by CRM match)
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

    // Sync missing profile fields from CRM
    const profileUpdates: Record<string, unknown> = {};
    if (!cmsUser.phone) profileUpdates.phone = normalizedPhone;
    if (!cmsUser.avatar_url && customer.ProfilePicture) profileUpdates.avatar_url = customer.ProfilePicture;
    if (Object.keys(profileUpdates).length > 0) {
      cmsUser = await prisma.user.update({ where: { id: cmsUser.id }, data: profileUpdates });
    }

    // Issue tokens immediately — batch sync happens in background
    const tokens = await issueTokens(cmsUser);

    setImmediate(() => {
      const _custId = customer!.CustId;
      const _userId = cmsUser!.id;
      getCustomerEnrollments(_custId)
        .then((enrollments) => syncBatchMemberships(_userId, enrollments))
        .catch((err) => console.error("[bg] Learner batch sync failed:", err));
      fetchEnrichedData(customer!).catch(() => {});
    });

    return tokens;
  }

  // ── Path B: CRM mentor ───────────────────────────────────────────────────
  // Mentors are NOT in the CRM customers table. Look them up by email.
  // The LMS sends both email + phone in the SSO payload; we use email as the
  // primary lookup key for mentors and phone as a secondary verification.
  const crmMentor = await findCrmMentorByContact(submittedEmail).catch(() => null);

  if (crmMentor) {
    if (crmMentor.Active === false) {
      throw new UnauthorizedError("Your mentor account is inactive. Please contact support.");
    }

    // Verify the phone the LMS sent matches the mentor's CRM phone.
    // We only enforce this if the CRM record actually has a phone stored —
    // some mentors may be phone-less (email-only) in the CRM.
    const mentorPhone = String(crmMentor.Mobile ?? "").replace(/\D/g, "").slice(-10);
    if (mentorPhone && normalizedPhone && mentorPhone !== normalizedPhone) {
      throw new UnauthorizedError(
        "Phone and email do not match our records. Please use the phone registered with AcceleratorX."
      );
    }

    // Provision (or update) the mentor's CMS user account and issue tokens
    return upsertAndIssueMentor(crmMentor);
  }

  // ── Not found anywhere ───────────────────────────────────────────────────
  throw new UnauthorizedError(
    "No account found with that phone number. Please use the number registered with AcceleratorX."
  );
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
