/**
 * OTP service — Redis-backed.
 *
 * Keys:
 *   otp:code:{key}        → JSON {code, attempts, expiresAt}       TTL = OTP_TTL_SECONDS
 *   otp:pending:{cleaned} → JSON {requestId, attempts, expiresAt}  TTL = OTP_TTL_SECONDS
 *
 * The redis.ts util provides a transparent MemoryCache fallback for single-instance
 * local development, so no code paths differ between environments.
 */
import crypto from "crypto";
import { sendOtpEmail } from "./email.service.js";
import { consumeCooldown, clearCooldown } from "../utils/throttle.js";
import { redisGet, redisSet, redisDel } from "../utils/redis.js";

const MAXXCOM_BASE_URL = process.env.MAXXCOM_BASE_URL || "";
const OTP_GATEWAY_API_KEY = process.env.OTP_GATEWAY_API_KEY || "";
const OTP_FETCH_TIMEOUT_MS = 8_000;
const OTP_RESEND_COOLDOWN_SECONDS = 45;
const OTP_TTL_SECONDS = 5 * 60; // 5 minutes
const OTP_MAX_ATTEMPTS = 5;

function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OTP_FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function generateOtpCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

function otpStoreKey(key: string): string {
  return `otp:code:${key}`;
}

function pendingKey(cleaned: string): string {
  return `otp:pending:${cleaned}`;
}

interface StoredOtp {
  code: string;
  attempts: number;
  expiresAt: number;
}

interface PendingOtp {
  requestId: string;
  attempts: number;
  expiresAt: number;
}

// ── Redis OTP helpers ─────────────────────────────────────────────────────────

async function storeOtp(key: string, code: string): Promise<void> {
  const payload: StoredOtp = { code, attempts: 0, expiresAt: Date.now() + OTP_TTL_SECONDS * 1000 };
  await redisSet(otpStoreKey(key), JSON.stringify(payload), OTP_TTL_SECONDS);
}

async function getOtp(key: string): Promise<StoredOtp | null> {
  const raw = await redisGet(otpStoreKey(key));
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as StoredOtp;
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      await deleteOtp(key);
      return null;
    }
    if (!entry.expiresAt) entry.expiresAt = Date.now() + OTP_TTL_SECONDS * 1000;
    return entry;
  } catch {
    return null;
  }
}

function remainingOtpTtlSeconds(expiresAt: number): number {
  return Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));
}

async function updateOtpAttempts(key: string, entry: StoredOtp): Promise<void> {
  await redisSet(otpStoreKey(key), JSON.stringify(entry), remainingOtpTtlSeconds(entry.expiresAt));
}

async function deleteOtp(key: string): Promise<void> {
  await redisDel(otpStoreKey(key));
}

async function storePendingOtp(cleaned: string, requestId: string): Promise<void> {
  const payload: PendingOtp = { requestId, attempts: 0, expiresAt: Date.now() + OTP_TTL_SECONDS * 1000 };
  await redisSet(pendingKey(cleaned), JSON.stringify(payload), OTP_TTL_SECONDS);
}

async function getPendingOtp(cleaned: string): Promise<PendingOtp | null> {
  const raw = await redisGet(pendingKey(cleaned));
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as PendingOtp;
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      await redisDel(pendingKey(cleaned));
      return null;
    }
    if (!entry.expiresAt) entry.expiresAt = Date.now() + OTP_TTL_SECONDS * 1000;
    return entry;
  } catch {
    return { requestId: raw, attempts: 0, expiresAt: Date.now() + OTP_TTL_SECONDS * 1000 };
  }
}

async function updatePendingOtp(cleaned: string, entry: PendingOtp): Promise<void> {
  await redisSet(pendingKey(cleaned), JSON.stringify(entry), remainingOtpTtlSeconds(entry.expiresAt));
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function sendOtp(
  identifier: string,
  method: "phone" | "email"
): Promise<{ success: boolean; message: string; requestId?: string; method: string }> {
  // Per-target cooldown — prevents email/OTP bombing of a single recipient.
  const cooldownKey = `cooldown:otp:${method}:${identifier.toLowerCase()}`;
  if (!(await consumeCooldown(cooldownKey, OTP_RESEND_COOLDOWN_SECONDS))) {
    return {
      success: true,
      message: `An OTP was just sent to your ${method}. Please wait a moment before requesting another.`,
      method,
    };
  }

  try {
    if (method === "phone" && MAXXCOM_BASE_URL && OTP_GATEWAY_API_KEY) {
      return await sendWhatsAppOtp(identifier);
    }

    // Fallback: generate code and store in Redis (or MemoryCache in dev)
    const code = generateOtpCode();
    const key = identifier.includes("@") ? identifier.toLowerCase() : identifier.replace(/\D/g, "");
    await storeOtp(key, code);

    if (method === "email") {
      await sendOtpEmail(identifier, code);
    } else {
      console.log(`[OTP-DEV] Phone OTP for ${identifier}: ${code}`);
    }

    return { success: true, message: `OTP sent to your ${method}`, method };
  } catch (err) {
    // Send failed — release the cooldown immediately so the user can retry.
    await clearCooldown(cooldownKey);
    if (method === "email") {
      console.error(`[OTP] Failed to send email OTP to ${identifier}:`, err);
      throw new Error("Failed to send OTP email. Please try again.");
    }
    throw err;
  }
}

async function sendWhatsAppOtp(phone: string) {
  const cleaned = phone.replace(/\D/g, "");
  const formatted = cleaned.length === 10 ? `91${cleaned}` : cleaned;

  try {
    const response = await fetchWithTimeout(`${MAXXCOM_BASE_URL}/whatsapp/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": OTP_GATEWAY_API_KEY,
      },
      body: JSON.stringify({ phone: formatted, context: "cms-login" }),
    });

    const data: any = await response.json();
    if (!response.ok) throw new Error("Failed to send OTP");

    await storePendingOtp(cleaned, data.requestId as string);

    return {
      success: true,
      message: "OTP sent to your WhatsApp",
      requestId: data.requestId as string,
      method: "whatsapp",
    };
  } catch {
    // Maxxcom unavailable — generate and store a fallback code in Redis.
    const code = generateOtpCode();
    await storeOtp(cleaned, code);
    console.log(`[OTP-FALLBACK] Phone OTP for ${phone}: ${code}`);
    return { success: true, message: "OTP sent", method: "fallback" };
  }
}

export async function verifyOtp(
  identifier: string,
  otpCode: string,
  requestId?: string
): Promise<{ success: boolean; message?: string }> {
  const cleaned = identifier.replace(/\D/g, "");
  const isPhone = /^\d{10,}$/.test(cleaned) && !identifier.includes("@");

  // ── Maxxcom WhatsApp verification ──────────────────────────────────────────
  if (isPhone && MAXXCOM_BASE_URL && OTP_GATEWAY_API_KEY) {
    const storedPending = await getPendingOtp(cleaned);
    const gatewayRequestId = storedPending?.requestId ?? requestId;

    if (gatewayRequestId) {
      const pending = storedPending ?? {
        requestId: gatewayRequestId,
        attempts: 0,
        expiresAt: Date.now() + OTP_TTL_SECONDS * 1000,
      };

      if (pending.attempts >= OTP_MAX_ATTEMPTS) {
        await redisDel(pendingKey(cleaned));
        return { success: false, message: "Too many attempts. Please request a new OTP." };
      }

      pending.attempts += 1;
      await updatePendingOtp(cleaned, pending);

      const valid = await verifyWhatsAppOtp(pending.requestId, otpCode);
      if (!valid) {
        if (pending.attempts >= OTP_MAX_ATTEMPTS) {
          await redisDel(pendingKey(cleaned));
          return { success: false, message: "Too many attempts. Please request a new OTP." };
        }
        return { success: false, message: "Invalid OTP" };
      }
      await redisDel(pendingKey(cleaned));
      return { success: true };
    }
  }

  // ── Redis-backed fallback verification ─────────────────────────────────────
  const key = identifier.includes("@") ? identifier.toLowerCase() : cleaned;
  const entry = await getOtp(key);

  if (!entry) {
    return { success: false, message: "No OTP found. Please request a new one." };
  }

  if (entry.attempts >= OTP_MAX_ATTEMPTS) {
    await deleteOtp(key);
    return { success: false, message: "Too many attempts. Please request a new OTP." };
  }

  entry.attempts += 1;

  // Guard length before timingSafeEqual to avoid the "unequal buffer length" throw.
  const submitted = otpCode.trim();
  const isValid =
    submitted.length === entry.code.length &&
    crypto.timingSafeEqual(Buffer.from(submitted), Buffer.from(entry.code));

  if (!isValid) {
    if (entry.attempts >= OTP_MAX_ATTEMPTS) {
      await deleteOtp(key);
      return { success: false, message: "Too many attempts. Please request a new OTP." };
    }
    await updateOtpAttempts(key, entry);
    return { success: false, message: "Invalid OTP" };
  }

  await deleteOtp(key);
  return { success: true };
}

async function verifyWhatsAppOtp(requestId: string, otp: string): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(`${MAXXCOM_BASE_URL}/whatsapp/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": OTP_GATEWAY_API_KEY,
      },
      body: JSON.stringify({ requestId, otp }),
    });

    if (response.status === 410) return false;
    const data: any = await response.json();
    if (!response.ok) return false;
    return data.valid === true || data.success === true || data.verified === true;
  } catch {
    return false;
  }
}
