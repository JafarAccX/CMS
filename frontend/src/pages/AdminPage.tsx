import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../api/client";
import {
  Users, Shield, FileText, AlertTriangle, Check, Plus, UserPlus,
  Trash2, Megaphone, Pin, PinOff, Hash, Search,
  Settings, Sparkles,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "../components/Modal";
import { FormTextarea } from "../components/FormField";
import NewUserModal from "../components/NewUserModal";
import CreateBatchModal, { type CreateBatchPayload } from "../components/CreateBatchModal";

type Tab = "users" | "batches" | "logs" | "modqueue";

// ── Stat card ────────────────────────────────────────────────────
function StatCard({
  icon, value, label, delta, iconBg, onClick,
}: {
  icon: React.ReactNode; value?: number | string; label: string;
  delta?: string; iconBg: string; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="relative overflow-hidden rounded-xl border border-hairline p-5 cursor-pointer transition-all hover:-translate-y-px"
      style={{ backgroundColor: "rgb(10,13,18)" }}
    >
      {/* decorative orb */}
      <div className="pointer-events-none absolute -right-4 -top-10 w-24 h-24 rounded-full opacity-20 blur-2xl"
        style={{ background: "linear-gradient(rgb(62,56,224),rgb(0,219,232))" }} />
      <div className="flex items-center gap-4 mb-4 relative">
        <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: iconBg }}>
          <span style={{ background: "linear-gradient(rgb(59,130,255) 17%,rgb(0,219,232) 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", display: "flex" }}>
            {icon}
          </span>
        </div>
        <span className="text-2xl font-bold text-white leading-none">{value ?? "—"}</span>
      </div>
      <p className="text-[11px] font-semibold tracking-widest text-muted uppercase relative">{label}</p>
      {delta && <p className="text-[11px] text-dim mt-1 relative">{delta}</p>}
    </div>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("users");
  const [showCreateBatch, setShowCreateBatch] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showManageMembers] = useState<string | null>(null);
  const [userFilter, setUserFilter] = useState<string>("all");
  const [userSearch, setUserSearch] = useState("");
  const [newUser, setNewUser] = useState({ username: "", email: "", phone: "", password: "", role: "learner" });
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastContent, setBroadcastContent] = useState("");
  const [broadcastTargets, setBroadcastTargets] = useState<Set<string>>(new Set());
  const [broadcastAll, setBroadcastAll] = useState(true);

  const qc = useQueryClient();
  const { data: usersData } = useQuery({ queryKey: ["admin-users"], queryFn: async () => (await api.get("/admin/users")).data });
  const { data: pinnedData } = useQuery({ queryKey: ["admin-pinned"], queryFn: async () => (await api.get("/admin/pinned")).data });
  const { data: allBatchesData } = useQuery({ queryKey: ["batches"], queryFn: async () => (await api.get("/batches")).data });
  const { data: statsData } = useQuery({ queryKey: ["admin-stats"], queryFn: async () => (await api.get("/admin/stats")).data });
  const { data: logsData } = useQuery({ queryKey: ["admin-logs"], queryFn: async () => (await api.get("/admin/logs")).data, enabled: tab === "logs" });
  const { data: modData } = useQuery({ queryKey: ["mod-queue"], queryFn: async () => (await api.get("/mod-queue")).data, enabled: tab === "modqueue" });
  useQuery({ queryKey: ["batch-members", showManageMembers], queryFn: async () => (await api.get(`/batches/${showManageMembers}/members`)).data, enabled: !!showManageMembers });

  const banMutation = useMutation({ mutationFn: (id: string) => api.patch(`/admin/users/${id}/ban`), onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }) });
  const roleMutation = useMutation({ mutationFn: ({ id, role }: { id: string; role: string }) => api.patch(`/admin/users/${id}/role`, { role }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast.success("Role updated"); } });
  const createBatchMutation = useMutation({
    mutationFn: async (payload: CreateBatchPayload) => {
      const { data } = await api.post("/batches", {
        name: payload.name.trim(),
        description: payload.description.trim(),
        type: payload.is_paid ? "paid" : payload.type,
        is_paid: payload.is_paid,
      });

      const extraChannels = payload.channels.filter((channel) => channel && channel !== "general");
      await Promise.allSettled(extraChannels.map((channel) => api.post(`/batches/${data.id}/channels`, { name: channel })));
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["batches"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      setShowCreateBatch(false);
      toast.success("Batch created");
    },
    onError: (error: any) => toast.error(error?.response?.data?.error || "Failed to create batch"),
  });
  const createUserMutation = useMutation({ mutationFn: (data: typeof newUser) => api.post("/admin/users", data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); qc.invalidateQueries({ queryKey: ["admin-stats"] }); setShowCreateUser(false); setNewUser({ username: "", email: "", phone: "", password: "", role: "learner" }); toast.success("User created successfully"); } });
  const resolveMutation = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/mod-queue/${id}`, { status }), onSuccess: () => qc.invalidateQueries({ queryKey: ["mod-queue"] }) });
  const togglePinBatch = useMutation({ mutationFn: (batchId: string) => api.post(`/batches/${batchId}/pin`), onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-pinned"] }); qc.invalidateQueries({ queryKey: ["batches"] }); } });

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "users", label: "Users" },
    { key: "batches", label: "Batches" },
    { key: "logs", label: "Logs" },
    { key: "modqueue", label: "Queue", badge: modData?.length },
  ];

  const filteredUsers = usersData?.users?.filter((u: any) => {
    const matchFilter = userFilter === "all" || u.role === userFilter;
    const matchSearch = !userSearch || u.username.toLowerCase().includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase());
    return matchFilter && matchSearch;
  });

  return (
    <>
      {/* ── Glassmorphic Header ── */}
      <header className="app-topbar h-16 flex-shrink-0 border-b border-hairline flex items-center px-8 gap-4 sticky top-0 z-20"
        style={{ backgroundColor: "rgba(10,12,17,0.6)", backdropFilter: "blur(24px)" }}>
        <h1 className="text-xl font-bold text-primary tracking-tight">Dashboard</h1>
        <div className="flex-1 flex justify-center">
          <div className="app-topbar-search relative w-[480px]">
            <div className="w-full h-10 rounded-md flex items-center px-10 border border-hairline" style={{ backgroundColor: "rgb(10,13,18)" }}>
              <span className="text-sm text-faint select-none">Ask AI or search workspace… (Cmd+K)</span>
            </div>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none" />
            <Sparkles className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-accent-400 pointer-events-none" />
          </div>
        </div>
        <div className="app-topbar-actions flex items-center gap-2">
          <button onClick={() => setShowBroadcast(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold text-black"
            style={{ background: "linear-gradient(rgb(59,130,255) 17%,rgb(0,219,232) 100%)", boxShadow: "0 0 10px rgba(59,130,255,0.3)" }}>
            <Megaphone className="w-3.5 h-3.5" /> Ask Mentor
          </button>
          <button className="w-8 h-8 flex items-center justify-center rounded-lg text-dim hover:text-primary transition-colors"><Settings className="w-4 h-4" /></button>
          <div className="w-px h-5 bg-hairline mx-1" />
          <Link to="/profile" aria-label="Open profile" className="w-8 h-8 rounded-full bg-[rgb(45,103,107)] border border-hairline cursor-pointer" />
        </div>
      </header>

      {/* ── Scrollable Content ── */}
      <div className="page-scroll-content flex-1 overflow-y-auto custom-scrollbar px-8 py-8">
        {/* Admin Insights */}
        <p className="t-overline text-dim mb-4">ADMIN INSIGHTS</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Users", value: statsData?.totalUsers, delta: "12% vs last 30 days", iconBg: "rgba(89,149,232,0.2)", icon: <Users className="w-5 h-5" />, filter: "all" },
            { label: "Total Mentors", value: statsData?.totalMentors, delta: "8% vs last 30 days", iconBg: "rgba(52,211,153,0.2)", icon: <Shield className="w-5 h-5" />, filter: "mentor" },
            { label: "Total Learners", value: statsData?.totalLearners, delta: "18% vs last 30 days", iconBg: "rgba(20,184,166,0.2)", icon: <Users className="w-5 h-5" />, filter: "learner" },
            { label: "Active Batches", value: statsData?.totalBatches, delta: "5% vs last 30 days", iconBg: "rgba(139,92,246,0.2)", icon: <Shield className="w-5 h-5" />, filter: "all" },
          ].map((s, i) => (
            <StatCard key={i} icon={s.icon} value={s.value} label={s.label} delta={s.delta} iconBg={s.iconBg}
              onClick={() => { setTab("users"); if (s.filter !== "all") setUserFilter(s.filter); }} />
          ))}
        </div>

        {/* Controls row */}
        <div className="responsive-controls rounded-xl border border-[rgb(30,41,59)] p-3 flex items-center justify-between mb-0"
          style={{ backgroundColor: "rgb(16,21,29)" }}>
          {/* Tabs */}
          <div className="flex items-center gap-1 p-1.5 rounded-lg border border-[rgb(30,41,59)]" style={{ backgroundColor: "rgb(5,7,10)" }}>
            {tabs.map(({ key, label, badge }) => (
              <button key={key} onClick={() => setTab(key)}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[13px] font-bold transition-all"
                style={{
                  background: tab === key ? "rgb(255,255,255)" : "transparent",
                  color: tab === key ? "rgb(5,7,10)" : "rgb(194,198,214)",
                }}>
                {label}
                {badge != null && badge > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: tab === key ? "rgba(0,0,0,0.12)" : "rgba(175,198,255,0.2)", color: tab === key ? "rgb(5,7,10)" : "rgb(175,198,255)" }}>{badge}</span>
                )}
              </button>
            ))}
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-0.5 rounded-md border border-[rgb(30,41,59)]" style={{ backgroundColor: "rgb(5,7,10)" }}>
              {["all", "admin", "mentor", "learner"].map((f) => (
                <button key={f} onClick={() => setUserFilter(f)}
                  className="px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all"
                  style={{ background: userFilter === f ? "rgba(59,130,255,0.15)" : "transparent", color: userFilter === f ? "#afc6ff" : "rgb(194,198,214)" }}>
                  {f}
                </button>
              ))}
            </div>
            <div className="relative">
              <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Search users, emails…"
                className="h-8 pl-8 pr-3 rounded-md text-[12px] text-primary placeholder-faint focus:outline-none focus:ring-1 focus:ring-accent-400/30 w-44 border border-[rgb(30,41,59)]"
                style={{ backgroundColor: "rgb(10,13,18)" }} />
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-faint pointer-events-none" />
            </div>
            {tab === "users" && (
              <button onClick={() => setShowCreateUser(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-bold text-black border-none"
                style={{ background: "linear-gradient(rgb(59,130,255) 17%,rgb(0,219,232) 100%)", boxShadow: "0 0 10px rgba(59,130,255,0.3)" }}>
                <UserPlus className="w-4 h-4" /> New User
              </button>
            )}
          </div>
        </div>

        {/* ── Users Tab ── */}
        {tab === "users" && (
          <div className="responsive-table-wrap rounded-b-xl border border-[rgb(30,41,59)] border-t-0 overflow-hidden" style={{ backgroundColor: "rgb(10,13,18)" }}>
            <table className="w-full border-collapse text-sm min-w-[760px]">
              <thead>
                <tr className="border-b border-[rgb(30,41,59)]">
                  {["User Profile", "Global Role", "Assigned Batches", "Account Status", "Actions"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold tracking-widest text-dim uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredUsers?.map((u: any) => (
                  <tr key={u.id} className="group border-t border-[rgb(22,30,42)] hover:bg-white/[0.025] transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="relative flex-shrink-0">
                          <span className={`avatar ${u.role === "admin" ? "avatar-coral" : u.role === "mentor" ? "avatar-cyan" : "avatar-indigo"} w-9 h-9 text-[13px]`}>
                            {u.username[0].toUpperCase()}
                          </span>
                          <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[rgb(10,13,18)]" />
                        </div>
                        <div>
                          <p className="font-semibold text-primary text-[14px]">{u.username}</p>
                          <p className="text-dim text-xs mt-0.5">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="relative inline-flex items-center">
                        <select value={u.role} onChange={(e) => roleMutation.mutate({ id: u.id, role: e.target.value })}
                          className="appearance-none pr-6 pl-2.5 py-1.5 rounded-md text-xs text-primary focus:outline-none focus:ring-1 focus:ring-accent-400/30 border border-[rgb(30,41,59)] cursor-pointer"
                          style={{ backgroundColor: "rgb(13,17,24)" }}>
                          <option value="learner">Learner</option>
                          <option value="mentor">Mentor</option>
                          <option value="admin">Admin</option>
                        </select>
                        <span className="pointer-events-none absolute right-2 text-dim text-[10px]">▾</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 max-w-[220px]">
                      <div className="flex flex-wrap gap-1">
                        {u.memberships?.length > 0
                          ? u.memberships.slice(0, 3).map((m: any, i: number) => (
                            <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border"
                              style={{ background: "rgba(59,130,255,0.14)", color: "#94b4ff", borderColor: "rgba(59,130,255,0.18)" }}>
                              {m.batch.name}
                            </span>
                          ))
                          : <span className="text-xs text-faint italic">No batches</span>}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-start gap-1.5">
                        <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${u.is_banned ? "bg-red-500" : "bg-emerald-500"}`}
                          style={{ boxShadow: u.is_banned ? "0 0 6px rgba(239,68,68,0.5)" : "0 0 6px rgba(53,221,61,0.5)" }} />
                        <div>
                          <p className={`text-[13px] font-medium ${u.is_banned ? "text-red-400" : "text-emerald-400"}`}>{u.is_banned ? "Suspended" : "Active"}</p>
                          <p className="text-[11px] text-dim">Joined recently</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <button onClick={() => banMutation.mutate(u.id)} className="p-1.5 text-dim hover:text-red-400 transition-colors" aria-label={u.is_banned ? "Restore" : "Suspend"}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button className="p-1.5 text-dim hover:text-accent-400 transition-colors"><FileText className="w-3.5 h-3.5" /></button>
                        <button className="text-dim hover:text-primary text-xs font-medium transition-colors">Report</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="px-5 py-3.5 border-t border-[rgb(30,41,59)] flex items-center justify-between">
              <span className="text-xs text-dim">Showing {filteredUsers?.length ?? 0} of {usersData?.users?.length ?? 0} users</span>
              <div className="flex items-center gap-1">
                {["‹", "1", "2", "3", "…", "›"].map((p, i) => (
                  <button key={i} className="w-8 h-8 rounded-md flex items-center justify-center text-[13px] font-medium border transition-colors"
                    style={{ border: "1px solid rgb(30,41,59)", background: p === "1" ? "linear-gradient(rgb(59,130,255) 17%,rgb(0,219,232) 100%)" : "rgb(10,13,18)", color: p === "1" ? "#fff" : "#94a3b8" }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Batches Tab ── */}
        {tab === "batches" && (
          <div className="rounded-b-xl border border-[rgb(30,41,59)] border-t-0 p-6" style={{ backgroundColor: "rgb(10,13,18)" }}>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-lg font-bold text-primary flex items-center gap-2"><Pin className="w-5 h-5 text-accent-300" />Pinned Batches & Channels</h2>
                <p className="text-dim text-sm mt-1">Quick access to your pinned items.</p>
              </div>
              <button onClick={() => setShowCreateBatch(true)} className="btn-primary flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all">
                <Plus className="w-5 h-5" />New Batch
              </button>
            </div>
            {pinnedData?.pinnedBatches?.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pinnedData.pinnedBatches.map((b: any) => (
                  <div key={b.id} className="card card-hover p-5 group">
                    <div className="flex justify-between items-start mb-3">
                      <Link to={`/batch/${b.id}`} className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-accent-100 flex items-center justify-center text-accent-300"><Shield className="w-5 h-5" /></div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-primary font-bold text-base truncate group-hover:text-accent-300 transition-colors">{b.name}</h3>
                          <span className="text-[11px] text-dim">{b._count?.channels || 0} channels · {b._count?.memberships || 0} members</span>
                        </div>
                      </Link>
                      <button onClick={() => togglePinBatch.mutate(b.id)} className="p-1.5 text-accent-400 hover:text-red-400 transition-colors"><PinOff className="w-4 h-4" /></button>
                    </div>
                    <div className="space-y-1 border-t border-hairline pt-2 mt-2">
                      {b.channels?.slice(0, 5).map((ch: any) => (
                        <Link key={ch.id} to={`/batch/${b.id}/channel/${ch.id}`} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-surface-100 text-sm text-muted hover:text-primary transition-colors">
                          <Hash className="w-3 h-3 text-dim" /><span className="flex-1 truncate">{ch.name}</span>
                          {ch.is_pinned && <Pin className="w-2.5 h-2.5 text-accent-400" />}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="card p-8 text-center">
                <Pin className="w-10 h-10 text-faint mx-auto mb-3" />
                <h3 className="text-lg font-bold text-muted">No pinned items</h3>
                <p className="text-dim text-sm mb-4">Pin batches or channels for quick access.</p>
              </div>
            )}

            <h3 className="t-overline text-dim mb-3 mt-8">All Batches</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {allBatchesData?.map((b: any) => (
                <div key={b.id} className="card p-3 flex items-center gap-3">
                  <Shield className="w-4 h-4 text-dim shrink-0" />
                  <Link to={`/batch/${b.id}`} className="flex-1 min-w-0 text-sm text-primary hover:text-accent-300 transition-colors truncate">{b.name}</Link>
                  <button onClick={() => togglePinBatch.mutate(b.id)} className={`p-1.5 transition-colors ${b.is_pinned ? "text-accent-400 hover:text-red-400" : "text-faint hover:text-accent-400"}`}>
                    {b.is_pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Logs Tab ── */}
        {tab === "logs" && (
          <div className="responsive-table-wrap rounded-b-xl border border-[rgb(30,41,59)] border-t-0 overflow-hidden" style={{ backgroundColor: "rgb(10,13,18)" }}>
            <div className="px-6 py-4 border-b border-[rgb(30,41,59)]"><h3 className="t-overline text-dim">Administrative Audit Logs</h3></div>
            <table className="w-full text-sm min-w-[700px]">
              <thead><tr className="border-b border-[rgb(30,41,59)]">
                {["Administrator", "Action", "Target", "Timestamp"].map(h => <th key={h} className="px-6 py-3 text-left text-[11px] font-semibold tracking-widest text-dim uppercase">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-[rgb(22,30,42)]">
                {logsData?.logs?.map((l: any) => (
                  <tr key={l.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 flex items-center gap-2"><span className="avatar avatar-muted w-6 h-6 text-[10px]">{l.actor?.username[0]}</span><span className="text-primary font-medium">{l.actor?.username}</span></td>
                    <td className="px-6 py-4"><span className="chip chip-accent text-[10px]">{l.action_type.replace(/_/g, " ")}</span></td>
                    <td className="px-6 py-4"><span className="text-muted text-xs font-mono bg-surface-100 px-2 py-0.5 rounded border border-hairline">{l.target_id || "System"}</span></td>
                    <td className="px-6 py-4 text-dim text-xs font-medium">{new Date(l.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Mod Queue Tab ── */}
        {tab === "modqueue" && (
          <div className="rounded-b-xl border border-[rgb(30,41,59)] border-t-0 p-6 space-y-4" style={{ backgroundColor: "rgb(10,13,18)" }}>
            <div className="flex items-center gap-3 mb-2"><AlertTriangle className="w-5 h-5 text-amber-400" /><h2 className="text-lg font-bold text-primary">Moderation Queue</h2></div>
            {modData?.map((q: any) => (
              <div key={q.id} className="card card-hover p-6 flex items-start justify-between group">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${q.priority === "high" ? "bg-red-500 text-white" : q.priority === "medium" ? "bg-amber-500 text-black" : "bg-surface-200 text-dim"}`}>{q.priority} Priority</span>
                    <span className="text-dim text-xs">in <span className="text-accent-300">#{q.channel?.name}</span></span>
                  </div>
                  <div className="bg-surface-100 rounded-xl p-4 border border-hairline italic text-muted text-sm">"{q.message?.content}"</div>
                  <div className="flex items-center gap-4 text-xs text-dim">
                    <span>Sender: <span className="text-primary font-bold">{q.message?.sender?.username}</span></span>
                    <span>Reporter: <span className="text-primary font-bold">{q.reporter?.username}</span></span>
                  </div>
                </div>
                {q.status === "pending" && (
                  <div className="flex flex-col gap-2 shrink-0 ml-6">
                    <button onClick={() => resolveMutation.mutate({ id: q.id, status: "resolved" })} className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl hover:bg-emerald-500/20 border border-emerald-500/20 transition-all"><Check className="w-5 h-5" /></button>
                    <button onClick={() => resolveMutation.mutate({ id: q.id, status: "escalated" })} className="p-3 bg-red-500/10 text-red-400 rounded-xl hover:bg-red-500/20 border border-red-500/20 transition-all"><AlertTriangle className="w-5 h-5" /></button>
                  </div>
                )}
              </div>
            ))}
            {(!modData || modData.length === 0) && (
              <div className="flex flex-col items-center justify-center py-20 bg-surface-100/30 rounded-3xl border border-dashed border-hairline-strong">
                <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4"><Check className="w-8 h-8 text-emerald-500" /></div>
                <h3 className="text-lg font-bold text-muted">Queue is Empty</h3>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showCreateBatch && (
        <CreateBatchModal
          onClose={() => setShowCreateBatch(false)}
          onSubmit={(payload) => createBatchMutation.mutate(payload)}
          pending={createBatchMutation.isPending}
        />
      )}

      {showCreateUser && (
        <NewUserModal
          form={newUser}
          pending={createUserMutation.isPending}
          onChange={setNewUser}
          onClose={() => setShowCreateUser(false)}
          onSubmit={() => createUserMutation.mutate(newUser)}
        />
      )}

      <Modal open={showBroadcast} onClose={() => setShowBroadcast(false)}>
        <ModalHeader title="Broadcast Announcement" onClose={() => setShowBroadcast(false)} icon={<Megaphone className="w-5 h-5 text-accent-300" />} />
        <ModalBody>
          <FormTextarea label="Message" value={broadcastContent} onChange={(e) => setBroadcastContent(e.target.value)} rows={4} placeholder="Type your announcement here..." />
          <div className="mt-4">
            <p className="t-overline text-dim mb-2">Send to</p>
            <div className="flex gap-2 mb-3">
              {[{ k: true, l: "All channels" }, { k: false, l: "Specific channels" }].map(({ k, l }) => (
                <button key={String(k)} onClick={() => { setBroadcastAll(k); if (k) setBroadcastTargets(new Set()); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${broadcastAll === k ? "bg-accent-100 text-accent-300 border-accent-200" : "bg-surface-100 text-dim border-hairline hover:text-primary"}`}>{l}</button>
              ))}
            </div>
          </div>
        </ModalBody>
        <ModalFooter className="justify-end">
          <button onClick={() => setShowBroadcast(false)} className="px-4 py-2 text-sm text-dim hover:text-primary transition-colors">Cancel</button>
          <button disabled={!broadcastContent.trim()} onClick={async () => {
            try {
              const body: any = { content: broadcastContent.trim() };
              if (!broadcastAll) body.channelIds = Array.from(broadcastTargets);
              const res = await api.post("/admin/broadcast", body);
              toast.success(`Broadcast sent to ${res.data.channelCount} channels!`);
              setBroadcastContent(""); setShowBroadcast(false);
            } catch { toast.error("Failed to send broadcast"); }
          }} className="btn-primary px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50">Send broadcast</button>
        </ModalFooter>
      </Modal>
    </>
  );
}
