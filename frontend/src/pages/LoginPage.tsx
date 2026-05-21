import { useState, useCallback, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import {
  Zap, ArrowRight, Phone, Mail, KeyRound, Lock, GraduationCap, Shield, RotateCcw, User,
} from "lucide-react";

// ─── Staff Login ─────────────────────────────────────────────────────────────

function StaffLoginForm() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) return;
    setError("");
    setLoading(true);
    try {
      await login(identifier.trim(), password, "crm");
      navigate("/");
    } catch (err: any) {
      setError(err.response?.data?.error || "Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className="block text-[11px] font-medium text-muted mb-1.5">Email or username</label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none" />
          <input
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            autoComplete="username"
            placeholder="admin@acceleratorx.co"
            className="w-full h-[42px] pl-10 pr-3.5 bg-surface-100 border border-hairline-strong rounded-[10px] text-[13.5px] text-primary placeholder-faint focus:outline-none focus:ring-2 focus:ring-accent-400/30 focus:border-accent-400/50 transition-all"
          />
        </div>
      </div>

      <div>
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

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-[10px] p-3">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="btn-primary flex items-center justify-center gap-2 h-[44px] rounded-[10px] text-sm mt-1 disabled:opacity-50"
      >
        {loading ? "Signing in…" : <><Shield className="w-3.5 h-3.5" /> Sign in as Staff <ArrowRight className="w-3.5 h-3.5" /></>}
      </button>
    </form>
  );
}

// ─── Learner Login (OTP flow) ─────────────────────────────────────────────────

type OtpMethod = "phone" | "email";
type OtpStep = "input" | "verify";

function LearnerLoginForm() {
  const navigate = useNavigate();
  const sendOtp = useAuthStore((s) => s.sendOtp);
  const verifyOtp = useAuthStore((s) => s.verifyOtp);

  const [method, setMethod] = useState<OtpMethod>("phone");
  const [step, setStep] = useState<OtpStep>("input");
  const [identifier, setIdentifier] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [requestId, setRequestId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(0);

  // Countdown timer for resend
  useEffect(() => {
    if (timer <= 0) return;
    const id = setInterval(() => setTimer((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, [timer]);

  const handleSendOtp = useCallback(async () => {
    setError("");
    const val = identifier.trim();
    if (!val) { setError(method === "phone" ? "Enter your phone number." : "Enter your email."); return; }
    if (method === "phone" && !/^\d{10}$/.test(val)) { setError("Enter a valid 10-digit phone number."); return; }
    if (method === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { setError("Enter a valid email address."); return; }

    setLoading(true);
    try {
      const result = await sendOtp(val, method, "crm");
      if (result.requestId) setRequestId(result.requestId);
      setStep("verify");
      setTimer(60);
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to send OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [identifier, method, sendOtp]);

  const handleVerifyOtp = useCallback(async () => {
    setError("");
    if (!/^\d{6}$/.test(otpCode.trim())) { setError("Enter the 6-digit OTP."); return; }

    setLoading(true);
    try {
      await verifyOtp(identifier.trim(), otpCode.trim(), method, "crm", requestId || undefined);
      navigate("/");
    } catch (err: any) {
      setError(err.response?.data?.error || "Verification failed. Check the OTP and try again.");
    } finally {
      setLoading(false);
    }
  }, [otpCode, identifier, method, requestId, verifyOtp, navigate]);

  // ── Step 2: OTP entry ─────────────────────────────────────
  if (step === "verify") {
    return (
      <div className="flex flex-col gap-4">
        <div className="bg-accent-100 border border-accent-200 rounded-[10px] p-3 text-[12px] text-accent-300 flex items-start gap-2">
          <KeyRound className="w-4 h-4 shrink-0 mt-px" />
          <span>
            OTP sent to <span className="font-semibold">{identifier}</span>.
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
          {loading ? "Verifying…" : <><GraduationCap className="w-3.5 h-3.5" /> Verify & Access Batches <ArrowRight className="w-3.5 h-3.5" /></>}
        </button>

        <div className="flex items-center justify-between text-[12px]">
          <button
            type="button"
            onClick={() => { setStep("input"); setOtpCode(""); setError(""); }}
            className="text-dim hover:text-muted flex items-center gap-1 transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Change {method === "phone" ? "number" : "email"}
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

  // ── Step 1: Identifier entry ──────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      {/* Phone / Email toggle */}
      <div className="flex bg-surface-100 rounded-[10px] p-1 border border-hairline gap-1">
        <button
          type="button"
          onClick={() => { setMethod("phone"); setIdentifier(""); setError(""); }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[7px] text-[13px] font-medium transition-all ${
            method === "phone"
              ? "bg-surface-200 text-primary border border-hairline-strong"
              : "text-dim hover:text-muted border border-transparent"
          }`}
        >
          <Phone className="w-3.5 h-3.5" /> Phone
        </button>
        <button
          type="button"
          onClick={() => { setMethod("email"); setIdentifier(""); setError(""); }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[7px] text-[13px] font-medium transition-all ${
            method === "email"
              ? "bg-surface-200 text-primary border border-hairline-strong"
              : "text-dim hover:text-muted border border-transparent"
          }`}
        >
          <Mail className="w-3.5 h-3.5" /> Email
        </button>
      </div>

      <div>
        <label className="block text-[11px] font-medium text-muted mb-1.5">
          {method === "phone" ? "Phone number registered with AcceleratorX" : "Email registered with AcceleratorX"}
        </label>
        <div className="relative">
          {method === "phone" ? (
            <>
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none" />
              <span className="absolute left-9 top-1/2 -translate-y-1/2 text-[13px] text-dim font-medium pointer-events-none">+91</span>
              <input
                type="tel"
                inputMode="numeric"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="9876543210"
                autoFocus
                className="w-full h-[42px] pl-[58px] pr-3.5 bg-surface-100 border border-hairline-strong rounded-[10px] text-[13.5px] text-primary placeholder-faint focus:outline-none focus:ring-2 focus:ring-accent-400/30 focus:border-accent-400/50 transition-all"
              />
            </>
          ) : (
            <>
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none" />
              <input
                type="email"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="you@example.com"
                autoFocus
                autoComplete="email"
                className="w-full h-[42px] pl-10 pr-3.5 bg-surface-100 border border-hairline-strong rounded-[10px] text-[13.5px] text-primary placeholder-faint focus:outline-none focus:ring-2 focus:ring-accent-400/30 focus:border-accent-400/50 transition-all"
              />
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-[10px] p-3">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleSendOtp}
        disabled={loading}
        className="btn-primary flex items-center justify-center gap-2 h-[44px] rounded-[10px] text-sm disabled:opacity-50"
      >
        {loading ? "Sending OTP…" : <><GraduationCap className="w-3.5 h-3.5" /> Send OTP <ArrowRight className="w-3.5 h-3.5" /></>}
      </button>

      <p className="text-[11.5px] text-dim text-center">
        No account?{" "}
        <span className="text-accent-300 font-medium cursor-pointer">
          Contact your AcceleratorX coordinator.
        </span>
      </p>
    </div>
  );
}

// ─── Main Login Page ──────────────────────────────────────────────────────────

type LoginMode = "staff" | "learner";

export default function LoginPage() {
  const [mode, setMode] = useState<LoginMode>("learner");

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
            {mode === "learner"
              ? "Access your batch channels with your enrolled phone and email."
              : "Staff and admin access via CRM credentials."}
          </p>

          {/* Mode Toggle */}
          <div className="flex bg-surface-100 rounded-[12px] p-1 mb-7 border border-hairline gap-1">
            <button
              type="button"
              onClick={() => setMode("learner")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[9px] text-[13px] font-semibold transition-all ${
                mode === "learner"
                  ? "bg-accent-400 text-white shadow-btn"
                  : "text-dim hover:text-muted border border-transparent"
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" /> Learner
            </button>
            <button
              type="button"
              onClick={() => setMode("staff")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[9px] text-[13px] font-semibold transition-all ${
                mode === "staff"
                  ? "bg-surface-200 text-primary border border-hairline-strong"
                  : "text-dim hover:text-muted border border-transparent"
              }`}
            >
              <Shield className="w-3.5 h-3.5" /> Staff
            </button>
          </div>

          {/* Form */}
          {mode === "learner" ? <LearnerLoginForm /> : <StaffLoginForm />}
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
