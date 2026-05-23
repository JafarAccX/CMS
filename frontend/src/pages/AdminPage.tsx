import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../api/client";
import { Users, Shield, FileText, AlertTriangle, Check, Plus, UserPlus, Trash2, Megaphone, Pin, PinOff, Hash, ArrowRight } from "lucide-react";
import { toast } from "react-hot-toast";
import PageShell from "../components/PageShell";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "../components/Modal";
import { FormField, FormTextarea, FormSelect } from "../components/FormField";

type Tab = "users" | "batches" | "logs" | "modqueue";

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("users");
  const [showCreateBatch, setShowCreateBatch] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showManageMembers, setShowManageMembers] = useState<string | null>(null);
  const [userFilter, setUserFilter] = useState<string>("all");
  const [newBatch, setNewBatch] = useState({ name: "", description: "", type: "public", is_paid: false });
  const [newUser, setNewUser] = useState({ username: "", email: "", phone: "", password: "", role: "learner" });
  const [newMember, setNewMember] = useState({ userId: "", roleInBatch: "member" });
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastContent, setBroadcastContent] = useState("");
  const [broadcastTargets, setBroadcastTargets] = useState<Set<string>>(new Set()); // channelIds
  const [broadcastAll, setBroadcastAll] = useState(true);

  const qc = useQueryClient();

  const { data: usersData } = useQuery({ queryKey: ["admin-users"], queryFn: async () => (await api.get("/admin/users")).data });
  const { data: pinnedData } = useQuery({ queryKey: ["admin-pinned"], queryFn: async () => (await api.get("/admin/pinned")).data });
  const { data: allBatchesData } = useQuery({ queryKey: ["batches"], queryFn: async () => (await api.get("/batches")).data });
  const { data: statsData } = useQuery({ queryKey: ["admin-stats"], queryFn: async () => (await api.get("/admin/stats")).data });
  const { data: logsData } = useQuery({ queryKey: ["admin-logs"], queryFn: async () => (await api.get("/admin/logs")).data, enabled: tab === "logs" });
  const { data: modData } = useQuery({ queryKey: ["mod-queue"], queryFn: async () => (await api.get("/mod-queue")).data, enabled: tab === "modqueue" });

  const { data: membersData } = useQuery({
    queryKey: ["batch-members", showManageMembers],
    queryFn: async () => (await api.get(`/batches/${showManageMembers}/members`)).data,
    enabled: !!showManageMembers
  });

  // Mutations
  const banMutation = useMutation({ mutationFn: (id: string) => api.patch(`/admin/users/${id}/ban`), onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }) });
  const roleMutation = useMutation({ mutationFn: ({ id, role }: { id: string, role: string }) => api.patch(`/admin/users/${id}/role`, { role }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast.success("Role updated"); } });

  const createBatchMutation = useMutation({
    mutationFn: (data: typeof newBatch) => api.post("/batches", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["batches"] });
      setShowCreateBatch(false);
      setNewBatch({ name: "", description: "", type: "public", is_paid: false });
      toast.success("Batch created");
    }
  });

  const addMemberMutation = useMutation({
    mutationFn: ({ batchId, userId, role }: { batchId: string, userId: string, role: string }) => api.post(`/batches/${batchId}/members`, { user_id: userId, role_in_batch: role }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["batch-members", showManageMembers] }); toast.success("Member added"); }
  });

  const removeMemberMutation = useMutation({
    mutationFn: ({ batchId, userId }: { batchId: string, userId: string }) => api.delete(`/batches/${batchId}/members/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["batch-members", showManageMembers] })
  });

  const createUserMutation = useMutation({
    mutationFn: (data: typeof newUser) => api.post("/admin/users", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      setShowCreateUser(false);
      setNewUser({ username: "", email: "", phone: "", password: "", role: "learner" });
      toast.success("User created successfully");
    }
  });

  const resolveMutation = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/mod-queue/${id}`, { status }), onSuccess: () => qc.invalidateQueries({ queryKey: ["mod-queue"] }) });

  const togglePinBatch = useMutation({
    mutationFn: (batchId: string) => api.post(`/batches/${batchId}/pin`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-pinned"] });
      qc.invalidateQueries({ queryKey: ["batches"] });
    },
  });

  const togglePinChannel = useMutation({
    mutationFn: (channelId: string) => api.post(`/channels/${channelId}/pin`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-pinned"] }),
  });

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "users", label: "Users", icon: <Users className="w-4 h-4" /> },
    { key: "batches", label: "Batches", icon: <Shield className="w-4 h-4" /> },
    { key: "logs", label: "Logs", icon: <FileText className="w-4 h-4" /> },
    { key: "modqueue", label: "Mod Queue", icon: <AlertTriangle className="w-4 h-4" /> },
  ];

  return (
    <PageShell
      title="Admin Panel"
      actions={
        <>
          <button onClick={() => setShowBroadcast(true)} className="px-3 py-1.5 bg-accent-100 border border-accent-200 text-accent-300 text-xs font-bold rounded-lg hover:bg-accent-200 transition-all flex items-center gap-2"><Megaphone className="w-4 h-4" />Broadcast</button>
          <span className="chip chip-admin text-[10px]">System Administrator</span>
        </>
      }
    >
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Users", value: statsData?.totalUsers, icon: <Users className="w-5 h-5" style={{ color: "oklch(0.7 0.15 250)" }} />, hue: "250", tab: "users", filter: "all" },
            { label: "Total Mentors", value: statsData?.totalMentors, icon: <Shield className="w-5 h-5" style={{ color: "oklch(0.75 0.12 190)" }} />, hue: "190", tab: "users", filter: "mentor" },
            { label: "Total Learners", value: statsData?.totalLearners, icon: <Users className="w-5 h-5" style={{ color: "oklch(0.74 0.16 150)" }} />, hue: "150", tab: "users", filter: "learner" },
            { label: "Active Batches", value: statsData?.totalBatches, icon: <Shield className="w-5 h-5" style={{ color: "oklch(0.72 0.14 290)" }} />, hue: "290", tab: "batches", filter: "all" },
          ].map((s, i) => (
            <div
              key={i}
              onClick={() => { setTab(s.tab as Tab); if(s.tab === "users") setUserFilter(s.filter); }}
              className="card card-hover p-6 cursor-pointer active:scale-[0.98] transition-all animate-in fade-in slide-in-from-bottom-2 duration-500"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 rounded-[9px] flex items-center justify-center" style={{ background: `oklch(0.3 0.06 ${s.hue})` }}>{s.icon}</div>
              </div>
              <p className="text-2xl font-serif font-medium text-primary mb-0.5">{s.value ?? "..."}</p>
              <p className="t-overline text-dim">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div className="flex flex-wrap gap-1 bg-surface-50 p-1 rounded-xl border border-hairline">
            {tabs.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${tab === t.key ? "bg-accent-100 text-accent-300 border border-hairline-strong" : "text-dim hover:text-primary hover:bg-surface-100 border border-transparent"}`}>{t.icon}{t.label}</button>
            ))}
          </div>

          {tab === "users" && (
            <button
              onClick={() => setShowCreateUser(true)}
              className="btn-primary flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all"
            >
              <UserPlus className="w-4 h-4" /> Create New User
            </button>
          )}
        </div>

        {tab === "users" && (
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-hairline flex items-center justify-between bg-surface-100/30">
               <div className="flex items-center gap-2">
                  <span className="t-overline text-dim">Filter:</span>
                  <div className="flex bg-surface-200 p-0.5 rounded-lg border border-hairline">
                     {["all", "admin", "mentor", "learner"].map((f) => (
                        <button
                           key={f}
                           onClick={() => setUserFilter(f)}
                           className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${userFilter === f ? "bg-accent-100 text-accent-300 border border-hairline-strong" : "text-dim hover:text-muted border border-transparent"}`}
                        >
                           {f}
                        </button>
                     ))}
                  </div>
               </div>
               <p className="t-overline text-faint">Showing {usersData?.users?.filter((u: any) => userFilter === "all" || u.role === userFilter).length} users</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
               <thead>
                 <tr className="border-b border-hairline text-dim bg-surface-100/50">
                   <th className="px-6 py-4 text-left font-semibold text-[11px] uppercase tracking-widest">User Details</th>
                   <th className="px-6 py-4 text-left font-semibold text-[11px] uppercase tracking-widest">Global Role</th>
                   <th className="px-6 py-4 text-left font-semibold text-[11px] uppercase tracking-widest">Assigned Batches</th>
                   <th className="px-6 py-4 text-left font-semibold text-[11px] uppercase tracking-widest">Account Status</th>
                   <th className="px-6 py-4 text-right font-semibold text-[11px] uppercase tracking-widest">Actions</th>
                 </tr>
               </thead>
              <tbody className="divide-y divide-hairline">
                {usersData?.users?.filter((u: any) => userFilter === "all" || u.role === userFilter).map((u: any) => (
                  <tr key={u.id} className="hover:bg-surface-100/40 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span className={`avatar ${u.role === 'admin' ? 'avatar-coral' : u.role === 'mentor' ? 'avatar-cyan' : 'avatar-indigo'} w-10 h-10 text-sm`}>{u.username[0].toUpperCase()}</span>
                        <div><p className="text-primary font-semibold text-base">{u.username}</p><p className="text-dim text-xs mt-0.5">{u.email}</p></div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={u.role}
                        onChange={(e) => roleMutation.mutate({ id: u.id, role: e.target.value })}
                        className="bg-surface-100 border border-hairline-strong rounded-lg text-xs px-2 py-1 text-primary focus:outline-none focus:ring-2 focus:ring-accent-400/30 transition-all cursor-pointer"
                      >
                        <option value="learner">Learner</option>
                        <option value="mentor">Mentor</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 max-w-xs">
                      <div className="flex flex-wrap gap-1.5">
                        {u.memberships?.length > 0 ? (
                          u.memberships.map((m: any, i: number) => (
                            <span key={i} className="chip chip-accent text-[10px] truncate">{m.batch.name}</span>
                          ))
                        ) : (
                          <span className="text-[10px] text-faint italic">No batches</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${u.is_banned ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"}`} />
                        <span className={`text-xs font-medium ${u.is_banned ? "text-red-400" : "text-emerald-400"}`}>{u.is_banned ? "Suspended" : "Active"}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => banMutation.mutate(u.id)} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${u.is_banned ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20" : "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"}`}>{u.is_banned ? "Restore Access" : "Restrict User"}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

        {tab === "batches" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-primary flex items-center gap-2">
                  <Pin className="w-5 h-5 text-accent-300" />
                  Pinned Batches & Channels
                </h2>
                <p className="text-dim text-sm mt-1">
                  Quick access to your pinned items. Pin batches/channels from their pages or below.
                </p>
              </div>
              <button onClick={() => setShowCreateBatch(true)} className="btn-primary flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all">
                <Plus className="w-5 h-5" />New Batch
              </button>
            </div>

            {/* Pinned Batches */}
            {pinnedData?.pinnedBatches?.length > 0 && (
              <div>
                <h3 className="t-overline text-dim mb-3">Pinned Batches</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pinnedData.pinnedBatches.map((b: any) => (
                    <div key={b.id} className="card card-hover p-5 group">
                      <div className="flex justify-between items-start mb-3">
                        <Link to={`/batch/${b.id}`} className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-accent-100 flex items-center justify-center text-accent-300">
                            <Shield className="w-5 h-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-primary font-bold text-base truncate group-hover:text-accent-300 transition-colors">{b.name}</h3>
                            <span className="text-[11px] text-dim">{b._count?.channels || 0} channels · {b._count?.memberships || 0} members</span>
                          </div>
                        </Link>
                        <button
                          onClick={() => togglePinBatch.mutate(b.id)}
                          className="p-1.5 text-accent-400 hover:text-red-400 transition-colors"
                          title="Unpin batch"
                        >
                          <PinOff className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Channels under this batch */}
                      <div className="space-y-1 border-t border-hairline pt-2 mt-2">
                        {b.channels?.slice(0, 5).map((ch: any) => (
                          <Link
                            key={ch.id}
                            to={`/batch/${b.id}/channel/${ch.id}`}
                            className="flex items-center gap-2 px-2 py-1 rounded hover:bg-surface-100 text-sm text-muted hover:text-primary transition-colors"
                          >
                            <Hash className="w-3 h-3 text-dim" />
                            <span className="flex-1 truncate">{ch.name}</span>
                            {ch.is_pinned && <Pin className="w-2.5 h-2.5 text-accent-400" />}
                            <span className="text-[10px] text-dim">{ch._count?.messages || 0}</span>
                          </Link>
                        ))}
                        {b.channels?.length > 5 && (
                          <Link to={`/batch/${b.id}`} className="text-[11px] text-accent-300 hover:underline px-2 flex items-center gap-1">
                            View all {b.channels.length} channels <ArrowRight className="w-3 h-3" />
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pinned Channels (whose batch is not pinned) */}
            {pinnedData?.pinnedChannelGroups?.length > 0 && (
              <div>
                <h3 className="t-overline text-dim mb-3">Pinned Channels</h3>
                <div className="space-y-3">
                  {pinnedData.pinnedChannelGroups.map((g: any) => (
                    <div key={g.batch.id} className="card p-4">
                      <Link to={`/batch/${g.batch.id}`} className="text-sm font-semibold text-primary hover:text-accent-300 transition-colors flex items-center gap-2 mb-2">
                        <Shield className="w-4 h-4 text-dim" /> {g.batch.name}
                        <span className="chip text-[9px] chip-muted">{g.batch.type}</span>
                      </Link>
                      <div className="space-y-1 ml-6">
                        {g.channels.map((ch: any) => (
                          <div key={ch.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-surface-100 group/ch">
                            <Link to={`/batch/${g.batch.id}/channel/${ch.id}`} className="flex items-center gap-2 flex-1 text-sm text-muted hover:text-primary transition-colors">
                              <Hash className="w-3 h-3 text-dim" />
                              <span className="truncate flex-1">{ch.name}</span>
                              <span className="text-[10px] text-dim">{ch._count?.messages || 0} msgs</span>
                            </Link>
                            <button
                              onClick={() => togglePinChannel.mutate(ch.id)}
                              className="opacity-0 group-hover/ch:opacity-100 p-1 text-accent-400 hover:text-red-400 transition-all"
                              title="Unpin channel"
                            >
                              <PinOff className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state with quick pin from all batches */}
            {(!pinnedData?.pinnedBatches?.length && !pinnedData?.pinnedChannelGroups?.length) && (
              <div className="card p-8 text-center">
                <Pin className="w-10 h-10 text-faint mx-auto mb-3" />
                <h3 className="text-lg font-bold text-muted">No pinned items</h3>
                <p className="text-dim text-sm mb-4">Pin batches or channels for quick access here.</p>
              </div>
            )}

            {/* All batches → quick pin */}
            <div>
              <h3 className="t-overline text-dim mb-3">All Batches (pin to add to your quick-access)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {allBatchesData?.map((b: any) => (
                  <div key={b.id} className="card p-3 flex items-center gap-3">
                    <Shield className="w-4 h-4 text-dim shrink-0" />
                    <Link to={`/batch/${b.id}`} className="flex-1 min-w-0 text-sm text-primary hover:text-accent-300 transition-colors truncate">
                      {b.name}
                    </Link>
                    <button
                      onClick={() => togglePinBatch.mutate(b.id)}
                      className={`p-1.5 transition-colors ${b.is_pinned ? "text-accent-400 hover:text-red-400" : "text-faint hover:text-accent-400"}`}
                      title={b.is_pinned ? "Unpin" : "Pin"}
                    >
                      {b.is_pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Create Batch Modal */}
        <Modal open={showCreateBatch} onClose={() => setShowCreateBatch(false)}>
          <ModalHeader title="Create New Batch" onClose={() => setShowCreateBatch(false)} />
          <ModalBody>
            <FormField label="Batch Name" value={newBatch.name} onChange={e => setNewBatch({...newBatch, name: e.target.value})} placeholder="e.g. React Deep Dive 2024" />
            <FormTextarea label="Description" value={newBatch.description} onChange={e => setNewBatch({...newBatch, description: e.target.value})} placeholder="Briefly describe the batch's focus..." className="h-24" />
            <div className="grid grid-cols-2 gap-4">
              <FormSelect label="Visibility" value={newBatch.type} onChange={e => setNewBatch({...newBatch, type: e.target.value})}>
                <option value="public">Public</option>
                <option value="private">Private</option>
                <option value="hidden">Hidden</option>
              </FormSelect>
              <div className="flex flex-col justify-end pb-3">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div
                    className={`w-5 h-5 rounded border transition-all flex items-center justify-center ${newBatch.is_paid ? 'bg-accent-400 border-accent-400' : 'border-hairline-strong group-hover:border-accent-400/50'}`}
                    onClick={() => setNewBatch({...newBatch, is_paid: !newBatch.is_paid})}
                  >
                    {newBatch.is_paid && <Check className="w-3 h-3 text-white font-bold" />}
                  </div>
                  <span className="text-sm font-medium text-muted">Paid Access</span>
                </label>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <button onClick={() => setShowCreateBatch(false)} className="flex-1 py-3 text-sm font-bold text-dim hover:text-primary transition-colors">Cancel</button>
            <button onClick={() => createBatchMutation.mutate(newBatch)} disabled={!newBatch.name} className="btn-primary flex-2 px-8 py-3 rounded-xl font-bold transition-all disabled:opacity-50">Create Batch</button>
          </ModalFooter>
        </Modal>

        {/* Create User Modal */}
        <Modal open={showCreateUser} onClose={() => setShowCreateUser(false)}>
          <ModalHeader title="Create New User" onClose={() => setShowCreateUser(false)} />
          <ModalBody>
            <FormField label="Username" type="text" value={newUser.username} onChange={(e) => setNewUser({...newUser, username: e.target.value})} placeholder="johndoe" />
            <FormField label="Email Address" type="email" value={newUser.email} onChange={(e) => setNewUser({...newUser, email: e.target.value})} placeholder="john@example.com" />
            <FormField label="Phone Number" type="tel" value={newUser.phone} onChange={(e) => setNewUser({...newUser, phone: e.target.value})} placeholder="+91 98765 43210" />
            <FormField label="Initial Password" type="text" value={newUser.password} onChange={(e) => setNewUser({...newUser, password: e.target.value})} placeholder="Set password..." className="font-mono" />
            <FormSelect label="Initial Role" value={newUser.role} onChange={(e) => setNewUser({...newUser, role: e.target.value})}>
              <option value="learner">Learner (Student)</option>
              <option value="mentor">Mentor (Instructor)</option>
              <option value="admin">Administrator</option>
            </FormSelect>
            <button
              onClick={() => createUserMutation.mutate(newUser)}
              disabled={createUserMutation.isPending || !newUser.username || !newUser.email || !newUser.phone || !newUser.password}
              className="btn-primary w-full py-3.5 rounded-xl font-bold transition-all disabled:opacity-50 mt-2"
            >
              {createUserMutation.isPending ? "Creating User..." : "Create User Account"}
            </button>
          </ModalBody>
        </Modal>

        {/* Manage Members Modal */}
        <Modal open={!!showManageMembers} onClose={() => setShowManageMembers(null)} size="xl">
          <ModalHeader title="Manage Batch Members" onClose={() => setShowManageMembers(null)} />
          <div className="p-6 border-b border-hairline bg-surface-100/30 shrink-0">
            <div className="flex gap-3">
              <div className="flex-1">
                <FormSelect label="Select User" value={newMember.userId} onChange={e => setNewMember({...newMember, userId: e.target.value})}>
                  <option value="" disabled>Select a user to add...</option>
                  {usersData?.users?.map((u: any) => (
                    <option key={u.id} value={u.id}>{u.username} ({u.email})</option>
                  ))}
                </FormSelect>
              </div>
              <div className="w-32">
                <FormSelect label="Role" value={newMember.roleInBatch} onChange={e => setNewMember({...newMember, roleInBatch: e.target.value})}>
                  <option value="member">Learner</option>
                  <option value="mentor">Mentor</option>
                  <option value="moderator">Moderator</option>
                </FormSelect>
              </div>
              <div className="flex items-end">
                <button onClick={() => showManageMembers && addMemberMutation.mutate({ batchId: showManageMembers, userId: newMember.userId, role: newMember.roleInBatch })} className="btn-primary px-4 py-2.5 rounded-lg font-bold transition-all">Add</button>
              </div>
            </div>
          </div>
          <div className="max-h-[40vh] overflow-y-auto p-2">
            <table className="w-full text-sm">
              <thead><tr className="text-dim text-[10px] uppercase tracking-widest"><th className="px-4 py-2 text-left">Member</th><th className="px-4 py-2 text-left">Role</th><th className="px-4 py-2 text-right">Actions</th></tr></thead>
              <tbody>
                {membersData?.map((m: any) => (
                  <tr key={m.id} className="hover:bg-surface-100/40 transition-colors group">
                    <td className="px-4 py-3"><div className="flex items-center gap-2"><span className="avatar avatar-indigo w-7 h-7 text-[10px]">{m.user.username[0].toUpperCase()}</span><div><p className="font-medium text-primary">{m.user.username}</p><p className="text-[10px] text-faint font-mono">{m.user_id.slice(0, 8)}</p></div></div></td>
                    <td className="px-4 py-3"><span className={`chip text-[10px] ${m.role_in_batch === 'mentor' ? 'chip-mentor' : m.role_in_batch === 'moderator' ? 'chip-mod' : 'chip-learner'}`}>{m.role_in_batch === 'member' ? 'learner' : m.role_in_batch}</span></td>
                    <td className="px-4 py-3 text-right"><button onClick={() => showManageMembers && removeMemberMutation.mutate({ batchId: showManageMembers, userId: m.user_id })} className="p-1.5 text-faint hover:text-red-400 transition-colors" aria-label="Remove member"><Trash2 className="w-4 h-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>

        {tab === "logs" && (
          <div className="card overflow-hidden">
             <div className="px-6 py-4 border-b border-hairline bg-surface-100/30 flex justify-between items-center"><h3 className="t-overline text-dim">Administrative Audit Logs</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead><tr className="text-dim text-[10px] uppercase tracking-widest border-b border-hairline"><th className="px-6 py-3 text-left">Administrator</th><th className="px-6 py-3 text-left">Action Performed</th><th className="px-6 py-3 text-left">Target Object</th><th className="px-6 py-3 text-right">Timestamp</th></tr></thead>
                <tbody className="divide-y divide-hairline">
                  {logsData?.logs?.map((l: any) => (
                    <tr key={l.id} className="hover:bg-surface-100/40">
                      <td className="px-6 py-4 flex items-center gap-2"><span className="avatar avatar-muted w-6 h-6 text-[10px]">{l.actor?.username[0]}</span><span className="text-primary font-medium">{l.actor?.username}</span></td>
                      <td className="px-6 py-4"><span className="chip chip-accent text-[10px]">{l.action_type.replace(/_/g, ' ')}</span></td>
                      <td className="px-6 py-4"><span className="text-muted text-xs font-mono bg-surface-100 px-2 py-0.5 rounded border border-hairline">{l.target_id || "System"}</span></td>
                      <td className="px-6 py-4 text-right text-dim text-xs font-medium">{new Date(l.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "modqueue" && (
          <div className="space-y-4">
             <div className="flex items-center gap-3 mb-6"><AlertTriangle className="w-6 h-6 text-amber-500" /><div><h2 className="text-xl font-bold text-primary">Moderation Queue</h2><p className="text-dim text-sm">Review reported messages and maintain community standards.</p></div></div>
            {modData?.map((q: any) => (
              <div key={q.id} className="card card-hover p-6 flex items-start justify-between group">
                <div className="space-y-3 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tighter ${q.priority === "high" ? "bg-red-500 text-white" : q.priority === "medium" ? "bg-amber-500 text-black" : "bg-surface-200 text-dim"}`}>{q.priority} Priority</span>
                    <span className="text-dim text-xs font-medium">Reported in <span className="text-accent-300">#{q.channel?.name}</span> ({q.channel?.batch?.name})</span>
                  </div>
                  <div className="bg-surface-100 rounded-xl p-4 border border-hairline italic text-muted text-sm">"{q.message?.content}"</div>
                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-red-500/20 text-red-400 flex items-center justify-center text-[8px] font-bold">S</div><span className="text-dim">Sender: <span className="text-primary font-bold">{q.message?.sender?.username}</span></span></div>
                    <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-accent-100 text-accent-300 flex items-center justify-center text-[8px] font-bold">R</div><span className="text-dim">Reporter: <span className="text-primary font-bold">{q.reporter?.username}</span></span></div>
                  </div>
                </div>
                {q.status === "pending" && (
                  <div className="flex flex-col gap-2 shrink-0 ml-6">
                    <button onClick={() => resolveMutation.mutate({ id: q.id, status: "resolved" })} className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl hover:bg-emerald-500/20 border border-emerald-500/20 transition-all" title="Mark as Resolved" aria-label="Mark as resolved"><Check className="w-5 h-5" /></button>
                    <button onClick={() => resolveMutation.mutate({ id: q.id, status: "escalated" })} className="p-3 bg-red-500/10 text-red-400 rounded-xl hover:bg-red-500/20 border border-red-500/20 transition-all" title="Escalate Report" aria-label="Escalate report"><AlertTriangle className="w-5 h-5" /></button>
                  </div>
                )}
              </div>
            ))}
            {(!modData || modData.length === 0) && (
              <div className="flex flex-col items-center justify-center py-20 bg-surface-100/30 rounded-3xl border border-dashed border-hairline-strong">
                <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4"><Check className="w-8 h-8 text-emerald-500" /></div>
                <h3 className="text-lg font-bold text-muted">Queue is Empty</h3>
                <p className="text-dim text-sm">Great job! All reports have been handled.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Broadcast Modal */}
      <Modal open={showBroadcast} onClose={() => setShowBroadcast(false)} size="lg">
        <ModalHeader title="Broadcast Announcement" onClose={() => setShowBroadcast(false)} icon={<Megaphone className="w-5 h-5 text-accent-300" />} />
        <ModalBody>
          <FormTextarea
            label="Message"
            value={broadcastContent}
            onChange={(e) => setBroadcastContent(e.target.value)}
            rows={4}
            placeholder="Type your announcement here..."
          />

          {/* Target picker */}
          <div className="mt-4">
            <p className="t-overline text-dim mb-2">Send to</p>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => { setBroadcastAll(true); setBroadcastTargets(new Set()); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${broadcastAll ? "bg-accent-100 text-accent-300 border-accent-200" : "bg-surface-100 text-dim border-hairline hover:text-primary"}`}
              >
                All channels
              </button>
              <button
                onClick={() => setBroadcastAll(false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${!broadcastAll ? "bg-accent-100 text-accent-300 border-accent-200" : "bg-surface-100 text-dim border-hairline hover:text-primary"}`}
              >
                Specific channels
              </button>
            </div>

            {!broadcastAll && (
              <div className="card p-3 max-h-64 overflow-y-auto custom-scrollbar">
                {allBatchesData?.map((b: any) => (
                  <BroadcastBatchPicker
                    key={b.id}
                    batch={b}
                    selected={broadcastTargets}
                    onToggle={(channelId) => {
                      const next = new Set(broadcastTargets);
                      if (next.has(channelId)) next.delete(channelId);
                      else next.add(channelId);
                      setBroadcastTargets(next);
                    }}
                  />
                ))}
                {(!allBatchesData || allBatchesData.length === 0) && (
                  <p className="text-dim text-xs text-center py-4">No batches available</p>
                )}
                <div className="border-t border-hairline mt-2 pt-2 text-[11px] text-dim flex items-center justify-between">
                  <span>{broadcastTargets.size} channel(s) selected</span>
                  <button
                    onClick={() => setBroadcastTargets(new Set())}
                    disabled={broadcastTargets.size === 0}
                    className="text-accent-300 hover:underline disabled:opacity-40"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>
        </ModalBody>
        <ModalFooter className="justify-end">
          <button onClick={() => setShowBroadcast(false)} className="px-4 py-2 text-sm text-dim hover:text-primary transition-colors">Cancel</button>
          <button
            disabled={!broadcastContent.trim() || (!broadcastAll && broadcastTargets.size === 0)}
            onClick={async () => {
              try {
                const body: any = { content: broadcastContent.trim() };
                if (!broadcastAll) body.channelIds = Array.from(broadcastTargets);
                const res = await api.post("/admin/broadcast", body);
                toast.success(`Broadcast sent to ${res.data.channelCount} channels!`);
                setBroadcastContent("");
                setBroadcastTargets(new Set());
                setBroadcastAll(true);
                setShowBroadcast(false);
              } catch (err) { toast.error("Failed to send broadcast"); }
            }}
            className="btn-primary px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Send broadcast
          </button>
        </ModalFooter>
      </Modal>
    </PageShell>
  );
}



/** Per-batch expandable channel picker for the broadcast modal. */
function BroadcastBatchPicker({
  batch,
  selected,
  onToggle,
}: {
  batch: any;
  selected: Set<string>;
  onToggle: (channelId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { data: channels } = useQuery({
    queryKey: ["broadcast-channels", batch.id],
    queryFn: async () => (await api.get(`/batches/${batch.id}/channels`)).data,
    enabled: expanded,
  });

  const selectedInBatch = channels?.filter((c: any) => selected.has(c.id)).length || 0;

  return (
    <div className="border-b border-hairline last:border-0 py-1.5">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-2 py-1 hover:bg-surface-100 rounded text-left"
      >
        <span className="text-dim text-xs w-3">{expanded ? "−" : "+"}</span>
        <Shield className="w-3.5 h-3.5 text-dim" />
        <span className="flex-1 text-sm text-primary truncate">{batch.name}</span>
        {selectedInBatch > 0 && (
          <span className="chip chip-accent text-[9px]">{selectedInBatch}</span>
        )}
      </button>
      {expanded && (
        <div className="ml-7 mt-1 space-y-0.5">
          {channels?.length === 0 && <p className="text-[11px] text-faint px-2">No channels</p>}
          {channels?.map((c: any) => (
            <label key={c.id} className="flex items-center gap-2 px-2 py-1 hover:bg-surface-100 rounded cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => onToggle(c.id)}
                className="rounded"
              />
              <Hash className="w-3 h-3 text-dim" />
              <span className="flex-1 truncate text-muted">{c.name}</span>
              {c.is_pinned && <Pin className="w-2.5 h-2.5 text-accent-400" />}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
