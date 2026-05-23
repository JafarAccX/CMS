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
  ChevronDown, ChevronRight, Search, Folder
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
  // Learners see a batch-switcher view of "Active rooms"; everyone else sees pinned-only.
  const isLearner = user?.role === "learner";
  const [activeBatchId, setActiveBatchId] = useState<string | null>(() =>
    localStorage.getItem("dashboard.activeBatchId")
  );
  useSocket();

  const { data: batchData } = useQuery({
    queryKey: ["batches"],
    queryFn: async () => { const { data } = await api.get("/batches"); return data; },
  });

  const { data: pinnedData } = useQuery({
    queryKey: ["pinned-rooms"],
    queryFn: async () => (await api.get("/pinned")).data as { pinnedBatches: any[]; pinnedChannels: any[] },
  });

  const { data: notifData } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => { const { data } = await api.get("/notifications"); return data; },
  });

  useEffect(() => { if (batchData) setBatches(batchData); }, [batchData]);
  useEffect(() => { if (notifData) setNotifications(notifData); }, [notifData]);

  const generalBatches = batches.filter((b) => b.type === "general");
  const lockedBatches = batches.filter((b) => !b.hasAccess && b.type !== "general");
  // Sidebar: batches user can navigate into (member of, or general access)
  const sidebarBatches = batches.filter(
    (b) => b.userMembership !== null || b.type === "general"
  );
  // "Active rooms" = pinned batches + pinned channels (user-scoped, from /pinned)
  const pinnedBatches = pinnedData?.pinnedBatches || [];
  const pinnedChannels = pinnedData?.pinnedChannels || [];
  const activeRoomCount = pinnedBatches.length + pinnedChannels.length;

  // ── Learner-only: batch switcher state ──────────────────────
  // Auto-pick first sidebar batch if none selected (or stored one is gone).
  useEffect(() => {
    if (!isLearner || sidebarBatches.length === 0) return;
    const stillExists = activeBatchId && sidebarBatches.some((b) => b.id === activeBatchId);
    if (!stillExists) {
      const next = sidebarBatches[0].id;
      setActiveBatchId(next);
      localStorage.setItem("dashboard.activeBatchId", next);
    }
  }, [isLearner, sidebarBatches, activeBatchId]);

  const handleSwitchBatch = (id: string) => {
    setActiveBatchId(id);
    localStorage.setItem("dashboard.activeBatchId", id);
  };

  const activeBatch = isLearner
    ? sidebarBatches.find((b) => b.id === activeBatchId) || null
    : null;

  const { data: activeBatchChannels } = useQuery({
    queryKey: ["dashboard-channels", activeBatchId],
    queryFn: async () => (await api.get(`/batches/${activeBatchId}/channels`)).data,
    enabled: isLearner && !!activeBatchId,
  });

  const handleLogout = async () => { await logout(); navigate("/login"); };

  const nav = [
    { key: "home", label: "Home", icon: <Zap className="w-[15px] h-[15px]" />, active: true },
    { key: "rooms", label: "Rooms", icon: <Hash className="w-[15px] h-[15px]" />, count: sidebarBatches.length },
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

        {/* Batches (expandable to show channels) */}
        <div className="flex-1 overflow-auto custom-scrollbar px-2">
          <div className="flex items-center px-2 py-1.5">
            <span className="t-overline flex-1">Batches</span>
          </div>
          {sidebarBatches.map((b) => (
            <SidebarBatch key={b.id} batch={b} />
          ))}
          {sidebarBatches.length === 0 && (
            <p className="text-faint text-[11.5px] px-2.5 py-3">
              No batches yet. Enroll in a course to get started.
            </p>
          )}
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
                      {activeRoomCount} pinned room{activeRoomCount === 1 ? "" : "s"}
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

                {/* Active rooms — learners get a batch-scoped switcher,
                    everyone else sees pinned batches + pinned channels. */}
                {isLearner ? (
                  <section className="mb-8">
                    <SectionLabel
                      kicker="Active"
                      title="Your rooms"
                      right={activeBatch ? `in ${activeBatch.name}` : undefined}
                    />

                    {sidebarBatches.length > 0 ? (
                      <>
                        {/* Batch switcher pills */}
                        <div className="flex gap-1.5 mb-4 overflow-x-auto custom-scrollbar pb-1">
                          {sidebarBatches.map((b) => {
                            const isActive = b.id === activeBatchId;
                            return (
                              <button
                                key={b.id}
                                onClick={() => handleSwitchBatch(b.id)}
                                className={`shrink-0 px-3 py-1.5 rounded-lg text-[12.5px] font-semibold transition-all border flex items-center gap-1.5 ${
                                  isActive
                                    ? "bg-accent-100 text-accent-300 border-accent-200"
                                    : "bg-surface-50 text-dim border-hairline hover:text-primary hover:bg-surface-100"
                                }`}
                                title={b.name}
                              >
                                <Hash className="w-3 h-3" />
                                <span className="max-w-[140px] truncate">{b.name}</span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Channels of the selected batch */}
                        {activeBatchChannels && activeBatchChannels.length > 0 ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {activeBatchChannels.map((c: any) => (
                              <ChannelTile
                                key={c.id}
                                channel={{
                                  ...c,
                                  batch: { id: activeBatchId!, name: activeBatch?.name || "" },
                                }}
                              />
                            ))}
                          </div>
                        ) : activeBatchChannels ? (
                          <div className="card p-8 text-center">
                            <Hash className="w-8 h-8 text-faint mx-auto mb-3" />
                            <p className="text-dim text-sm">No channels in this batch yet.</p>
                          </div>
                        ) : (
                          <div className="card p-6 text-center">
                            <p className="text-dim text-xs">Loading…</p>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="card p-8 text-center">
                        <Hash className="w-8 h-8 text-faint mx-auto mb-3" />
                        <p className="text-dim text-sm">You're not enrolled in any batch yet.</p>
                      </div>
                    )}
                  </section>
                ) : activeRoomCount > 0 ? (
                  <section className="mb-8">
                    <SectionLabel
                      kicker="Active"
                      title="Your rooms"
                      right={`${activeRoomCount} pinned`}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {pinnedBatches.map((b: any) => (
                        <RoomTile key={`b-${b.id}`} batch={b} />
                      ))}
                      {pinnedChannels.map((c: any) => (
                        <ChannelTile key={`c-${c.id}`} channel={c} />
                      ))}
                    </div>
                  </section>
                ) : (
                  <section className="mb-8">
                    <SectionLabel kicker="Active" title="Your rooms" />
                    <div className="card p-8 text-center">
                      <Hash className="w-8 h-8 text-faint mx-auto mb-3" />
                      <p className="text-dim text-sm">No pinned rooms yet.</p>
                      <p className="text-faint text-xs mt-1">
                        Admins can pin batches or channels to feature them here.
                      </p>
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
                  <StatCard n={String(activeRoomCount).padStart(2, "0")} label="pinned" sub="active rooms" highlight />
                  <StatCard n={String(sidebarBatches.length).padStart(2, "0")} label="batches" sub="accessible" />
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
        <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{batch._count?.channels || 0} channels</span>
      </div>
    </Link>
  );
}

function ChannelTile({ channel }: { channel: any }) {
  return (
    <Link
      to={`/batch/${channel.batch.id}/channel/${channel.id}`}
      className="card card-hover p-3.5 cursor-pointer block"
    >
      <div className="flex items-center gap-2 mb-2.5">
        <Hash className="w-3.5 h-3.5 text-accent-400" />
        <span className="text-sm font-semibold text-primary flex-1 truncate">{channel.name}</span>
        <span className="chip chip-accent text-[9px]">channel</span>
      </div>
      <p className="text-[12.5px] text-muted truncate mb-2.5">
        in {channel.batch?.name}
      </p>
      <div className="flex items-center gap-4 text-[11px] text-dim">
        <span className="flex items-center gap-1">
          <MessageSquare className="w-3 h-3" />
          {channel._count?.messages || 0} messages
        </span>
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



/**
 * Sidebar batch row that expands on click to reveal its channels.
 * Lazy-fetches channels on first expand.
 */
function SidebarBatch({ batch }: { batch: any }) {
  const [expanded, setExpanded] = useState(false);

  const { data: channels } = useQuery({
    queryKey: ["batch-channels", batch.id],
    queryFn: async () => (await api.get(`/batches/${batch.id}/channels`)).data,
    enabled: expanded,
  });

  return (
    <div className="mb-px">
      <div className="flex items-center w-full rounded-[7px] text-[13px] transition-all text-muted hover:bg-surface-100">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="px-1.5 py-1.5 text-dim hover:text-primary"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
        </button>
        <Link
          to={`/batch/${batch.id}`}
          className="flex items-center gap-2 flex-1 py-1.5 pr-2.5 hover:text-primary truncate"
        >
          <Folder className="w-[13px] h-[13px] text-dim shrink-0" />
          <span className="flex-1 truncate">{batch.name}</span>
          {(batch._count?.channels ?? 0) > 0 && (
            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-surface-200 text-muted text-[10px] font-bold flex items-center justify-center">
              {batch._count?.channels}
            </span>
          )}
        </Link>
      </div>
      {expanded && (
        <div className="ml-5 border-l border-hairline pl-1.5 mt-px">
          {!channels && (
            <p className="text-[11px] text-faint px-2 py-1">Loading…</p>
          )}
          {channels?.length === 0 && (
            <p className="text-[11px] text-faint px-2 py-1">No channels</p>
          )}
          {channels?.map((c: any) => (
            <Link
              key={c.id}
              to={`/batch/${batch.id}/channel/${c.id}`}
              className="flex items-center gap-2 px-2 py-1 rounded-[6px] text-[12.5px] text-muted hover:text-primary hover:bg-surface-100 transition-colors"
            >
              <Hash className="w-3 h-3 text-dim shrink-0" />
              <span className="truncate flex-1">{c.name}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
