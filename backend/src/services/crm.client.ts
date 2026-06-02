/**
 * CRM API client.
 * Handles authenticated HTTP calls to the CRM (NestJS) backend.
 *
 * The CRM exposes admin/staff data on JWT-guarded endpoints. We log in once
 * with a service account (an admin in CRM `users` table) and reuse the token,
 * refreshing on 401.
 */

const CRM_BASE_URL = process.env.CRM_BASE_URL || "http://localhost:4001";
const CRM_SERVICE_EMAIL = process.env.CRM_SERVICE_EMAIL || "";
const CRM_SERVICE_PASSWORD = process.env.CRM_SERVICE_PASSWORD || "";

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
const SERVICE_TOKEN_TTL_MS = 12 * 60 * 1000; // 12 min (CRM tokens last 15 min)
const FETCH_TIMEOUT_MS = 10_000; // 10 s hard timeout on every CRM call

function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

async function fetchServiceToken(force = false): Promise<string> {
  const now = Date.now();
  if (
    !force &&
    serviceAccessToken &&
    now - serviceTokenFetchedAt < SERVICE_TOKEN_TTL_MS
  ) {
    return serviceAccessToken;
  }

  if (!CRM_SERVICE_EMAIL || !CRM_SERVICE_PASSWORD) {
    throw new Error(
      "CRM_SERVICE_EMAIL / CRM_SERVICE_PASSWORD env vars are missing — cannot reach CRM."
    );
  }

  const res = await fetchWithTimeout(`${CRM_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: CRM_SERVICE_EMAIL,
      password: CRM_SERVICE_PASSWORD,
    }),
  });

  if (!res.ok) {
    throw new Error(`CRM service-account login failed: ${res.status}`);
  }

  const data = (await res.json()) as CrmStaffLoginResponse;
  serviceAccessToken = data.accessToken;
  serviceTokenFetchedAt = now;
  return data.accessToken;
}

async function crmGet<T>(path: string): Promise<T> {
  let token: string;
  try {
    token = await fetchServiceToken();
  } catch (err) {
    throw new Error(`CRM service-account auth failed: ${(err as Error).message}`);
  }

  let res = await fetchWithTimeout(`${CRM_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  // Retry once on 401 with a fresh token
  if (res.status === 401) {
    try {
      token = await fetchServiceToken(true);
    } catch {
      throw new Error(`CRM token refresh failed`);
    }
    res = await fetchWithTimeout(`${CRM_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  if (!res.ok) {
    throw new Error(`CRM GET ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
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

/**
 * Look up a CRM customer (learner) by email or phone number.
 * Tries email first, then mobile. Returns null if not found.
 */
export async function findCrmCustomerByContact(
  identifier: string
): Promise<CrmCustomer | null> {
  const isEmail = identifier.includes("@");

  // CRM list endpoint shape: { data: Customer[], total: number }
  type ListResp = { data: CrmCustomer[]; total: number };

  if (isEmail) {
    const enc = encodeURIComponent(identifier);
    const res = await crmGet<ListResp>(`/customers?Email=${enc}&limit=1`);
    return res.data?.[0] ?? null;
  }

  // Phone: normalize by stripping non-digits and any leading country code "91"
  const digits = identifier.replace(/\D/g, "");
  const candidates = new Set<string>([digits]);
  if (digits.startsWith("91") && digits.length > 10) {
    candidates.add(digits.slice(2));
  }

  for (const num of candidates) {
    const res = await crmGet<ListResp>(
      `/customers?Mobile=${encodeURIComponent(num)}&limit=1`
    );
    if (res.data?.[0]) return res.data[0];
  }
  return null;
}

/**
 * Look up a CRM customer by CustId (numeric CRM ID).
 */
export async function findCrmCustomerByCustId(
  custId: string
): Promise<CrmCustomer | null> {
  try {
    const enc = encodeURIComponent(custId);
    type ListResp = { data: CrmCustomer[]; total: number };
    const res = await crmGet<ListResp>(`/customers?CustId=${enc}&limit=1`);
    return res.data?.[0] ?? null;
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
 * Fetch all students enrolled in a specific batch from CRM.
 * Uses the CRM's GET /batches/:batchId/students endpoint.
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
