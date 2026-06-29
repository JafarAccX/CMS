import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useCmsNavigate, useCmsUrl } from "../hooks/useCmsNavigation";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft,
  ArrowRight,
  Lock,
  MessagesSquare,
  MoreVertical,
  Paperclip,
  Phone,
  Plus,
  Search,
  Send,
  Smile,
  Video,
  X,
} from "lucide-react";
import { cmsApiClient as api } from "../api/cmsClient";
import { useCmsAuthStore } from "../api/cmsClient";
import { useCmsDmStore } from "../store/cmsDmStore";
import { useCmsUiStore } from "../store/cmsUiStore";
import { useCmsSocket } from "../hooks/useCmsSocket";
import TypingIndicator from "../components/TypingIndicator";
import { figmaGradient } from "../components/FigmaShared";

// ── Helpers ─────────────────────────────────────────────────────────
type AvatarVisual = { bg: string; border: string; color: string };

const learnerPalette: AvatarVisual[] = [
  { bg: "rgba(0,222,235,0.2)", border: "rgba(139,246,255,0.3)", color: "rgb(139,246,255)" }, // cyan
  { bg: "rgba(235,200,0,0.2)", border: "rgba(255,251,139,0.3)", color: "rgb(234,179,8)" }, // yellow
  { bg: "rgba(20,184,154,0.2)", border: "rgba(110,231,199,0.3)", color: "rgb(110,231,199)" }, // teal
  { bg: "rgba(245,107,86,0.2)", border: "rgba(255,157,140,0.3)", color: "rgb(255,157,140)" }, // coral
];

function avatarVisual(user: { id?: string; role?: string }, index = 0): AvatarVisual {
  const role = (user?.role || "").toLowerCase();
  if (role === "mentor") {
    return {
      bg: "var(--ax-dm-avatar-mentor-bg)",
      border: "var(--ax-dm-avatar-mentor-border)",
      color: "var(--ax-dm-avatar-mentor-text)",
    };
  }
  if (role === "admin") {
    return {
      bg: "var(--ax-dm-avatar-admin-bg)",
      border: "var(--ax-dm-avatar-admin-border)",
      color: "var(--ax-dm-avatar-admin-text)",
    };
  }
  const seed = user?.id ? Array.from(String(user.id)).reduce((sum, char) => sum + char.charCodeAt(0), 0) : index;
  return learnerPalette[seed % learnerPalette.length];
}

const coloredBadge: Record<string, { bg: string; color: string; label: string }> = {
  mentor: { bg: "rgba(0,94,100,0.2)", color: "rgb(0,219,232)", label: "MENTOR" },
  admin: { bg: "rgba(79,124,255,0.15)", color: "var(--accent-300)", label: "ADMIN" },
  learner: { bg: "rgba(59,73,94,0.2)", color: "var(--ax-muted)", label: "LEARNER" },
};

function badgeFor(role?: string) {
  return coloredBadge[(role || "learner").toLowerCase()] || coloredBadge.learner;
}

function roleLabel(role?: string) {
  return (role || "learner").toUpperCase();
}

function titleRole(role?: string) {
  const r = (role || "learner").toLowerCase();
  return r.charAt(0).toUpperCase() + r.slice(1);
}

function isPinnedRole(role?: string) {
  const r = (role || "").toLowerCase();
  return r === "mentor" || r === "admin";
}

function timeLabel(value?: string) {
  if (!value) return "";
  try {
    const date = new Date(value);
    const diff = Date.now() - date.getTime();
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))}m`;
    if (diff < day) return format(date, "h:mm a");
    if (diff < day * 2) return "Yesterday";
    return format(date, "EEE");
  } catch {
    return "";
  }
}

// ── Reusable presentational pieces ──────────────────────────────────
function Avatar({
  user,
  index = 0,
  size = 40,
  online,
  showDot = true,
  borderColor = "var(--ax-bg)",
  glow = false,
}: {
  user: { id?: string; username?: string; role?: string };
  index?: number;
  size?: number;
  online?: boolean;
  showDot?: boolean;
  borderColor?: string;
  glow?: boolean;
}) {
  const visual = avatarVisual(user, index);
  const dot = size >= 48 ? 14 : 12;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: visual.bg,
          border: `1px solid ${visual.border}`,
          color: visual.color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: Math.round(size * 0.4),
          fontWeight: 700,
          boxShadow: glow ? "0 0 20px rgba(82,141,255,0.25)" : "none",
        }}
      >
        {user?.username?.[0]?.toUpperCase()}
      </div>
      {showDot && online && (
        <span
          style={{
            position: "absolute",
            right: 0,
            bottom: 0,
            width: dot,
            height: dot,
            borderRadius: "50%",
            background: "rgb(34,197,94)",
            border: `2px solid ${borderColor}`,
            boxShadow: "0 0 5px rgba(34,197,94,0.5)",
          }}
        />
      )}
    </div>
  );
}

function NeutralBadge({ role }: { role?: string }) {
  return (
    <span
      style={{
        borderRadius: 4,
        background: "var(--ax-panel-3)",
        padding: "2px 6px",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.45px",
        color: "var(--ax-muted)",
        textTransform: "uppercase",
        flexShrink: 0,
        lineHeight: "9px",
      }}
    >
      {roleLabel(role)}
    </span>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.55px",
          color: "var(--ax-muted)",
          textTransform: "uppercase",
          padding: "0 12px",
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function ContactRow({
  conversation,
  index,
  online,
  active,
}: {
  conversation: any;
  index: number;
  online: boolean;
  active: boolean;
}) {
  const getUrl = useCmsUrl();
  const other = conversation.otherUser;
  const unread = conversation.unreadCount > 0;

  return (
    <Link to={getUrl(`/dm/${conversation.id}`)} style={{ textDecoration: "none", display: "block" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: 12,
          borderRadius: 12,
          border: `1px solid ${active ? "rgba(82,141,255,0.2)" : "transparent"}`,
          background: active ? "rgba(82,141,255,0.08)" : "transparent",
          cursor: "pointer",
          transition: "background 0.15s, border-color 0.15s",
        }}
        onMouseEnter={(event) => {
          if (!active) event.currentTarget.style.background = "var(--ax-hover)";
        }}
        onMouseLeave={(event) => {
          if (!active) event.currentTarget.style.background = "transparent";
        }}
      >
        <Avatar user={other} index={index} size={40} online={online} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.52px", color: "var(--ax-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {other.username}
              </span>
              <NeutralBadge role={other.role} />
            </div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.66px",
                color: unread ? "rgb(36,175,18)" : "var(--ax-muted)",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {unread ? "New" : timeLabel(conversation.updated_at || conversation.lastMessage?.created_at)}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <p
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 14,
                lineHeight: "21px",
                letterSpacing: "0.14px",
                color: unread ? "#e0e3e6" : "var(--ax-text)",
                fontWeight: unread ? 700 : 400,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {conversation.lastMessage?.content || `Message ${other.username}`}
            </p>
            {unread && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "rgb(36,175,18)", flexShrink: 0 }} />}
          </div>
        </div>
      </div>
    </Link>
  );
}

function WelcomeCanvas({
  suggested,
  suggestedLabel,
  onlineUsers,
  onStart,
  onOpenPicker,
}: {
  suggested: any[];
  suggestedLabel: string;
  onlineUsers: Set<string>;
  onStart: (id: string) => void;
  onOpenPicker: () => void;
}) {
  return (
    <div
      className="dm-main dm-main--empty"
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        position: "relative",
        overflowY: "auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
        zIndex: 1,
      }}
    >
      <div
        className="theme-orb"
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%,-50%)",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: "rgba(82,141,255,0.05)",
          filter: "blur(50px)",
          pointerEvents: "none",
        }}
      />

      <div
        className="dm-welcome-card"
        style={{
          position: "relative",
          width: 672,
          maxWidth: "100%",
          borderRadius: 16,
          background: "linear-gradient(rgba(78,249,240,0.05) 0%, rgba(255,255,255,0.05) 100%)",
          border: "1px solid var(--ax-panel-3)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          padding: 48,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          overflow: "visible",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 1,
            left: 1,
            right: 1,
            height: 1,
            background: "linear-gradient(90deg, rgba(59,130,255,0) 0%, rgba(59,130,255,0.5) 50%, rgba(59,130,255,0) 100%)",
          }}
        />

        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 16,
            background: "var(--ax-field-bg)",
            border: "1px solid var(--ax-field-border)",
            boxShadow: "inset 0 2px 4px 1px rgba(0,0,0,0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--ax-dim)",
            marginBottom: 16,
          }}
        >
          <MessagesSquare size={34} strokeWidth={1.6} />
        </div>

        <h2 className="dm-welcome-h1" style={{ fontSize: 32, fontWeight: 700, lineHeight: "40px", letterSpacing: "-1.44px", textAlign: "center", color: "var(--ax-text)", marginBottom: 16 }}>
          Your Workspace
          <br />
          Communications
        </h2>

        <p style={{ fontSize: 18, lineHeight: "28.8px", letterSpacing: "-0.18px", textAlign: "center", color: "var(--ax-text)", maxWidth: 524, marginBottom: 26 }}>
          Select a conversation from the sidebar or start a new direct message to collaborate with mentors and peers.
        </p>

        <button
          type="button"
          onClick={onOpenPicker}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            fontFamily: "Poppins",
            background: figmaGradient,
            boxShadow: "0 0 20px rgba(59,130,255,0.3)",
            padding: "12px 24px",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.52px",
          }}
        >
          <Plus size={15} />
          Start a conversation
        </button>

        {suggested.length > 0 && (
          <div style={{ width: "100%", maxWidth: 574, minWidth: 0, marginTop: 48, display: "flex", flexDirection: "column", gap: 16 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.55px",
                color: "var(--ax-muted)",
                textTransform: "uppercase",
                paddingBottom: 8,
                borderBottom: "1px solid rgba(66,71,84,0.15)",
              }}
            >
              {suggestedLabel}
            </div>
            <div className="dm-suggested-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16, minWidth: 0, width: "100%" }}>
              {suggested.map((person, i) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => onStart(person.id)}
                  style={{
                    borderRadius: 12,
                    background: "var(--ax-panel-2)",
                    border: "1px solid var(--ax-panel-3)",
                    padding: 16,
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    minWidth: 0,
                    width: "100%",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.borderColor = "rgba(82,141,255,0.4)";
                    event.currentTarget.style.background = "var(--ax-panel-3)";
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.borderColor = "var(--ax-border)";
                    event.currentTarget.style.background = "var(--ax-panel-2)";
                  }}
                >
                  <Avatar user={person} index={i} size={48} online={onlineUsers.has(person.id)} borderColor="var(--ax-panel-2)" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.52px", color: "var(--ax-text)", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {person.username}
                    </div>
                    <div style={{ fontSize: 14, lineHeight: "21px", letterSpacing: "0.14px", color: "var(--ax-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {person.email || titleRole(person.role)}
                    </div>
                  </div>
                  <ArrowRight size={16} style={{ color: "var(--ax-muted)", flexShrink: 0 }} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ position: "absolute", left: 0, right: 0, bottom: 32, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "rgba(66,71,84,0.6)", pointerEvents: "none" }}>
        <Lock size={12} />
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.66px" }}>End-to-end encrypted</span>
      </div>
    </div>
  );
}

function PickerRow({ user, index, online, onStart }: { user: any; index: number; online: boolean; onStart: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onStart(user.id)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: 12,
        borderRadius: 12,
        border: "1px solid transparent",
        background: "transparent",
        cursor: "pointer",
        textAlign: "left",
        transition: "background 0.15s",
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = "var(--ax-hover)";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = "transparent";
      }}
    >
      <Avatar user={user} index={index} size={40} online={online} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.52px", color: "var(--ax-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {user.username}
          </span>
          <NeutralBadge role={user.role} />
        </div>
        <span style={{ fontSize: 14, lineHeight: "21px", letterSpacing: "0.14px", color: "var(--ax-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {user.email || titleRole(user.role)}
        </span>
      </div>
      <ArrowRight size={16} style={{ color: "var(--ax-muted)", flexShrink: 0 }} />
    </button>
  );
}

function StartConversationPanel({
  open,
  mentorOnly,
  mentors,
  members,
  search,
  onSearch,
  onClose,
  onStart,
  onlineUsers,
}: {
  open: boolean;
  mentorOnly?: boolean;
  mentors: any[];
  members: any[];
  search: string;
  onSearch: (value: string) => void;
  onClose: () => void;
  onStart: (id: string) => void;
  onlineUsers: Set<string>;
}) {
  const empty = mentors.length === 0 && members.length === 0;
  const title = mentorOnly ? "Choose a mentor" : "Start your conversation with";
  const emptyText = mentorOnly ? "No mentors found" : "No people found";
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgb(var(--surface) / 0.5)",
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.25s ease",
          zIndex: 40,
        }}
      />
      <aside
        className="dm-picker"
        aria-hidden={!open}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: 521,
          maxWidth: "90vw",
          height: "100vh",
          borderRadius: "16px 0 0 16px",
          background: "rgb(var(--surface-50) / 0.6)",
          border: "1px solid var(--ax-field-border)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          boxShadow: "-2px 0 18px rgba(0,0,0,0.45)",
          display: "flex",
          flexDirection: "column",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.3s cubic-bezier(0.32,0.72,0,1)",
          zIndex: 50,
        }}
      >
        <div style={{ padding: "24px 24px 16px", borderBottom: "1px solid var(--ax-field-border)", display: "flex", flexDirection: "column", gap: 16, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, lineHeight: "28.8px", letterSpacing: "-0.48px", color: "var(--ax-text)" }}>{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "none",
                border: "none",
                color: "var(--ax-muted)",
                cursor: "pointer",
                flexShrink: 0,
                transition: "background 0.15s, color 0.15s",
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = "var(--ax-hover-strong)";
                event.currentTarget.style.color = "var(--ax-text)";
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = "none";
                event.currentTarget.style.color = "var(--ax-muted)";
              }}
            >
              <X size={16} />
            </button>
          </div>
          <div style={{ position: "relative" }}>
            <Search size={16} color="#424c64" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder={mentorOnly ? "Search mentors..." : "Search people..."}
              style={{ width: "100%", height: 42, borderRadius: 8, border: "1px solid var(--ax-panel-3)", background: "var(--ax-input-bg)", color: "var(--ax-text)", fontFamily: "Poppins", fontSize: 14, padding: "0 16px 0 40px" }}
            />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
          {empty && <p style={{ color: "var(--ax-faint)", fontSize: 13, textAlign: "center", paddingTop: 40 }}>{emptyText}</p>}
          {mentors.length > 0 && (
            <Section label="Mentors">
              {mentors.map((item, index) => (
                <PickerRow key={item.id} user={item} index={index} online={onlineUsers.has(item.id)} onStart={onStart} />
              ))}
            </Section>
          )}
          {members.length > 0 && (
            <Section label="Members">
              {members.map((item, index) => (
                <PickerRow key={item.id} user={item} index={index} online={onlineUsers.has(item.id)} onStart={onStart} />
              ))}
            </Section>
          )}
        </div>
      </aside>
    </>
  );
}

function MessageBubble({ message, isMe, activeConv }: { message: any; isMe: boolean; activeConv: any }) {
  const senderName = isMe ? "Me" : message.sender?.username || activeConv.otherUser.username;
  const visual = avatarVisual(activeConv.otherUser);

  return (
    <div style={{ display: "flex", gap: 12, flexDirection: isMe ? "row-reverse" : "row", marginBottom: 16 }}>
      {!isMe && (
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: visual.bg,
            border: `1px solid ${visual.border}`,
            color: visual.color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {senderName?.[0]?.toUpperCase()}
        </div>
      )}
      <div className="dm-message-bubble" style={{ maxWidth: "62%", display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start" }}>
        {!isMe && <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ax-muted)", marginBottom: 4 }}>{senderName}</span>}
        <div
          style={{
            borderRadius: isMe ? "16px 0 16px 16px" : "0 16px 16px 16px",
            background: isMe ? "linear-gradient(135deg,rgba(59,130,255,0.25),rgba(0,219,232,0.15))" : "var(--ax-panel-2)",
            border: `1px solid ${isMe ? "rgba(59,130,255,0.3)" : "var(--ax-panel-3)"}`,
            padding: "10px 14px",
            color: "var(--ax-text)",
            fontSize: 14,
            lineHeight: 1.6,
            opacity: message.isOptimistic ? 0.62 : 1,
          }}
        >
          {message.content}
        </div>
        <span style={{ fontSize: 10, color: "var(--ax-faint)", marginTop: 4 }}>{format(new Date(message.created_at), "hh:mm a")}</span>
      </div>
    </div>
  );
}

function RightUtilityPanel({ activeConv, online }: { activeConv: any; online: boolean }) {
  const badge = badgeFor(activeConv.otherUser.role);
  const visual = avatarVisual(activeConv.otherUser);
  const files = ["hooks-patterns.pdf", "design-system.fig", "notes.md"];

  return (
    <aside
      className="dm-right-panel figma-panel custom-scrollbar"
      style={{
        width: 280,
        flexShrink: 0,
        borderRadius: 0,
        borderTop: 0,
        borderRight: 0,
        borderBottom: 0,
        borderLeft: "1px solid var(--ax-border)",
        background: "rgb(var(--surface-50) / 0.74)",
        padding: "24px 20px",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 24,
        position: "relative",
        zIndex: 2,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, paddingBottom: 20, borderBottom: "1px solid var(--ax-border)" }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: visual.bg,
            border: `1px solid ${visual.border}`,
            color: visual.color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
            fontWeight: 700,
            boxShadow: "0 0 20px rgba(82,141,255,0.2)",
          }}
        >
          {activeConv.otherUser.username?.[0]?.toUpperCase()}
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ax-text)" }}>{activeConv.otherUser.username}</div>
          <span style={{ display: "inline-flex", marginTop: 5, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: badge.bg, color: badge.color, border: `1px solid ${badge.color}33` }}>
            {badge.label}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: online ? "rgb(34,197,94)" : "var(--ax-faint)", boxShadow: online ? "0 0 5px rgba(34,197,94,0.5)" : "none" }} />
          <span style={{ fontSize: 12, color: online ? "rgb(34,197,94)" : "var(--ax-dim)" }}>{online ? "Online" : "Offline"}</span>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ax-dim)", marginBottom: 12, paddingBottom: 6, borderBottom: "1px solid var(--ax-border)" }}>Today</div>
        {[
          { color: "rgb(59,130,255)", title: "1:1 Mentoring", sub: "with Alex Johnson", time: "2:00 PM" },
          { color: "rgb(0,219,232)", title: "Course Outline V2", sub: "Pending Approval", action: "Review" },
        ].map((item) => (
          <div key={item.title} style={{ borderRadius: 10, background: "var(--ax-panel)", border: "1px solid var(--ax-border)", padding: "14px 14px 14px 18px", marginBottom: 8, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: item.color, boxShadow: `0 0 10px ${item.color}80` }} />
            {item.time && <div style={{ fontSize: 10, color: "var(--ax-dim)", marginBottom: 2 }}>{item.time}</div>}
            {item.sub && <div style={{ fontSize: 10, color: item.color, marginBottom: 2 }}>{item.sub}</div>}
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ax-text)" }}>{item.title}</div>
            {item.action && <button type="button" style={{ marginTop: 6, fontSize: 11, color: item.color, background: "none", border: "none", cursor: "pointer", padding: 0 }}>{item.action} -&gt;</button>}
          </div>
        ))}
      </div>

      <div>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ax-dim)", marginBottom: 12, paddingBottom: 6, borderBottom: "1px solid var(--ax-border)" }}>Shared Files</div>
        {files.map((file) => (
          <div key={file} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, marginBottom: 4 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: "rgba(59,130,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "var(--accent-300)", flexShrink: 0 }}>
              {file.split(".").pop()?.toUpperCase()}
            </div>
            <span style={{ fontSize: 12, color: "var(--ax-muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

export default function DmPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useCmsNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useCmsAuthStore((state) => state.user);
  const conversations = useCmsDmStore((state) => state.conversations);
  const setConversations = useCmsDmStore((state) => state.setConversations);
  const messages = useCmsDmStore((state) => state.messages);
  const setMessages = useCmsDmStore((state) => state.setMessages);
  const dmTypingUsers = useCmsUiStore((state) => state.dmTypingUsers);
  const onlineUsers = useCmsUiStore((state) => state.onlineUsers);
  const { joinDm, leaveDm, sendDm, startDmTyping, stopDmTyping, markDmRead } = useCmsSocket();
  const [input, setInput] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showDrawer, setShowDrawer] = useState(false);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMentorRequest = searchParams.get("askMentor") === "1";

  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [conversationId, showDrawer]);

  useEffect(() => {
    if (isMentorRequest) {
      setShowDrawer(true);
      setUserSearch("");
    }
  }, [isMentorRequest]);

  // Debounce the search input by 350ms before hitting the backend
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(userSearch), 350);
    return () => clearTimeout(t);
  }, [userSearch]);

  useEffect(() => {
    if (!showDrawer) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setShowDrawer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showDrawer]);

  const { data: convData, refetch: refetchConvs } = useQuery({
    queryKey: ["dm-conversations"],
    queryFn: async () => (await api.get("/dm/conversations")).data,
    staleTime: 30_000,         // socket pushes receive_dm; REST is initial + fallback
  });
  useEffect(() => { if (convData) setConversations(convData); }, [convData, setConversations]);

  const { data: msgData } = useQuery({
    queryKey: ["dm-messages", conversationId],
    queryFn: async () => (await api.get(`/dm/conversations/${conversationId}/messages`)).data,
    enabled: !!conversationId,
    staleTime: 5 * 60_000,    // socket streams new DMs; REST loads history on open
  });
  useEffect(() => { if (msgData && conversationId) setMessages(conversationId, msgData.messages); }, [msgData, conversationId, setMessages]);

  const { data: dmUsers = [] } = useQuery<any[]>({
    queryKey: ["dm-users", isMentorRequest, debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (isMentorRequest) params.set("batchMentors", "true");
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      const qs = params.toString();
      return (await api.get(`/dm/users${qs ? `?${qs}` : ""}`)).data;
    },
    enabled: showDrawer || !conversationId,
    staleTime: 60_000,         // user list changes rarely; re-search if needed
  });

  useEffect(() => {
    if (!conversationId) return;
    joinDm(conversationId);
    markDmRead(conversationId);
    return () => { leaveDm(conversationId); };
  }, [conversationId, joinDm, leaveDm, markDmRead]);

  useEffect(() => {
    const container = messagesScrollRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages, conversationId]);

  const activeConv = conversations.find((conversation) => conversation.id === conversationId);
  const convMessages = conversationId ? messages[conversationId] || [] : [];
  const currentDmTyping = conversationId ? dmTypingUsers[conversationId] || [] : [];

  const filteredConversations = conversations.filter((conversation) => {
    const query = conversationSearch.trim().toLowerCase();
    return !query || conversation.otherUser.username.toLowerCase().includes(query);
  });
  const pinnedConversations = filteredConversations.filter((conversation) => isPinnedRole(conversation.otherUser.role));
  const recentConversations = filteredConversations.filter((conversation) => !isPinnedRole(conversation.otherUser.role));

  // Server already filters by search term — just use dmUsers directly
  const drawerUsers = dmUsers;
  const drawerMentors = drawerUsers.filter((item: any) => {
    const role = (item.role || "").toLowerCase();
    return isMentorRequest ? role === "mentor" : isPinnedRole(role);
  });
  const drawerMembers = isMentorRequest ? [] : drawerUsers.filter((item: any) => !isPinnedRole(item.role));

  const allMentors = dmUsers.filter((item: any) => (item.role || "").toLowerCase() === "mentor");
  const suggested = (allMentors.length ? allMentors : dmUsers).slice(0, 4);
  const suggestedLabel = allMentors.length ? "Suggested Mentors" : "Suggested People";

  const handleTyping = () => {
    if (!conversationId) return;
    startDmTyping(conversationId);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => stopDmTyping(conversationId), 2000);
  };

  const handleSend = () => {
    if (!input.trim() || !conversationId || !user) return;
    const tempId = Math.random().toString(36).slice(2);
    useCmsDmStore.getState().addOptimisticMessage(conversationId, {
      id: tempId,
      tempId,
      conversation_id: conversationId,
      sender_id: user.id,
      content: input.trim(),
      is_read: false,
      created_at: new Date().toISOString(),
      sender: { id: user.id, username: user.username, role: user.role },
      attachments: [],
    });
    sendDm(conversationId, input.trim(), tempId, []);
    setInput("");
    refetchConvs();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const startNewConversation = async (targetUserId: string) => {
    const { data } = await api.post("/dm/conversations", { targetUserId });
    setShowDrawer(false);
    refetchConvs();
    navigate(`/dm/${data.id}`);
  };

  const closeStartDrawer = () => {
    setShowDrawer(false);
    if (isMentorRequest) {
      const next = new URLSearchParams(searchParams);
      next.delete("askMentor");
      setSearchParams(next, { replace: true });
    }
  };

  const activeOnline = activeConv ? onlineUsers.has(activeConv.otherUser.id) : false;

  return (
    <div className="dm-layout" style={{ height: "100%", minHeight: 0, width: "100%", display: "flex", background: "var(--ax-bg)", color: "var(--ax-text)", overflow: "hidden", position: "relative" }}>
      <aside
        className={`dm-contact-panel figma-panel ${activeConv ? "dm-contact-panel--has-active" : ""}`}
        style={{
          width: 384,
          flexShrink: 0,
          borderRadius: 0,
          borderTop: 0,
          borderLeft: 0,
          borderBottom: 0,
          borderRight: "1px solid var(--ax-border)",
          background: "rgb(var(--surface-50) / 0.74)",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          overflow: "hidden",
          zIndex: 2,
        }}
      >
        {/* Decorative orb */}
        <div
          className="theme-orb"
          style={{
            position: "absolute",
            left: 69,
            bottom: -120,
            width: 265,
            height: 159,
            borderRadius: "50%",
            background: "linear-gradient(rgb(62,56,224) 0%, rgb(0,219,232) 100%)",
            opacity: 0.5,
            filter: "blur(70px)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

        <div style={{ padding: "24px 24px 16px", borderBottom: "1px solid var(--ax-field-border)", position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button type="button" onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: "var(--ax-muted)", display: "flex", padding: 4, cursor: "pointer" }} aria-label="Back">
                <ArrowLeft size={16} />
              </button>
              <h1 style={{ fontSize: 24, fontWeight: 700, lineHeight: "28.8px", color: "var(--ax-text)", letterSpacing: "-0.48px" }}>Direct Messages</h1>
            </div>
            <button
              type="button"
              onClick={() => setShowDrawer(true)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 6, border: "1px solid var(--ax-field-border)", background: "var(--ax-field-bg)", color: "var(--ax-text)", fontSize: 13, fontWeight: 700, letterSpacing: "0.52px", cursor: "pointer" }}
            >
              <Plus size={11} />
              New
            </button>
          </div>

          <div style={{ position: "relative" }}>
            <Search size={16} color="#424c64" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input
              className="figma-field"
              value={conversationSearch}
              onChange={(event) => setConversationSearch(event.target.value)}
              placeholder="Find a conversation..."
              style={{ height: 42, padding: "0 72px 0 40px" }}
            />
            <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", display: "flex", gap: 3 }}>
              {["⌘", "K"].map((key) => (
                <span key={key} style={{ minWidth: 20, height: 22, borderRadius: 4, background: "var(--ax-field-bg)", border: "1px solid var(--ax-field-border)", color: "var(--ax-faint)", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{key}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="figma-scroll custom-scrollbar" style={{ padding: "8px 12px", position: "relative", zIndex: 1 }}>
          {pinnedConversations.length > 0 && (
            <Section label="Pinned">
              {pinnedConversations.map((conversation, index) => (
                <ContactRow key={conversation.id} conversation={conversation} index={index} online={onlineUsers.has(conversation.otherUser.id)} active={conversation.id === conversationId} />
              ))}
            </Section>
          )}
          {recentConversations.length > 0 && (
            <Section label="Recent">
              {recentConversations.map((conversation, index) => (
                <ContactRow key={conversation.id} conversation={conversation} index={index} online={onlineUsers.has(conversation.otherUser.id)} active={conversation.id === conversationId} />
              ))}
            </Section>
          )}
          {filteredConversations.length === 0 && <p style={{ color: "var(--ax-faint)", fontSize: 13, textAlign: "center", paddingTop: 24 }}>No conversations yet</p>}
        </div>
      </aside>

      {activeConv ? (
        <main className="dm-main" style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", position: "relative", zIndex: 1 }}>
          <header className="dm-main-header" style={{ height: 64, flexShrink: 0, background: "var(--ax-glass)", borderBottom: "1px solid var(--ax-border)", backdropFilter: "blur(24px)", display: "flex", alignItems: "center", padding: "0 24px", gap: 16 }}>
            <button type="button" className="dm-chat-back" onClick={() => navigate("/dm")} style={{ background: "transparent", border: "none", color: "var(--ax-muted)", display: "none", padding: 4 }} aria-label="Back to conversations">
              <ArrowLeft size={17} />
            </button>
            <Avatar user={activeConv.otherUser} size={38} online={activeOnline} borderColor="var(--ax-panel)" />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: "var(--ax-text)" }}>{activeConv.otherUser.username}</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: badgeFor(activeConv.otherUser.role).bg, color: badgeFor(activeConv.otherUser.role).color, border: `1px solid ${badgeFor(activeConv.otherUser.role).color}33` }}>
                  {badgeFor(activeConv.otherUser.role).label}
                </span>
              </div>
              <span style={{ fontSize: 12, color: activeOnline ? "rgb(34,197,94)" : "var(--ax-dim)" }}>{activeOnline ? "Online" : "Offline"}</span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {[<Phone size={16} />, <Video size={16} />, <MoreVertical size={16} />].map((icon, index) => (
                <button key={index} type="button" style={{ width: 34, height: 34, borderRadius: 8, border: "1px solid var(--ax-border)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ax-muted)" }}>
                  {icon}
                </button>
              ))}
            </div>
          </header>

          <div ref={messagesScrollRef} className="figma-scroll custom-scrollbar" style={{ padding: "24px 24px 8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "0 0 20px" }}>
              <div style={{ flex: 1, height: 1, background: "var(--ax-panel-3)" }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ax-faint)", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>Today</span>
              <div style={{ flex: 1, height: 1, background: "var(--ax-panel-3)" }} />
            </div>
            {convMessages.map((message) => (
              <MessageBubble key={message.id} message={message} isMe={String(message.sender_id).toLowerCase() === String(user?.id).toLowerCase()} activeConv={activeConv} />
            ))}
          </div>

          <TypingIndicator users={currentDmTyping} />
          <div style={{ padding: "12px 20px 20px", flexShrink: 0 }}>
            <div className="figma-panel" style={{ borderRadius: 12, padding: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px" }}>
                <button type="button" style={{ color: "var(--ax-dim)", background: "none", border: "none", cursor: "pointer", display: "flex", padding: 4 }}>
                  <Paperclip size={15} />
                </button>
                <textarea
                  value={input}
                  onChange={(event) => {
                    setInput(event.target.value);
                    handleTyping();
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={`Message ${activeConv.otherUser.username}...`}
                  rows={1}
                  style={{ flex: 1, resize: "none", background: "none", border: "none", color: "var(--ax-text)", fontSize: 14, lineHeight: 1.6, padding: "0 4px", fontFamily: "Poppins" }}
                />
                <button type="button" style={{ color: "var(--ax-dim)", background: "none", border: "none", cursor: "pointer", display: "flex", padding: 4 }}>
                  <Smile size={16} />
                </button>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 12px 8px" }}>
                <button type="button" onClick={handleSend} disabled={!input.trim()} style={{ display: "flex", alignItems: "center", gap: 6, border: "none", borderRadius: 6, background: figmaGradient, color: "var(--ax-primary-action-text)", padding: "6px 16px", fontSize: 12, fontWeight: 600, cursor: input.trim() ? "pointer" : "not-allowed", opacity: input.trim() ? 1 : 0.5 }}>
                  <Send size={14} />
                  Send
                </button>
              </div>
            </div>
          </div>
        </main>
      ) : (
        <WelcomeCanvas
          suggested={suggested}
          suggestedLabel={suggestedLabel}
          onlineUsers={onlineUsers}
          onStart={startNewConversation}
          onOpenPicker={() => setShowDrawer(true)}
        />
      )}

      {activeConv && <RightUtilityPanel activeConv={activeConv} online={activeOnline} />}

      <StartConversationPanel
        open={showDrawer}
        mentorOnly={isMentorRequest}
        mentors={drawerMentors}
        members={drawerMembers}
        search={userSearch}
        onSearch={setUserSearch}
        onClose={closeStartDrawer}
        onStart={startNewConversation}
        onlineUsers={onlineUsers}
      />
    </div>
  );
}
