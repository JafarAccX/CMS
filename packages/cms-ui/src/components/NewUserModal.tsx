import { useState } from "react";
import { Check, Eye, EyeOff, UserPlus, X } from "lucide-react";

type NewUserForm = {
  username: string;
  email: string;
  phone: string;
  password: string;
  role: string;
};

type NewUserModalProps = {
  form: NewUserForm;
  pending: boolean;
  onChange: (form: NewUserForm) => void;
  onClose: () => void;
  onSubmit: () => void;
};

const roles = [
  { key: "learner", label: "Learner", desc: "Access to enrolled batch channels", color: "var(--ax-active-text)", bg: "rgba(59,130,255,0.12)" },
  { key: "mentor", label: "Mentor", desc: "Can manage and teach batch content", color: "rgb(0,219,232)", bg: "rgba(0,94,100,0.2)" },
  { key: "batch_moderator", label: "Moderator", desc: "Moderates batch channels and members", color: "rgb(251,191,36)", bg: "rgba(120,90,0,0.18)" },
  { key: "admin", label: "Admin", desc: "Full platform administration access", color: "rgb(175,198,255)", bg: "rgba(79,124,255,0.15)" },
];

function alpha(color: string, opacity: number) {
  if (color.startsWith("#")) {
    const value = Math.round(opacity * 255).toString(16).padStart(2, "0");
    return `${color}${value}`;
  }
  return color.replace("rgb(", "rgba(").replace(")", `,${opacity})`);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3.5 block flex-1">
      <span className="mb-1.5 block text-xs font-semibold tracking-[0.03em] text-muted">{label}</span>
      {children}
    </label>
  );
}

export default function NewUserModal({ form, pending, onChange, onClose, onSubmit }: NewUserModalProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [sendWelcome, setSendWelcome] = useState(true);

  const role = roles.find((item) => item.key === form.role) || roles[0];
  const initials = form.username ? form.username.slice(0, 2).toUpperCase() : "?";
  const isValid = Boolean(form.username.trim() && form.email.trim() && form.phone.trim() && form.password.trim());

  return (
    <div className="figma-modal-backdrop">
      <div
        className="new-user-modal figma-modal-shell relative"
        style={{ background: "linear-gradient(145deg,rgb(var(--surface-100) / 0.96),rgb(var(--surface-50) / 0.98))" }}
      >
        <div className="pointer-events-none absolute -left-32 -top-32 h-64 w-64 rounded-full bg-[rgb(82,141,255)] opacity-10 mix-blend-screen" />

        <div className="new-user-modal-header flex shrink-0 items-center justify-between border-b px-6 py-5" style={{ background: "var(--ax-modal-header-bg)", borderColor: "var(--ax-border)" }}>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "var(--ax-primary-action-bg)", color: "var(--ax-primary-action-text)" }}>
              <UserPlus className="h-4 w-4" />
            </div>
            <div>
              <div className="text-lg font-bold tracking-[-0.01em] text-primary">Create New User</div>
              <div className="text-[13px]" style={{ color: "var(--ax-muted)" }}>Add a new user to the AcceleratorX platform</div>
            </div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-md text-[#8c90a0] transition-colors hover:bg-[var(--ax-hover-strong)] hover:text-primary" aria-label="Close new user modal">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pt-6">
          <div className="new-user-preview mb-6 flex items-center gap-4 rounded-xl border px-5 py-4" style={{ background: "var(--ax-modal-accent-panel)", borderColor: "var(--ax-border)" }}>
            <div
              className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl text-lg font-bold transition-all"
              style={{
                background: form.username ? `linear-gradient(140deg, ${alpha(role.color, 0.74)}, ${alpha(role.color, 0.4)})` : "var(--ax-panel-3)",
                border: `1px solid ${form.username ? alpha(role.color, 0.27) : "var(--ax-panel-3)"}`,
                color: form.username ? "#fff" : "var(--ax-faint)",
              }}
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className={`mb-1 text-[15px] font-bold ${form.username ? "text-primary" : "text-faint"}`}>{form.username || "Username preview"}</div>
              <div className="flex items-center gap-1.5">
                <span className="rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ backgroundColor: role.bg, color: role.color, border: `1px solid ${alpha(role.color, 0.2)}` }}>
                  {role.label}
                </span>
                {form.email && <span className="truncate text-[11px] text-dim">{form.email}</span>}
              </div>
            </div>
          </div>

          <div className="new-user-field-row flex gap-4">
            <Field label="Username">
              <input value={form.username} onChange={(event) => onChange({ ...form, username: event.target.value })} placeholder="e.g. johndoe" className="figma-field" />
            </Field>
            <Field label="Email Address">
              <input type="email" value={form.email} onChange={(event) => onChange({ ...form, email: event.target.value })} placeholder="john@example.com" className="figma-field" />
            </Field>
          </div>

          <div className="new-user-field-row flex gap-4">
            <Field label="Phone Number">
              <input type="tel" value={form.phone} onChange={(event) => onChange({ ...form, phone: event.target.value })} placeholder="+91 98765 43210" className="figma-field" />
            </Field>
            <Field label="Initial Password">
              <div className="relative">
                <input type={showPassword ? "text" : "password"} value={form.password} onChange={(event) => onChange({ ...form, password: event.target.value })} placeholder="Set temporary password" className="figma-field pr-11" />
                <button onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 flex -translate-y-1/2 text-dim transition-colors hover:text-primary" aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </Field>
          </div>

          <div className="mb-4">
            <label className="mb-2.5 block text-xs font-semibold tracking-[0.03em] text-muted">Initial Role</label>
            <div className="new-user-role-grid grid grid-cols-2 gap-2.5">
              {roles.map((item) => {
                const active = form.role === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => onChange({ ...form, role: item.key })}
                    className="relative rounded-[10px] border p-3.5 text-left transition-all"
                    style={{ borderColor: active ? alpha(item.color, 0.42) : "var(--ax-border)", background: active ? item.bg : "var(--ax-option-bg)" }}
                  >
                    {active && <span className="absolute right-2.5 top-2.5 flex h-4 w-4 items-center justify-center rounded-full" style={{ background: "var(--ax-primary-action-bg)", color: "var(--ax-primary-action-text)" }}><Check className="h-3 w-3" /></span>}
                    <span className={`mb-1 block text-[13px] font-bold ${active ? "text-primary" : "text-muted"}`}>{item.label}</span>
                    <span className="block text-[11px] leading-snug text-dim">{item.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <button onClick={() => setSendWelcome((value) => !value)} className="new-user-welcome mb-5 flex w-full items-center gap-3 rounded-[10px] border p-3.5 text-left transition-colors hover:border-accent-300/30" style={{ background: "var(--ax-modal-accent-panel)", borderColor: "var(--ax-border)" }}>
            <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border ${sendWelcome ? "border-transparent" : "border-[rgb(30,41,59)]"}`} style={sendWelcome ? { background: "var(--ax-primary-action-bg)", color: "var(--ax-primary-action-text)" } : undefined}>
              {sendWelcome && <Check className="h-3 w-3" />}
            </span>
            <span>
              <span className="block text-[13px] font-medium text-primary">Send welcome email</span>
              <span className="text-[11px] text-dim">User receives login credentials via email</span>
            </span>
          </button>
        </div>

        <div className="new-user-modal-footer flex shrink-0 gap-2.5 border-t px-6 py-4" style={{ background: "var(--ax-modal-footer-bg)", borderColor: "var(--ax-border)" }}>
          <button onClick={onClose} className="h-11 flex-1 rounded-[10px] border text-sm text-dim transition-colors hover:bg-[var(--ax-hover)] hover:text-primary" style={{ borderColor: "var(--ax-border)" }}>Cancel</button>
          <button onClick={onSubmit} disabled={!isValid || pending} className="h-11 flex-[2] rounded-[10px] text-sm font-bold shadow-[0_0_20px_rgba(59,130,255,0.3)] transition disabled:cursor-not-allowed disabled:bg-none disabled:shadow-none" style={!isValid || pending ? { background: "var(--ax-disabled-bg)", color: "var(--ax-disabled-text)" } : { background: "var(--ax-primary-action-bg)", color: "var(--ax-primary-action-text)" }}>
            {pending ? "Creating..." : "Create User Account"}
          </button>
        </div>
      </div>
    </div>
  );
}
