import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../api/client";
import { useAuthStore } from "../store/authStore";
import { ArrowLeft, Hash, Plus, Pencil, Trash2, Pin, PinOff, MessageCircle, Users, Lock } from "lucide-react";
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
  const isModerator = user?.role === "batch_moderator";
  const canManageChannels = isAdmin || isModerator;

  const { data: batch } = useQuery({
    queryKey: ["batch", batchId],
    queryFn: async () => (await api.get(`/batches/${batchId}`)).data,
    enabled: !!batchId,
  });

  const { data: channels, isLoading } = useQuery({
    queryKey: ["channels", batchId],
    queryFn: async () => (await api.get(`/batches/${batchId}/channels`)).data,
    enabled: !!batchId,
  });

  const { data: members } = useQuery({
    queryKey: ["members", batchId],
    queryFn: async () => (await api.get(`/batches/${batchId}/members`)).data,
    enabled: !!batchId,
  });

  const createChannel = useMutation({
    mutationFn: (name: string) => api.post(`/batches/${batchId}/channels`, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channels", batchId] });
      setCreating(false);
      setNewName("");
      toast.success("Channel created");
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || "Failed to create channel"),
  });

  const renameChannel = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.patch(`/channels/${id}`, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channels", batchId] });
      setRenamingId(null);
      setRenameValue("");
      toast.success("Channel renamed");
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || "Rename failed"),
  });

  const deleteChannel = useMutation({
    mutationFn: (id: string) => api.delete(`/channels/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channels", batchId] });
      toast.success("Channel deleted");
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || "Delete failed"),
  });

  const togglePin = useMutation({
    mutationFn: (id: string) => api.post(`/channels/${id}/pin`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channels", batchId] }),
  });

  return (
    <div className="h-screen flex flex-col bg-surface text-primary overflow-hidden">
      <header className="h-14 border-b border-hairline bg-surface-50/80 backdrop-blur flex items-center justify-between px-5 shrink-0 z-20">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 text-dim hover:text-primary text-sm transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </Link>
          <span className="text-faint">/</span>
          <h1 className="text-sm font-semibold truncate">{batch?.name || "Batch"}</h1>
          {batch?.is_pinned && (
            <span className="chip chip-accent text-[9px] flex items-center gap-1">
              <Pin className="w-2.5 h-2.5" />
              Pinned
            </span>
          )}
        </div>
        <NotificationDropdown />
      </header>

      <main className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-4xl mx-auto px-6 py-8">
          {/* Batch info */}
          <div className="mb-8">
            <h2 className="text-2xl font-serif font-medium text-primary mb-1">{batch?.name}</h2>
            {batch?.description && <p className="text-dim text-sm">{batch.description}</p>}
            <div className="flex items-center gap-4 mt-3 text-xs text-dim">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                {members?.length || 0} members
              </span>
              <span className="flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5" />
                {channels?.length || 0} channels
              </span>
            </div>
          </div>

          {/* Channels header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="t-overline text-dim">Channels</h3>
            {canManageChannels && (
              <button
                onClick={() => setCreating((v) => !v)}
                className="btn-primary flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
              >
                <Plus className="w-3.5 h-3.5" />
                New channel
              </button>
            )}
          </div>

          {/* Inline create */}
          {creating && (
            <div className="card p-3 mb-3 flex items-center gap-2">
              <Hash className="w-4 h-4 text-dim" />
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newName.trim()) createChannel.mutate(newName.trim());
                  if (e.key === "Escape") {
                    setCreating(false);
                    setNewName("");
                  }
                }}
                placeholder="channel-name"
                className="flex-1 bg-transparent text-primary placeholder-faint focus:outline-none text-sm"
              />
              <button
                onClick={() => newName.trim() && createChannel.mutate(newName.trim())}
                disabled={!newName.trim() || createChannel.isPending}
                className="btn-primary px-3 py-1 rounded-md text-xs font-bold disabled:opacity-40"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setCreating(false);
                  setNewName("");
                }}
                className="text-dim hover:text-primary text-xs px-2"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Channel list */}
          <div className="space-y-1.5">
            {isLoading && <p className="text-dim text-sm">Loading channels…</p>}
            {!isLoading && channels?.length === 0 && (
              <div className="card p-8 text-center">
                <Hash className="w-8 h-8 text-faint mx-auto mb-3" />
                <p className="text-dim text-sm">No channels yet.</p>
              </div>
            )}
            {channels?.map((ch: any) => {
              const isRenaming = renamingId === ch.id;
              return (
                <div
                  key={ch.id}
                  className="card card-hover px-4 py-3 flex items-center gap-3 cursor-pointer group"
                  onClick={() => !isRenaming && navigate(`/batch/${batchId}/channel/${ch.id}`)}
                >
                  <Hash className="w-4 h-4 text-dim shrink-0" />

                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter" && renameValue.trim()) {
                          renameChannel.mutate({ id: ch.id, name: renameValue.trim() });
                        }
                        if (e.key === "Escape") {
                          setRenamingId(null);
                          setRenameValue("");
                        }
                      }}
                      className="flex-1 bg-surface-100 border border-hairline-strong rounded px-2 py-1 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent-400/30"
                    />
                  ) : (
                    <>
                      <span className="flex-1 text-sm font-medium text-primary truncate">{ch.name}</span>
                      {ch.is_pinned && <Pin className="w-3 h-3 text-accent-400" />}
                      <span className="text-[11px] text-dim flex items-center gap-1">
                        <MessageCircle className="w-3 h-3" />
                        {ch._count?.messages || 0}
                      </span>
                    </>
                  )}

                  {/* Action buttons (admin/moderator) */}
                  {canManageChannels && !isRenaming && (
                    <div
                      className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => {
                          setRenamingId(ch.id);
                          setRenameValue(ch.name);
                        }}
                        className="p-1.5 text-faint hover:text-accent-400 transition-colors"
                        title="Rename channel"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {isAdmin && (
                        <>
                          <button
                            onClick={() => togglePin.mutate(ch.id)}
                            className="p-1.5 text-faint hover:text-accent-400 transition-colors"
                            title={ch.is_pinned ? "Unpin channel" : "Pin channel"}
                          >
                            {ch.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Delete channel "${ch.name}"?`)) deleteChannel.mutate(ch.id);
                            }}
                            className="p-1.5 text-faint hover:text-red-400 transition-colors"
                            title="Delete channel"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {batch && !batch.hasAccess && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mt-6 text-center">
              <p className="text-red-300 text-sm flex items-center justify-center gap-2">
                <Lock className="w-4 h-4" />
                You don't have access to this batch.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
