import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../api/client";
import { useAuthStore } from "../store/authStore";
import {
  Hash, Plus, Pencil, Trash2, Pin, PinOff, MessageCircle,
  Users, User, Lock, ArrowLeft, Settings, Sparkles,
} from "lucide-react";
import ThemeToggle from "../components/ThemeToggle";
import { toast } from "react-hot-toast";
import NotificationDropdown from "../components/NotificationDropdown";

export default function BatchPage() {
  const { id: batchId } = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const isAdmin = user?.role === "admin";
  const canManageChannels = isAdmin || user?.role === "batch_moderator";

  const { data: batch } = useQuery({ queryKey: ["batch", batchId], queryFn: async () => (await api.get(`/batches/${batchId}`)).data, enabled: !!batchId });
  const { data: channels, isLoading } = useQuery({ queryKey: ["channels", batchId], queryFn: async () => (await api.get(`/batches/${batchId}/channels`)).data, enabled: !!batchId });
  const { data: members } = useQuery({ queryKey: ["members", batchId], queryFn: async () => (await api.get(`/batches/${batchId}/members`)).data, enabled: !!batchId });

  const createChannel = useMutation({ mutationFn: (name: string) => api.post(`/batches/${batchId}/channels`, { name }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["channels", batchId] }); setCreating(false); setNewName(""); toast.success("Channel created"); }, onError: (err: any) => toast.error(err?.response?.data?.error || "Failed") });
  const renameChannel = useMutation({ mutationFn: ({ id, name }: { id: string; name: string }) => api.patch(`/channels/${id}`, { name }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["channels", batchId] }); setRenamingId(null); toast.success("Renamed"); }, onError: (err: any) => toast.error(err?.response?.data?.error || "Rename failed") });
  const deleteChannel = useMutation({ mutationFn: (id: string) => api.delete(`/channels/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ["channels", batchId] }); toast.success("Deleted"); } });
  const togglePin = useMutation({ mutationFn: (id: string) => api.post(`/channels/${id}/pin`), onSuccess: () => qc.invalidateQueries({ queryKey: ["channels", batchId] }) });

  return (
    <>
      {/* ── Glassmorphic header ── */}
      <header className="app-topbar h-16 flex-shrink-0 border-b border-hairline flex items-center px-8 gap-4 sticky top-0 z-20"
        style={{ backgroundColor: "var(--ax-glass)", backdropFilter: "blur(24px)" }}>
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 text-dim hover:text-primary text-sm transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="w-px h-5 bg-hairline" />
          <h1 className="text-xl font-bold text-primary tracking-tight">{batch?.name || "Batch"}</h1>
          {batch?.is_pinned && <span className="chip chip-accent text-[9px] flex items-center gap-1"><Pin className="w-2.5 h-2.5" />Pinned</span>}
        </div>
        <div className="flex-1 flex justify-center">
          <div className="app-topbar-search relative w-[480px]">
            <div className="w-full h-10 rounded-md flex items-center px-10 border border-hairline" style={{ backgroundColor: "var(--ax-panel)" }}>
              <span className="text-sm text-faint select-none">Ask AI or search workspace… (Cmd+K)</span>
            </div>
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            </span>
            <Sparkles className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-accent-400 pointer-events-none" />
          </div>
        </div>
        <div className="app-topbar-actions flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold"
            type="button"
            onClick={() => navigate("/dm?askMentor=1")}
            style={{ background: "var(--ax-primary-action-bg)", color: "var(--ax-primary-action-text)", boxShadow: "var(--ax-primary-action-shadow)" }}>
            <Sparkles className="w-3.5 h-3.5" /> Ask Mentor
          </button>
          <ThemeToggle />
          <NotificationDropdown />
          <button className="w-8 h-8 flex items-center justify-center rounded-lg text-dim hover:text-primary transition-colors"><Settings className="w-4 h-4" /></button>
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

      {/* ── Scrollable content ── */}
      <div className="page-scroll-content flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-4xl mx-auto px-8 py-8">

          {/* Batch info hero */}
          <div className="relative overflow-hidden rounded-xl border border-hairline p-6 mb-8" style={{ backgroundColor: "var(--ax-panel)" }}>
            <div className="theme-orb pointer-events-none absolute -right-8 -top-16 w-40 h-40 rounded-full opacity-15 blur-3xl"
              style={{ background: "linear-gradient(rgb(62,56,224),rgb(0,219,232))" }} />
            <h2 className="text-2xl font-bold text-primary mb-1 relative">{batch?.name}</h2>
            {batch?.description && <p className="text-muted text-sm mb-4 relative">{batch.description}</p>}
            <div className="flex items-center gap-6 text-xs text-dim relative">
              <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />{members?.length || 0} members</span>
              <span className="flex items-center gap-1.5"><Hash className="w-3.5 h-3.5" />{channels?.length || 0} channels</span>
              <span className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" style={{ boxShadow: "0 0 5px rgba(53,221,61,0.5)" }} />
                Active
              </span>
            </div>
          </div>

          {/* Channels header */}
          <div className="flex items-center justify-between mb-4">
            <p className="t-overline text-dim">CHANNELS</p>
            {canManageChannels && (
              <button onClick={() => setCreating((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border-none"
                style={{ background: "var(--ax-primary-action-bg)", color: "var(--ax-primary-action-text)" }}>
                <Plus className="w-3.5 h-3.5" /> New channel
              </button>
            )}
          </div>

          {/* Inline create */}
          {creating && (
            <div className="rounded-xl border border-accent-200 p-3 mb-3 flex items-center gap-2 bg-accent-50">
              <Hash className="w-4 h-4 text-accent-400" />
              <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) createChannel.mutate(newName.trim()); if (e.key === "Escape") { setCreating(false); setNewName(""); } }}
                placeholder="channel-name"
                className="flex-1 bg-transparent text-primary placeholder-faint focus:outline-none text-sm" />
              <button onClick={() => newName.trim() && createChannel.mutate(newName.trim())} disabled={!newName.trim() || createChannel.isPending}
                className="px-3 py-1 rounded-md text-xs font-bold disabled:opacity-40 border-none"
                style={{ background: "var(--ax-primary-action-bg)", color: "var(--ax-primary-action-text)" }}>
                Create
              </button>
              <button onClick={() => { setCreating(false); setNewName(""); }} className="text-dim hover:text-primary text-xs px-2">Cancel</button>
            </div>
          )}

          {/* Channel list */}
          <div className="flex flex-col gap-2">
            {isLoading && <p className="text-dim text-sm px-1">Loading channels…</p>}
            {!isLoading && channels?.length === 0 && (
              <div className="card p-8 text-center">
                <Hash className="w-8 h-8 text-faint mx-auto mb-3" />
                <p className="text-dim text-sm">No channels yet.</p>
              </div>
            )}
            {channels?.map((ch: any) => {
              const isRenaming = renamingId === ch.id;
              return (
                <div key={ch.id}
                  className="rounded-xl border border-hairline p-4 flex items-center gap-3 cursor-pointer group transition-all hover:-translate-y-px hover:border-hairline-strong"
                  style={{ backgroundColor: "var(--ax-panel)" }}
                  onClick={() => !isRenaming && navigate(`/batch/${batchId}/channel/${ch.id}`)}>
                  <div className="w-8 h-8 rounded-lg border border-hairline flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--ax-bg)" }}>
                    <Hash className="w-4 h-4 text-dim" />
                  </div>

                  {isRenaming ? (
                    <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && renameValue.trim()) renameChannel.mutate({ id: ch.id, name: renameValue.trim() }); if (e.key === "Escape") { setRenamingId(null); setRenameValue(""); } }}
                      className="flex-1 bg-surface-100 border border-hairline-strong rounded-lg px-3 py-1.5 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent-400/30" />
                  ) : (
                    <>
                      <span className="flex-1 text-[14px] font-medium text-primary truncate group-hover:text-accent-300 transition-colors">{ch.name}</span>
                      {ch.is_pinned && <Pin className="w-3 h-3 text-accent-400 flex-shrink-0" />}
                      <span className="text-[11px] text-dim flex items-center gap-1 flex-shrink-0">
                        <MessageCircle className="w-3 h-3" />{ch._count?.messages || 0}
                      </span>
                    </>
                  )}

                  {canManageChannels && !isRenaming && (
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => { setRenamingId(ch.id); setRenameValue(ch.name); }}
                        className="p-1.5 text-faint hover:text-accent-400 transition-colors rounded-lg hover:bg-surface-200"><Pencil className="w-3.5 h-3.5" /></button>
                      {isAdmin && <>
                        <button onClick={() => togglePin.mutate(ch.id)}
                          className="p-1.5 text-faint hover:text-accent-400 transition-colors rounded-lg hover:bg-surface-200">
                          {ch.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => { if (confirm(`Delete "${ch.name}"?`)) deleteChannel.mutate(ch.id); }}
                          className="p-1.5 text-faint hover:text-red-400 transition-colors rounded-lg hover:bg-surface-200"><Trash2 className="w-3.5 h-3.5" /></button>
                      </>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Access warning */}
          {batch && !batch.hasAccess && (
            <div className="border border-red-500/20 rounded-xl p-4 mt-6 text-center bg-red-500/5">
              <p className="text-red-300 text-sm flex items-center justify-center gap-2">
                <Lock className="w-4 h-4" /> You don't have access to this batch.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
