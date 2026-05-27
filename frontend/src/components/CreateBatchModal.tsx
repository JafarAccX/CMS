import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { CreditCard, Globe2, Lock, Rocket, ShieldCheck, X } from "lucide-react";
import { figmaGradient } from "./FigmaShared";

export type CreateBatchPayload = {
  name: string;
  description: string;
  type: string;
  is_paid: boolean;
  channels: string[];
};

const fieldStyle: CSSProperties = {
  width: "100%",
  borderRadius: 7,
  background: "rgba(255,255,255,0.035)",
  border: "1px solid rgba(148,163,184,0.46)",
  color: "#e0e3e6",
  fontFamily: "Poppins",
  fontSize: 14,
  outline: "none",
};

function Toggle({ checked, onClick }: { checked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 28,
        height: 15,
        borderRadius: 20,
        border: "none",
        background: checked ? figmaGradient : "rgba(148,163,184,0.25)",
        padding: 2,
        display: "flex",
        alignItems: "center",
        justifyContent: checked ? "flex-end" : "flex-start",
        cursor: "pointer",
      }}
    >
      <span style={{ width: 11, height: 11, borderRadius: "50%", background: checked ? "#05070a" : "#6c7793", display: "block" }} />
    </button>
  );
}

function SectionTitle({
  icon,
  label,
  action,
}: {
  icon: ReactNode;
  label: string;
  action?: ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#b9c1cc" }}>
        <span style={{ display: "flex" }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase" }}>{label}</span>
      </div>
      {action}
    </div>
  );
}

function AccessCard({
  active,
  icon,
  title,
  description,
  tone,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  description: string;
  tone: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: 64,
        borderRadius: 8,
        border: `1px solid ${active ? tone : "rgba(148,163,184,0.18)"}`,
        background: active ? "linear-gradient(115deg,rgba(0,219,232,0.08),rgba(59,130,255,0.06))" : "rgba(255,255,255,0.025)",
        color: "#e0e3e6",
        cursor: "pointer",
        padding: "12px 12px",
        textAlign: "left",
        display: "flex",
        gap: 10,
        position: "relative",
      }}
    >
      <span style={{ display: "flex", color: tone, marginTop: 1 }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 3 }}>{title}</span>
        <span style={{ display: "block", fontSize: 11, color: "#94a3b8", lineHeight: 1.35 }}>{description}</span>
      </span>
      <span
        style={{
          width: 15,
          height: 15,
          borderRadius: "50%",
          border: `1px solid ${active ? tone : "#6c7793"}`,
          boxShadow: active ? `0 0 0 3px ${tone}22 inset` : "none",
          flexShrink: 0,
        }}
      />
    </button>
  );
}

export default function CreateBatchModal({
  onClose,
  onSubmit,
  pending = false,
}: {
  onClose: () => void;
  onSubmit: (payload: CreateBatchPayload) => void;
  pending?: boolean;
}) {
  const [form, setForm] = useState<CreateBatchPayload>({
    name: "",
    description: "",
    type: "public",
    is_paid: false,
    channels: ["general", "announcements"],
  });
  const [hidden, setHidden] = useState(false);
  const isValid = form.name.trim().length > 0;

  const submit = () => {
    if (!isValid || pending) return;
    onSubmit({ ...form, type: hidden ? "hidden" : form.type });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.68)",
        backdropFilter: "blur(7px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 80,
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        className="create-batch-modal"
        style={{
          width: 600,
          maxWidth: "calc(100vw - 48px)",
          borderRadius: 10,
          overflow: "hidden",
          background: "linear-gradient(145deg,rgba(18,27,31,0.96),rgba(7,9,13,0.98))",
          border: "1px solid rgba(59,130,255,0.22)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.55), 0 0 60px rgba(0,219,232,0.05)",
          color: "#e0e3e6",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ padding: "22px 24px 18px", borderBottom: "1px solid rgba(148,163,184,0.13)", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ fontSize: 18, lineHeight: "24px", fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 6 }}>Initialize New Batch</h2>
            <p style={{ fontSize: 13, color: "#94a3b8" }}>Define the parameters for a new learning node.</p>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", display: "flex", padding: 5, cursor: "pointer" }}>
            <X size={17} />
          </button>
        </div>

        <div style={{ padding: "18px 24px 22px" }}>
          <SectionTitle icon={<ShieldCheck size={14} />} label="Batch Identity" />
          <label style={{ display: "block", marginBottom: 14 }}>
            <span style={{ display: "block", color: "#b7c0cd", fontSize: 11, fontWeight: 700, marginBottom: 7 }}>Batch Name</span>
            <input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="e.g., Generative AI Mastery 2024"
              style={{ ...fieldStyle, height: 54, padding: "0 16px" }}
              autoFocus
            />
          </label>
          <label style={{ display: "block", marginBottom: 26 }}>
            <span style={{ display: "block", color: "#b7c0cd", fontSize: 11, fontWeight: 700, marginBottom: 7 }}>Mission Brief</span>
            <textarea
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Define the primary objective and scope..."
              style={{ ...fieldStyle, height: 98, padding: "14px 16px", resize: "none", lineHeight: 1.5 }}
            />
          </label>

          <SectionTitle
            icon={<Lock size={14} />}
            label="Access Configuration"
            action={
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#b9c1cc", fontSize: 11, fontWeight: 800, letterSpacing: "0.1em" }}>HIDE</span>
                <Toggle checked={hidden} onClick={() => setHidden((value) => !value)} />
              </div>
            }
          />
          <div className="create-batch-access-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 26 }}>
            <AccessCard
              active={!hidden && form.type === "public"}
              icon={<Globe2 size={18} />}
              title="Public"
              description="Visible to all users in the network."
              tone="rgb(0,219,232)"
              onClick={() => {
                setHidden(false);
                setForm((prev) => ({ ...prev, type: "public" }));
              }}
            />
            <AccessCard
              active={!hidden && form.type === "private"}
              icon={<Lock size={18} />}
              title="Private"
              description="Restricted to invited identities only."
              tone="rgb(255,99,93)"
              onClick={() => {
                setHidden(false);
                setForm((prev) => ({ ...prev, type: "private" }));
              }}
            />
          </div>

          <SectionTitle
            icon={<CreditCard size={14} />}
            label="Paid Access"
            action={<Toggle checked={form.is_paid} onClick={() => setForm((prev) => ({ ...prev, is_paid: !prev.is_paid }))} />}
          />
        </div>

        <div style={{ padding: "16px 24px", borderTop: "1px solid rgba(148,163,184,0.13)", background: "rgba(5,7,10,0.24)", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12 }}>
          <button
            type="button"
            onClick={onClose}
            style={{ width: 98, height: 34, borderRadius: 5, border: "1px solid rgba(148,163,184,0.25)", background: "transparent", color: "#e0e3e6", fontSize: 12, fontWeight: 700, fontFamily: "Poppins", cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!isValid || pending}
            onClick={submit}
            style={{
              minWidth: 174,
              height: 34,
              borderRadius: 5,
              border: "none",
              background: isValid ? "rgb(0,115,230)" : "rgba(59,130,255,0.35)",
              color: "#fff",
              fontSize: 12,
              fontWeight: 800,
              fontFamily: "Poppins",
              cursor: isValid && !pending ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              opacity: pending ? 0.75 : 1,
            }}
          >
            <Rocket size={14} />
            {pending ? "Initializing..." : "Initialize Batch"}
          </button>
        </div>
      </div>
    </div>
  );
}
