import { Fragment, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import { Edit3, Eye, Hash, Layers, LayoutGrid, List as ListIcon, Lock, Plus, Search, Shield, Trash2, TrendingUp, Users, X } from "lucide-react";
import api from "../api/client";
import { useAuthStore } from "../store/authStore";
import { FigmaOverline, FigmaStatCard, FigmaTopBar, figmaGradient } from "../components/FigmaShared";
import ExactCreateBatchModal, { type CreateBatchPayload } from "../components/CreateBatchModal";

type BatchType = "all" | "private" | "public" | "general" | "paid" | "hidden";
type ViewMode = "grid" | "list";

type Batch = {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  is_paid?: boolean;
  hasAccess?: boolean;
  _count?: { channels?: number; memberships?: number };
};

const swatches = ["#3b82ff", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899", "#0dd4e8", "#94a3b8"];

function getBatchColor(index: number) {
  return swatches[index % swatches.length];
}

function batchDescription(batch: Batch) {
  return batch.description || "No description";
}

function typeTone(type: string) {
  if (type === "private" || type === "paid" || type === "hidden") {
    return {
      background: "rgba(139,92,246,0.15)",
      color: "#a78bfa",
      border: "1px solid rgba(139,92,246,0.2)",
    };
  }
  if (type === "general") {
    return {
      background: "rgba(148,163,184,0.12)",
      color: "#94a3b8",
      border: "1px solid rgba(148,163,184,0.15)",
    };
  }
  return {
    background: "rgba(52,211,153,0.12)",
    color: "#34d399",
    border: "1px solid rgba(52,211,153,0.2)",
  };
}

function TypeChip({ batch, compact = false }: { batch: Batch; compact?: boolean }) {
  return (
    <span
      style={{
        fontSize: compact ? 9 : 10,
        padding: compact ? "2px 6px" : "2px 8px",
        borderRadius: 4,
        textTransform: "capitalize",
        ...typeTone(batch.type || "public"),
      }}
    >
      {batch.type || "public"}
    </span>
  );
}

function PaidChip({ compact = false }: { compact?: boolean }) {
  return (
    <span
      style={{
        fontSize: compact ? 9 : 10,
        padding: compact ? "2px 6px" : "2px 8px",
        borderRadius: 4,
        background: "rgba(245,158,11,0.12)",
        color: "#fbbf24",
        border: "1px solid rgba(245,158,11,0.2)",
        display: "flex",
        alignItems: "center",
        gap: compact ? 2 : 3,
      }}
    >
      <Lock size={compact ? 10 : 12} />
      Paid
    </span>
  );
}

function IconAction({
  children,
  onClick,
  label,
}: {
  children: ReactNode;
  onClick?: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        color: "#6c7793",
        background: "none",
        border: "none",
        display: "flex",
        cursor: "pointer",
        padding: 0,
      }}
      onMouseEnter={(event) => { event.currentTarget.style.color = "#e0e3e6"; }}
      onMouseLeave={(event) => { event.currentTarget.style.color = "#6c7793"; }}
    >
      {children}
    </button>
  );
}

function BatchCard({
  batch,
  index,
  view,
  canManage,
  onArchive,
}: {
  batch: Batch;
  index: number;
  view: ViewMode;
  canManage: boolean;
  onArchive: (batch: Batch) => void;
}) {
  const color = getBatchColor(index);
  const channels = batch._count?.channels || 0;
  const members = batch._count?.memberships || 0;
  const isPaid = Boolean(batch.is_paid || batch.type === "paid");

  if (view === "list") {
    return (
      <tr style={{ cursor: "default" }} onMouseEnter={(event) => { event.currentTarget.style.background = "rgba(255,255,255,0.025)"; }} onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; }}>
        <td style={{ padding: "14px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: `${color}22`,
                border: `1px solid ${color}44`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                color,
              }}
            >
              <Shield size={16} />
            </div>
            <div>
              <Link to={`/batch/${batch.id}`} style={{ fontSize: 14, fontWeight: 500, color: "#e0e3e6", textDecoration: "none" }}>
                {batch.name}
              </Link>
              <div
                style={{
                  fontSize: 12,
                  color: "#6c7793",
                  marginTop: 1,
                  maxWidth: 280,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {batchDescription(batch)}
              </div>
            </div>
          </div>
        </td>
        <td style={{ padding: "14px 20px" }}>
          <div style={{ display: "flex", gap: 6 }}>
            <TypeChip batch={batch} />
            {isPaid && <PaidChip />}
          </div>
        </td>
        <td style={{ padding: "14px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#94a3b8" }}>
            <Hash size={14} />
            <span style={{ fontSize: 13 }}>{channels} channels</span>
          </div>
        </td>
        <td style={{ padding: "14px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#94a3b8" }}>
            <Users size={14} />
            <span style={{ fontSize: 13 }}>{members} members</span>
          </div>
        </td>
        <td style={{ padding: "14px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "rgb(53,221,61)", boxShadow: "0 0 5px rgba(53,221,61,0.4)" }} />
            <span style={{ fontSize: 12, color: "rgb(53,221,61)", fontWeight: 500 }}>Active</span>
          </div>
        </td>
        <td style={{ padding: "14px 20px", textAlign: "right" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
            <Link to={`/batch/${batch.id}`} style={{ color: "#6c7793", display: "flex" }} aria-label={`Open ${batch.name}`}>
              <Eye size={14} />
            </Link>
            {canManage && (
              <>
                <IconAction label={`Edit ${batch.name}`}>
                  <Edit3 size={14} />
                </IconAction>
                <IconAction label={`Archive ${batch.name}`} onClick={() => onArchive(batch)}>
                  <Trash2 size={14} />
                </IconAction>
              </>
            )}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div
      style={{
        borderRadius: 12,
        backgroundColor: "rgb(10,13,18)",
        border: "1px solid rgba(255,255,255,0.08)",
        padding: 20,
        transition: "all 0.14s",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
        event.currentTarget.style.background = "rgb(13,17,24)";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
        event.currentTarget.style.background = "rgb(10,13,18)";
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <Link
          to={`/batch/${batch.id}`}
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: `${color}22`,
            border: `1px solid ${color}44`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color,
          }}
        >
          <Shield size={16} />
        </Link>
        <div style={{ display: "flex", gap: 4 }}>
          {isPaid && <PaidChip compact />}
          <TypeChip batch={batch} compact />
        </div>
      </div>
      <div>
        <Link to={`/batch/${batch.id}`} style={{ fontSize: 15, fontWeight: 600, color: "#e0e3e6", marginBottom: 4, display: "block", textDecoration: "none" }}>
          {batch.name}
        </Link>
        <div style={{ fontSize: 12, color: "#6c7793", lineHeight: "18px", minHeight: 36 }}>
          {batchDescription(batch)}
        </div>
      </div>
      <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#6c7793" }}>
            <Hash size={14} />
            {channels}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#6c7793" }}>
            <Users size={14} />
            {members}
          </div>
        </div>
        {canManage && (
          <div style={{ display: "flex", gap: 6 }}>
            <IconAction label={`Edit ${batch.name}`}>
              <Edit3 size={14} />
            </IconAction>
            <IconAction label={`Archive ${batch.name}`} onClick={() => onArchive(batch)}>
              <Trash2 size={14} />
            </IconAction>
          </div>
        )}
      </div>
    </div>
  );
}

function CreateBatchModal({
  onClose,
  onCreate,
  pending,
}: {
  onClose: () => void;
  onCreate: (data: { name: string; description: string; type: string; is_paid: boolean }) => void;
  pending: boolean;
}) {
  const [newBatch, setNewBatch] = useState({ name: "", description: "", type: "public", is_paid: false });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "rgb(16,21,29)",
          border: "1px solid rgb(30,41,59)",
          borderRadius: 16,
          padding: 28,
          width: 440,
          boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: "#e0e3e6" }}>Create New Batch</span>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#6c7793", display: "flex", padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: "#94a3b8", marginBottom: 6, letterSpacing: "0.02em" }}>
              Batch Name
            </div>
            <input
              value={newBatch.name}
              onChange={(event) => setNewBatch((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="e.g. React Deep Dive 2024"
              style={{
                width: "100%",
                background: "rgb(10,13,18)",
                border: "1px solid rgb(30,41,59)",
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 13,
                fontFamily: "Poppins",
                color: "#e0e3e6",
              }}
              autoFocus
            />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: "#94a3b8", marginBottom: 6, letterSpacing: "0.02em" }}>
              Description
            </div>
            <input
              value={newBatch.description}
              onChange={(event) => setNewBatch((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Briefly describe the batch..."
              style={{
                width: "100%",
                background: "rgb(10,13,18)",
                border: "1px solid rgb(30,41,59)",
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 13,
                fontFamily: "Poppins",
                color: "#e0e3e6",
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: "#94a3b8", marginBottom: 6 }}>Visibility</div>
            <div style={{ position: "relative" }}>
              <select
                value={newBatch.type}
                onChange={(event) => setNewBatch((prev) => ({ ...prev, type: event.target.value }))}
                style={{
                  width: "100%",
                  background: "rgb(10,13,18)",
                  border: "1px solid rgb(30,41,59)",
                  borderRadius: 8,
                  padding: "10px 14px",
                  fontSize: 13,
                  fontFamily: "Poppins",
                  color: "#e0e3e6",
                  appearance: "none",
                }}
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
                <option value="general">General</option>
              </select>
              <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", pointerEvents: "none", fontSize: 10 }}>
                v
              </span>
            </div>
          </div>
          <div
            style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
            onClick={() => setNewBatch((prev) => ({ ...prev, is_paid: !prev.is_paid }))}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                border: `1px solid ${newBatch.is_paid ? "transparent" : "rgb(30,41,59)"}`,
                background: newBatch.is_paid ? figmaGradient : "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.15s",
              }}
            >
              {newBatch.is_paid && <span style={{ color: "#05070a", fontSize: 11, fontWeight: 900 }}>✓</span>}
            </div>
            <span style={{ fontSize: 13, color: "#94a3b8" }}>Paid Access</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: 11,
              borderRadius: 10,
              border: "1px solid rgb(30,41,59)",
              background: "transparent",
              color: "#6c7793",
              fontSize: 13,
              fontFamily: "Poppins",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onCreate(newBatch)}
            disabled={!newBatch.name.trim() || pending}
            style={{
              flex: 2,
              padding: 11,
              borderRadius: 10,
              border: "none",
              background: figmaGradient,
              color: "#05070a",
              fontSize: 13,
              fontFamily: "Poppins",
              fontWeight: 700,
              cursor: "pointer",
              opacity: newBatch.name.trim() && !pending ? 1 : 0.5,
            }}
          >
            {pending ? "Creating..." : "Create Batch"}
          </button>
        </div>
      </div>
    </div>
  );
}

void CreateBatchModal;

export default function BatchesPage() {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewMode>("grid");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<BatchType>("all");
  const [showCreate, setShowCreate] = useState(false);
  const canManage = user?.role === "admin";

  const { data: batches = [] } = useQuery<Batch[]>({
    queryKey: ["batches"],
    queryFn: async () => (await api.get("/batches")).data,
  });

  const createBatch = useMutation({
    mutationFn: async (payload: CreateBatchPayload) => {
      const { data } = await api.post("/batches", {
        name: payload.name.trim(),
        description: payload.description.trim(),
        type: payload.is_paid ? "paid" : payload.type,
        is_paid: payload.is_paid,
      });

      const extraChannels = payload.channels.filter((channel) => channel && channel !== "channel1");
      await Promise.allSettled(extraChannels.map((channel) => api.post(`/batches/${data.id}/channels`, { name: channel })));
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      setShowCreate(false);
      toast.success("Batch created");
    },
    onError: (error: any) => toast.error(error?.response?.data?.error || "Failed to create batch"),
  });

  const archiveBatch = useMutation({
    mutationFn: (batchId: string) => api.delete(`/batches/${batchId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      toast.success("Batch archived");
    },
    onError: () => toast.error("Failed to archive batch"),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return batches.filter((batch) => {
      const matchesSearch = !q || batch.name.toLowerCase().includes(q) || batchDescription(batch).toLowerCase().includes(q);
      const matchesFilter = filter === "all" || batch.type === filter || (filter === "paid" && Boolean(batch.is_paid || batch.type === "paid"));
      return matchesSearch && matchesFilter;
    });
  }, [batches, filter, search]);

  const stats = [
    { icon: <Layers size={20} />, value: String(batches.length).padStart(2, "0"), label: "Total Batches", iconBg: "rgba(89,149,232,0.2)" },
    { icon: <TrendingUp size={20} />, value: String(batches.reduce((sum, batch) => sum + (batch._count?.memberships || 0), 0)), label: "Total Members", iconBg: "rgba(52,211,153,0.2)" },
    { icon: <Hash size={20} />, value: String(batches.reduce((sum, batch) => sum + (batch._count?.channels || 0), 0)), label: "Total Channels", iconBg: "rgba(139,92,246,0.2)" },
  ];

  const handleArchive = (batch: Batch) => {
    if (confirm(`Archive "${batch.name}"?`)) archiveBatch.mutate(batch.id);
  };

  return (
    <>
      <FigmaTopBar title="Rooms" subtitle="Manage all learning batches" />
      <div className="page-scroll-content figma-scroll" style={{ padding: "32px 32px 40px" }}>
        <FigmaOverline style={{ marginBottom: 16 }}>Overview</FigmaOverline>
        <div className="responsive-stat-grid" style={{ display: "flex", gap: 16, marginBottom: 32 }}>
          {stats.map((stat) => <FigmaStatCard key={stat.label} {...stat} />)}
        </div>

        <div
          className="responsive-controls figma-panel"
          style={{
            padding: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 0,
          }}
        >
          <div className="responsive-tab-strip" style={{ display: "flex", alignItems: "center", background: "rgb(5,7,10)", border: "1px solid rgb(30,41,59)", borderRadius: 8, padding: 6, gap: 2 }}>
            {[
              { key: "all", label: "All Batches" },
              { key: "private", label: "Private" },
              { key: "public", label: "Public" },
              { key: "general", label: "General" },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key as BatchType)}
                style={{
                  padding: "5px 14px",
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "Poppins",
                  fontSize: 12,
                  fontWeight: 700,
                  background: filter === item.key ? "rgb(255,255,255)" : "transparent",
                  color: filter === item.key ? "rgb(5,7,10)" : "rgb(194,198,214)",
                  transition: "all 0.15s",
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="responsive-control-actions" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", background: "rgb(5,7,10)", border: "1px solid rgb(30,41,59)", borderRadius: 6, overflow: "hidden" }}>
              {[
                { key: "grid", icon: <LayoutGrid size={15} /> },
                { key: "list", icon: <ListIcon size={15} /> },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setView(item.key as ViewMode)}
                  style={{
                    width: 32,
                    height: 32,
                    border: "none",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: view === item.key ? "rgba(59,130,255,0.15)" : "transparent",
                    color: view === item.key ? "#afc6ff" : "#6c7793",
                    transition: "all 0.15s",
                  }}
                >
                  {item.icon}
                </button>
              ))}
            </div>
            <div style={{ position: "relative" }}>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search batches..."
                style={{
                  background: "rgb(10,13,18)",
                  border: "1px solid rgb(30,41,59)",
                  borderRadius: 6,
                  padding: "6px 12px 6px 32px",
                  fontSize: 12,
                  fontFamily: "Poppins",
                  color: "#e0e3e6",
                  width: 200,
                }}
              />
              <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", display: "flex", pointerEvents: "none" }}>
                <Search size={14} />
              </span>
            </div>
            {canManage && (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 16px",
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "Poppins",
                  background: figmaGradient,
                  boxShadow: "0 0 10px rgba(59,130,255,0.3)",
                  color: "#05070a",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <Plus size={13} />
                New Batch
              </button>
            )}
          </div>
        </div>

        {view === "grid" ? (
          <div className="figma-card" style={{ marginTop: 0, borderRadius: "0 0 12px 12px", borderTop: "none", padding: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
              {filtered.map((batch, index) => (
                <BatchCard key={batch.id} batch={batch} index={index} view="grid" canManage={canManage} onArchive={handleArchive} />
              ))}
            </div>
            {filtered.length === 0 && <p style={{ padding: "48px 0", textAlign: "center", fontSize: 14, color: "#6c7793" }}>No batches found.</p>}
          </div>
        ) : (
          <div className="responsive-table-wrap figma-card" style={{ borderRadius: "0 0 12px 12px", borderTop: "none" }}>
            <table className="figma-table" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "32%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "10%" }} />
              </colgroup>
              <thead>
                <tr>
                  {["Batch Name", "Type", "Channels", "Members", "Status", "Actions"].map((heading) => (
                    <th key={heading}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((batch, index) => (
                  <Fragment key={batch.id}>
                    {index > 0 && (
                      <tr>
                        <td colSpan={6}>
                          <div style={{ height: 1, background: "rgb(22,30,42)" }} />
                        </td>
                      </tr>
                    )}
                    <BatchCard batch={batch} index={index} view="list" canManage={canManage} onArchive={handleArchive} />
                  </Fragment>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <p style={{ padding: "48px 0", textAlign: "center", fontSize: 14, color: "#6c7793" }}>No batches found.</p>}
            <div style={{ padding: "14px 20px", borderTop: "1px solid rgb(30,41,59)" }}>
              <span style={{ fontSize: 12, color: "#94a3b8" }}>Showing {filtered.length} of {batches.length} batches</span>
            </div>
          </div>
        )}
      </div>

      {showCreate && (
        <ExactCreateBatchModal
          onClose={() => setShowCreate(false)}
          onSubmit={(payload) => createBatch.mutate(payload)}
          pending={createBatch.isPending}
        />
      )}
    </>
  );
}
