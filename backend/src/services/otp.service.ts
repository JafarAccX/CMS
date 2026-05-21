import crypto from "crypto";
import { sendOtpEmail } from "./email.service.js";

const MAXXCOM_BASE_URL = process.env.MAXXCOM_BASE_URL || "";
const OTP_GATEWAY_API_KEY = process.env.OTP_GATEWAY_API_KEY || "";
const OTP_FETCH_TIMEOUT_MS = 8_000;

function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OTP_FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

interface OtpEntry {
  code: string;
  expiresAt: number;
  attempts: number;
}

interface PendingRequest {
  requestId: string;
  expiresAt: number;
}

const otpStore = new Map<string, OtpEntry>();
const pendingRequests = new Map<string, PendingRequest>();

// Cleanup expired entries every 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of otpStore) {
    if (now > entry.expiresAt) otpStore.delete(key);
  }
  for (const [key, entry] of pendingRequests) {
    if (now > entry.expiresAt) pendingRequests.delete(key);
  }
}, 2 * 60 * 1000);

function generateOtpCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

export async function sendOtp(
  identifier: string,
  method: "phone" | "email"
): Promise<{ success: boolean; message: string; requestId?: string; method: string }> {
  if (method === "phone" && MAXXCOM_BASE_URL && OTP_GATEWAY_API_KEY) {
    return sendWhatsAppOtp(identifier);
  }

  // Fallback: generate code in-memory (for email or when Maxxcom not configured)
  const code = generateOtpCode();
  otpStore.set(identifier, {
    code,
    expiresAt: Date.now() + 5 * 60 * 1000,
    attempts: 0,
  });

  if (method === "email") {
    try {
      await sendOtpEmail(identifier, code);
    } catch (err) {
      console.error(`[OTP] Failed to send email OTP to ${identifier}:`, err);
      throw new Error("Failed to send OTP email. Please try again.");
    }
  } else {
    console.log(`[OTP-DEV] Phone OTP for ${identifier}: ${code}`);
  }

  return { success: true, message: `OTP sent to your ${method}`, method };
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
    if (!response.ok) {
      throw new Error("Failed to send OTP");
    }

    pendingRequests.set(cleaned, {
      requestId: data.requestId,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    return {
      success: true,
      message: "OTP sent to your WhatsApp",
      requestId: data.requestId as string,
      method: "whatsapp",
    };
  } catch {
    // Fallback to in-memory if Maxxcom fails
    const code = generateOtpCode();
    otpStore.set(phone.replace(/\D/g, ""), {
      code,
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
    });
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

  // Try Maxxcom verification first for phone
  if (isPhone && MAXXCOM_BASE_URL && OTP_GATEWAY_API_KEY) {
    let finalRequestId = requestId;
    if (!finalRequestId) {
      const pending = pendingRequests.get(cleaned);
      if (pending && pending.expiresAt > Date.now()) {
        finalRequestId = pending.requestId;
      }
    }

    if (finalRequestId) {
      const valid = await verifyWhatsAppOtp(finalRequestId, otpCode);
      if (!valid) {
        return { success: false, message: "Invalid OTP" };
      }
      pendingRequests.delete(cleaned);
      return { success: true };
    }
  }

  // In-memory verification
  const key = identifier.includes("@") ? identifier.toLowerCase() : cleaned;
  const entry = otpStore.get(key);

  if (!entry) {
    return { success: false, message: "No OTP found. Please request a new one." };
  }

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(key);
    return { success: false, message: "OTP expired. Please request a new one." };
  }

  if (entry.attempts >= 3) {
    otpStore.delete(key);
    return { success: false, message: "Too many attempts. Please request a new OTP." };
  }

  entry.attempts++;

  const isValid = crypto.timingSafeEqual(
    Buffer.from(otpCode.trim()),
    Buffer.from(entry.code)
  );

  if (!isValid) {
    return { success: false, message: "Invalid OTP" };
  }

  otpStore.delete(key);
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
