import { useState, useCallback, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Mail,
  Phone,
  RotateCcw,
} from "lucide-react";
import { useAuthStore } from "../store/authStore";

type Kind = "email" | "phone" | "unknown";
type Step = "input" | "verify";

function detectKind(raw: string): Kind {
  const value = raw.trim();
  if (!value) return "unknown";
  if (value.includes("@")) return "email";
  const digits = value.replace(/\D/g, "");
  if (/^\d{10}$/.test(digits)) return "phone";
  return "unknown";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
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
  useEffect(() => {
    if (timer <= 0) return undefined;
    const id = window.setInterval(() => setTimer((value) => value - 1), 1000);
    return () => window.clearInterval(id);
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
  }, [identifier, login, navigate, password]);

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
  }, [identifier, navigate, otpCode, requestId, verifyOtp]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (kind === "email") {
      void handleEmailSignIn();
      return;
    }

    if (kind === "phone") {
      void handleSendOtp();
      return;
    }

    setError("Enter a valid email address or 10-digit mobile number.");
  };

  if (step === "verify") {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleVerifyOtp();
        }}
        className="flex flex-col gap-5"
      >
        <div className="flex items-start gap-3 rounded-lg border border-[rgba(66,71,84,0.5)] bg-[rgba(29,32,34,0.5)] p-4 text-[13px] leading-5 text-[#C2C6D6]">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-[#AFC6FF]" />
          <span>
            OTP sent to <span className="font-semibold text-[#E0E3E6]">+91 {identifier.replace(/\D/g, "")}</span>.
            Enter the 6-digit code below.
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex h-[13px] items-center justify-between">
            <label htmlFor="otp-code" className="text-[12px] font-medium tracking-[0.52px] text-[#E0E3E6]">
              Verification code
            </label>
          </div>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#C2C6D6]" />
            <input
              id="otp-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otpCode}
              onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              autoFocus
              className="h-11 w-full rounded-lg border border-[rgba(66,71,84,0.5)] bg-[rgba(29,32,34,0.5)] pl-[42px] pr-3 text-center font-mono text-2xl tracking-[0.45em] text-[#E0E3E6] shadow-[0_1px_2px_rgba(0,0,0,0.05)] placeholder:text-[rgba(194,198,214,0.5)] focus:border-[rgba(59,130,255,0.6)] focus:bg-[rgba(29,32,34,0.85)] focus:outline-none"
            />
          </div>
        </div>

        {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}

        <button
          type="submit"
          disabled={loading || otpCode.length < 6}
          className="flex w-full items-center justify-center gap-3 rounded-lg border-0 bg-[linear-gradient(82.76deg,#3B82FF_17.65%,#00DBE8_100.33%)] px-6 py-3 text-[13px] font-semibold tracking-[0.52px] text-white shadow-[0_0_18px_rgba(59,130,255,0.25)] transition disabled:cursor-not-allowed disabled:opacity-50 hover:brightness-110"
        >
          {loading ? (
            "Verifying..."
          ) : (
            <>
              Verify and continue
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>

        <div className="flex items-center justify-between text-[12px]">
          <button
            type="button"
            onClick={() => {
              setStep("input");
              setOtpCode("");
              setError("");
            }}
            className="flex items-center gap-1.5 text-[#94A3B8] transition hover:text-[#E0E3E6]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Change number
          </button>
          {timer > 0 ? (
            <span className="text-[#6C7793]">Resend in {timer}s</span>
          ) : (
            <button type="button" onClick={() => void handleSendOtp()} className="font-medium text-[#AFC6FF]">
              Resend OTP
            </button>
          )}
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex h-[13px] items-center justify-between">
          <label htmlFor="login-identifier" className="text-[12px] font-medium tracking-[0.52px] text-[#E0E3E6]">
            Email or mobile number
          </label>
          {kind !== "unknown" && (
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#AFC6FF]">
              <CheckCircle2 className="h-3 w-3" />
              {kind === "email" ? "Email" : "Mobile"}
            </span>
          )}
        </div>
        <div className="relative">
          {kind === "phone" ? (
            <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#C2C6D6]" />
          ) : (
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#C2C6D6]" />
          )}
          <input
            id="login-identifier"
            type="text"
            inputMode={kind === "phone" ? "numeric" : "email"}
            value={identifier}
            onChange={(event) => {
              setIdentifier(event.target.value);
              setError("");
            }}
            autoFocus
            autoComplete="username"
            placeholder="you@example.com or 9876543210"
            className="h-11 w-full rounded-lg border border-[rgba(66,71,84,0.5)] bg-[rgba(29,32,34,0.5)] pl-[42px] pr-3 text-base text-[#E0E3E6] shadow-[0_1px_2px_rgba(0,0,0,0.05)] placeholder:text-[rgba(194,198,214,0.5)] focus:border-[rgba(59,130,255,0.6)] focus:bg-[rgba(29,32,34,0.85)] focus:outline-none"
          />
        </div>
        <p className="text-[11px] font-semibold leading-[11px] tracking-[0.66px] text-[rgba(194,198,214,0.7)]">
          Email signs in with password. Mobile signs in with OTP.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex h-[13px] items-center justify-between">
          <label htmlFor="login-password" className="text-[12px] font-medium tracking-[0.52px] text-[#E0E3E6]">
            Password
          </label>
          <button type="button" className="text-[12px] font-medium tracking-[0.52px] text-[#E0E3E6] underline">
            Forgot?
          </button>
        </div>
        <div className="relative">
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError("");
            }}
            autoComplete="current-password"
            placeholder="Password..."
            className="h-11 w-full rounded-lg border border-[rgba(66,71,84,0.5)] bg-[rgba(29,32,34,0.5)] px-4 text-base text-[#E0E3E6] shadow-[0_1px_2px_rgba(0,0,0,0.05)] placeholder:text-[rgba(194,198,214,0.5)] focus:border-[rgba(59,130,255,0.6)] focus:bg-[rgba(29,32,34,0.85)] focus:outline-none"
          />
        </div>
        <p className="text-[11px] font-semibold leading-[11px] tracking-[0.66px] text-[rgba(194,198,214,0.7)]">
          Email signs in with password. Mobile signs in with OTP.
        </p>
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}

      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-3 rounded-lg border-0 bg-[linear-gradient(82.76deg,#3B82FF_17.65%,#00DBE8_100.33%)] px-6 py-3 text-[13px] font-semibold tracking-[0.52px] text-white shadow-[0_0_18px_rgba(59,130,255,0.25)] transition disabled:cursor-wait disabled:opacity-70 hover:brightness-110"
      >
        {loading ? (
          kind === "phone" ? "Sending OTP..." : "Signing in..."
        ) : (
          <>
            Continue
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>

    </form>
  );
}

function BrandLogo() {
  return (
    <div className="text-[21px] font-semibold leading-none tracking-[-0.04em] text-[#E0E3E6]">
      Accelerator<span className="text-[#3B82FF]">X</span>
    </div>
  );
}

function AvatarStack() {
  const avatars = [
    { initials: "PS", className: "bg-[#528DFF] text-[#00275F]" },
    { initials: "AK", className: "bg-[#8D7FFF] text-[#23008D]" },
    { initials: "MC", className: "bg-[#00DEEB] text-[#005E64]" },
    { initials: "+3", className: "bg-[#323538] text-[#C2C6D6]" },
  ];

  return (
    <div className="flex">
      {avatars.map((avatar, index) => (
        <span
          key={avatar.initials}
          className={`flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#191C1E] text-[13px] font-semibold tracking-[0.52px] ${avatar.className} ${index ? "-ml-4" : ""}`}
        >
          {avatar.initials}
        </span>
      ))}
    </div>
  );
}

export default function LoginPage() {
  return (
    <section className="relative flex h-dvh overflow-hidden bg-[#05070A] font-sans text-[#E0E3E6] max-[900px]:flex-col max-[900px]:overflow-y-auto">


      <aside className="relative isolate flex min-h-dvh flex-1 basis-[719px] flex-col overflow-hidden border-r border-[rgba(255,255,255,0.12)] bg-[#05070a] px-14 py-6 max-[900px]:min-h-[540px] max-[900px]:basis-auto max-[900px]:border-r-0 max-[900px]:border-b max-[900px]:border-[rgba(255,255,255,0.12)] max-[900px]:px-10 max-[640px]:px-6 max-[640px]:py-8">
        {/* Modern glowing gradient mesh matching Figma */}
        <div className="pointer-events-none absolute right-0 top-0 h-[600px] w-[500px] -translate-y-[20%] translate-x-[10%] rounded-full bg-[radial-gradient(circle_at_center,rgba(59,130,255,0.3)_0%,rgba(0,219,232,0.2)_40%,transparent_70%)] blur-[90px] opacity-85" />
        <div className="pointer-events-none absolute right-[15%] top-[25%] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle_at_center,rgba(59,130,255,0.2)_0%,rgba(0,219,232,0.1)_50%,transparent_80%)] blur-[80px] opacity-75" />
        <div className="pointer-events-none absolute -left-10 bottom-[-10%] h-[250px] w-[250px] rounded-full bg-[radial-gradient(circle_at_center,rgba(59,130,255,0.15)_0%,transparent_70%)] blur-[70px]" />
        <div className="pointer-events-none absolute left-[15%] top-[15%] h-[350px] w-[350px] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.02)_0%,transparent_70%)] blur-[50px]" />

        <div className="relative z-10 flex flex-1 flex-col">
          <header className="pt-[50px] max-[900px]:pt-0">
            <BrandLogo />
            <p className="mt-1.5 text-[10px] font-normal uppercase leading-[15px] tracking-[1px] text-[#94A3B8]">
              Discussion platform
            </p>
          </header>

          <div className="mb-auto mt-[clamp(118px,13vh,150px)] max-w-[586px] max-[900px]:mt-20">
            <div className="mb-[22.8px] flex items-center gap-3">
              <span className="h-2 w-2 shrink-0 rounded-full bg-[#8BF6FF] shadow-[0_0_8px_rgba(139,246,255,0.6)]" />
              <span className="text-[13px] font-semibold uppercase leading-[13px] tracking-[1.3px] text-[#8BF6FF]">
                Cohort 09 · In session
              </span>
            </div>

            <h1 className="mb-[22.8px] max-w-[586px] text-[48px] font-medium leading-[53px] tracking-[-1.2px] text-[#E0E3E6] max-[640px]:text-[36px] max-[640px]:leading-[41px]">
              Where mentors and learners build, ship, and review together.
            </h1>
            <p className="max-w-[525px] text-[18px] font-normal leading-[29px] tracking-[-0.18px] text-[#C2C6D6] max-[640px]:text-base max-[640px]:leading-7">
              Real-time batch rooms, structured 1:1s with mentors, sprint reviews, and a shared library of every session. Built for high-velocity cohorts.
            </p>
          </div>

          <footer className="flex items-center gap-3 pb-4">
            <AvatarStack />
            <p className="text-[14px] font-semibold leading-[21px] tracking-[0.14px] text-[#E0E3E6]">
              142 learners <span className="font-normal text-[#C2C6D6]">across 3 active cohorts</span>
            </p>
          </footer>
        </div>
      </aside>

      <main className="relative z-10 flex min-h-dvh flex-1 basis-[721px] flex-col bg-[#05070A] max-[900px]:min-h-0 max-[900px]:basis-auto">
        <div className="flex flex-1 items-center justify-center px-10 py-10 max-[640px]:px-6">
          <div className="w-full max-w-[400px]">
            <div className="flex flex-col gap-[11.3px] pb-8">
              <p className="text-[12px] font-semibold uppercase leading-[13px] tracking-[1.3px] text-[#AFC6FF]">
                Welcome back
              </p>
              <h2 className="text-[32px] font-medium leading-[38px] tracking-[-0.64px] text-[#E0E3E6]">
                Sign in to your workspace.
              </h2>
              <p className="max-w-[400px] text-[16px] font-normal leading-[26px] text-[#C2C6D6]">
                Use your registered email or mobile number we'll pick the right method.
              </p>
            </div>

            <UnifiedLoginForm />
          </div>
        </div>

        <footer className="relative flex min-h-[102px] items-center justify-between gap-6 border-t border-[rgba(66,71,84,0.2)] px-10 py-10 max-[1100px]:flex-col max-[1100px]:items-start max-[640px]:px-6">
          <p className="text-[14px] font-normal leading-[21px] tracking-[0.14px] text-[#C2C6D6]">
            New to AcceleratorX?{" "}
            <Link to="/register" className="font-semibold text-[#E0E3E6] transition hover:text-[#AFC6FF]">
              Request access
            </Link>
          </p>

          <div className="flex h-[29px] items-center gap-3 rounded-full border border-[rgba(139,246,255,0.1)] bg-[rgba(16,21,29,0.4)] px-4 backdrop-blur-[10px]">
            <span className="relative h-2.5 w-2.5 rounded-full bg-[#8BF6FF] before:absolute before:inset-0 before:animate-ping before:rounded-full before:bg-[#8BF6FF] before:opacity-75" />
            <span className="text-[11px] font-semibold uppercase leading-[11px] tracking-[0.55px] text-[#C2C6D6]">
              All systems operational
            </span>
          </div>

          <nav className="flex gap-6">
            <a href="#" className="text-[14px] font-normal leading-[21px] tracking-[0.14px] text-[#C2C6D6] transition hover:text-[#E0E3E6]">
              Privacy
            </a>
            <a href="#" className="text-[14px] font-normal leading-[21px] tracking-[0.14px] text-[#C2C6D6] transition hover:text-[#E0E3E6]">
              Terms
            </a>
          </nav>
        </footer>
      </main>
    </section>
  );
}
