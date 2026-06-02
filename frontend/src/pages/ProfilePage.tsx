import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  AtSign,
  Bell,
  Bot,
  BriefcaseBusiness,
  Github,
  IdCard,
  Lock,
  Monitor,
  Save,
  Search,
  Settings,
  Share2,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import api from "../api/client";
import { useAuthStore } from "../store/authStore";
import { figmaGradient } from "../components/FigmaShared";

const inputStyle = {
  height: 44,
  borderRadius: 8,
  background: "rgba(29,32,34,0.5)",
  border: "1px solid rgba(66,71,84,0.5)",
  color: "#94a3b8",
  padding: "0 14px",
  fontSize: 13,
  fontFamily: "Poppins",
  width: "100%",
} as const;

function FieldLabel({ children }: { children: string }) {
  return <div style={{ color: "#b6bdca", fontSize: 12, letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: 8 }}>{children}</div>;
}

function Toggle({ checked, onClick }: { checked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 32,
        height: 18,
        borderRadius: 20,
        border: "none",
        background: checked ? "linear-gradient(90deg,#2e6cff,#00dbe8)" : "rgba(255,255,255,0.14)",
        padding: 2,
        cursor: "pointer",
        display: "flex",
        justifyContent: checked ? "flex-end" : "flex-start",
        alignItems: "center",
      }}
    >
      <span style={{ width: 14, height: 14, borderRadius: "50%", background: "#e0e3e6", display: "block" }} />
    </button>
  );
}

function Panel({ title, icon, children, style }: { title: string; icon: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <section
      className="figma-panel"
      style={{
        padding: 24,
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#d7dce3", fontSize: 16, marginBottom: 18 }}>
        <span style={{ color: "#b8c0cc", display: "flex" }}>{icon}</span>
        <span>{title}</span>
      </div>
      <div style={{ height: 1, background: "rgba(255,255,255,0.06)", marginBottom: 18 }} />
      {children}
    </section>
  );
}

export default function ProfilePage() {
  const user = useAuthStore((state) => state.user);
  const sources = useAuthStore((state) => state.sources);
  const setUser = useAuthStore((state) => state.setUser);
  const lms = sources?.lms?.profile;
  const crm = sources?.crm;

  const displayAvatar = user?.avatar_url || lms?.ProfilePicture || crm?.profilePicture || "";
  const displayName = user?.username || [lms?.FirstName, lms?.LastName].filter(Boolean).join(" ") || "Admin User";
  const displayEmail = user?.email || lms?.Email || crm?.email || "admin@acceleratorx.ai";
  const [username, setUsername] = useState(displayName);
  const [bio, setBio] = useState(user?.bio || "Lead system administrator ensuring the AI workspace remains stable and secure. Passionate about automated workflows.");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [twoFactor, setTwoFactor] = useState(true);
  const [desktopAlerts, setDesktopAlerts] = useState(true);
  const [emailDigests, setEmailDigests] = useState(false);
  const [mentionsOnly, setMentionsOnly] = useState(true);
  const [message, setMessage] = useState("");

  const profileMut = useMutation({
    mutationFn: (data: { username: string; bio?: string }) => api.patch("/profile", data),
    onSuccess: (res) => {
      if (user) setUser({ ...user, username: res.data.username, bio: res.data.bio });
      setMessage("Profile updated");
      setTimeout(() => setMessage(""), 2500);
    },
  });

  const passwordMut = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) => api.post("/profile/change-password", data),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setMessage("Password changed");
      setTimeout(() => setMessage(""), 2500);
    },
  });

  return (
    <div className="figma-page">
      <header className="app-topbar" style={{ height: 64, borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(5,7,10,0.82)", display: "flex", alignItems: "center", gap: 16, padding: "0 28px" }}>
        <button type="button" onClick={() => window.history.back()} style={{ display: "flex", background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}>
          <ArrowLeft size={22} />
        </button>
        <h1 style={{ fontSize: 18, color: "#e0e3e6", fontWeight: 700 }}>Profile Settings</h1>
        <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
          <div className="app-topbar-search" style={{ position: "relative", width: 460 }}>
            <Search size={15} color="#6c7793" style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }} />
            <input
              placeholder="Ask AI or search workspace... (Cmd+K)"
              style={{ width: "100%", height: 38, borderRadius: 6, background: "rgb(7,9,13)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", padding: "0 42px", fontFamily: "Poppins", fontSize: 13 }}
            />
            <Sparkles size={13} color="rgb(0,219,232)" style={{ position: "absolute", right: 13, top: "50%", transform: "translateY(-50%)" }} />
          </div>
        </div>
        <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 6, border: "none", background: figmaGradient, color: "#05070a", fontSize: 12, fontWeight: 600, fontFamily: "Poppins", cursor: "pointer" }}>
          <Sparkles size={13} />
          Ask Mentor
        </button>
        <Bell size={16} color="#94a3b8" />
        <Settings size={16} color="#94a3b8" />
        <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.1)" }} />
        <Link to="/profile" aria-label="Open profile" style={{ width: 32, height: 32, borderRadius: "50%", background: "rgb(45,103,107)", border: "1px solid rgba(255,255,255,0.1)", display: "block" }} />
      </header>

      <main className="profile-content page-scroll-content figma-scroll" style={{ width: "100%", maxWidth: 1240, margin: "0 auto", padding: "50px 28px 70px" }}>
        {message && <div style={{ marginBottom: 16, color: "rgb(53,221,61)", fontSize: 13 }}>{message}</div>}

        <section
          className="profile-hero"
          style={{
            minHeight: 154,
            borderRadius: 9,
            border: "1px solid var(--ax-border)",
            background: "linear-gradient(105deg,rgba(0,219,232,0.055),rgba(255,255,255,0.035),rgba(0,94,160,0.13))",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "22px 22px",
            marginBottom: 22,
          }}
        >
          <div className="profile-hero-main" style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <div style={{ position: "relative", width: 118, height: 118, borderRadius: "50%", border: "1px solid rgba(59,130,255,0.35)", boxShadow: "0 0 0 8px rgba(59,130,255,0.08), 0 0 30px rgba(0,219,232,0.22)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {displayAvatar ? (
                <img src={displayAvatar} alt="Profile" style={{ width: 90, height: 90, borderRadius: "50%", objectFit: "cover" }} />
              ) : (
                <div style={{ width: 90, height: 90, borderRadius: "50%", background: "linear-gradient(140deg,#7fe6f0,#2bb8d4 60%,#0e7490)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 700 }}>
                  {displayName[0]?.toUpperCase()}
                </div>
              )}
              <button style={{ position: "absolute", right: -2, bottom: 8, width: 28, height: 28, borderRadius: "50%", border: "1px solid rgba(148,163,184,0.4)", background: "rgb(16,21,29)", color: "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Settings size={13} />
              </button>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <h2 style={{ fontSize: 24, fontWeight: 700 }}>{displayName}</h2>
                <span style={{ borderRadius: 4, border: "1px solid rgba(175,198,255,0.22)", background: "rgba(79,124,255,0.15)", color: "#afc6ff", fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", padding: "5px 8px" }}>
                  SYSTEM ADMINISTRATOR
                </span>
              </div>
              <div style={{ color: "#94a3b8", fontSize: 14, marginBottom: 10 }}>@admin_master</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "rgb(0,219,232)", fontSize: 11, fontWeight: 700 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "rgb(0,219,232)", boxShadow: "0 0 6px rgba(0,219,232,0.7)" }} />
                Online - Last active just now
              </div>
            </div>
          </div>
          <button style={{ display: "flex", alignItems: "center", gap: 10, height: 38, padding: "0 17px", borderRadius: 7, border: "1px solid rgba(148,163,184,0.28)", background: "rgba(255,255,255,0.03)", color: "#d7dce3", fontFamily: "Poppins", fontSize: 14 }}>
            <Share2 size={15} />
            Share Profile
          </button>
        </section>

        <div className="profile-grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <Panel title="Identity Details" icon={<IdCard size={18} />}>
              <div className="profile-field-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <label>
                  <FieldLabel>Full Name</FieldLabel>
                  <input value={displayName} readOnly style={inputStyle} />
                </label>
                <label>
                  <FieldLabel>Username</FieldLabel>
                  <input value={`@${username}`} onChange={(event) => setUsername(event.target.value.replace(/^@/, ""))} style={inputStyle} />
                </label>
              </div>
              <label style={{ display: "block", marginBottom: 14 }}>
                <FieldLabel>Email Address</FieldLabel>
                <input value={displayEmail} readOnly style={inputStyle} />
              </label>
              <label>
                <FieldLabel>Bio / About</FieldLabel>
                <textarea value={bio} onChange={(event) => setBio(event.target.value)} style={{ ...inputStyle, height: 108, padding: "12px 14px", resize: "none", lineHeight: 1.5 }} />
              </label>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                <button
                  onClick={() => profileMut.mutate({ username, bio })}
                  disabled={profileMut.isPending}
                  style={{ display: "flex", alignItems: "center", gap: 8, height: 40, border: "none", borderRadius: 7, background: figmaGradient, color: "#fff", padding: "0 22px", fontFamily: "Poppins", fontSize: 14, cursor: "pointer" }}
                >
                  <Save size={14} />
                  Save Changes
                </button>
              </div>
            </Panel>

            <section style={{ borderRadius: 9, padding: 22, background: "linear-gradient(120deg,#006df5,#00dbe8)", color: "#e0e3e6" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 17 }}>
                  <BriefcaseBusiness size={17} />
                  API & Integrations
                </div>
                <span style={{ borderRadius: 4, background: "rgba(5,7,10,0.25)", color: "#9cf9ff", fontSize: 9, fontWeight: 700, padding: "4px 8px" }}>PRO</span>
              </div>
              <div style={{ height: 1, background: "rgba(5,7,10,0.18)", marginBottom: 20 }} />
              {[
                { icon: <Github size={18} />, title: "GitHub Workspace", sub: "Connected to acme-corp repo", action: "Manage", dark: true },
                { icon: <Bot size={18} />, title: "OpenAI API Key", sub: "sk-...8f92 (Active)", action: "Revoke", dark: false },
              ].map((item) => (
                <div key={item.title} style={{ display: "flex", alignItems: "center", gap: 18, borderRadius: 7, border: "1px solid rgba(5,7,10,0.22)", padding: "13px 12px", marginBottom: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 4, background: item.dark ? "#05070a" : "rgba(255,255,255,0.28)", display: "flex", alignItems: "center", justifyContent: "center", color: item.dark ? "#fff" : "#003b91" }}>
                    {item.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14 }}>{item.title}</div>
                    <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 14, marginTop: 4 }}>{item.sub}</div>
                  </div>
                  <button style={{ borderRadius: 4, border: "1px solid rgba(5,7,10,0.2)", background: "rgba(5,7,10,0.18)", color: "#e0e3e6", fontSize: 11, padding: "7px 12px" }}>{item.action}</button>
                </div>
              ))}
            </section>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <Panel title="Security" icon={<Lock size={18} />}>
              <label style={{ display: "block", marginBottom: 14 }}>
                <FieldLabel>Current Password</FieldLabel>
                <input value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} type="password" placeholder="********" style={inputStyle} />
              </label>
              <label style={{ display: "block", marginBottom: 18 }}>
                <FieldLabel>New Password</FieldLabel>
                <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" placeholder="Enter new password" style={inputStyle} />
              </label>
              <button onClick={() => passwordMut.mutate({ currentPassword, newPassword })} style={{ width: "100%", height: 40, borderRadius: 7, border: "1px solid rgba(59,130,255,0.22)", background: "transparent", color: "#e0e3e6", fontFamily: "Poppins", fontSize: 13 }}>
                Update Password
              </button>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 32 }}>
                <div>
                  <div style={{ fontSize: 14, color: "#e0e3e6" }}>Two-Factor Auth</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Recommended for admins</div>
                </div>
                <Toggle checked={twoFactor} onClick={() => setTwoFactor((value) => !value)} />
              </div>
            </Panel>

            <Panel title="Notifications" icon={<Bell size={18} />}>
              {[
                { icon: <Monitor size={13} />, label: "Desktop Alerts", value: desktopAlerts, set: setDesktopAlerts },
                { icon: <Bell size={13} />, label: "Email Digests", value: emailDigests, set: setEmailDigests },
                { icon: <AtSign size={13} />, label: "Mentions Only", value: mentionsOnly, set: setMentionsOnly },
              ].map((item) => (
                <div key={item.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 15 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#cfd5dc", fontSize: 13 }}>
                    {item.icon}
                    {item.label}
                  </div>
                  <Toggle checked={item.value} onClick={() => item.set((value) => !value)} />
                </div>
              ))}
            </Panel>

            <section style={{ borderRadius: 9, border: "1px solid rgba(255,99,93,0.3)", background: "linear-gradient(135deg,rgba(255,99,93,0.06),rgba(59,130,255,0.05))", padding: "24px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <ShieldAlert size={18} color="rgb(255,99,93)" />
                <div>
                  <div style={{ color: "rgb(255,99,93)", fontSize: 14 }}>Danger Zone</div>
                  <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 5 }}>Permanently delete account</div>
                </div>
              </div>
              <button style={{ borderRadius: 7, border: "1px solid rgb(255,99,93)", background: "transparent", color: "rgb(255,99,93)", fontWeight: 700, fontSize: 11, padding: "7px 13px" }}>Delete</button>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
