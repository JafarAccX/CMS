import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "../api/client";
import { useAuthStore } from "../store/authStore";
import { useBatchStore } from "../store/batchStore";
import { useNotificationStore } from "../store/notificationStore";
import { useSocket } from "../hooks/useSocket";
import { TopBar, StatCard, Ic } from "../components/AppShell";

function RoomRow({ batch }: { batch: any }) {
  const members = batch._count?.memberships || 0;
  const channels = batch._count?.channels || 0;
  return (
    <Link to={batch.hasAccess ? `/batch/${batch.id}` : "#"} style={{ textDecoration:'none', display:'block' }}>
      <div style={{ borderRadius:12, backgroundColor:'rgb(10,12,17)', border:'1px solid rgba(255,255,255,0.08)', padding:'16px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', transition:'background 0.14s, border-color 0.14s', cursor:'pointer', marginBottom:8 }}
        onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='rgb(13,17,24)'; (e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,0.14)';}}
        onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='rgb(10,12,17)'; (e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,0.08)';}}>
        <div style={{ display:'flex', alignItems:'center', gap:16, flex:1, minWidth:0 }}>
          <div style={{ width:40, height:40, borderRadius:8, backgroundColor:'rgb(5,7,10)', border:'1px solid rgba(255,255,255,0.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <span style={{ fontSize:16, color:'#94a3b8', fontWeight:500 }}>#</span>
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
              <span style={{ fontSize:14, fontWeight:500, color:'#e0e3e6' }}>{batch.name}</span>
              <span style={{ fontSize:10, color:'#94a3b8', background:'rgb(5,7,10)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:4, padding:'1px 6px' }}>{batch.type}</span>
            </div>
            <div style={{ fontSize:13, color:'#94a3b8', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:380 }}>{batch.description || 'No description'}</div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:4 }}>
              <span style={{ fontSize:12, color:'#6c7793', fontWeight:500 }}>{channels} channels · {members} members</span>
              <div style={{ width:6, height:6, borderRadius:'50%', background:'rgb(43,206,52)', boxShadow:'0 0 5px rgba(43,206,52,0.5)' }} />
            </div>
          </div>
        </div>
        <button style={{ padding:'6px 14px', borderRadius:6, border:'1px solid rgb(30,41,59)', background:'transparent', color:'#94a3b8', fontSize:12, fontFamily:'Poppins,Inter,sans-serif', cursor:'pointer', transition:'all 0.14s', whiteSpace:'nowrap' }}
          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='rgba(59,130,255,0.1)'; (e.currentTarget as HTMLElement).style.color='#afc6ff'; (e.currentTarget as HTMLElement).style.borderColor='rgba(59,130,255,0.3)';}}
          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='transparent'; (e.currentTarget as HTMLElement).style.color='#94a3b8'; (e.currentTarget as HTMLElement).style.borderColor='rgb(30,41,59)';}}>
          Open →
        </button>
      </div>
    </Link>
  );
}

function MentorshipCard() {
  return (
    <div style={{ borderRadius:12, backgroundColor:'rgb(10,13,18)', border:'1px solid rgba(255,255,255,0.08)', padding:20, overflow:'hidden', position:'relative' }}>
      <div style={{ position:'absolute', right:-20, top:-30, width:80, height:80, borderRadius:'50%', background:'linear-gradient(rgb(0,219,232),rgb(59,130,255))', opacity:0.15, filter:'blur(20px)' }} />
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div style={{ width:36, height:36, borderRadius:8, backgroundColor:'rgba(0,219,232,0.1)', border:'1px solid rgba(0,219,232,0.2)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <svg width="15" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
        </div>
        <span style={{ fontSize:10, color:'#94a3b8' }}>Starts 2:00 PM</span>
      </div>
      <div style={{ marginBottom:4 }}>
        <div style={{ fontSize:18, color:'#fff', fontWeight:600, lineHeight:'27px' }}>Live Session</div>
        <div style={{ fontSize:13, color:'#94a3b8', lineHeight:'19.5px', marginTop:4 }}>Advanced Hooks Deep Dive.</div>
      </div>
      <div style={{ marginTop:16, display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ width:24, height:24, borderRadius:'50%', background:'linear-gradient(140deg,#7fe6f0,#2bb8d4 60%,#0e7490)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#fff' }}>M</div>
        <span style={{ fontSize:12, color:'#94a3b8' }}>with mentor</span>
        <div style={{ flex:1 }} />
        <button style={{ padding:'5px 12px', borderRadius:6, border:'none', background:'linear-gradient(rgb(59,130,255) 17%,rgb(0,219,232) 100%)', color:'#05070a', fontSize:11, fontWeight:600, fontFamily:'Poppins,Inter,sans-serif', cursor:'pointer' }}>Join Now</button>
      </div>
    </div>
  );
}

function UpcomingCard({ title, time, type, color }: { title:string; time:string; type:string; color:string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderRadius:10, backgroundColor:'rgb(10,13,18)', border:'1px solid rgba(255,255,255,0.06)', marginBottom:8 }}>
      <div style={{ width:32, height:32, borderRadius:8, backgroundColor:`${color}22`, border:`1px solid ${color}44`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <Ic.Calendar />
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:500, color:'#e0e3e6', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{title}</div>
        <div style={{ fontSize:11, color:'#6c7793', marginTop:2 }}>{time}</div>
      </div>
      <span style={{ fontSize:10, padding:'2px 8px', borderRadius:4, background:`${color}22`, color, border:`1px solid ${color}33` }}>{type}</span>
    </div>
  );
}

export default function DashboardPage() {
  const user = useAuthStore(s => s.user);
  const setBatches = useBatchStore(s => s.setBatches);
  const batches = useBatchStore(s => s.batches);
  const setNotifications = useNotificationStore(s => s.setNotifications);
  useSocket();

  const { data: batchData } = useQuery({ queryKey:["batches"], queryFn: async () => (await api.get("/batches")).data });
  const { data: notifData } = useQuery({ queryKey:["notifications"], queryFn: async () => (await api.get("/notifications")).data });

  useEffect(() => { if (batchData) setBatches(batchData); }, [batchData]);
  useEffect(() => { if (notifData) setNotifications(notifData); }, [notifData]);

  const generalBatches = batches.filter(b => b.type === 'general');
  const enrolledBatches = batches.filter(b => b.userMembership !== null);
  const lockedBatches = batches.filter(b => !b.hasAccess && b.type !== 'general');

  const stats = [
    { icon:<Ic.Hash />, value: String(batchData?.length || 0).padStart(2,'0'), label:'Channels Available', iconBg:'rgba(89,149,232,0.2)' },
    { icon:<Ic.Users />, value: String(enrolledBatches.length || 0).padStart(2,'0'), label:'Enrolled in Batches', iconBg:'rgba(52,211,153,0.2)' },
    { icon:<Ic.Mentor />, value: String(generalBatches.length || 0).padStart(2,'0'), label:'General Open to All', iconBg:'rgba(20,184,166,0.2)' },
  ];

  const displayRooms = [...generalBatches, ...enrolledBatches].filter((b,i,arr) => arr.findIndex(x => x.id === b.id) === i).slice(0,6);

  return (
    <>
      <TopBar title="Home" />
      <div style={{ flex:1, overflowY:'auto', padding:'32px 32px 40px', display:'flex', gap:32 }}>
        {/* Left column */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:11, fontWeight:500, letterSpacing:'1.1px', color:'#94a3b8', textTransform:'uppercase', marginBottom:16 }}>ADMIN INSIGHTS</div>
          <div style={{ display:'flex', gap:16, marginBottom:32 }}>
            {stats.map((st,i) => <StatCard key={i} {...st} />)}
          </div>

          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <span style={{ fontSize:11, fontWeight:500, letterSpacing:'1.1px', color:'#94a3b8', textTransform:'uppercase' }}>ACTIVE ROOMS</span>
            <Link to="/admin" style={{ display:'flex', alignItems:'center', gap:4, fontSize:12, color:'#4f7cff', textDecoration:'none' }}>View all <Ic.ChevronRight /></Link>
          </div>
          <div>
            {displayRooms.length > 0 ? displayRooms.map(b => <RoomRow key={b.id} batch={b} />) : (
              <div style={{ borderRadius:12, backgroundColor:'rgb(10,13,18)', border:'1px solid rgba(255,255,255,0.08)', padding:'48px 0', textAlign:'center', color:'#6c7793', fontSize:14 }}>No active rooms yet.</div>
            )}
            {lockedBatches.length > 0 && <>
              <div style={{ fontSize:11, fontWeight:500, letterSpacing:'1.1px', color:'#94a3b8', textTransform:'uppercase', marginTop:24, marginBottom:8 }}>LOCKED</div>
              {lockedBatches.slice(0,2).map(b => (
                <div key={b.id} style={{ borderRadius:12, backgroundColor:'rgb(10,13,18)', border:'1px solid rgba(255,255,255,0.08)', padding:'12px 16px', marginBottom:8, opacity:0.5 }}>
                  <div style={{ fontSize:14, fontWeight:500, color:'#6c7793' }}>{b.name}</div>
                  <div style={{ fontSize:12, color:'#424c64' }}>{b.description || 'No description'}</div>
                </div>
              ))}
            </>}
          </div>
        </div>

        {/* Right sidebar */}
        <div style={{ width:300, flexShrink:0 }}>
          <div style={{ fontSize:11, fontWeight:500, letterSpacing:'1.1px', color:'#94a3b8', textTransform:'uppercase', marginBottom:16 }}>MENTORSHIP</div>
          <MentorshipCard />

          <div style={{ fontSize:11, fontWeight:500, letterSpacing:'1.1px', color:'#94a3b8', textTransform:'uppercase', margin:'28px 0 16px' }}>UPCOMING</div>
          <UpcomingCard title="React Hooks Deep Dive" time="Today, 2:00 PM" type="Live" color="rgb(0,219,232)" />
          <UpcomingCard title="System Design Review" time="Tomorrow, 11:00 AM" type="Session" color="rgb(139,92,246)" />
          <UpcomingCard title="UI/UX Critique" time="Thu, 3:30 PM" type="Workshop" color="rgb(52,211,153)" />

          <div style={{ fontSize:11, fontWeight:500, letterSpacing:'1.1px', color:'#94a3b8', textTransform:'uppercase', margin:'28px 0 16px' }}>QUICK LINKS</div>
          {[
            user?.role === 'admin' && { label:'Admin Console', to:'/admin', icon:<Ic.Shield /> },
            { label:'Manage Batches', to:'/batch', icon:<Ic.Folder /> },
            { label:'Direct Messages', to:'/dm', icon:<Ic.Message /> },
          ].filter(Boolean).map((item: any) => (
            <Link key={item.label} to={item.to} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:8, marginBottom:4, transition:'background 0.14s', color:'#94a3b8', textDecoration:'none' }}
              onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.04)'}
              onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
              <div style={{ width:28, height:28, borderRadius:7, background:'rgba(59,130,255,0.12)', display:'flex', alignItems:'center', justifyContent:'center', color:'#4f7cff' }}>{item.icon}</div>
              <span style={{ fontSize:13, color:'#e0e3e6', flex:1 }}>{item.label}</span>
              <Ic.ChevronRight />
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
