import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../api/client";
import { useAuthStore } from "../store/authStore";
import { TopBar, Ic } from "../components/AppShell";
import { toast } from "react-hot-toast";

export default function BatchPage() {
  const { id: batchId } = useParams<{ id: string }>();
  const user = useAuthStore(s => s.user);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const isAdmin = user?.role === "admin";
  const canManage = isAdmin || user?.role === "batch_moderator";

  const { data: batch } = useQuery({ queryKey:["batch",batchId], queryFn: async () => (await api.get(`/batches/${batchId}`)).data, enabled:!!batchId });
  const { data: channels, isLoading } = useQuery({ queryKey:["channels",batchId], queryFn: async () => (await api.get(`/batches/${batchId}/channels`)).data, enabled:!!batchId });
  const { data: members } = useQuery({ queryKey:["members",batchId], queryFn: async () => (await api.get(`/batches/${batchId}/members`)).data, enabled:!!batchId });

  const createChannel = useMutation({ mutationFn: (name:string) => api.post(`/batches/${batchId}/channels`, { name }), onSuccess: () => { qc.invalidateQueries({ queryKey:["channels",batchId] }); setCreating(false); setNewName(""); toast.success("Channel created"); } });
  const renameChannel = useMutation({ mutationFn: ({ id,name }:{ id:string; name:string }) => api.patch(`/channels/${id}`, { name }), onSuccess: () => { qc.invalidateQueries({ queryKey:["channels",batchId] }); setRenamingId(null); toast.success("Renamed"); } });
  const deleteChannel = useMutation({ mutationFn: (id:string) => api.delete(`/channels/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey:["channels",batchId] }); toast.success("Deleted"); } });
  const togglePin = useMutation({ mutationFn: (id:string) => api.post(`/channels/${id}/pin`), onSuccess: () => qc.invalidateQueries({ queryKey:["channels",batchId] }) });

  return (
    <>
      <TopBar title={batch?.name || "Batch"} subtitle={`${channels?.length || 0} channels · ${members?.length || 0} members`} />
      <div style={{ flex:1, overflowY:'auto', padding:'32px' }}>
        <div style={{ maxWidth:900, margin:'0 auto' }}>

          {/* Batch hero */}
          <div style={{ position:'relative', overflow:'hidden', borderRadius:12, backgroundColor:'rgb(10,13,18)', border:'1px solid rgba(255,255,255,0.08)', padding:24, marginBottom:32 }}>
            <div style={{ position:'absolute', right:-40, top:-80, width:160, height:160, borderRadius:'50%', background:'linear-gradient(rgb(62,56,224),rgb(0,219,232))', opacity:0.12, filter:'blur(40px)', pointerEvents:'none' }} />
            <h2 style={{ fontSize:22, fontWeight:700, color:'#e0e3e6', marginBottom:4, position:'relative' }}>{batch?.name}</h2>
            {batch?.description && <p style={{ fontSize:14, color:'#94a3b8', marginBottom:16, position:'relative' }}>{batch.description}</p>}
            <div style={{ display:'flex', gap:20, fontSize:12, color:'#6c7793', position:'relative' }}>
              <span style={{ display:'flex', alignItems:'center', gap:5 }}><Ic.Users />{members?.length || 0} members</span>
              <span style={{ display:'flex', alignItems:'center', gap:5 }}><Ic.Hash />{channels?.length || 0} channels</span>
              <span style={{ display:'flex', alignItems:'center', gap:5 }}><div style={{ width:6, height:6, borderRadius:'50%', background:'rgb(53,221,61)', boxShadow:'0 0 5px rgba(53,221,61,0.5)' }} />Active</span>
            </div>
          </div>

          {/* Channels header */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <span style={{ fontSize:11, fontWeight:500, letterSpacing:'1.1px', color:'#94a3b8', textTransform:'uppercase' }}>CHANNELS</span>
            {canManage && (
              <button onClick={() => setCreating(v => !v)} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:6, border:'none', cursor:'pointer', fontFamily:'Poppins,Inter,sans-serif', background:'linear-gradient(rgb(59,130,255) 17%,rgb(0,219,232) 100%)', boxShadow:'0 0 10px rgba(59,130,255,0.3)', color:'#05070a', fontSize:12, fontWeight:600 }}>
                <Ic.Plus /> New channel
              </button>
            )}
          </div>

          {/* Inline create */}
          {creating && (
            <div style={{ borderRadius:10, border:'1px solid rgba(59,130,255,0.3)', background:'rgba(59,130,255,0.06)', padding:'8px 12px', marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:15, color:'rgba(148,163,184,0.5)', fontWeight:500 }}>#</span>
              <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key==='Enter' && newName.trim()) createChannel.mutate(newName.trim()); if (e.key==='Escape') { setCreating(false); setNewName(''); } }}
                placeholder="channel-name" style={{ flex:1, background:'none', border:'none', color:'#e0e3e6', fontSize:14, fontFamily:'Poppins,Inter,sans-serif', outline:'none' }} />
              <button onClick={() => newName.trim() && createChannel.mutate(newName.trim())} disabled={!newName.trim()} style={{ padding:'5px 14px', borderRadius:6, border:'none', background:'linear-gradient(rgb(59,130,255) 17%,rgb(0,219,232) 100%)', color:'#05070a', fontSize:12, fontWeight:600, fontFamily:'Poppins,Inter,sans-serif', cursor:'pointer', opacity: newName.trim() ? 1 : 0.5 }}>Create</button>
              <button onClick={() => { setCreating(false); setNewName(''); }} style={{ color:'#6c7793', fontSize:12, background:'none', border:'none', cursor:'pointer', fontFamily:'Poppins,Inter,sans-serif', padding:'4px 8px' }}>Cancel</button>
            </div>
          )}

          {/* Channel list */}
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {isLoading && <p style={{ fontSize:13, color:'#6c7793', padding:'8px 0' }}>Loading channels…</p>}
            {!isLoading && channels?.length === 0 && (
              <div style={{ borderRadius:12, backgroundColor:'rgb(10,13,18)', border:'1px solid rgba(255,255,255,0.08)', padding:'48px 0', textAlign:'center', color:'#6c7793', fontSize:14 }}>No channels yet.</div>
            )}
            {channels?.map((ch: any) => {
              const isRenaming = renamingId === ch.id;
              return (
                <div key={ch.id} style={{ borderRadius:12, backgroundColor:'rgb(10,13,18)', border:'1px solid rgba(255,255,255,0.08)', padding:'14px 18px', display:'flex', alignItems:'center', gap:12, cursor: isRenaming ? 'default' : 'pointer', transition:'all 0.14s' }}
                  onClick={() => !isRenaming && navigate(`/batch/${batchId}/channel/${ch.id}`)}
                  onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,0.15)'; (e.currentTarget as HTMLElement).style.background='rgb(13,17,24)';}}
                  onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,0.08)'; (e.currentTarget as HTMLElement).style.background='rgb(10,13,18)';}}>
                  <div style={{ width:32, height:32, borderRadius:8, backgroundColor:'rgb(5,7,10)', border:'1px solid rgba(255,255,255,0.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <span style={{ fontSize:14, color:'#94a3b8', fontWeight:500 }}>#</span>
                  </div>
                  {isRenaming ? (
                    <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      onKeyDown={e => { e.stopPropagation(); if (e.key==='Enter' && renameValue.trim()) renameChannel.mutate({ id:ch.id, name:renameValue.trim() }); if (e.key==='Escape') { setRenamingId(null); setRenameValue(''); } }}
                      style={{ flex:1, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, padding:'6px 12px', color:'#e0e3e6', fontSize:14, fontFamily:'Poppins,Inter,sans-serif', outline:'none' }} />
                  ) : (
                    <>
                      <span style={{ flex:1, fontSize:14, fontWeight:500, color:'#e0e3e6', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ch.name}</span>
                      {ch.is_pinned && <span style={{ display:'flex', color:'#afc6ff' }}><Ic.Pin /></span>}
                      <span style={{ fontSize:11, color:'#6c7793', display:'flex', alignItems:'center', gap:4, flexShrink:0 }}><Ic.Message />{ch._count?.messages || 0}</span>
                    </>
                  )}
                  {canManage && !isRenaming && (
                    <div style={{ display:'flex', gap:6 }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => { setRenamingId(ch.id); setRenameValue(ch.name); }} style={{ background:'none', border:'none', cursor:'pointer', color:'#6c7793', display:'flex', padding:4, transition:'color 0.14s' }} onMouseEnter={e=>(e.currentTarget as HTMLElement).style.color='#afc6ff'} onMouseLeave={e=>(e.currentTarget as HTMLElement).style.color='#6c7793'}><Ic.Settings /></button>
                      {isAdmin && (
                        <button onClick={() => { if (confirm(`Delete "${ch.name}"?`)) deleteChannel.mutate(ch.id); }} style={{ background:'none', border:'none', cursor:'pointer', color:'#6c7793', display:'flex', padding:4, transition:'color 0.14s' }} onMouseEnter={e=>(e.currentTarget as HTMLElement).style.color='rgb(255,99,93)'} onMouseLeave={e=>(e.currentTarget as HTMLElement).style.color='#6c7793'}><Ic.X /></button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Access warning */}
          {batch && !batch.hasAccess && (
            <div style={{ border:'1px solid rgba(255,99,93,0.2)', borderRadius:12, padding:16, marginTop:24, textAlign:'center', background:'rgba(255,99,93,0.05)', color:'rgb(255,99,93)', fontSize:14 }}>
              You don't have access to this batch.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
