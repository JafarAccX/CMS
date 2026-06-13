/**
 * CRM API client.
 * Handles authenticated HTTP calls to the CRM (NestJS) backend.
 *
 * The CRM exposes admin/staff data on JWT-guarded endpoints. We log in once
 * with a service account (an admin in CRM `users` table) and reuse the token,
 * refreshing on 401.
 */

import { redisGet, redisSet } from "../utils/redis.js";
import { logger } from "../utils/logger.js";
import { incrementCounter, observeHistogram } from "../utils/metrics.js";
import { createHmac } from "node:crypto";

const CRM_BASE_URL = process.env.CRM_BASE_URL || "http://localhost:4001";
const CRM_MENTOR_LOOKUP_BASE_URL =
  process.env.CRM_MENTOR_LOOKUP_BASE_URL ||
  process.env.CRM_INTERNAL_BASE_URL ||
  CRM_BASE_URL;
const CRM_INTERNAL_HMAC_SECRET = process.env.CRM_INTERNAL_HMAC_SECRET || "";
const CRM_SERVICE_EMAIL = process.env.CRM_SERVICE_EMAIL || "";
const CRM_SERVICE_PASSWORD = process.env.CRM_SERVICE_PASSWORD || "";

// Cache CRM customer lookups in Redis for 10 minutes.
// The same learner triggers this on every embed SSO re-auth (every ~15 min
// access-token expiry), so caching eliminates the CRM round-trip for repeat logins.
const CRM_CUSTOMER_CACHE_TTL = 10 * 60; // seconds

function crmCacheKey(identifier: string) {
  return `crm:customer:${identifier.toLowerCase().trim()}`;
}

async function getCachedCustomer(identifier: string): Promise<CrmCustomer | null> {
  try {
    const raw = await redisGet(crmCacheKey(identifier));
    if (raw) return JSON.parse(raw) as CrmCustomer;
  } catch {}
  return null;
}

async function setCachedCustomer(identifier: string, customer: CrmCustomer | null): Promise<void> {
  if (!customer) return; // don't cache misses — a new signup should not be blocked by a cached null
  try {
    await redisSet(crmCacheKey(identifier), JSON.stringify(customer), CRM_CUSTOMER_CACHE_TTL);
  } catch {}
}

// ─── Types matching CRM responses ──────────────────────────────────────────

export interface CrmStaffLoginResponse {
  user: {
    id: string;
    email: string;
    role: string | null;
    full_name?: string | null;
    mobile_number?: string | null;
    is_deleted?: boolean;
    [k: string]: unknown;
  };
  accessToken: string;
  refreshToken: string;
}

export interface CrmCustomer {
  Id: string;
  CustId: string;
  Email?: string | null;
  Mobile: string;
  CallingCode: number;
  FirstName?: string | null;
  LastName?: string | null;
  Role: string;
  Active: boolean;
  ProfilePicture?: string | null;
}

export interface CrmBatchSummary {
  Id: string;
  Batch: string;
  Course?: string;
  StartDate?: string;
  EndDate?: string | null;
  Active?: boolean;
}

export interface CrmBatch extends CrmBatchSummary {
  Topics?: string | null;
  Deleted?: boolean | null;
  IsFree?: boolean | null;
  CourseId?: string | null;
  EnrollmentStartDate?: string | null;
  EnrollmentEndDate?: string | null;
  Image?: string | null;
  BatchType?: "TEST" | "FREE" | "PAID" | string | null;
}

export interface CrmEnrollmentWithBatch {
  Id: string;
  CustId: string;
  BatchId: string;
  Active: boolean;
  PaymentStatus: string;
  CompletionStatus: string;
  Batch: CrmBatchSummary;
}

export interface CrmMentor {
  Id: string;
  Name?: string | null;
  Mobile?: string | number | null;
  Education?: string | null;
  ExperienceYear?: string | number | null;
  Designation?: string | null;
  Email?: string | null;
  LinkedInURL?: string | null;
  Active?: boolean | null;
  AdditionalInfo?: string | null;
  Role?: string | null;
}

export interface CrmBatchMentorAssignment {
  Id: string;
  BatchId: string;
  MentorId: string;
  Active?: boolean | null;
  Deleted?: boolean | null;
}

type CrmPagedResponse<T> = {
  data?: T[];
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
};

// ─── Service-account token cache ───────────────────────────────────────────

let serviceAccessToken: string | null = null;
let serviceTokenFetchedAt = 0;
let tokenInflight: Promise<string> | null = null; // deduplicates concurrent token fetches
const SERVICE_TOKEN_TTL_MS = 12 * 60 * 1000; // 12 min (CRM tokens last 15 min)
const FETCH_TIMEOUT_MS = 10_000; // 10 s hard timeout on every CRM call

function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

function signInternalBody(timestamp: string, body: string): string {
  if (!CRM_INTERNAL_HMAC_SECRET) {
    throw new Error("CRM_INTERNAL_HMAC_SECRET is missing - cannot verify mentor credentials.");
  }
  return createHmac("sha256", CRM_INTERNAL_HMAC_SECRET)
    .update(`${timestamp}.${body}`)
    .digest("hex");
}

function recordCrmRequest(path: string, startedAt: number, success: boolean, status: number | "auth" | "error") {
  const durationMs = Date.now() - startedAt;
  const route = path.split("?")[0];
  const labels = { route, status, success };
  incrementCounter("crm_requests_total", labels);
  observeHistogram("crm_request_duration_ms", durationMs, labels);
  logger[success ? "info" : "warn"]("crm_request", {
    route,
    status,
    success,
    durationMs,
  });
}

async function fetchServiceToken(force = false): Promise<string> {
  const now = Date.now();
  // Return cached token if still fresh and not forcing a refresh
  if (!force && serviceAccessToken && now - serviceTokenFetchedAt < SERVICE_TOKEN_TTL_MS) {
    return serviceAccessToken;
  }

  // Deduplicate: if another request is already fetching the token, reuse its promise.
  if (!force && tokenInflight) return tokenInflight;

  tokenInflight = (async () => {
    if (!CRM_SERVICE_EMAIL || !CRM_SERVICE_PASSWORD) {
      throw new Error(
        "CRM_SERVICE_EMAIL / CRM_SERVICE_PASSWORD env vars are missing — cannot reach CRM."
      );
    }

    const res = await fetchWithTimeout(`${CRM_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: CRM_SERVICE_EMAIL, password: CRM_SERVICE_PASSWORD }),
    });

    if (!res.ok) throw new Error(`CRM service-account login failed: ${res.status}`);

    const data = (await res.json()) as CrmStaffLoginResponse;
    serviceAccessToken = data.accessToken;
    serviceTokenFetchedAt = Date.now();
    return data.accessToken;
  })().finally(() => {
    tokenInflight = null;
  });

  return tokenInflight;
}

async function crmGet<T>(path: string): Promise<T> {
  const startedAt = Date.now();
  let token: string;
  try {
    token = await fetchServiceToken();
  } catch (err) {
    recordCrmRequest(path, startedAt, false, "auth");
    throw new Error(`CRM service-account auth failed: ${(err as Error).message}`);
  }

  try {
    let res = await fetchWithTimeout(`${CRM_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // Retry once on 401 with a fresh token
    if (res.status === 401) {
      try {
        token = await fetchServiceToken(true);
      } catch {
        recordCrmRequest(path, startedAt, false, "auth");
        throw new Error(`CRM token refresh failed`);
      }
      res = await fetchWithTimeout(`${CRM_BASE_URL}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    if (!res.ok) {
      recordCrmRequest(path, startedAt, false, res.status);
      throw new Error(`CRM GET ${path} failed: ${res.status}`);
    }

    recordCrmRequest(path, startedAt, true, res.status);
    return (await res.json()) as T;
  } catch (err) {
    if ((err as Error).message.startsWith("CRM ")) throw err;
    recordCrmRequest(path, startedAt, false, "error");
    throw err;
  }
}

async function crmPostInternal<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const startedAt = Date.now();
  const timestamp = String(Date.now());
  const bodyText = JSON.stringify(body ?? {});
  const signature = signInternalBody(timestamp, bodyText);

  try {
    const res = await fetchWithTimeout(
      `${CRM_MENTOR_LOOKUP_BASE_URL.replace(/\/$/, "")}${path}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-timestamp": timestamp,
          "x-internal-signature": signature,
        },
        body: bodyText,
      }
    );

    if (res.status === 401 || res.status === 403 || res.status === 404) {
      recordCrmRequest(path, startedAt, false, res.status);
      return null as T;
    }
    if (!res.ok) {
      recordCrmRequest(path, startedAt, false, res.status);
      throw new Error(`CRM POST ${path} failed: ${res.status}`);
    }

    recordCrmRequest(path, startedAt, true, res.status);
    return (await res.json()) as T;
  } catch (err) {
    if ((err as Error).message.startsWith("CRM ")) throw err;
    recordCrmRequest(path, startedAt, false, "error");
    throw err;
  }
}

async function fetchAllPages<T>(
  buildPath: (page: number, limit: number) => string,
  limit = 100
): Promise<T[]> {
  const rows: T[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const res = await crmGet<CrmPagedResponse<T>>(buildPath(page, limit));
    const data = res.data ?? [];
    rows.push(...data);

    if (typeof res.totalPages === "number") {
      totalPages = Math.max(res.totalPages, 1);
    } else if (typeof res.total === "number") {
      totalPages = Math.max(Math.ceil(res.total / limit), 1);
    } else {
      totalPages = data.length === limit ? page + 1 : page;
    }
    page += 1;
  } while (page <= totalPages);

  return rows;
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Authenticate a CRM staff member (admin/manager/etc.) via the CRM /auth/login.
 * Returns null on bad credentials so the caller can fall through to learner lookup.
 */
export async function loginCrmStaff(
  email: string,
  password: string
): Promise<CrmStaffLoginResponse | null> {
  try {
    const res = await fetch(`${CRM_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.status === 401) return null;
    if (!res.ok) return null;
    return (await res.json()) as CrmStaffLoginResponse;
  } catch {
    return null;
  }
}

export async function verifyCrmMentorLogin(
  email: string,
  password: string
): Promise<CrmMentor | null> {
  const res = await crmPostInternal<{ success?: boolean; mentor?: CrmMentor | null } | null>(
    "/internal/mentors/verify-login",
    { email: email.trim().toLowerCase(), password }
  );
  if (!res?.success || !res.mentor?.Id) return null;
  return res.mentor;
}

/**
 * Look up a CRM customer (learner) by email or phone number.
 * Tries email first, then mobile. Returns null if not found.
 */
export async function findCrmCustomerByContact(
  identifier: string
): Promise<CrmCustomer | null> {
  const normalized = identifier.toLowerCase().trim();

  // Cache hit — skip the CRM round-trip entirely.
  const cached = await getCachedCustomer(normalized);
  if (cached) return cached;

  const isEmail = normalized.includes("@");

  type ListResp = { data: CrmCustomer[]; total: number };

  let customer: CrmCustomer | null = null;

  if (isEmail) {
    const enc = encodeURIComponent(normalized);
    const res = await crmGet<ListResp>(`/customers?Email=${enc}&limit=1`);
    customer = res.data?.[0] ?? null;
  } else {
    const digits = normalized.replace(/\D/g, "");
    const candidates = new Set<string>([digits]);
    if (digits.startsWith("91") && digits.length > 10) {
      candidates.add(digits.slice(2));
    }

    for (const num of candidates) {
      const res = await crmGet<ListResp>(
        `/customers?Mobile=${encodeURIComponent(num)}&limit=1`
      );
      if (res.data?.[0]) { customer = res.data[0]; break; }
    }
  }

  if (customer) {
    await Promise.all([
      setCachedCustomer(normalized, customer),
      customer.Email ? setCachedCustomer(customer.Email.toLowerCase(), customer) : Promise.resolve(),
      customer.Mobile ? setCachedCustomer(String(customer.Mobile).replace(/\D/g, "").slice(-10), customer) : Promise.resolve(),
    ]);
  }

  return customer;
}

/**
 * Look up a CRM customer by CustId (numeric CRM ID).
 */
export async function findCrmCustomerByCustId(
  custId: string
): Promise<CrmCustomer | null> {
  try {
    const cacheKey = `custid:${custId}`;
    const cached = await getCachedCustomer(cacheKey);
    if (cached) return cached;

    const enc = encodeURIComponent(custId);
    type ListResp = { data: CrmCustomer[]; total: number };
    const res = await crmGet<ListResp>(`/customers?CustId=${enc}&limit=1`);
    const customer = res.data?.[0] ?? null;
    if (customer) await setCachedCustomer(cacheKey, customer);
    return customer;
  } catch {
    return null;
  }
}

/**
 * Fetch all active enrollments for a customer, with the Batch eager-loaded.
 */
export async function getCustomerEnrollments(
  custId: string
): Promise<CrmEnrollmentWithBatch[]> {
  type ListResp = { data: CrmEnrollmentWithBatch[]; total: number };
  const res = await crmGet<ListResp>(
    `/enrollments?CustId=${encodeURIComponent(custId)}&Active=true&limit=100`
  );
  return res.data ?? [];
}

export async function listCrmBatches(): Promise<CrmBatch[]> {
  return fetchAllPages<CrmBatch>(
    (page, limit) => `/batches?Deleted=false&limit=${limit}&page=${page}`
  );
}

export async function listCrmMentors(): Promise<CrmMentor[]> {
  return fetchAllPages<CrmMentor>(
    (page, limit) => `/mentors?active=true&limit=${limit}&page=${page}`
  );
}

export async function listCrmBatchMentorAssignments(): Promise<CrmBatchMentorAssignment[]> {
  return fetchAllPages<CrmBatchMentorAssignment>(
    (page, limit) =>
      `/batch-mentor-assignments?Active=true&Deleted=false&limit=${limit}&page=${page}`
  );
}

/**
 * Look up a CRM mentor by email or phone number.
 * Used by learnerLogin to identify mentors (who are not CRM customers).
 */
export async function findCrmMentorByContact(
  identifier: string
): Promise<CrmMentor | null> {
  const normalized = identifier.toLowerCase().trim();
  const isEmail = normalized.includes("@");
  const mentors = await listCrmMentors();

  if (isEmail) {
    return mentors.find(m => m.Email?.trim().toLowerCase() === normalized) ?? null;
  } else {
    const digits = normalized.replace(/\D/g, "").slice(-10);
    if (!digits) return null;
    return mentors.find(m => {
      const mentorDigits = String(m.Mobile ?? "").replace(/\D/g, "").slice(-10);
      return mentorDigits === digits;
    }) ?? null;
  }
}

export interface CrmClass {
  Id: string;
  BatchId: string;
  Topic: string;
  Description?: string | null;
  ClassStartDateTime: string;
  ClassEndDateTime: string;
  /** "UPCOMING" | "JOIN" | "COMPLETED" — updated every 5 min by CRM cron */
  Status: string;
  Active?: boolean | null;
  Deleted?: boolean | null;
  ZoomJoinURL?: string | null;
  ZoomMeetingId?: string | null;
  ImageUrl?: string | null;
  IsInteractiveClass?: boolean | null;
  ScheduledMentorId?: string | null;
}

/**
 * Fetch active classes for a CRM batch, ordered by start time ascending.
 * Returns [] on any CRM error so callers can degrade gracefully.
 */
async function fetchCrmClassesForBatch(crmBatchId: string): Promise<CrmClass[]> {
  const path = `/classes?batchId=${encodeURIComponent(crmBatchId)}&active=true&sortBy=ClassStartDateTime&order=ASC&limit=100`;
  const res = await crmGet<CrmPagedResponse<CrmClass>>(path);
  return (res.data ?? []).filter((c) => c.Deleted !== true);
}

export async function getCrmClassesForBatch(crmBatchId: string): Promise<CrmClass[]> {
  try {
    return await fetchCrmClassesForBatch(crmBatchId);
  } catch {
    return [];
  }
}

export async function getCrmClassesForBatchStrict(crmBatchId: string): Promise<CrmClass[]> {
  return fetchCrmClassesForBatch(crmBatchId);
}

/**
 * Fetch all students enrolled in a specific batch from CRM.
 */
export interface CrmBatchStudent {
  CustId: string;
  FirstName?: string | null;
  LastName?: string | null;
  Email?: string | null;
  Mobile?: string | number | null;
  CallingCode?: number;
  ProfilePicture?: string | null;
}

export async function getBatchStudents(
  batchId: string
): Promise<CrmBatchStudent[]> {
  type RawBatchStudent = CrmBatchStudent & {
    Customer?: CrmBatchStudent | null;
  };
  type Resp = {
    batchDetails: unknown;
    totalStudents: number;
    students: RawBatchStudent[];
  };
  try {
    const res = await crmGet<Resp>(`/batches/${encodeURIComponent(batchId)}/students`);
    return (res.students ?? []).map((student) => {
      const customer = student.Customer ?? student;
      return {
        CustId: customer.CustId ?? student.CustId,
        FirstName: customer.FirstName ?? student.FirstName,
        LastName: customer.LastName ?? student.LastName,
        Email: customer.Email ?? student.Email,
        Mobile: customer.Mobile ?? student.Mobile,
        CallingCode: customer.CallingCode ?? student.CallingCode,
        ProfilePicture: customer.ProfilePicture ?? student.ProfilePicture,
      };
    });
  } catch {
    return [];
  }
}
