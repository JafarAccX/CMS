import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/client";
import { useAuthStore } from "../store/authStore";
import { useBatchStore } from "../store/batchStore";
import { useNotificationStore } from "../store/notificationStore";
import { useSocket } from "../hooks/useSocket";
import {
  Lock, MessageSquare, Users, LogOut, Shield, BookOpen, User,
  MessageCircle, Zap, Hash, Sparkles, ArrowRight, Calendar,
  ChevronDown, Search
} from "lucide-react";
import NotificationDropdown from "../components/NotificationDropdown";

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const setBatches = useBatchStore((s) => s.setBatches);
  const batches = useBatchStore((s) => s.batches);
  const setNotifications = useNotificationStore((s) => s.setNotifications);
  const navigate = useNavigate();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  useSocket();

  const { data: batchData } = useQuery({
    queryKey: ["batches"],
    queryFn: async () => { const { data } = await api.get("/batches"); return data; },
  });

  const { data: notifData } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => { const { data } = await api.get("/notifications"); return data; },
  });

  useEffect(() => { if (batchData) setBatches(batchData); }, [batchData]);
  useEffect(() => { if (notifData) setNotifications(notifData); }, [notifData]);

  const generalBatches = batches.filter((b) => b.type === "general");
  const myBatches = batches.filter((b) => b.type !== "general" && b.hasAccess);
  const lockedBatches = batches.filter((b) => !b.hasAccess && b.type !== "general");

  const handleLogout = async () => { await logout(); navigate("/login"); };

  const nav = [
    { key: "home", label: "Home", icon: <Zap className="w-[15px] h-[15px]" />, active: true },
    { key: "rooms", label: "Rooms", icon: <Hash className="w-[15px] h-[15px]" />, count: batches.filter(b => b.hasAccess).length },
    { key: "dm", label: "Direct", icon: <MessageCircle className="w-[15px] h-[15px]" />, href: "/dm" },
    { key: "lib", label: "Library", icon: <BookOpen className="w-[15px] h-[15px]" /> },
    { key: "cal", label: "Calendar", icon: <Calendar className="w-[15px] h-[15px]" /> },
  ];

  return (
    <div className="h-screen flex bg-surface bg-grid">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-surface-50 border-r border-hairline flex flex-col hidden lg:flex">
        {/* Workspace header */}
        <button className="flex items-center gap-2.5 px-3.5 py-3.5 border-b border-hairline text-left hover:bg-surface-100 transition-colors">
          <div className="w-[30px] h-[30px] rounded-lg bg-gradient-to-br from-accent-300 via-accent-400 to-accent-600 flex items-center justify-center shadow-btn">
            <Zap className="w-[15px] h-[15px] text-white" strokeWidth={2.4} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-primary">AcceleratorX</div>
            <div className="text-[11px] text-dim font-normal">Learning Platform</div>
          </div>
          <ChevronDown className="w-[13px] h-[13px] text-dim" />
        </button>

        {/* Search */}
        <div className="px-3 pt-3 pb-1.5">
          <div className="h-8 px-2.5 bg-surface-100 border border-hairline rounded-lg flex items-center gap-2 text-dim">
            <Search className="w-[13px] h-[13px]" />
            <span className="text-[12.5px] flex-1">Search</span>
            <span className="font-mono text-[11px] px-1.5 border border-hairline rounded text-dim">⌘K</span>
          </div>
        </div>

        {/* Nav */}
        <div className="px-2 py-1.5">
          {nav.map(it => (
            <Link
              key={it.key}
              to={it.href || (it.key === "home" ? "/" : `/${it.key}`)}
              className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-[13px] mb-px transition-all ${
                it.active
                  ? "bg-accent-100 border border-accent-200 text-accent-300 font-semibold"
                  : "text-muted hover:bg-surface-100 hover:text-primary border border-transparent font-medium"
              }`}
            >
              <span className={it.active ? "text-accent-300" : "text-dim"}>{it.icon}</span>
              <span className="flex-1">{it.label}</span>
              {it.count != null && (
                <span className={`min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                  it.active ? "bg-accent-400 text-white" : "bg-surface-200 text-muted"
                }`}>{it.count}</span>
              )}
            </Link>
          ))}
        </div>

        <div className="h-px bg-hairline mx-3 my-2" />

        {/* Channels */}
        <div className="flex-1 overflow-auto custom-scrollbar px-2">
          <div className="flex items-center px-2 py-1.5">
            <span className="t-overline flex-1">Channels</span>
          </div>
          {batches.filter(b => b.hasAccess).map(b => (
            <Link
              key={b.id}
              to={`/batch/${b.id}`}
              className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-[7px] text-[13px] mb-px transition-all text-muted hover:text-primary hover:bg-surface-100"
            >
              <Hash className="w-[13px] h-[13px] text-dim" />
              <span className="flex-1 truncate">{b.name}</span>
              {b._count?.messages > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-accent-400 text-white text-[10px] font-bold flex items-center justify-center">
                  {b._count.messages > 99 ? "99+" : b._count.messages}
                </span>
              )}
            </Link>
          ))}
        </div>

        {/* Profile */}
        <div className="p-3 border-t border-hairline flex items-center gap-2.5">
          <div className="relative">
            <span className="avatar avatar-violet w-8 h-8 text-xs">{user?.username?.[0]?.toUpperCase() || "?"}</span>
            <span className="status-dot status-online absolute -bottom-px -right-px border-surface-50" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-semibold text-primary truncate">{user?.username}</div>
            <div className="text-[11px] text-dim font-normal">Online</div>
          </div>
          <button onClick={handleLogout} className="p-1 text-dim hover:text-red-400 rounded transition-colors" title="Sign out" aria-label="Sign out">
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 px-6 flex-shrink-0 border-b border-hairline flex items-center gap-3">
          {/* Mobile hamburger */}
          <button onClick={() => setIsMobileNavOpen(!isMobileNavOpen)} className="p-2 -ml-2 text-dim hover:text-primary lg:hidden" aria-label="Toggle navigation menu">
            <Hash className="w-5 h-5" />
          </button>
          <div className="text-sm font-semibold text-primary flex-1">Home</div>
          {user?.role === "admin" && (
            <Link to="/admin" className="chip chip-admin text-[10px]">
              <Shield className="w-3 h-3" /> Admin
            </Link>
          )}
          {user?.role === "mentor" && (
            <Link to="/mentor" className="chip chip-mentor text-[10px]">
              <BookOpen className="w-3 h-3" /> Mentor
            </Link>
          )}
          <NotificationDropdown />
          <button className="btn-surface flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[13px] font-medium">
            <Sparkles className="w-3.5 h-3.5" /> Ask mentor
          </button>
        </header>

        {/* Content scroll area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-glow">
          <div className="px-10 py-9 max-w-[1280px] mx-auto">
            {/* Hero */}
            <div className="mb-9">
              <div className="flex items-center gap-2.5 text-dim mb-3">
                <span className="t-overline">Today</span>
                <span className="text-faint">·</span>
                <span className="text-[11px] font-normal">Week 6 of 12</span>
                {batches.length > 0 && (
                  <>
                    <span className="text-faint">·</span>
                    <span className="text-[11px] text-accent-300 font-medium flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent-400" />
                      {myBatches.length + generalBatches.length} channels available
                    </span>
                  </>
                )}
              </div>
              <h1 className="font-serif text-[56px] font-medium leading-none text-primary max-w-[820px]" style={{ letterSpacing: "-0.025em" }}>
                Good morning, {user?.username}.<br />
                <span className="text-muted">Your workspace </span>
                <em className="italic text-accent-300 font-medium">awaits.</em>
              </h1>
            </div>

            {/* Guest Banner */}
            {user?.role === "guest" && (
              <div className="mb-8 p-4 rounded-lg border border-amber-500/20 bg-amber-500/5 flex items-center justify-between">
                <p className="text-amber-300 text-sm">You're browsing as a guest. Sign up for full access!</p>
                <Link to="/register" className="btn-primary px-4 py-1.5 rounded-lg text-sm">Sign Up</Link>
              </div>
            )}

            {/* Rooms grid */}
            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
              <div>
                {/* General batches */}
                {generalBatches.length > 0 && (
                  <section className="mb-8">
                    <SectionLabel kicker="General" title="Open rooms" right={`${generalBatches.length} rooms`} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {generalBatches.map(b => (
                        <RoomTile key={b.id} batch={b} />
                      ))}
                    </div>
                  </section>
                )}

                {/* My batches */}
                {myBatches.length > 0 && (
                  <section className="mb-8">
                    <SectionLabel kicker="Active" title="Your rooms" right={`${myBatches.length} rooms`} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {myBatches.map(b => (
                        <RoomTile key={b.id} batch={b} />
                      ))}
                    </div>
                  </section>
                )}

                {/* Locked */}
                {lockedBatches.length > 0 && (
                  <section>
                    <SectionLabel kicker="Locked" title="Requires access" />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {lockedBatches.map(b => (
                        <div key={b.id} className="card p-3.5 opacity-60">
                          <div className="flex items-center gap-2 mb-2">
                            <Lock className="w-3.5 h-3.5 text-faint" />
                            <span className="text-sm font-semibold text-dim truncate">{b.name}</span>
                          </div>
                          <p className="text-[12.5px] text-faint truncate">{b.description || "No description"}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>

              {/* Right sidebar — stats */}
              <aside>
                <SectionLabel kicker="This week" title="At a glance" />
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <StatCard n={String(myBatches.length + generalBatches.length).padStart(2, "0")} label="channels" sub="available" />
                  <StatCard n={String(myBatches.length).padStart(2, "0")} label="enrolled" sub="your batches" />
                  <StatCard n={String(generalBatches.length).padStart(2, "0")} label="general" sub="open to all" />
                </div>

                <SectionLabel kicker="Quick actions" title="Navigate" />
                <div className="card p-3 flex flex-col gap-1">
                  <QuickLink icon={<MessageCircle className="w-3.5 h-3.5" />} label="Direct Messages" href="/dm" />
                  <QuickLink icon={<User className="w-3.5 h-3.5" />} label="Your Profile" href="/profile" />
                  {user?.role === "admin" && <QuickLink icon={<Shield className="w-3.5 h-3.5" />} label="Admin Console" href="/admin" />}
                  {user?.role === "mentor" && <QuickLink icon={<BookOpen className="w-3.5 h-3.5" />} label="Mentor Hub" href="/mentor" />}
                </div>
              </aside>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Nav Menu */}
      {isMobileNavOpen && (
        <div className="fixed inset-0 z-50 bg-surface/80 backdrop-blur-sm lg:hidden" onClick={() => setIsMobileNavOpen(false)}>
          <div className="w-64 h-full bg-surface-50 border-r border-hairline p-4 space-y-2" onClick={e => e.stopPropagation()}>
            {user?.role === "admin" && <Link to="/admin" className="flex items-center gap-3 p-3 text-muted hover:bg-surface-100 rounded-xl"><Shield className="w-5 h-5 text-role-admin" /> Admin Panel</Link>}
            {user?.role === "mentor" && <Link to="/mentor" className="flex items-center gap-3 p-3 text-muted hover:bg-surface-100 rounded-xl"><BookOpen className="w-5 h-5 text-accent-400" /> Mentor Hub</Link>}
            <Link to="/dm" className="flex items-center gap-3 p-3 text-muted hover:bg-surface-100 rounded-xl"><MessageCircle className="w-5 h-5 text-accent-400" /> Direct Messages</Link>
            <Link to="/profile" className="flex items-center gap-3 p-3 text-muted hover:bg-surface-100 rounded-xl"><User className="w-5 h-5 text-dim" /> My Profile</Link>
            <button onClick={handleLogout} className="w-full flex items-center gap-3 p-3 text-red-400 hover:bg-red-500/10 rounded-xl"><LogOut className="w-5 h-5" /> Logout</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ kicker, title, right }: { kicker: string; title: string; right?: string }) {
  return (
    <div className="flex items-baseline gap-3 mb-3">
      <span className="t-overline">{kicker}</span>
      <span className="text-[19px] font-semibold text-primary" style={{ letterSpacing: "-0.012em" }}>{title}</span>
      <span className="flex-1 h-px bg-hairline mb-1" />
      {right && <span className="text-[11px] text-dim font-normal">{right}</span>}
    </div>
  );
}

function RoomTile({ batch }: { batch: any }) {
  return (
    <Link to={batch.hasAccess ? `/batch/${batch.id}` : "#"} className="card card-hover p-3.5 cursor-pointer block">
      <div className="flex items-center gap-2 mb-2.5">
        <Hash className="w-3.5 h-3.5 text-dim" />
        <span className="text-sm font-semibold text-primary flex-1 truncate">{batch.name}</span>
        {batch.userMembership && (
          <span className={`chip text-[9px] ${
            batch.userMembership.role_in_batch === "mentor" ? "chip-mentor" :
            batch.userMembership.role_in_batch === "moderator" ? "chip-mod" :
            "chip-muted"
          }`}>{batch.userMembership.role_in_batch === "member" ? "learner" : batch.userMembership.role_in_batch}</span>
        )}
      </div>
      <p className="text-[12.5px] text-muted truncate mb-2.5">{batch.description || "No description"}</p>
      <div className="flex items-center gap-4 text-[11px] text-dim">
        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{batch._count?.memberships || 0} members</span>
        <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{batch._count?.messages || 0} msgs</span>
      </div>
    </Link>
  );
}

function StatCard({ n, label, sub, highlight }: { n: string; label: string; sub: string; highlight?: boolean }) {
  return (
    <div className="card p-3.5">
      <div className={`font-serif text-[32px] font-medium leading-none ${highlight ? "text-accent-300" : "text-primary"}`} style={{ fontFeatureSettings: '"tnum", "lnum"' }}>{n}</div>
      <div className="text-[11px] text-muted mt-1 font-medium">{label}</div>
      <div className="text-[11px] text-dim font-normal">{sub}</div>
    </div>
  );
}

function QuickLink({ icon, label, href }: { icon: React.ReactNode; label: string; href: string }) {
  return (
    <Link to={href} className="flex items-center gap-2.5 px-1.5 py-2 rounded-[7px] hover:bg-surface-100 transition-colors">
      <div className="w-7 h-7 rounded-[7px] bg-accent-100 text-accent-300 flex items-center justify-center flex-shrink-0">{icon}</div>
      <span className="text-[12.5px] text-primary font-medium flex-1 truncate">{label}</span>
      <ArrowRight className="w-3 h-3 text-dim" />
    </Link>
  );
}
