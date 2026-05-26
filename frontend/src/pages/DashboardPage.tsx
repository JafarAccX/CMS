import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import api from "../api/client";
import { useAuthStore } from "../store/authStore";
import { useBatchStore } from "../store/batchStore";
import { useNotificationStore } from "../store/notificationStore";
import { useSocket } from "../hooks/useSocket";
import {
  Hash, MessageSquare, Users, Lock, Shield, BookOpen,
  ArrowRight, Sparkles,
  Video, Calendar, Settings,
} from "lucide-react";
import NotificationDropdown from "../components/NotificationDropdown";

// ── Stat card ─────────────────────────────────────────────────────
function StatCard({ icon, value, label, iconBg }: { icon: React.ReactNode; value: string; label: string; iconBg: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-hairline p-5 flex-1 min-w-0" style={{ backgroundColor: "rgb(10,13,18)" }}>
      <div className="pointer-events-none absolute -right-4 -top-10 w-24 h-24 rounded-full opacity-20 blur-2xl"
        style={{ background: "linear-gradient(rgb(62,56,224),rgb(0,219,232))" }} />
      <div className="flex items-center gap-4 mb-3 relative">
        <div className="w-8 h-8 rounded flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: iconBg }}>
          <span style={{ background: "linear-gradient(rgb(59,130,255) 17%,rgb(0,219,232) 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", display: "flex" }}>{icon}</span>
        </div>
        <span className="text-2xl font-bold text-white leading-none">{value}</span>
      </div>
      <p className="text-[11px] font-semibold tracking-widest text-muted uppercase relative">{label}</p>
    </div>
  );
}

// ── Room row ──────────────────────────────────────────────────────
function RoomRow({ batch }: { batch: any }) {
  const members = batch._count?.memberships || 0;
  const channels = batch._count?.channels || 0;
  return (
    <Link
      to={batch.hasAccess ? `/batch/${batch.id}` : "#"}
      className="block rounded-xl border border-hairline p-4 transition-all hover:-translate-y-px hover:border-hairline-strong group"
      style={{ backgroundColor: "rgb(10,12,17)" }}
    >
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg border border-hairline flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: "rgb(5,7,10)" }}>
          <span className="text-[16px] text-muted font-medium leading-none">#</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[14px] font-semibold text-primary group-hover:text-accent-300 transition-colors">{batch.name}</span>
            <span className="text-[10px] border border-hairline px-1.5 py-0.5 rounded text-dim" style={{ backgroundColor: "rgb(5,7,10)" }}>
              {batch.type}
            </span>
          </div>
          <p className="text-[13px] text-muted truncate">{batch.description || "No description"}</p>
          <div className="flex items-center gap-4 mt-1 text-[11px] text-dim">
            <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{channels} channels</span>
            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{members} members</span>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 ml-1" style={{ boxShadow: "0 0 5px rgba(53,221,61,0.5)" }} />
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-dim group-hover:text-accent-400 transition-colors flex-shrink-0" />
      </div>
    </Link>
  );
}

// ── Mentorship card ───────────────────────────────────────────────
function MentorshipCard() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-hairline p-5" style={{ backgroundColor: "rgb(10,13,18)" }}>
      <div className="pointer-events-none absolute right-0 top-0 w-20 h-20 rounded-full opacity-10 blur-xl"
        style={{ background: "linear-gradient(rgb(0,219,232),rgb(59,130,255))" }} />
      <div className="flex items-center justify-between mb-4">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center border"
          style={{ backgroundColor: "rgba(0,219,232,0.1)", borderColor: "rgba(0,219,232,0.2)" }}>
          <Video className="w-4 h-4 text-cyan-400" />
        </div>
        <span className="text-[11px] text-dim">Starts 2:00 PM</span>
      </div>
      <div className="mb-4">
        <h3 className="text-[18px] font-semibold text-white leading-tight">Live Session</h3>
        <p className="text-[13px] text-muted mt-1 leading-relaxed">Advanced Hooks Deep Dive.</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
          style={{ background: "linear-gradient(140deg,#7fe6f0,#2bb8d4 60%,#0e7490)" }}>M</div>
        <span className="text-[12px] text-dim flex-1">with mentor</span>
        <button className="px-3 py-1.5 rounded-md text-[12px] font-semibold border-none text-black"
          style={{ background: "linear-gradient(rgb(59,130,255) 17%,rgb(0,219,232) 100%)" }}>
          Join Now
        </button>
      </div>
    </div>
  );
}

// ── Upcoming item ─────────────────────────────────────────────────
function UpcomingItem({ title, time, type, color }: { title: string; time: string; type: string; color: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-hairline mb-2 transition-all hover:border-hairline-strong"
      style={{ backgroundColor: "rgb(10,13,18)" }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${color}22`, border: `1px solid ${color}44` }}>
        <Calendar className="w-3.5 h-3.5" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-primary truncate">{title}</p>
        <p className="text-[11px] text-dim">{time}</p>
      </div>
      <span className="text-[10px] px-2 py-0.5 rounded font-medium"
        style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}33` }}>{type}</span>
    </div>
  );
}

// ── Main DashboardPage ────────────────────────────────────────────
export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const setBatches = useBatchStore((s) => s.setBatches);
  const batches = useBatchStore((s) => s.batches);
  const setNotifications = useNotificationStore((s) => s.setNotifications);
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
  const enrolledBatches = batches.filter((b) => b.userMembership !== null);
  const lockedBatches = batches.filter((b) => !b.hasAccess && b.type !== "general");
  const pinnedBatches = pinnedData?.pinnedBatches || [];

  const stats = [
    { icon: <Hash className="w-5 h-5" />, value: String(batchData?.length || 0).padStart(2, "0"), label: "Channels", iconBg: "rgba(89,149,232,0.2)" },
    { icon: <Users className="w-5 h-5" />, value: String(enrolledBatches.length || 0).padStart(2, "0"), label: "Enrolled Batches", iconBg: "rgba(52,211,153,0.2)" },
    { icon: <BookOpen className="w-5 h-5" />, value: String(generalBatches.length || 0).padStart(2, "0"), label: "Open to All", iconBg: "rgba(20,184,166,0.2)" },
  ];

  const displayRooms = [...pinnedBatches, ...generalBatches, ...enrolledBatches]
    .filter((b, i, arr) => arr.findIndex(x => x.id === b.id) === i)
    .slice(0, 6);

  return (
    <>
      {/* ── Glassmorphic header ── */}
      <header className="h-16 flex-shrink-0 border-b border-hairline flex items-center px-8 gap-4 sticky top-0 z-20"
        style={{ backgroundColor: "rgba(10,12,17,0.6)", backdropFilter: "blur(24px)" }}>
        <h1 className="text-xl font-bold text-primary tracking-tight">Home</h1>
        <div className="flex-1 flex justify-center">
          <div className="relative w-[480px]">
            <div className="w-full h-10 rounded-md flex items-center px-10 border border-hairline" style={{ backgroundColor: "rgb(10,13,18)" }}>
              <span className="text-sm text-faint select-none">Ask AI or search workspace… (Cmd+K)</span>
            </div>
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            </span>
            <Sparkles className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-accent-400 pointer-events-none" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold text-black"
            style={{ background: "linear-gradient(rgb(59,130,255) 17%,rgb(0,219,232) 100%)", boxShadow: "0 0 10px rgba(59,130,255,0.3)" }}>
            <Sparkles className="w-3.5 h-3.5" /> Ask Mentor
          </button>
          <NotificationDropdown />
          <button className="w-8 h-8 flex items-center justify-center rounded-lg text-dim hover:text-primary transition-colors"><Settings className="w-4 h-4" /></button>
          <div className="w-px h-5 bg-hairline mx-1" />
          <div className="w-8 h-8 rounded-full bg-[rgb(45,103,107)] border border-hairline" />
        </div>
      </header>

      {/* ── Main content ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="flex gap-8 px-8 py-8 max-w-[1400px]">

          {/* Left column */}
          <div className="flex-1 min-w-0">
            {/* Stats */}
            <p className="t-overline text-dim mb-4">ADMIN INSIGHTS</p>
            <div className="flex gap-4 mb-8">
              {stats.map((s, i) => <StatCard key={i} {...s} />)}
            </div>

            {/* Active rooms */}
            <div className="flex items-center justify-between mb-4">
              <p className="t-overline text-dim">ACTIVE ROOMS</p>
              <Link to="/admin" className="text-[12px] text-accent-300 hover:underline flex items-center gap-1">
                View all <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="flex flex-col gap-3">
              {displayRooms.length > 0
                ? displayRooms.map((b) => <RoomRow key={b.id} batch={b} />)
                : <div className="card p-8 text-center"><Hash className="w-8 h-8 text-faint mx-auto mb-3" /><p className="text-dim text-sm">No active rooms yet.</p></div>
              }
              {lockedBatches.length > 0 && (
                <>
                  <p className="t-overline text-dim mt-4 mb-2">LOCKED</p>
                  {lockedBatches.slice(0, 2).map(b => (
                    <div key={b.id} className="card p-4 opacity-50 flex items-center gap-3">
                      <Lock className="w-4 h-4 text-faint shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-dim truncate">{b.name}</p>
                        <p className="text-[12px] text-faint">{b.description || "No description"}</p>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Right sidebar */}
          <div className="w-[280px] flex-shrink-0">
            <p className="t-overline text-dim mb-4">MENTORSHIP</p>
            <MentorshipCard />

            <p className="t-overline text-dim mt-7 mb-4">UPCOMING</p>
            <UpcomingItem title="React Hooks Deep Dive" time="Today, 2:00 PM" type="Live" color="rgb(0,219,232)" />
            <UpcomingItem title="System Design Review" time="Tomorrow, 11:00 AM" type="Session" color="rgb(139,92,246)" />
            <UpcomingItem title="UI/UX Critique" time="Thu, 3:30 PM" type="Workshop" color="rgb(52,211,153)" />

            <p className="t-overline text-dim mt-7 mb-3">QUICK LINKS</p>
            <div className="card p-2">
              {[
                user?.role === "admin" && { label: "Admin Console", href: "/admin", icon: <Shield className="w-3.5 h-3.5" /> },
                { label: "Direct Messages", href: "/dm", icon: <MessageSquare className="w-3.5 h-3.5" /> },
                user?.role === "mentor" && { label: "Mentor Hub", href: "/mentor", icon: <BookOpen className="w-3.5 h-3.5" /> },
              ].filter(Boolean).map((item: any) => (
                <Link key={item.label} to={item.href}
                  className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-surface-100 transition-colors">
                  <div className="w-7 h-7 rounded-lg bg-accent-100 text-accent-300 flex items-center justify-center flex-shrink-0">{item.icon}</div>
                  <span className="text-[13px] text-primary font-medium flex-1">{item.label}</span>
                  <ArrowRight className="w-3 h-3 text-dim" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
