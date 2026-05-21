import bcrypt from "bcrypt";
import prisma from "../utils/prisma.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt.js";
import { UnauthorizedError, ConflictError, ForbiddenError } from "../utils/errors.js";
import type { RegisterInput, LoginInput } from "../validators/index.js";
import {
  loginCrmStaff,
  findCrmCustomerByContact,
  findCrmCustomerByCustId,
  getCustomerEnrollments,
  getBatchStudents,
  type CrmCustomer,
  type CrmEnrollmentWithBatch,
  type CrmBatchStudent,
} from "./crm.client.js";
import {
  getLmsLearnerData,
  type LmsLearnerData,
} from "./lms.client.js";

const BCRYPT_ROUNDS = 12;

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
  const refreshToken = generateRefreshToken(fullUser);

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
    // Check if we have a local user with this identifier who has a custom hashed password (not CRM_MANAGED placeholder)
    const localUser = await findLocalUser(identifier, idType);
    if (localUser && localUser.provider === "crm" && localUser.password_hash !== "CRM_MANAGED") {
      if (localUser.is_banned) throw new UnauthorizedError("Your account has been banned");
      const valid = await bcrypt.compare(data.password, localUser.password_hash);
      if (!valid) throw new UnauthorizedError("Invalid credentials");

      return issueTokens(localUser);
    }

    return loginViaCrm(identifier, idType, data.password);
  }

  // Website provider — try local DB first, then fall back to CRM lookup
  const localUser = await findLocalUser(identifier, idType);
  if (localUser) {
    if (localUser.is_banned) throw new UnauthorizedError("Your account has been banned");
    const valid = await bcrypt.compare(data.password, localUser.password_hash);
    if (!valid) throw new UnauthorizedError("Invalid credentials");

    // Fetch enriched CRM/LMS data even for existing local users
    const customer = await findCrmCustomer(identifier, idType).catch(() => null);

    const [enriched] = await Promise.all([
      fetchEnrichedData(customer ?? null).catch(() => null),
      customer
        ? getCustomerEnrollments(customer.CustId)
            .then((enrollments) => syncLearnerBatches(localUser.id, enrollments))
            .catch((err) => console.error("Batch sync failed (continuing login):", err))
        : Promise.resolve(),
    ]);

    // Sync phone and avatar from CRM into local record if missing
    let syncedUser = localUser;
    if (customer) {
      const updates: Record<string, unknown> = {};
      if (!localUser.phone && customer.Mobile) updates.phone = String(customer.Mobile);
      if (!localUser.avatar_url && customer.ProfilePicture) updates.avatar_url = customer.ProfilePicture;
      if (Object.keys(updates).length > 0) {
        syncedUser = await prisma.user.update({ where: { id: localUser.id }, data: updates });
      }
    }

    return issueTokens(syncedUser, enriched ?? undefined);
  }

  // Not in local DB — try CRM customer lookup (cross-system)
  const customer = await findCrmCustomer(identifier, idType);
  if (customer) {
    if (!customer.Active) throw new UnauthorizedError("Your CRM account is inactive");
    const cmsUser = await findOrCreateLearnerUser(customer, data.password);

    const [enriched] = await Promise.all([
      fetchEnrichedData(customer),
      getCustomerEnrollments(customer.CustId)
        .then((enrollments) => syncLearnerBatches(cmsUser.id, enrollments))
        .catch((err) => console.error("CRM batch sync failed (continuing login):", err)),
    ]);

    return issueTokens(cmsUser, enriched);
  }

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

    // Fetch enriched data from CRM + LMS, and sync batches — all in parallel
    const [enriched] = await Promise.all([
      fetchEnrichedData(customer),
      getCustomerEnrollments(customer.CustId)
        .then((enrollments) => syncLearnerBatches(cmsUser.id, enrollments))
        .catch((err) => console.error("CRM batch sync failed (continuing login):", err)),
    ]);

    return issueTokens(cmsUser, enriched);
  }

  // 2. Not a customer. If it's an email, try CRM staff login.
  if (idType === "email") {
    const staff = await loginCrmStaff(identifier, password);
    if (staff) {
      if ((staff.user.role || "").toLowerCase() !== "admin") {
        throw new ForbiddenError(
          "Only CRM admins can sign in here. Other staff roles are not yet supported."
        );
      }
      return upsertAndIssueAdmin(staff);
    }
  }

  // 3. Neither customer nor staff — not found.
  throw new UnauthorizedError("No account found with that identifier");
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
  // Try to find existing user by email first, then by phone.
  let user = customer.Email
    ? await prisma.user.findUnique({ where: { email: customer.Email } })
    : null;

  if (!user) {
    const phone = String(customer.Mobile);
    user = await prisma.user.findFirst({ where: { phone } });
  }

  if (user) {
    if (user.is_banned) throw new UnauthorizedError("Your account has been banned");
    // Existing user: verify password if it's a real one. CRM_MANAGED placeholder
    // means this is the user's first password — set it now.
    if (user.password_hash === "CRM_MANAGED") {
      const newHash = await bcrypt.hash(passwordPlain, BCRYPT_ROUNDS);
      user = await prisma.user.update({
        where: { id: user.id },
        data: { password_hash: newHash },
      });
    } else {
      const ok = await bcrypt.compare(passwordPlain, user.password_hash);
      if (!ok) throw new UnauthorizedError("Invalid password");
    }
    return user;
  }

  // Auto-provision new learner. The password they typed becomes their CMS password.
  const fullName =
    [customer.FirstName, customer.LastName].filter(Boolean).join(" ").trim() ||
    customer.Email?.split("@")[0] ||
    `learner-${customer.CustId}`;

  const password_hash = await bcrypt.hash(passwordPlain, BCRYPT_ROUNDS);

  // Ensure email uniqueness — fabricate one from CustId if CRM has no email.
  const email = customer.Email ?? `cust-${customer.CustId}@crm.local`;

  const created = await prisma.user.create({
    data: {
      email,
      username: await ensureUniqueUsername(fullName),
      phone: String(customer.Mobile),
      password_hash,
      role: "learner",
      provider: "crm",
    },
  });
  await prisma.subscription.create({
    data: {
      user_id: created.id,
      plan: "free",
      status: "active",
      started_at: new Date(),
    },
  });
  return created;
}

async function ensureUniqueUsername(base: string): Promise<string> {
  const sanitized = base.replace(/\s+/g, " ").trim().slice(0, 45) || "user";
  let candidate = sanitized;
  let suffix = 1;
  // Loop until we find an unused username.
  // In practice this resolves on the first or second try.
  while (await prisma.user.findUnique({ where: { username: candidate } })) {
    suffix += 1;
    candidate = `${sanitized.slice(0, 40)} ${suffix}`;
  }
  return candidate;
}

async function syncLearnerBatches(
  userId: string,
  enrollments: CrmEnrollmentWithBatch[]
) {
  if (!enrollments.length) return;

  // Pick a default org + admin to satisfy required Batch foreign keys.
  const defaultOrg = await prisma.organization.findFirst();
  const defaultAdmin = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!defaultOrg || !defaultAdmin) {
    console.warn("Cannot sync batches: missing default org or admin in CMS DB");
    return;
  }

  for (const enr of enrollments) {
    const crmBatchName = enr.Batch?.Batch;
    if (!crmBatchName) continue;

    // Match by name (case-insensitive). Auto-create if missing.
    let batch = await prisma.batch.findFirst({
      where: { name: { equals: crmBatchName, mode: "insensitive" } },
    });
    if (!batch) {
      batch = await prisma.batch.create({
        data: {
          name: crmBatchName,
          type: "private",
          org_id: defaultOrg.id,
          created_by: defaultAdmin.id,
          description: `Auto-synced from CRM (Course: ${enr.Batch.Course ?? "—"})`,
        },
      });
    }

    // Add the current user to the batch
    await prisma.membership.upsert({
      where: { user_id_batch_id: { user_id: userId, batch_id: batch.id } },
      update: {},
      create: {
        user_id: userId,
        batch_id: batch.id,
        role_in_batch: "member",
      },
    });

    // Sync all other students in this batch from CRM (best-effort)
    try {
      const students = await getBatchStudents(enr.BatchId);
      await syncBatchStudents(batch.id, students);
    } catch (err) {
      console.error(`Failed to sync students for batch ${crmBatchName}:`, err);
    }
  }
}

/**
 * Provision CMS users for all CRM students in a batch and add them as members.
 */
async function syncBatchStudents(cmsBatchId: string, students: CrmBatchStudent[]) {
  for (const student of students) {
    try {
      const email = student.Email ?? `cust-${student.CustId}@crm.local`;
      const phone = student.Mobile ? String(student.Mobile) : null;

      // Find existing user by email or phone
      let user = await prisma.user.findUnique({ where: { email } });
      if (!user && phone) {
        user = await prisma.user.findFirst({ where: { phone } });
      }

      if (!user) {
        // Auto-provision the student
        const fullName =
          [student.FirstName, student.LastName].filter(Boolean).join(" ").trim() ||
          email.split("@")[0];

        user = await prisma.user.create({
          data: {
            email,
            username: await ensureUniqueUsername(fullName),
            phone,
            password_hash: "CRM_MANAGED",
            role: "learner",
            provider: "crm",
          },
        });
        await prisma.subscription.create({
          data: {
            user_id: user.id,
            plan: "free",
            status: "active",
            started_at: new Date(),
          },
        });
      }

      // Add to batch
      await prisma.membership.upsert({
        where: { user_id_batch_id: { user_id: user.id, batch_id: cmsBatchId } },
        update: {},
        create: {
          user_id: user.id,
          batch_id: cmsBatchId,
          role_in_batch: "member",
        },
      });
    } catch (err) {
      // Skip individual student failures — don't block the rest
      console.error(`Failed to sync student ${student.CustId}:`, err);
    }
  }
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

function issueTokens(
  user: { id: string; email: string; role: string; password_hash: string; is_banned: boolean },
  enriched?: { crm: any; lms: any; crmEnrollments: any } | null
) {
  if (user.is_banned) throw new UnauthorizedError("Your account has been banned");
  const accessToken = generateAccessToken(user as any);
  const refreshToken = generateRefreshToken(user as any);
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

  // 5. Fetch enriched data + sync CRM batch memberships in parallel
  const [enriched] = await Promise.all([
    fetchEnrichedData(customer).catch(() => null),
    getCustomerEnrollments(customer.CustId)
      .then((enrollments) => syncLearnerBatches(cmsUser!.id, enrollments))
      .catch((err) => console.error("Learner batch sync failed (continuing login):", err)),
  ]);

  return issueTokens(cmsUser, enriched ?? undefined);
}

export async function refreshAccessToken(refreshTokenCookie: string) {
  if (!refreshTokenCookie) {
    throw new UnauthorizedError("No refresh token provided");
  }

  let payload;
  try {
    payload = verifyRefreshToken(refreshTokenCookie);
  } catch {
    throw new UnauthorizedError("Invalid refresh token");
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) throw new UnauthorizedError("User not found");
  if (user.is_banned) throw new UnauthorizedError("Your account has been banned");

  const accessToken = generateAccessToken(user);
  return { accessToken };
}
