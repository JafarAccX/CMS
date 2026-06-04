/**
 * LMS API client.
 * Handles authenticated HTTP calls to the LMS (Deno/Oak) backend.
 *
 * The LMS requires:
 *  - x-api-key: Organisation API key
 *  - x-signature: HMAC-SHA512 of "{METHOD}&{URL}&{NOUNCE}&{AUTH_TOKEN}"
 *  - x-nounce: ISO timestamp
 *  - authorization: Bearer {session_id}  (for authenticated routes)
 *
 * We login once with a service account and cache the session token.
 */

import crypto from "node:crypto";

const LMS_BASE_URL = process.env.LMS_BASE_URL || "http://localhost:8008";
const LMS_API_KEY = process.env.LMS_API_KEY || "";
const LMS_API_SECRET = process.env.LMS_API_SECRET || "";
// Service account is a CRM customer identified by phone (LMS auth is phone-based, no password)
const LMS_SERVICE_CALLING_CODE = parseInt(process.env.LMS_SERVICE_CALLING_CODE || "91", 10);
const LMS_SERVICE_MOBILE = process.env.LMS_SERVICE_MOBILE || "";

// ─── Types ────────────────────────────────────────────────────────────────

export interface LmsCustomerProfile {
  CustId: string;
  Email?: string | null;
  Mobile?: string | number | null;
  FirstName?: string | null;
  MiddleName?: string | null;
  LastName?: string | null;
  DOB?: string | null;
  Gender?: string | null;
  ProfilePicture?: string | null;
  LinkedinUrl?: string | null;
  GithubUrl?: string | null;
  Skills?: string | null;
  Education?: string | null;
  YearOfExperience?: number | null;
  CurrentCompany?: string | null;
  Designation?: string | null;
  Active?: boolean;
  [k: string]: unknown;
}

export interface LmsCourseEnrollment {
  courseId?: string;
  courseTitle?: string;
  courseImage?: string;
  courseBrief?: string;
  batchName?: string;
  startDate?: string;
  endDate?: string;
  enrollmentDate?: string;
  paymentStatus?: string;
  completionStatus?: string;
  finalPrice?: number;
  isActive?: boolean;
  [k: string]: unknown;
}

export interface LmsLearnerData {
  profile: LmsCustomerProfile | null;
  courses: LmsCourseEnrollment[];
}

// ─── Session cache ────────────────────────────────────────────────────────

let sessionToken: string | null = null;
let sessionFetchedAt = 0;
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour (LMS Customer session timeout is 7 days)
const LMS_FETCH_TIMEOUT_MS = 8_000; // 8s hard timeout — prevents login hang if LMS is slow

function lmsFetch(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LMS_FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

function generateSignature(
  method: string,
  url: string,
  nounce: string,
  authToken?: string
): string {
  const parts = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(nounce),
  ];
  if (authToken) parts.push(encodeURIComponent(authToken));

  const signatureData = parts.join("&");
  const hmac = crypto.createHmac("sha512", LMS_API_SECRET);
  hmac.update(signatureData);
  // LMS expects base64(hex(hmac)) — it converts binary to hex string first, then base64-encodes that
  const hexHash = hmac.digest("hex");
  return Buffer.from(hexHash).toString("base64");
}

async function fetchSessionToken(force = false): Promise<string> {
  const now = Date.now();
  if (!force && sessionToken && now - sessionFetchedAt < SESSION_TTL_MS) {
    return sessionToken;
  }

  if (!LMS_API_KEY || !LMS_API_SECRET) {
    throw new Error("LMS_API_KEY / LMS_API_SECRET env vars are missing");
  }
  if (!LMS_SERVICE_MOBILE) {
    throw new Error("LMS_SERVICE_MOBILE env var is missing");
  }

  const url = `${LMS_BASE_URL}/auth/customer/`;
  const nounce = new Date().toISOString();
  const signature = generateSignature("POST", url, nounce);

  // LMS customer auth is phone-based (CallingCode + Mobile) — no password
  const res = await lmsFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": LMS_API_KEY,
      "x-signature": signature,
      "x-nounce": nounce,
    },
    body: JSON.stringify({
      CallingCode: LMS_SERVICE_CALLING_CODE,
      Mobile: Number(LMS_SERVICE_MOBILE),
    }),
  });

  if (!res.ok) {
    throw new Error(`LMS service-account login failed: ${res.status}`);
  }

  const data = await res.json();
  // Response shape: { status, payload: [{ CustId, Bearer }] }
  const token = data?.payload?.[0]?.Bearer;
  if (!token) throw new Error("LMS login response missing Bearer token");

  sessionToken = token;
  sessionFetchedAt = now;
  return token;
}

async function lmsGet<T>(path: string): Promise<T> {
  let token: string;
  try {
    token = await fetchSessionToken();
  } catch (err) {
    throw new Error(`LMS auth failed: ${(err as Error).message}`);
  }

  const url = `${LMS_BASE_URL}${path}`;
  const nounce = new Date().toISOString();
  const signature = generateSignature("GET", url, nounce, token);

  let res = await lmsFetch(url, {
    headers: {
      "x-api-key": LMS_API_KEY,
      "x-signature": signature,
      "x-nounce": nounce,
      authorization: `Bearer ${token}`,
    },
  });

  // Retry once on 401 with a fresh session
  if (res.status === 401) {
    try {
      token = await fetchSessionToken(true);
    } catch {
      throw new Error("LMS session refresh failed");
    }
    const retryNounce = new Date().toISOString();
    const retrySignature = generateSignature("GET", url, retryNounce, token);

    res = await lmsFetch(url, {
      headers: {
        "x-api-key": LMS_API_KEY,
        "x-signature": retrySignature,
        "x-nounce": retryNounce,
        authorization: `Bearer ${token}`,
      },
    });
  }

  if (!res.ok) {
    throw new Error(`LMS GET ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

// ─── Public API ───────────────────────────────────────────────────────────

export async function getLmsCustomerProfile(
  custId: string
): Promise<LmsCustomerProfile | null> {
  try {
    const enc = encodeURIComponent(custId);
    type Resp = { status: number; payload: LmsCustomerProfile[] };
    const res = await lmsGet<Resp>(`/Customer/Details/?CustId=${enc}`);
    return res.payload?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function getLmsCustomerCourses(
  custId: string
): Promise<LmsCourseEnrollment[]> {
  try {
    const enc = encodeURIComponent(custId);
    type Resp = { status: number; payload: { batches: LmsCourseEnrollment[]; totalCount: number } };
    const res = await lmsGet<Resp>(`/Customer/Courses/${enc}`);
    return res.payload?.batches ?? [];
  } catch {
    return [];
  }
}

export async function getLmsLearnerData(
  custId: string
): Promise<LmsLearnerData> {
  const [profile, courses] = await Promise.all([
    getLmsCustomerProfile(custId),
    getLmsCustomerCourses(custId),
  ]);
  return { profile, courses };
}
