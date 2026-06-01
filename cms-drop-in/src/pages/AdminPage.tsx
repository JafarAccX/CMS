import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../api/client";
import { TopBar, StatCard, Ic } from "../components/AppShell";
import { toast } from "react-hot-toast";

type Tab = "users" | "batches" | "logs" | "modqueue";

const s = {
  card: { borderRadius:12, backgroundColor:'rgb(10,13,18)', border:'1px solid rgba(255,255,255,0.08)' } as React.CSSProperties,
  input: { width:'100%', height:40, borderRadius:6, backgroundColor:'rgb(10,13,18)', border:'1px solid rgba(255,255,255,0.1)', padding:'0 12px', fontSize:13, color:'#e0e3e6', fontFamily:'Poppins,Inter,sans-serif' } as React.CSSProperties,
  btnPrimary: { display:'flex', alignItems:'center', gap:6, padding:'7px 16px', borderRadius:6, border:'none', cursor:'pointer', fontFamily:'Poppins,Inter,sans-serif', background:'linear-gradient(rgb(59,130,255) 17%,rgb(0,219,232) 100%)', boxShadow:'0 0 10px rgba(59,130,255,0.3)', color:'#05070a', fontSize:13, fontWeight:600 } as React.CSSProperties,
  controlsRow: { borderRadius:12, backgroundColor:'rgba(255,255,255,0.02)', border:'1px solid rgb(30,41,59)', padding:12, display:'flex', alignItems:'center', justifyContent:'space-between' } as React.CSSProperties,
  tabs: { display:'flex', alignItems:'center', borderRadius:8, backgroundColor:'rgb(5,7,10)', border:'1px solid rgb(30,41,59)', padding:6, gap:2 } as React.CSSProperties,
  th: { padding:'14px 20px', textAlign:'left' as const, fontSize:11, fontWeight:600, letterSpacing:'0.6px', color:'#6c7793', textTransform:'uppercase' as const },
  td: { padding:'16px 20px', verticalAlign:'top' as const },
  divider: { height:1, background:'rgb(22,30,42)' },
};

// Avatars by role
const avatarColors: Record<string, string> = {
  admin: 'linear-gradient(140deg,#ff9d8c,#f56b56 60%,#c9442f)',
  mentor: 'linear-gradient(140deg,#7fe6f0,#2bb8d4 60%,#0e7490)',
  learner: 'linear-gradient(140deg,#8aa3ff,#4f6bff 60%,#3940cc)',
};

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("users");
  const [userFilter, setUserFilter] = useState("all");
  const [userSearch, setUserSearch] = useState("");
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showCreateBatch, setShowCreateBatch] = useState(false);
  const [newUser, setNewUser] = useState({ username:'', email:'', phone:'', password:'', role:'learner' });
  const [newBatch, setNewBatch] = useState({ name:'', description:'', type:'public', is_paid:false });

  const qc = useQueryClient();
  const { data: usersData } = useQuery({ queryKey:["admin-users"], queryFn: async () => (await api.get("/admin/users")).data });
  const { data: statsData } = useQuery({ queryKey:["admin-stats"], queryFn: async () => (await api.get("/admin/stats")).data });
  const { data: allBatchesData } = useQuery({ queryKey:["batches"], queryFn: async () => (await api.get("/batches")).data });
  const { data: logsData } = useQuery({ queryKey:["admin-logs"], queryFn: async () => (await api.get("/admin/logs")).data, enabled: tab === "logs" });
  const { data: modData } = useQuery({ queryKey:["mod-queue"], queryFn: async () => (await api.get("/mod-queue")).data, enabled: tab === "modqueue" });

  const banMutation = useMutation({ mutationFn: (id: string) => api.patch(`/admin/users/${id}/ban`), onSuccess: () => qc.invalidateQueries({ queryKey:["admin-users"] }) });
  const roleMutation = useMutation({ mutationFn: ({ id, role }: { id:string; role:string }) => api.patch(`/admin/users/${id}/role`, { role }), onSuccess: () => { qc.invalidateQueries({ queryKey:["admin-users"] }); toast.success("Role updated"); } });
  const createUserMutation = useMutation({ mutationFn: (data: typeof newUser) => api.post("/admin/users", data), onSuccess: () => { qc.invalidateQueries({ queryKey:["admin-users"] }); qc.invalidateQueries({ queryKey:["admin-stats"] }); setShowCreateUser(false); setNewUser({ username:'',email:'',phone:'',password:'',role:'learner' }); toast.success("User created"); } });
  const createBatchMutation = useMutation({ mutationFn: (data: typeof newBatch) => api.post("/batches", data), onSuccess: () => { qc.invalidateQueries({ queryKey:["batches"] }); setShowCreateBatch(false); setNewBatch({ name:'',description:'',type:'public',is_paid:false }); toast.success("Batch created"); } });
  const resolveMutation = useMutation({ mutationFn: ({ id, status }: { id:string; status:string }) => api.patch(`/mod-queue/${id}`, { status }), onSuccess: () => qc.invalidateQueries({ queryKey:["mod-queue"] }) });

  const tabs: { key:Tab; label:string; badge?:number }[] = [
    { key:'users', label:'Users' }, { key:'batches', label:'Batches' }, { key:'logs', label:'Audit Logs' },
    { key:'modqueue', label:'Mod Queue', badge: modData?.length },
  ];

  const filteredUsers = usersData?.users?.filter((u: any) => {
    const mf = userFilter === 'all' || u.role === userFilter;
    const ms = !userSearch || u.username.toLowerCase().includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase());
    return mf && ms;
  });

  return (
    <>
      <TopBar title="Dashboard" />
      <div style={{ flex:1, overflowY:'auto', padding:'32px 32px 48px' }}>
        {/* Stats */}
        <div style={{ fontSize:11, fontWeight:500, letterSpacing:'1.1px', color:'#94a3b8', textTransform:'uppercase', marginBottom:16 }}>ADMIN INSIGHTS</div>
        <div style={{ display:'flex', gap:16, marginBottom:32 }}>
          {[
            { icon:<Ic.Users />, value: statsData?.totalUsers ?? '—', label:'Total Users', delta:'12% vs last 30 days', iconBg:'rgba(89,149,232,0.2)' },
            { icon:<Ic.Shield />, value: statsData?.totalMentors ?? '—', label:'Total Mentors', delta:'8% vs last 30 days', iconBg:'rgba(52,211,153,0.2)' },
            { icon:<Ic.Users />, value: statsData?.totalLearners ?? '—', label:'Total Learners', delta:'18% vs last 30 days', iconBg:'rgba(20,184,166,0.2)' },
            { icon:<Ic.Shield />, value: statsData?.totalBatches ?? '—', label:'Active Batches', delta:'5% vs last 30 days', iconBg:'rgba(139,92,246,0.2)' },
          ].map((st, i) => <StatCard key={i} {...st} />)}
        </div>

        {/* Controls row */}
        <div style={s.controlsRow}>
          <div style={s.tabs}>
            {tabs.map(({ key, label, badge }) => (
              <button key={key} onClick={() => setTab(key)} style={{ padding:'6px 16px', borderRadius:4, border:'none', cursor:'pointer', fontFamily:'Poppins,Inter,sans-serif', fontSize:13, fontWeight:700, background: tab===key ? 'rgb(255,255,255)' : 'transparent', color: tab===key ? 'rgb(5,7,10)' : 'rgb(194,198,214)', transition:'all 0.15s' }}>
                {label}{badge != null && badge > 0 && <span style={{ marginLeft:6, padding:'1px 6px', borderRadius:4, fontSize:10, fontWeight:700, background: tab===key ? 'rgba(0,0,0,0.08)' : 'rgba(175,198,255,0.2)', color: tab===key ? 'rgb(5,7,10)' : 'rgb(175,198,255)' }}>{badge}</span>}
              </button>
            ))}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {tab === 'users' && (
              <div style={{ display:'flex', alignItems:'center', gap:2, borderRadius:6, background:'rgb(5,7,10)', border:'1px solid rgb(30,41,59)', padding:4 }}>
                {['all','admin','mentor','learner'].map(f => (
                  <button key={f} onClick={() => setUserFilter(f)} style={{ padding:'4px 10px', borderRadius:4, border:'none', cursor:'pointer', fontFamily:'Poppins,Inter,sans-serif', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.04em', background: userFilter===f ? 'rgba(59,130,255,0.15)' : 'transparent', color: userFilter===f ? '#afc6ff' : '#c2c6d6', transition:'all 0.15s' }}>{f}</button>
                ))}
              </div>
            )}
            <div style={{ position:'relative' }}>
              <input value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="Search users, emails…" style={{ ...s.input, width:180, paddingLeft:32, height:34, fontSize:12 }} />
              <span style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#94a3b8', display:'flex', pointerEvents:'none' }}><Ic.Search /></span>
            </div>
            {tab === 'users' && <button onClick={() => setShowCreateUser(true)} style={s.btnPrimary}><Ic.Plus /> New User</button>}
            {tab === 'batches' && <button onClick={() => setShowCreateBatch(true)} style={s.btnPrimary}><Ic.Plus /> New Batch</button>}
          </div>
        </div>

        {/* Users tab */}
        {tab === 'users' && (
          <div style={{ ...s.card, borderRadius:'0 0 12px 12px', borderTop:'none', overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ borderBottom:'1px solid rgb(30,41,59)' }}>
                  {['User Profile','Global Role','Assigned Batches','Account Status','Actions'].map(h => <th key={h} style={s.th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {filteredUsers?.map((u: any, idx: number) => (
                  <tr key={u.id} style={{ borderTop: idx > 0 ? '1px solid rgb(22,30,42)' : undefined, transition:'background 0.12s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                    <td style={s.td}>
                      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                        <div style={{ position:'relative', flexShrink:0 }}>
                          <div style={{ width:36, height:36, borderRadius:9, background: avatarColors[u.role] || avatarColors.learner, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, color:'#fff' }}>{u.username[0].toUpperCase()}</div>
                          <div style={{ position:'absolute', bottom:-1, right:-1, width:10, height:10, borderRadius:'50%', background: u.is_banned ? 'rgb(239,68,68)' : 'rgb(53,221,61)', border:'2px solid rgb(10,13,18)', boxShadow: u.is_banned ? '0 0 5px rgba(239,68,68,0.5)' : '0 0 5px rgba(53,221,61,0.5)' }} />
                        </div>
                        <div>
                          <div style={{ fontSize:14, fontWeight:600, color:'#e0e3e6' }}>{u.username}</div>
                          <div style={{ fontSize:11, color:'#6c7793', marginTop:2 }}>{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={s.td}>
                      <div style={{ position:'relative', display:'inline-flex' }}>
                        <select value={u.role} onChange={e => roleMutation.mutate({ id:u.id, role:e.target.value })} style={{ appearance:'none', WebkitAppearance:'none', paddingRight:24, paddingLeft:10, height:30, borderRadius:6, border:'1px solid rgb(30,41,59)', background:'rgb(13,17,24)', color:'#e0e3e6', fontSize:12, fontFamily:'Poppins,Inter,sans-serif', cursor:'pointer' }}>
                          <option value="learner">Learner</option><option value="mentor">Mentor</option><option value="admin">Admin</option>
                        </select>
                        <span style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', color:'#6c7793', pointerEvents:'none', fontSize:10 }}>▾</span>
                      </div>
                    </td>
                    <td style={{ ...s.td, maxWidth:200 }}>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                        {u.memberships?.length > 0
                          ? u.memberships.slice(0,3).map((m: any, i: number) => <span key={i} style={{ fontSize:11, padding:'2px 8px', borderRadius:4, background:'rgba(59,130,255,0.14)', color:'#94b4ff', border:'1px solid rgba(59,130,255,0.18)' }}>{m.batch.name}</span>)
                          : <span style={{ fontSize:11, color:'#424c64', fontStyle:'italic' }}>No batches</span>}
                      </div>
                    </td>
                    <td style={s.td}>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <div style={{ width:7, height:7, borderRadius:'50%', background: u.is_banned ? 'rgb(239,68,68)' : 'rgb(53,221,61)', boxShadow: u.is_banned ? '0 0 6px rgba(239,68,68,0.5)' : '0 0 6px rgba(53,221,61,0.5)' }} />
                        <div>
                          <div style={{ fontSize:13, fontWeight:500, color: u.is_banned ? 'rgb(255,99,93)' : 'rgb(53,221,61)' }}>{u.is_banned ? 'Suspended' : 'Active'}</div>
                          <div style={{ fontSize:11, color:'#6c7793', marginTop:1 }}>Joined recently</div>
                        </div>
                      </div>
                    </td>
                    <td style={s.td}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <button onClick={() => banMutation.mutate(u.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#6c7793', display:'flex', transition:'color 0.14s' }} onMouseEnter={e=>(e.currentTarget as HTMLElement).style.color='rgb(255,99,93)'} onMouseLeave={e=>(e.currentTarget as HTMLElement).style.color='#6c7793'}><Ic.Users /></button>
                        <button style={{ background:'none', border:'none', cursor:'pointer', color:'#6c7793', display:'flex', transition:'color 0.14s' }} onMouseEnter={e=>(e.currentTarget as HTMLElement).style.color='#e0e3e6'} onMouseLeave={e=>(e.currentTarget as HTMLElement).style.color='#6c7793'}><Ic.Settings /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding:'14px 20px', borderTop:'1px solid rgb(30,41,59)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:12, color:'#94a3b8' }}>Showing {filteredUsers?.length ?? 0} of {usersData?.users?.length ?? 0} users</span>
              <div style={{ display:'flex', gap:4 }}>
                {['‹','1','2','3','…','›'].map((p,i) => (
                  <button key={i} style={{ width:32, height:32, borderRadius:6, border:'1px solid rgb(30,41,59)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:500, fontFamily:'Poppins,Inter,sans-serif', background: p==='1' ? 'linear-gradient(rgb(59,130,255) 17%,rgb(0,219,232) 100%)' : 'rgb(10,13,18)', color: p==='1' ? '#fff' : '#94a3b8', cursor:'pointer' }}>{p}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Batches tab */}
        {tab === 'batches' && (
          <div style={{ ...s.card, borderRadius:'0 0 12px 12px', borderTop:'none', padding:24 }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16 }}>
              {allBatchesData?.map((b: any) => (
                <div key={b.id} style={{ borderRadius:12, backgroundColor:'rgb(10,12,17)', border:'1px solid rgba(255,255,255,0.08)', padding:20, transition:'all 0.14s', cursor:'pointer' }} onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,0.15)';}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,0.08)';}}>
                  <div style={{ fontSize:15, fontWeight:600, color:'#e0e3e6', marginBottom:4 }}>{b.name}</div>
                  <div style={{ fontSize:12, color:'#6c7793', lineHeight:'18px', marginBottom:12 }}>{b.description || 'No description'}</div>
                  <div style={{ height:1, background:'rgba(255,255,255,0.06)', marginBottom:12 }} />
                  <div style={{ display:'flex', gap:16, fontSize:12, color:'#6c7793' }}>
                    <span style={{ display:'flex', alignItems:'center', gap:4 }}><Ic.Hash />{b._count?.channels || 0}</span>
                    <span style={{ display:'flex', alignItems:'center', gap:4 }}><Ic.Users />{b._count?.memberships || 0}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Logs tab */}
        {tab === 'logs' && (
          <div style={{ ...s.card, borderRadius:'0 0 12px 12px', borderTop:'none', overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ borderBottom:'1px solid rgb(30,41,59)' }}>
                  {['Administrator','Action','Target','Timestamp'].map(h => <th key={h} style={s.th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {logsData?.logs?.map((l: any) => (
                  <tr key={l.id} style={{ borderTop:'1px solid rgb(22,30,42)' }} onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.02)'} onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                    <td style={s.td}><div style={{ display:'flex', alignItems:'center', gap:8 }}><div style={{ width:24, height:24, borderRadius:6, background:'linear-gradient(140deg,#4a5269,#2c3346)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#6c7793' }}>{l.actor?.username?.[0]}</div><span style={{ fontSize:13, fontWeight:500, color:'#e0e3e6' }}>{l.actor?.username}</span></div></td>
                    <td style={s.td}><span style={{ fontSize:10, padding:'3px 8px', borderRadius:4, background:'rgba(59,130,255,0.14)', color:'#afc6ff', border:'1px solid rgba(59,130,255,0.18)', fontWeight:600 }}>{l.action_type?.replace(/_/g,' ')}</span></td>
                    <td style={s.td}><span style={{ fontSize:11, fontFamily:'JetBrains Mono,monospace', color:'#94a3b8', background:'rgba(255,255,255,0.04)', padding:'2px 8px', borderRadius:4, border:'1px solid rgba(255,255,255,0.06)' }}>{l.target_id || 'System'}</span></td>
                    <td style={s.td}><span style={{ fontSize:12, color:'#6c7793' }}>{new Date(l.created_at).toLocaleString()}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Mod queue tab */}
        {tab === 'modqueue' && (
          <div style={{ ...s.card, borderRadius:'0 0 12px 12px', borderTop:'none', padding:24 }}>
            {modData?.map((q: any) => (
              <div key={q.id} style={{ ...s.card, padding:20, marginBottom:12, display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                    <span style={{ padding:'2px 8px', borderRadius:4, fontSize:10, fontWeight:700, textTransform:'uppercase', background: q.priority==='high' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.12)', color: q.priority==='high' ? '#fca5a5' : '#fbbf24', border:`1px solid ${q.priority==='high' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}` }}>{q.priority} Priority</span>
                    <span style={{ fontSize:11, color:'#6c7793' }}>in <span style={{ color:'#afc6ff' }}>#{q.channel?.name}</span></span>
                  </div>
                  <div style={{ borderRadius:10, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', padding:'12px 16px', fontSize:14, color:'#94a3b8', fontStyle:'italic', marginBottom:8, lineHeight:1.6 }}>"{q.message?.content}"</div>
                  <div style={{ display:'flex', gap:16, fontSize:12, color:'#6c7793' }}>
                    <span>Sender: <strong style={{ color:'#e0e3e6' }}>{q.message?.sender?.username}</strong></span>
                    <span>Reporter: <strong style={{ color:'#e0e3e6' }}>{q.reporter?.username}</strong></span>
                  </div>
                </div>
                {q.status === 'pending' && (
                  <div style={{ display:'flex', flexDirection:'column', gap:8, marginLeft:16, flexShrink:0 }}>
                    <button onClick={() => resolveMutation.mutate({ id:q.id, status:'resolved' })} style={{ width:40, height:40, borderRadius:10, border:'1px solid rgba(53,221,61,0.2)', background:'rgba(53,221,61,0.08)', color:'rgb(53,221,61)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:16 }}>✓</button>
                    <button onClick={() => resolveMutation.mutate({ id:q.id, status:'escalated' })} style={{ width:40, height:40, borderRadius:10, border:'1px solid rgba(255,99,93,0.2)', background:'rgba(255,99,93,0.08)', color:'rgb(255,99,93)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:14 }}>⚠</button>
                  </div>
                )}
              </div>
            ))}
            {(!modData || modData.length === 0) && (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'60px 0', color:'#6c7793' }}>
                <div style={{ width:48, height:48, borderRadius:'50%', background:'rgba(53,221,61,0.08)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:12, fontSize:20, color:'rgb(53,221,61)' }}>✓</div>
                <span style={{ fontSize:15, fontWeight:700, color:'#94a3b8' }}>Queue is Empty</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create User modal */}
      {showCreateUser && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }} onClick={() => setShowCreateUser(false)}>
          <div style={{ background:'linear-gradient(rgba(78,249,240,0.05),rgba(255,255,255,0.05))', border:'1px solid rgb(30,41,59)', borderRadius:16, padding:28, width:480, backdropFilter:'blur(20px)', boxShadow:'0 0 50px -12px rgba(224,227,230,0.25)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:24 }}>
              <span style={{ fontSize:18, fontWeight:700, color:'#e0e3e6' }}>Create New User</span>
              <button onClick={() => setShowCreateUser(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#6c7793', display:'flex' }}><Ic.X /></button>
            </div>
            {[
              { label:'Username', key:'username', placeholder:'johndoe' },
              { label:'Email', key:'email', placeholder:'john@example.com' },
              { label:'Phone', key:'phone', placeholder:'+91 98765 43210' },
              { label:'Password', key:'password', placeholder:'Set password...' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom:14 }}>
                <div style={{ fontSize:12, fontWeight:500, color:'#94a3b8', marginBottom:6 }}>{f.label}</div>
                <input value={(newUser as any)[f.key]} onChange={e => setNewUser(p => ({...p, [f.key]:e.target.value}))} placeholder={f.placeholder} style={{ ...s.input, borderColor:'rgb(30,41,59)' }} onFocus={e=>(e.target as HTMLElement).style.borderColor='rgba(59,130,255,0.5)'} onBlur={e=>(e.target as HTMLElement).style.borderColor='rgb(30,41,59)'} />
              </div>
            ))}
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:12, fontWeight:500, color:'#94a3b8', marginBottom:6 }}>Role</div>
              <div style={{ position:'relative' }}>
                <select value={newUser.role} onChange={e => setNewUser(p => ({...p,role:e.target.value}))} style={{ ...s.input, paddingRight:30 }}>
                  <option value="learner">Learner</option><option value="mentor">Mentor</option><option value="admin">Admin</option>
                </select>
                <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', color:'#94a3b8', pointerEvents:'none', fontSize:10 }}>▾</span>
              </div>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setShowCreateUser(false)} style={{ flex:1, padding:11, borderRadius:10, border:'1px solid rgb(30,41,59)', background:'transparent', color:'#6c7793', fontSize:13, fontFamily:'Poppins,Inter,sans-serif', cursor:'pointer' }}>Cancel</button>
              <button onClick={() => createUserMutation.mutate(newUser)} disabled={!newUser.username || !newUser.email} style={{ ...s.btnPrimary, flex:2, justifyContent:'center', padding:11, borderRadius:10, fontWeight:700, opacity: (newUser.username && newUser.email) ? 1 : 0.5 }}>Create User</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Batch modal */}
      {showCreateBatch && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }} onClick={() => setShowCreateBatch(false)}>
          <div style={{ background:'linear-gradient(rgba(78,249,240,0.05),rgba(255,255,255,0.05))', border:'1px solid rgb(30,41,59)', borderRadius:16, padding:28, width:480, backdropFilter:'blur(20px)', boxShadow:'0 0 50px -12px rgba(224,227,230,0.25)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:24 }}>
              <span style={{ fontSize:18, fontWeight:700, color:'#e0e3e6' }}>Initialize New Batch</span>
              <button onClick={() => setShowCreateBatch(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#6c7793', display:'flex' }}><Ic.X /></button>
            </div>
            {[
              { label:'Batch Name', key:'name', placeholder:'e.g. React Deep Dive 2024' },
              { label:'Description', key:'description', placeholder:'Briefly describe the batch...' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom:14 }}>
                <div style={{ fontSize:12, fontWeight:500, color:'#94a3b8', marginBottom:6 }}>{f.label}</div>
                <input value={(newBatch as any)[f.key]} onChange={e => setNewBatch(p => ({...p,[f.key]:e.target.value}))} placeholder={f.placeholder} style={{ ...s.input, borderColor:'rgb(30,41,59)' }} />
              </div>
            ))}
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:12, fontWeight:500, color:'#94a3b8', marginBottom:6 }}>Visibility</div>
              <div style={{ position:'relative' }}>
                <select value={newBatch.type} onChange={e => setNewBatch(p => ({...p,type:e.target.value}))} style={{ ...s.input, paddingRight:30 }}>
                  <option value="public">Public</option><option value="private">Private</option>
                </select>
                <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', color:'#94a3b8', pointerEvents:'none', fontSize:10 }}>▾</span>
              </div>
            </div>
            <div onClick={() => setNewBatch(p => ({...p,is_paid:!p.is_paid}))} style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', marginBottom:24 }}>
              <div style={{ width:18, height:18, borderRadius:4, border:`1px solid ${newBatch.is_paid ? 'transparent' : 'rgb(30,41,59)'}`, background: newBatch.is_paid ? 'linear-gradient(rgb(59,130,255) 17%,rgb(0,219,232) 100%)' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s' }}>
                {newBatch.is_paid && <span style={{ color:'#05070a', fontSize:11, fontWeight:900 }}>✓</span>}
              </div>
              <span style={{ fontSize:13, color:'#94a3b8' }}>Paid Access</span>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setShowCreateBatch(false)} style={{ flex:1, padding:11, borderRadius:10, border:'1px solid rgb(30,41,59)', background:'transparent', color:'#6c7793', fontSize:13, fontFamily:'Poppins,Inter,sans-serif', cursor:'pointer' }}>Cancel</button>
              <button onClick={() => createBatchMutation.mutate(newBatch)} disabled={!newBatch.name} style={{ ...s.btnPrimary, flex:2, justifyContent:'center', padding:11, borderRadius:10, fontWeight:700, opacity: newBatch.name ? 1 : 0.5 }}>Create Batch</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
