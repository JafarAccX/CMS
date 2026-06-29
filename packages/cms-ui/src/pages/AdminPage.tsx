import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cmsApiClient as api } from "../api/cmsClient";
import {
  Users, User, Shield, FileText, AlertTriangle, Check, Plus, UserPlus,
  Trash2, Megaphone, Pin, PinOff, Hash, Search,
  Settings, RefreshCw,
} from "lucide-react";
import ThemeToggle from "../components/ThemeToggle";
import { toast } from "react-hot-toast";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "../components/Modal";
import { FormTextarea } from "../components/FormField";
import NewUserModal from "../components/NewUserModal";
import CreateBatchModal, { type CreateBatchPayload } from "../components/CreateBatchModal";
import WorkspaceSearch from "../components/WorkspaceSearch";

type Tab = "users" | "batches" | "logs" | "modqueue";

type CrmSyncResult = {
  batches: { created: number; updated: number; skipped: number };
  students: { created: number; updated: number; memberships: number };
  mentors: { created: number; updated: number; memberships: number };
  errors: string[];
};

type BroadcastChannel = {
  id: string;
  name: string;
  batch_id: string;
  batch?: { id: string; name: string };
  _count?: { messages?: number };
};

type PageItem = number | "ellipsis";

const ADMIN_USERS_PAGE_SIZE_KEY = "cms.admin.usersPageSize";
const ADMIN_USERS_PREFETCH_KEY = "cms.admin.prefetchAdjacentPages";
const USER_PAGE_SIZE_OPTIONS = [20, 50, 100];

function getStoredUsersPageSize() {
  const fallback = USER_PAGE_SIZE_OPTIONS[0];
  try {
    const value = Number(window.localStorage.getItem(ADMIN_USERS_PAGE_SIZE_KEY));
    return USER_PAGE_SIZE_OPTIONS.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function getStoredPrefetchPreference() {
  try {
    const value = window.localStorage.getItem(ADMIN_USERS_PREFETCH_KEY);
    return value == null ? true : value === "true";
  } catch {
    return true;
  }
}

function getPaginationItems(current: number, total: number): PageItem[] {
  const safeTotal = Math.max(total, 1);
  if (safeTotal <= 7) return Array.from({ length: safeTotal }, (_, index) => index + 1);

  const items: PageItem[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(safeTotal - 1, current + 1);

  if (start > 2) items.push("ellipsis");
  for (let page = start; page <= end; page += 1) items.push(page);
  if (end < safeTotal - 1) items.push("ellipsis");
  items.push(safeTotal);
  return items;
}

function PaginationControls({
  page,
  totalPages,
  onPageChange,
  disabled = false,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}) {
  const safeTotal = Math.max(totalPages, 1);
  const safePage = Math.min(Math.max(page, 1), safeTotal);
  const buttonBase =
    "w-8 h-8 rounded-md flex items-center justify-center text-[13px] font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={disabled || safePage <= 1}
        onClick={() => onPageChange(safePage - 1)}
        className={buttonBase}
        style={{ border: "1px solid var(--ax-border)", background: "var(--ax-field-bg)", color: "var(--ax-muted)" }}
        aria-label="Previous page"
      >
        &lt;
      </button>
      {getPaginationItems(safePage, safeTotal).map((item, index) =>
        item === "ellipsis" ? (
          <span key={`ellipsis-${index}`} className="w-8 h-8 flex items-center justify-center text-dim text-sm">
            ...
          </span>
        ) : (
          <button
            type="button"
            key={item}
            disabled={disabled}
            onClick={() => onPageChange(item)}
            className={buttonBase}
            style={{
              border: "1px solid var(--ax-border)",
              background: item === safePage ? "var(--ax-primary-action-bg)" : "var(--ax-panel)",
              color: item === safePage ? "var(--ax-primary-action-text)" : "var(--ax-muted)",
            }}
            aria-label={`Page ${item}`}
            aria-current={item === safePage ? "page" : undefined}
          >
            {item}
          </button>
        )
      )}
      <button
        type="button"
        disabled={disabled || safePage >= safeTotal}
        onClick={() => onPageChange(safePage + 1)}
        className={buttonBase}
        style={{ border: "1px solid var(--ax-border)", background: "var(--ax-field-bg)", color: "var(--ax-muted)" }}
        aria-label="Next page"
      >
        &gt;
      </button>
    </div>
  );
}

async function fetchAdminUsers({
  page,
  limit,
  filter,
  search,
}: {
  page: number;
  limit: number;
  filter: string;
  search: string;
}) {
  return (await api.get("/admin/users", {
    params: {
      page,
      limit,
      role: filter !== "all" ? filter : undefined,
      search: search || undefined,
    },
  })).data;
}

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
      style={{ background: "var(--ax-card-bg)", boxShadow: "var(--ax-shadow-card)" }}
    >
      {/* decorative orb */}
      <div className="theme-orb pointer-events-none absolute -right-4 -top-10 w-24 h-24 rounded-full opacity-20 blur-2xl"
        style={{ background: "linear-gradient(rgb(62,56,224),rgb(0,219,232))" }} />
      <div className="flex items-center gap-4 mb-4 relative">
        <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: iconBg }}>
          <span style={{ color: "var(--accent-300)", display: "flex" }}>
            {icon}
          </span>
        </div>
        <span className="text-2xl font-bold leading-none" style={{ color: "var(--ax-text)" }}>{value ?? "--"}</span>
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
  const [showSettings, setShowSettings] = useState(false);
  const [showManageMembers] = useState<string | null>(null);
  const [userFilter, setUserFilter] = useState<string>("all");
  const [userSearch, setUserSearch] = useState("");
  const [debouncedUserSearch, setDebouncedUserSearch] = useState("");
  const [usersPage, setUsersPage] = useState(1);
  const [usersLimit, setUsersLimit] = useState(getStoredUsersPageSize);
  const [prefetchAdjacentPages, setPrefetchAdjacentPages] = useState(getStoredPrefetchPreference);
  const [logsPage, setLogsPage] = useState(1);
  const [logsLimit] = useState(20);
  const [newUser, setNewUser] = useState({ username: "", email: "", phone: "", password: "", role: "learner" });
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastContent, setBroadcastContent] = useState("");
  const [broadcastTargets, setBroadcastTargets] = useState<Set<string>>(new Set());
  const [broadcastAll, setBroadcastAll] = useState(true);
  const [broadcastBatchId, setBroadcastBatchId] = useState<string | null>(null);

  const qc = useQueryClient();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setUsersPage(1);
      setDebouncedUserSearch(userSearch.trim());
    }, 250);

    return () => window.clearTimeout(timer);
  }, [userSearch]);

  const { data: usersData, isFetching: usersFetching, isPlaceholderData: usersPlaceholderData } = useQuery({
    queryKey: ["admin-users", usersPage, usersLimit, userFilter, debouncedUserSearch],
    queryFn: () => fetchAdminUsers({
      page: usersPage,
      limit: usersLimit,
      filter: userFilter,
      search: debouncedUserSearch,
    }),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!prefetchAdjacentPages || !usersData || usersData.page !== usersPage) return;

    const adjacentPages = [usersPage - 1, usersPage + 1].filter(
      (page) => page >= 1 && page <= usersData.totalPages
    );

    adjacentPages.forEach((page) => {
      qc.prefetchQuery({
        queryKey: ["admin-users", page, usersLimit, userFilter, debouncedUserSearch],
        queryFn: () => fetchAdminUsers({
          page,
          limit: usersLimit,
          filter: userFilter,
          search: debouncedUserSearch,
        }),
      });
    });
  }, [qc, usersData, usersPage, usersLimit, userFilter, debouncedUserSearch, prefetchAdjacentPages]);
  const { data: pinnedData } = useQuery({ queryKey: ["admin-pinned"], queryFn: async () => (await api.get("/admin/pinned")).data });
  const { data: allBatchesData } = useQuery({ queryKey: ["batches"], queryFn: async () => (await api.get("/batches")).data });
  const { data: statsData } = useQuery({ queryKey: ["admin-stats"], queryFn: async () => (await api.get("/admin/stats")).data });
  const { data: broadcastChannels = [] } = useQuery<BroadcastChannel[]>({
    queryKey: ["admin-broadcast-channels"],
    queryFn: async () => (await api.get("/admin/broadcast-channels")).data,
    enabled: showBroadcast && !broadcastAll,
  });
  const { data: logsData } = useQuery({
    queryKey: ["admin-logs", logsPage, logsLimit],
    queryFn: async () => (await api.get("/admin/logs", { params: { page: logsPage, limit: logsLimit } })).data,
    enabled: tab === "logs",
  });
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
  const syncCrmMutation = useMutation({
    mutationFn: async () => (await api.post<CrmSyncResult>("/admin/sync-crm")).data,
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      qc.invalidateQueries({ queryKey: ["batches"] });
      qc.invalidateQueries({ queryKey: ["admin-pinned"] });

      const warningText = result.errors.length ? ` with ${result.errors.length} warning${result.errors.length === 1 ? "" : "s"}` : "";
      toast.success(
        `CRM sync complete${warningText}: ${result.batches.created} batches, ${result.students.created} learners, ${result.mentors.created} mentors created.`
      );
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || "CRM sync failed");
    },
  });

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "users", label: "Users" },
    { key: "batches", label: "Batches" },
    { key: "logs", label: "Logs" },
    { key: "modqueue", label: "Queue", badge: modData?.length },
  ];

  const comingSoon = (label: string) => toast(`${label} coming soon`);
  const users = usersData?.users ?? [];
  const usersTotal = usersData?.total ?? 0;
  const usersCurrentPage = usersData?.page ?? usersPage;
  const usersTotalPages = usersData?.totalPages ?? 1;
  const usersStart = usersTotal === 0 ? 0 : (usersCurrentPage - 1) * usersLimit + 1;
  const usersEnd = Math.min(usersCurrentPage * usersLimit, usersTotal);
  const logs = logsData?.logs ?? [];
  const logsTotal = logsData?.total ?? 0;
  const logsCurrentPage = logsData?.page ?? logsPage;
  const logsTotalPages = logsData?.totalPages ?? 1;
  const logsStart = logsTotal === 0 ? 0 : (logsCurrentPage - 1) * logsLimit + 1;
  const logsEnd = Math.min(logsCurrentPage * logsLimit, logsTotal);
  const broadcastBatches = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; channels: BroadcastChannel[] }>();
    for (const channel of broadcastChannels) {
      const batchId = channel.batch?.id || channel.batch_id;
      const batchName = channel.batch?.name || "Unknown batch";
      if (!groups.has(batchId)) groups.set(batchId, { id: batchId, name: batchName, channels: [] });
      groups.get(batchId)!.channels.push(channel);
    }
    return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [broadcastChannels]);
  const selectedBroadcastBatch = broadcastBatches.find((batch) => batch.id === broadcastBatchId) ?? null;
  const canSendBroadcast = Boolean(
    broadcastContent.trim() && (broadcastAll || broadcastTargets.size > 0)
  );

  const setUserFilterAndReset = (filter: string) => {
    setUsersPage(1);
    setUserFilter(filter);
  };

  const updateUsersLimit = (limit: number) => {
    setUsersPage(1);
    setUsersLimit(limit);
    try {
      window.localStorage.setItem(ADMIN_USERS_PAGE_SIZE_KEY, String(limit));
    } catch {
      // Ignore private browsing/storage failures; the in-memory setting still works.
    }
  };

  const updatePrefetchPreference = (enabled: boolean) => {
    setPrefetchAdjacentPages(enabled);
    try {
      window.localStorage.setItem(ADMIN_USERS_PREFETCH_KEY, String(enabled));
    } catch {
      // Ignore private browsing/storage failures; the in-memory setting still works.
    }
  };

  const refreshAdminData = () => {
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
    toast.success("Admin data refresh queued");
  };

  const toggleBroadcastTarget = (channelId: string) => {
    setBroadcastTargets((prev) => {
      const next = new Set(prev);
      if (next.has(channelId)) next.delete(channelId);
      else next.add(channelId);
      return next;
    });
  };

  return (
    <>
      {/* ── Glassmorphic Header ── */}
      <header className="app-topbar h-16 flex-shrink-0 border-b border-hairline flex items-center px-8 gap-4 sticky top-0 z-20"
        style={{ background: "var(--ax-topbar-bg)", backdropFilter: "blur(24px)" }}>
        <h1 className="text-xl font-bold text-primary tracking-tight">Dashboard</h1>
        <div className="flex-1 flex justify-center">
          <div className="w-[480px]"><WorkspaceSearch /></div>
        </div>
        <div className="app-topbar-actions flex items-center gap-2">
          <button onClick={() => setShowBroadcast(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold"
            style={{ background: "var(--ax-primary-action-bg)", color: "var(--ax-primary-action-text)", boxShadow: "var(--ax-primary-action-shadow)" }}>
            <Megaphone className="w-3.5 h-3.5" /> Announcement
          </button>
          <ThemeToggle />
          <button type="button" onClick={() => setShowSettings(true)} className="w-8 h-8 flex items-center justify-center rounded-lg text-dim hover:text-primary transition-colors" aria-label="Open settings" title="Settings"><Settings className="w-4 h-4" /></button>
          <div className="w-px h-5 bg-hairline mx-1" />
          <Link
            to="/profile"
            aria-label="Open profile"
            className="w-8 h-8 rounded-full border border-hairline cursor-pointer flex items-center justify-center"
            style={{
              background: "var(--ax-profile-avatar-bg)",
              color: "var(--ax-profile-avatar-icon)",
              boxShadow: "var(--ax-profile-avatar-shadow)",
            }}
          >
            <User className="w-4 h-4" />
          </Link>
        </div>
      </header>

      {/* ── Scrollable Content ── */}
      <div className="page-scroll-content figma-scroll custom-scrollbar px-8 py-8">
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
              onClick={() => { setTab("users"); setUserFilterAndReset(s.filter); }} />
          ))}
        </div>

        {/* Controls row */}
        <div className="responsive-controls figma-panel p-3 flex items-center justify-between mb-0">
          {/* Tabs */}
          <div className="flex items-center gap-1 p-1.5 rounded-lg border" style={{ background: "var(--ax-control-bg)", borderColor: "var(--ax-border)" }}>
            {tabs.map(({ key, label, badge }) => (
              <button key={key} onClick={() => setTab(key)}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[13px] font-bold transition-all"
                style={{
                  background: tab === key ? "var(--ax-segment-active-bg)" : "transparent",
                  color: tab === key ? "var(--ax-segment-active-text)" : "var(--ax-muted)",
                  boxShadow: tab === key ? "0 8px 18px -14px rgba(15,23,42,0.35)" : "none",
                }}>
                {label}
                {badge != null && badge > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: tab === key ? "rgba(37,99,235,0.12)" : "rgba(59,130,255,0.14)", color: tab === key ? "var(--ax-active-text)" : "var(--accent-300)" }}>{badge}</span>
                )}
              </button>
            ))}
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => syncCrmMutation.mutate()}
              disabled={syncCrmMutation.isPending}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-bold text-primary border disabled:opacity-60 disabled:cursor-not-allowed hover:border-accent-300/40 transition-all"
              style={{ background: "var(--ax-field-bg)", borderColor: "var(--ax-border)" }}
            >
              <RefreshCw className={`w-4 h-4 text-accent-300 ${syncCrmMutation.isPending ? "animate-spin" : ""}`} />
              {syncCrmMutation.isPending ? "Syncing" : "Sync CRM"}
            </button>
            <div className="flex items-center gap-1 p-0.5 rounded-md border" style={{ background: "var(--ax-control-bg)", borderColor: "var(--ax-border)" }}>
              {[
                { value: "all", label: "All" },
                { value: "admin", label: "Admin" },
                { value: "mentor", label: "Mentor" },
                { value: "batch_moderator", label: "Moderator" },
                { value: "learner", label: "Learner" },
              ].map(({ value, label }) => (
                <button key={value} onClick={() => setUserFilterAndReset(value)}
                  className="px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all"
                  style={{ background: userFilter === value ? "var(--ax-active-bg)" : "transparent", color: userFilter === value ? "var(--ax-active-text)" : "var(--ax-muted)" }}>
                  {label}
                </button>
              ))}
            </div>
            <div className="relative">
              <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Search users, emails…"
                className="h-8 pl-8 pr-3 rounded-md text-[12px] text-primary placeholder-faint focus:outline-none focus:ring-1 focus:ring-accent-400/30 w-44 border"
                style={{ background: "var(--ax-field-bg)", borderColor: "var(--ax-border)" }} />
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-faint pointer-events-none" />
            </div>
            {tab === "users" && (
              <button onClick={() => setShowCreateUser(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-bold border-none"
                style={{ background: "var(--ax-primary-action-bg)", color: "var(--ax-primary-action-text)", boxShadow: "var(--ax-primary-action-shadow)" }}>
                <UserPlus className="w-4 h-4" /> New User
              </button>
            )}
          </div>
        </div>

        {/* ── Users Tab ── */}
        {tab === "users" && (
          <div
            className={`responsive-table-wrap figma-card rounded-b-xl border-t-0 transition-opacity ${usersPlaceholderData ? "opacity-70" : "opacity-100"}`}
            aria-busy={usersFetching}
          >
            <table className="figma-table text-sm min-w-[760px]">
              <thead>
                <tr>
                  {["User Profile", "Global Role", "Assigned Batches", "Account Status", "Actions"].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u: any) => (
                  <tr key={u.id} className="group transition-colors">
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="relative flex-shrink-0">
                          <span className={`avatar ${u.role === "admin" ? "avatar-coral" : u.role === "mentor" ? "avatar-cyan" : u.role === "batch_moderator" ? "avatar-amber" : "avatar-indigo"} w-9 h-9 text-[13px]`}>
                            {u.username[0].toUpperCase()}
                          </span>
                          <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2" style={{ borderColor: "var(--ax-panel)" }} />
                        </div>
                        <div>
                          <p className="font-semibold text-primary text-[14px]">{u.username}</p>
                          <p className="text-dim text-xs mt-0.5">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="relative inline-flex items-center">
                        <select value={u.role} onChange={(e) => roleMutation.mutate({ id: u.id, role: e.target.value })}
                          className="appearance-none pr-6 pl-2.5 py-1.5 rounded-md text-xs text-primary focus:outline-none focus:ring-1 focus:ring-accent-400/30 border cursor-pointer"
                          style={{ background: "var(--ax-field-bg)", borderColor: "var(--ax-border)" }}>
                          <option value="learner">Learner</option>
                          <option value="mentor">Mentor</option>
                          <option value="batch_moderator">Moderator</option>
                          <option value="admin">Admin</option>
                        </select>
                        <span className="pointer-events-none absolute right-2 text-dim text-[10px]">▾</span>
                      </div>
                    </td>
                    <td className="max-w-[220px]">
                      <div className="flex flex-wrap gap-1">
                        {u.memberships?.length > 0
                          ? u.memberships.slice(0, 3).map((m: any, i: number) => (
                            <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border"
                              style={{ background: "rgba(59,130,255,0.14)", color: "var(--ax-active-text)", borderColor: "rgba(59,130,255,0.22)" }}>
                              {m.batch.name}
                            </span>
                          ))
                          : <span className="text-xs text-faint italic">No batches</span>}
                      </div>
                    </td>
                    <td>
                      <div className="flex items-start gap-1.5">
                        <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${u.is_banned ? "bg-red-500" : "bg-emerald-500"}`}
                          style={{ boxShadow: u.is_banned ? "0 0 6px rgba(239,68,68,0.5)" : "0 0 6px rgba(53,221,61,0.5)" }} />
                        <div>
                          <p className={`text-[13px] font-medium ${u.is_banned ? "text-red-400" : "text-emerald-400"}`}>{u.is_banned ? "Suspended" : "Active"}</p>
                          <p className="text-[11px] text-dim">Joined recently</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-3">
                        <button onClick={() => banMutation.mutate(u.id)} className="p-1.5 text-dim hover:text-red-400 transition-colors" aria-label={u.is_banned ? "Restore" : "Suspend"}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => comingSoon("Report export")} className="p-1.5 text-dim hover:text-accent-400 transition-colors" aria-label={`Export report for ${u.username}`} title="Report export coming soon"><FileText className="w-3.5 h-3.5" /></button>
                        <button type="button" onClick={() => comingSoon("User report")} className="text-dim hover:text-primary text-xs font-medium transition-colors" aria-label={`Open report for ${u.username}`} title="User report coming soon">Report</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="px-5 py-3.5 border-t flex items-center justify-between" style={{ borderColor: "var(--ax-border)" }}>
              <span className="text-xs text-dim flex items-center gap-2">
                Showing {usersStart}-{usersEnd} of {usersTotal} users
                {usersFetching && <RefreshCw className="w-3 h-3 animate-spin text-accent-300" aria-hidden="true" />}
              </span>
              <PaginationControls
                page={usersCurrentPage}
                totalPages={usersTotalPages}
                onPageChange={setUsersPage}
                disabled={usersFetching}
              />
            </div>
          </div>
        )}

        {/* ── Batches Tab ── */}
        {tab === "batches" && (
          <div className="figma-card rounded-b-xl border-t-0 p-6">
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
          <div className="responsive-table-wrap figma-card rounded-b-xl border-t-0">
            <div className="px-6 py-4 border-b" style={{ borderColor: "var(--ax-border)" }}><h3 className="t-overline text-dim">Administrative Audit Logs</h3></div>
            <table className="w-full text-sm min-w-[700px]">
              <thead><tr className="border-b" style={{ borderColor: "var(--ax-border)" }}>
                {["Administrator", "Action", "Target", "Timestamp"].map(h => <th key={h} className="px-6 py-3 text-left text-[11px] font-semibold tracking-widest text-dim uppercase">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y" style={{ borderColor: "var(--ax-row-border)" }}>
                {logs.map((l: any) => (
                  <tr key={l.id} className="hover:bg-[var(--ax-hover)] transition-colors">
                    <td className="px-6 py-4 flex items-center gap-2"><span className="avatar avatar-muted w-6 h-6 text-[10px]">{l.actor?.username[0]}</span><span className="text-primary font-medium">{l.actor?.username}</span></td>
                    <td className="px-6 py-4"><span className="chip chip-accent text-[10px]">{l.action_type.replace(/_/g, " ")}</span></td>
                    <td className="px-6 py-4"><span className="text-muted text-xs font-mono bg-surface-100 px-2 py-0.5 rounded border border-hairline">{l.target_id || "System"}</span></td>
                    <td className="px-6 py-4 text-dim text-xs font-medium">{new Date(l.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-5 py-3.5 border-t flex items-center justify-between" style={{ borderColor: "var(--ax-border)" }}>
              <span className="text-xs text-dim">Showing {logsStart}-{logsEnd} of {logsTotal} logs</span>
              <PaginationControls page={logsCurrentPage} totalPages={logsTotalPages} onPageChange={setLogsPage} />
            </div>
          </div>
        )}

        {/* ── Mod Queue Tab ── */}
        {tab === "modqueue" && (
          <div className="figma-card rounded-b-xl border-t-0 p-6 space-y-4">
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

      <Modal open={showSettings} onClose={() => setShowSettings(false)} size="lg">
        <ModalHeader title="Dashboard Settings" onClose={() => setShowSettings(false)} icon={<Settings className="w-5 h-5 text-accent-300" />} />
        <ModalBody className="space-y-5">
          <section className="rounded-xl border border-hairline bg-surface-100/35 p-4">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <h4 className="text-sm font-bold text-primary">Users table</h4>
                <p className="mt-1 text-xs text-dim">Choose how much data the admin list loads per page.</p>
              </div>
              <span className="rounded-md border border-hairline px-2 py-1 text-[11px] font-bold text-dim">
                {usersLimit} rows
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {USER_PAGE_SIZE_OPTIONS.map((limit) => (
                <button
                  key={limit}
                  type="button"
                  aria-pressed={usersLimit === limit}
                  onClick={() => updateUsersLimit(limit)}
                  className="rounded-lg border px-3 py-2 text-sm font-bold transition-all"
                  style={{
                    background: usersLimit === limit ? "var(--ax-active-bg)" : "var(--ax-field-bg)",
                    borderColor: usersLimit === limit ? "rgba(59,130,255,0.38)" : "var(--ax-border)",
                    color: usersLimit === limit ? "var(--ax-active-text)" : "var(--ax-muted)",
                  }}
                >
                  {limit}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-hairline bg-surface-100/35 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-bold text-primary">Fast page switching</h4>
                <p className="mt-1 text-xs text-dim">Prefetch the previous and next users pages after each load.</p>
              </div>
              <button
                type="button"
                aria-pressed={prefetchAdjacentPages}
                onClick={() => updatePrefetchPreference(!prefetchAdjacentPages)}
                className="relative h-7 w-12 rounded-full border transition-colors"
                style={{
                  background: prefetchAdjacentPages ? "var(--ax-primary-action-bg)" : "var(--ax-field-bg)",
                  borderColor: prefetchAdjacentPages ? "rgba(59,130,255,0.42)" : "var(--ax-border)",
                }}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${prefetchAdjacentPages ? "translate-x-5" : "translate-x-1"}`}
                />
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-hairline bg-surface-100/35 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-bold text-primary">Appearance</h4>
                <p className="mt-1 text-xs text-dim">Switch the dashboard theme.</p>
              </div>
              <ThemeToggle />
            </div>
          </section>
        </ModalBody>
        <ModalFooter className="justify-between">
          <button
            type="button"
            onClick={refreshAdminData}
            className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-bold text-primary transition-colors hover:text-accent-300"
            style={{ background: "var(--ax-field-bg)", borderColor: "var(--ax-border)" }}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh data
          </button>
          <button
            type="button"
            onClick={() => setShowSettings(false)}
            className="btn-primary rounded-lg px-4 py-2 text-sm font-bold"
          >
            Done
          </button>
        </ModalFooter>
      </Modal>

      <Modal open={showBroadcast} onClose={() => setShowBroadcast(false)}>
        <ModalHeader title="Broadcast Announcement" onClose={() => setShowBroadcast(false)} icon={<Megaphone className="w-5 h-5 text-accent-300" />} />
        <ModalBody>
          <FormTextarea label="Message" value={broadcastContent} onChange={(e) => setBroadcastContent(e.target.value)} rows={4} placeholder="Type your announcement here..." />
          <div className="mt-4">
            <p className="t-overline text-dim mb-2">Send to</p>
            <div className="flex gap-2 mb-3">
              {[{ k: true, l: "All channels" }, { k: false, l: "Specific channels" }].map(({ k, l }) => (
                <button key={String(k)} onClick={() => { setBroadcastAll(k); setBroadcastBatchId(null); if (k) setBroadcastTargets(new Set()); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${broadcastAll === k ? "bg-accent-100 text-accent-300 border-accent-200" : "bg-surface-100 text-dim border-hairline hover:text-primary"}`}>{l}</button>
              ))}
            </div>
            {!broadcastAll && (
              <div className="mt-3 rounded-xl border border-hairline bg-surface-100/40">
                <div className="flex items-center justify-between gap-3 border-b border-hairline px-3 py-2">
                  <div className="min-w-0">
                    {selectedBroadcastBatch ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setBroadcastBatchId(null)}
                          className="mb-1 text-[11px] font-semibold text-accent-300 hover:text-primary transition-colors"
                        >
                          Back to batches
                        </button>
                        <p className="truncate text-xs font-semibold text-muted">
                          {selectedBroadcastBatch.name} · {broadcastTargets.size} selected
                        </p>
                      </>
                    ) : (
                      <span className="text-xs font-semibold text-muted">
                        Choose a batch · {broadcastTargets.size} selected
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedBroadcastBatch && (
                      <button
                        type="button"
                        onClick={() => {
                          setBroadcastTargets((prev) => {
                            const next = new Set(prev);
                            selectedBroadcastBatch.channels.forEach((channel) => next.add(channel.id));
                            return next;
                          });
                        }}
                        className="text-[11px] font-semibold text-accent-300 hover:text-primary transition-colors"
                      >
                        Select batch
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setBroadcastTargets(new Set())}
                      className="text-[11px] font-semibold text-dim hover:text-primary transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="custom-scrollbar max-h-56 overflow-y-auto p-2">
                  {broadcastChannels.length === 0 ? (
                    <p className="px-2 py-6 text-center text-sm text-dim">No batches available.</p>
                  ) : selectedBroadcastBatch ? (
                    <div className="space-y-1">
                      {selectedBroadcastBatch.channels.map((channel) => {
                        const checked = broadcastTargets.has(channel.id);
                        return (
                          <button
                            key={channel.id}
                            type="button"
                            onClick={() => toggleBroadcastTarget(channel.id)}
                            className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-all ${
                              checked
                                ? "border-accent-200 bg-accent-100/70"
                                : "border-transparent hover:border-hairline hover:bg-surface-100"
                            }`}
                          >
                            <span
                              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-black ${
                                checked
                                  ? "border-accent-300 bg-accent-300 text-surface"
                                  : "border-hairline-strong text-transparent"
                              }`}
                            >
                              ✓
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-semibold text-primary">#{channel.name}</span>
                              <span className="block truncate text-[11px] text-dim">{channel.batch?.name || "Unknown batch"}</span>
                            </span>
                            <span className="shrink-0 text-[11px] text-faint">{channel._count?.messages ?? 0} msgs</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {broadcastBatches.map((batch) => {
                        const selectedInBatch = batch.channels.filter((channel) => broadcastTargets.has(channel.id)).length;
                        return (
                          <button
                            key={batch.id}
                            type="button"
                            onClick={() => setBroadcastBatchId(batch.id)}
                            className="flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-left transition-all hover:border-hairline hover:bg-surface-100"
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-100 text-[13px] font-black text-accent-300">
                              {batch.name[0]?.toUpperCase() || "B"}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-semibold text-primary">{batch.name}</span>
                              <span className="block text-[11px] text-dim">
                                {batch.channels.length} channel{batch.channels.length === 1 ? "" : "s"}
                                {selectedInBatch > 0 ? ` · ${selectedInBatch} selected` : ""}
                              </span>
                            </span>
                            <span className="shrink-0 text-[18px] leading-none text-dim">›</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </ModalBody>
        <ModalFooter className="justify-end">
          <button onClick={() => setShowBroadcast(false)} className="px-4 py-2 text-sm text-dim hover:text-primary transition-colors">Cancel</button>
          <button disabled={!canSendBroadcast} onClick={async () => {
            try {
              const body: any = { content: broadcastContent.trim() };
              if (!broadcastAll) body.channelIds = Array.from(broadcastTargets);
              const res = await api.post("/admin/broadcast", body);
              toast.success(`Broadcast sent to ${res.data.channelCount} channels!`);
              setBroadcastContent(""); setBroadcastTargets(new Set()); setBroadcastBatchId(null); setBroadcastAll(true); setShowBroadcast(false);
            } catch { toast.error("Failed to send broadcast"); }
          }} className="btn-primary px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50">Send broadcast</button>
        </ModalFooter>
      </Modal>
    </>
  );
}
