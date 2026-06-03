import type { CSSProperties, ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, Search, Settings, Sparkles, User } from "lucide-react";
import ThemeToggle from "./ThemeToggle";

export const figmaGradient = "var(--ax-primary-action-bg)";
export const figmaActionText = "var(--ax-primary-action-text)";
export const figmaOrbGradient = "linear-gradient(rgb(62,56,224) 0%,rgb(0,219,232) 100%)";
// Theme-aware tokens — these flip with [data-theme] (see index.css).
export const figmaSurface = "var(--ax-panel)";
export const figmaSurfaceElevated = "var(--ax-panel-2)";
export const figmaBorder = "var(--ax-border)";
export const figmaText = "var(--ax-text)";
export const figmaMuted = "var(--ax-muted)";
export const figmaDim = "var(--ax-dim)";

export function FigmaOrbs() {
  return (
    <>
      <div
        className="theme-orb"
        style={{
          position: "absolute",
          right: -80,
          top: -160,
          width: 303,
          height: 278,
          borderRadius: "50%",
          background: figmaOrbGradient,
          opacity: 0.28,
          filter: "blur(70px)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <div
        className="theme-orb"
        style={{
          position: "absolute",
          right: -80,
          bottom: -160,
          width: 303,
          height: 278,
          borderRadius: "50%",
          background: figmaOrbGradient,
          opacity: 0.15,
          filter: "blur(70px)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
    </>
  );
}

export function FigmaTopBar({
  title,
  subtitle,
  primaryLabel = "Ask Mentor",
  primaryIcon,
  onPrimary,
  bellSlot,
}: {
  title: string;
  subtitle?: string;
  primaryLabel?: string;
  primaryIcon?: ReactNode;
  onPrimary?: () => void;
  bellSlot?: ReactNode;
}) {
  const navigate = useNavigate();
  const iconButton: CSSProperties = {
    width: 32,
    height: 32,
    borderRadius: 6,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--ax-muted)",
  };

  return (
    <header
      className="figma-topbar"
      style={{
        height: 64,
        flexShrink: 0,
        background: "var(--ax-topbar-bg)",
        borderBottom: `1px solid ${figmaBorder}`,
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        display: "flex",
        alignItems: "center",
        padding: "0 32px",
        gap: 16,
        position: "relative",
        zIndex: 10,
      }}
    >
      <div className="figma-topbar-title">
        <span style={{ fontWeight: 700, fontSize: 20, color: "var(--ax-text)", letterSpacing: "-0.01em" }}>
          {title}
        </span>
        {subtitle && <span style={{ fontSize: 12, color: figmaDim, marginLeft: 10 }}>{subtitle}</span>}
      </div>

      <div className="figma-topbar-search" style={{ flex: 1, display: "flex", justifyContent: "center" }}>
        <div style={{ position: "relative", width: 512, maxWidth: "100%", height: 42 }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 6,
              background: "var(--ax-field-bg)",
              border: "1px solid var(--ax-border)",
              boxShadow: "0 1px 0 rgba(255,255,255,0.55) inset",
              display: "flex",
              alignItems: "center",
              padding: "0 40px",
            }}
          >
            <span style={{ fontSize: 14, color: "var(--ax-placeholder)", userSelect: "none" }}>
              Ask AI or search workspace... (Cmd+K)
            </span>
          </div>
          <span
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--ax-placeholder)",
              display: "flex",
              pointerEvents: "none",
            }}
          >
            <Search size={15} />
          </span>
          <span
            style={{
              position: "absolute",
              right: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--ax-primary-action-bg)",
              display: "flex",
              pointerEvents: "none",
            }}
          >
            <Sparkles size={13} />
          </span>
        </div>
      </div>

      <div className="figma-topbar-actions" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          className="figma-topbar-primary"
          type="button"
          onClick={onPrimary || (() => navigate("/dm?askMentor=1"))}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 14px",
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
            fontFamily: "Poppins",
            background: figmaGradient,
            boxShadow: "0 0 10px rgba(59,130,255,0.3)",
            color: figmaActionText,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {primaryIcon || <Sparkles size={13} />}
          {primaryLabel}
        </button>
        <ThemeToggle />
        {bellSlot || (
          <button type="button" style={iconButton} aria-label="Notifications">
            <Bell size={14} />
          </button>
        )}
        <button type="button" style={iconButton} aria-label="Settings">
          <Settings size={16} />
        </button>
        <div style={{ width: 1, height: 20, background: "var(--ax-border)", margin: "0 4px" }} />
        <Link
          to="/profile"
          aria-label="Open profile"
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "var(--ax-profile-avatar-bg, linear-gradient(145deg, rgba(45,103,107,0.95), rgba(0,219,232,0.28)))",
            border: "1px solid var(--ax-border)",
            boxShadow: "var(--ax-profile-avatar-shadow)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--ax-profile-avatar-icon)",
          }}
        >
          <User size={16} strokeWidth={2.2} />
        </Link>
      </div>
    </header>
  );
}

export function FigmaStatCard({
  icon,
  value,
  label,
  delta,
  iconBg,
}: {
  icon: ReactNode;
  value?: string | number;
  label: string;
  delta?: string;
  iconBg: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        borderRadius: 8,
        overflow: "hidden",
        position: "relative",
        background: "var(--ax-card-bg)",
        border: `1px solid ${figmaBorder}`,
        padding: "17px 20px",
        boxShadow: "var(--ax-shadow-card)",
      }}
    >
      <div
        className="theme-orb"
        style={{
          position: "absolute",
          right: -18,
          top: -42,
          width: 97,
          height: 101,
          borderRadius: "50%",
          background: figmaOrbGradient,
          opacity: 0.22,
          filter: "blur(24px)",
          pointerEvents: "none",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16, position: "relative" }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 4,
            flexShrink: 0,
            backgroundColor: iconBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
        <span
          style={{
            color: "var(--accent-300)",
            display: "flex",
          }}
        >
            {icon}
          </span>
        </div>
        <span style={{ fontWeight: 700, fontSize: 24, color: "var(--ax-text)", lineHeight: 1 }}>{value ?? "--"}</span>
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: "0.55px",
          color: figmaMuted,
          marginBottom: delta ? 6 : 0,
          textTransform: "uppercase",
          position: "relative",
        }}
      >
        {label}
      </div>
      {delta && (
        <div style={{ fontSize: 12, fontWeight: 500, letterSpacing: "0.55px", color: figmaMuted, position: "relative" }}>
          {delta}
        </div>
      )}
    </div>
  );
}

export function FigmaOverline({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: "1.1px",
        color: figmaMuted,
        textTransform: "uppercase",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function FigmaAvatarStack({ colors }: { colors: string[] }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {colors.slice(0, 4).map((color, index) => (
        <div
          key={`${color}-${index}`}
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: color,
            border: "2px solid var(--ax-bg)",
            marginLeft: index > 0 ? -8 : 0,
            zIndex: colors.length - index,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 700,
            color: "#fff",
          }}
        >
          {String.fromCharCode(65 + index)}
        </div>
      ))}
    </div>
  );
}
