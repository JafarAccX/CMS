import { useState, useCallback, useEffect, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import {
  Zap, ArrowRight, Phone, Mail, KeyRound, Lock, RotateCcw, CheckCircle2,
} from "lucide-react";

type Kind = "email" | "phone" | "unknown";
type Step = "input" | "verify";

/**
 * Auto-detect what the user typed.
 * - Contains "@" → email
 * - 10 consecutive digits (after stripping non-digits) → phone
 * - otherwise unknown
 */
function detectKind(raw: string): Kind {
  const value = raw.trim();
  if (!value) return "unknown";
  if (value.includes("@")) return "email";
  const digits = value.replace(/\D/g, "");
  if (/^\d{10}$/.test(digits)) return "phone";
  return "unknown";
}

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function UnifiedLoginForm() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const sendOtp = useAuthStore((s) => s.sendOtp);
  const verifyOtp = useAuthStore((s) => s.verifyOtp);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [requestId, setRequestId] = useState("");
  const [step, setStep] = useState<Step>("input");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(0);

  const kind = useMemo(() => detectKind(identifier), [identifier]);

  // Resend countdown
  useEffect(() => {
    if (timer <= 0) return;
    const id = setInterval(() => setTimer((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, [timer]);

  const handleEmailSignIn = useCallback(async () => {
    setError("");
    if (!isValidEmail(identifier)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }
    setLoading(true);
    try {
      await login(identifier.trim(), password, "crm");
      navigate("/");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [identifier, password, login, navigate]);

  const handleSendOtp = useCallback(async () => {
    setError("");
    const digits = identifier.replace(/\D/g, "");
    if (!/^\d{10}$/.test(digits)) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    setLoading(true);
    try {
      const result = await sendOtp(digits, "phone", "crm");
      if (result?.requestId) setRequestId(result.requestId);
      setStep("verify");
      setTimer(60);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to send OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [identifier, sendOtp]);

  const handleVerifyOtp = useCallback(async () => {
    setError("");
    if (!/^\d{6}$/.test(otpCode.trim())) {
      setError("Enter the 6-digit OTP.");
      return;
    }
    setLoading(true);
    try {
      const digits = identifier.replace(/\D/g, "");
      await verifyOtp(digits, otpCode.trim(), "phone", "crm", requestId || undefined);
      navigate("/");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Verification failed. Check the OTP and try again.");
    } finally {
      setLoading(false);
    }
  }, [otpCode, identifier, requestId, verifyOtp, navigate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (kind === "email") return handleEmailSignIn();
    if (kind === "phone") return handleSendOtp();
  };

  // ── OTP verify step ──────────────────────────────────────
  if (step === "verify") {
    return (
      <div className="flex flex-col gap-4">
        <div className="bg-accent-100 border border-accent-200 rounded-[10px] p-3 text-[12px] text-accent-300 flex items-start gap-2">
          <KeyRound className="w-4 h-4 shrink-0 mt-px" />
          <span>
            OTP sent to <span className="font-semibold">+91 {identifier.replace(/\D/g, "")}</span>.
            Enter the 6-digit code below.
          </span>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-muted mb-1.5">6-digit OTP</label>
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              autoFocus
              className="w-full h-[48px] pl-10 pr-3.5 bg-surface-100 border border-hairline-strong rounded-[10px] text-center text-2xl tracking-[0.5em] font-mono text-primary placeholder-faint focus:outline-none focus:ring-2 focus:ring-accent-400/30 focus:border-accent-400/50 transition-all"
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-[10px] p-3">
            {error}
          </div>
        )}

        <button
          onClick={handleVerifyOtp}
          disabled={loading || otpCode.length < 6}
          className="btn-primary flex items-center justify-center gap-2 h-[44px] rounded-[10px] text-sm disabled:opacity-50"
        >
          {loading ? "Verifying…" : <>Verify & continue <ArrowRight className="w-3.5 h-3.5" /></>}
        </button>

        <div className="flex items-center justify-between text-[12px]">
          <button
            type="button"
            onClick={() => { setStep("input"); setOtpCode(""); setError(""); }}
            className="text-dim hover:text-muted flex items-center gap-1 transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Change number
          </button>
          {timer > 0 ? (
            <span className="text-faint">Resend in {timer}s</span>
          ) : (
            <button type="button" onClick={handleSendOtp} className="text-accent-300 font-medium">
              Resend OTP
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Input step ───────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px] font-medium text-muted">Email or mobile number</label>
          {kind !== "unknown" && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-accent-300 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              {kind === "email" ? "Email detected" : "Mobile detected"}
            </span>
          )}
        </div>
        <div className="relative">
          {kind === "email" ? (
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-accent-400 pointer-events-none" />
          ) : kind === "phone" ? (
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-accent-400 pointer-events-none" />
          ) : (
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none" />
          )}
          <input
            type="text"
            inputMode={kind === "phone" ? "numeric" : "email"}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            autoFocus
            autoComplete="username"
            placeholder="you@example.com or 9876543210"
            className="w-full h-[42px] pl-10 pr-3.5 bg-surface-100 border border-hairline-strong rounded-[10px] text-[13.5px] text-primary placeholder-faint focus:outline-none focus:ring-2 focus:ring-accent-400/30 focus:border-accent-400/50 transition-all"
          />
        </div>
        <p className="text-[11px] text-faint mt-1.5">
          Email signs in with password. Mobile signs in with OTP.
        </p>
      </div>

      {/* Password — only for email */}
      {kind === "email" && (
        <div className="animate-in slide-in-from-top-1 fade-in duration-200">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] font-medium text-muted">Password</label>
            <span className="text-[11px] text-accent-300 cursor-pointer font-medium">Forgot?</span>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full h-[42px] pl-10 pr-3.5 bg-surface-100 border border-hairline-strong rounded-[10px] text-[13.5px] text-primary placeholder-faint focus:outline-none focus:ring-2 focus:ring-accent-400/30 focus:border-accent-400/50 transition-all"
            />
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-[10px] p-3">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || kind === "unknown" || (kind === "email" && !password)}
        className="btn-primary flex items-center justify-center gap-2 h-[44px] rounded-[10px] text-sm mt-1 disabled:opacity-50"
      >
        {loading
          ? kind === "email" ? "Signing in…" : "Sending OTP…"
          : kind === "email"
            ? <>Sign in <ArrowRight className="w-3.5 h-3.5" /></>
            : kind === "phone"
              ? <>Send OTP <ArrowRight className="w-3.5 h-3.5" /></>
              : <>Continue <ArrowRight className="w-3.5 h-3.5" /></>
        }
      </button>
    </form>
  );
}

// ─── Main Login Page ──────────────────────────────────────────────────────────

export default function LoginPage() {
  return (
    <div className="min-h-screen flex bg-surface relative overflow-hidden">
      {/* Left — Form panel */}
      <div className="flex-shrink-0 w-full lg:max-w-[480px] bg-surface-50 lg:border-r border-hairline flex flex-col px-6 sm:px-14 py-12 relative z-10">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-12">
          <div className="w-8 h-8 rounded-[9px] bg-gradient-to-br from-accent-300 via-accent-400 to-accent-600 flex items-center justify-center shadow-btn">
            <Zap className="w-4 h-4 text-white" strokeWidth={2.4} />
          </div>
          <div>
            <div className="text-sm font-semibold text-primary">AcceleratorX</div>
            <div className="text-[11px] text-dim font-normal">Learning platform</div>
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-center">
          <div className="t-overline mb-3 text-accent-400">Welcome back</div>
          <h1 className="font-serif text-4xl font-medium leading-[1.1] tracking-tight text-primary mb-2">
            Sign in to your<br />workspace.
          </h1>
          <p className="text-[13px] text-muted mb-8">
            Use your registered email or mobile number — we'll pick the right method.
          </p>

          <UnifiedLoginForm />
        </div>

        <div className="flex items-center justify-between pt-6 border-t border-hairline text-dim text-xs mt-8">
          <span>
            New to AcceleratorX?{" "}
            <Link to="/register" className="text-accent-300 font-medium cursor-pointer">
              Request access
            </Link>
          </span>
          <span className="flex gap-3.5">
            <span className="cursor-pointer hover:text-muted">Privacy</span>
            <span className="cursor-pointer hover:text-muted">Terms</span>
          </span>
        </div>
      </div>

      {/* Right — Editorial panel */}
      <div className="hidden lg:flex flex-1 relative flex-col px-14 py-12 overflow-hidden bg-glow">
        <div className="bg-grid absolute inset-0 opacity-70 pointer-events-none" />

        <div className="absolute -top-28 -right-20 w-[480px] h-[480px] rounded-full pointer-events-none" style={{
          background: "radial-gradient(circle, rgba(79,124,255,0.28), transparent 60%)",
          filter: "blur(20px)",
        }} />

        <div className="flex-1 flex flex-col justify-center relative z-10 max-w-[560px]">
          <div className="t-overline mb-4 text-accent-300">◆ Cohort 09 · in session</div>
          <h2
            className="font-serif text-5xl font-normal leading-[1.1] tracking-tight text-primary mb-6"
            style={{ textWrap: "balance" as any }}
          >
            Where mentors and learners build, ship, and review — together.
          </h2>
          <p
            className="text-[13.5px] text-muted max-w-[460px] mb-10 leading-relaxed"
            style={{ textWrap: "pretty" as any }}
          >
            Real-time batch rooms, structured 1:1s with mentors, sprint reviews, and a shared library of every session. Built for cohort-based learning.
          </p>

          <div className="flex flex-col gap-2.5 max-w-[520px]">
            <ActivityCard hue="indigo" initials="PS" who="Priya Shah" role="mentor" text="Posted a sprint brief with updated composition patterns." time="9:42 AM" live />
            <ActivityCard hue="violet" initials="MC" who="Maya Cortez" role="moderator" text="Sprint review demos at 16:00 IST today. 4 slots left." time="10:02 AM" />
            <ActivityCard hue="amber" initials="DP" who="Devon Park" role="mentor" text="If you're forwarding refs through a slot, preserve displayName." time="10:14 AM" />
          </div>
        </div>

        <div className="relative z-10 pt-8 border-t border-hairline flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex">
              {["indigo", "teal", "violet", "coral", "amber"].map((h, i) => (
                <span
                  key={i}
                  className={`avatar avatar-${h} w-[26px] h-[26px] text-[10px] rounded-full ${i ? "-ml-2" : ""}`}
                  style={{ border: "2px solid #07090f" }}
                >
                  {["PS", "AK", "MC", "JR", "DP"][i]}
                </span>
              ))}
            </div>
            <div className="text-[12.5px] text-muted">
              <span className="text-primary font-semibold">142 learners</span> across 3 active cohorts
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-dim text-xs">
            <span
              className="w-1.5 h-1.5 rounded-full bg-emerald-400"
              style={{ boxShadow: "0 0 8px oklch(0.74 0.16 150)" }}
            />
            All systems operational
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivityCard({
  hue, initials, who, role, text, time, live,
}: {
  hue: string; initials: string; who: string; role: string; text: string; time: string; live?: boolean;
}) {
  return (
    <div className="flex gap-3 p-3 bg-surface-50/80 backdrop-blur-lg border border-hairline rounded-xl relative overflow-hidden">
      {live && (
        <span className="absolute top-2.5 right-3 flex items-center gap-1 text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
          <span className="w-[5px] h-[5px] rounded-full bg-emerald-400 animate-blink" />
          live
        </span>
      )}
      <span className={`avatar avatar-${hue} w-8 h-8 text-xs`}>{initials}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 mb-0.5">
          <span className="text-[12.5px] font-semibold text-primary">{who}</span>
          <span className="text-[11px] text-dim font-normal">· {role} · {time}</span>
        </div>
        <div className="text-[12.5px] text-muted" style={{ textWrap: "pretty" as any }}>{text}</div>
      </div>
    </div>
  );
}
