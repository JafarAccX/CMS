import { ReactNode, CSSProperties } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { useBatchStore } from "../store/batchStore";

/* ── Inline SVG Icons (exact from Figma HTML) ── */
const Ic = {
  GridFill: () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>),
  Home: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>),
  Message: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>),
  Hash: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/></svg>),
  Pin: () => (<svg width="9" height="15" viewBox="0 0 9 15" fill="currentColor"><path d="M7.5 6.75L9 8.25v1.5H5.25v4.5L4.5 15l-.75-.75v-4.5H0v-1.5L1.5 6.75V1.5H.75V0h7.5v1.5H7.5v5.25ZM2.138 8.25h4.724L6 7.387V1.5H3v5.887L2.138 8.25Z"/></svg>),
  ChevronDown: () => (<svg width="8" height="5" viewBox="0 0 8 5" fill="currentColor"><path d="M4 4.933L0 .933.933 0 4 3.067 7.067 0 8 .933z"/></svg>),
  ChevronRight: () => (<svg width="5" height="8" viewBox="0 0 5 8" fill="currentColor"><path d="M4.933 4L.933 8 0 7.067l3.067-3.067L0 .933.933 0z"/></svg>),
  Search: () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>),
  Bell: () => (<svg width="14" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>),
  Settings: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>),
  Logout: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>),
  Folder: () => (<svg width="15" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>),
  Mentor: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>),
  AI: () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>),
};

export { Ic };

/* ── Shared Sub-components ── */
function SidebarSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 12px', marginBottom:2 }}>
        <span style={{ fontSize:11, letterSpacing:'0.55px', color:'#94a3b8', fontWeight:500 }}>{label}</span>
        <span style={{ color:'#94a3b8', display:'flex' }}><Ic.ChevronDown /></span>
      </div>
      {children}
    </div>
  );
}

function NavItem({ icon, label, active, to }: { icon: ReactNode; label: string; active?: boolean; to: string }) {
  return (
    <Link to={to} style={{ textDecoration:'none', display:'block' }}>
      <div style={{ position:'relative', display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:8, cursor:'pointer', backgroundColor: active ? 'rgba(59,130,255,0.1)' : 'transparent', transition:'background 0.14s' }}>
        {active && <div style={{ position:'absolute', left:0, top:'50%', transform:'translateY(-50%)', width:3, height:24, borderRadius:'0 4px 4px 0', background:'linear-gradient(rgb(59,130,255) 17%,rgb(0,219,232) 100%)', boxShadow:'0 0 8px rgba(59,130,255,0.5)' }} />}
        <span style={{ display:'flex', color: active ? 'transparent' : '#94a3b8', background: active ? 'linear-gradient(rgb(59,130,255) 17%,rgb(0,219,232) 100%)' : 'none', WebkitBackgroundClip: active ? 'text' : undefined, WebkitTextFillColor: active ? 'transparent' : undefined } as CSSProperties}>{icon}</span>
        <span style={{ fontSize:14, fontWeight: active ? 500 : 400, color:'#e0e3e6', flex:1 }}>{label}</span>
      </div>
    </Link>
  );
}

function ChannelLink({ label, to, active, hasBadge, count }: { label: string; to: string; active?: boolean; hasBadge?: boolean; count?: number }) {
  return (
    <Link to={to} style={{ textDecoration:'none', display:'block' }}>
      <div style={{ position:'relative', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 12px', borderRadius:8, cursor:'pointer', backgroundColor: active ? 'rgba(59,130,255,0.1)' : 'transparent', transition:'background 0.14s' }}>
        {active && <div style={{ position:'absolute', left:0, top:'50%', transform:'translateY(-50%)', width:3, height:20, borderRadius:'0 4px 4px 0', background:'linear-gradient(rgb(59,130,255) 17%,rgb(0,219,232) 100%)', boxShadow:'0 0 8px rgba(59,130,255,0.5)' }} />}
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ color:'#94a3b8', display:'flex', marginTop:1 }}><Ic.Pin /></span>
          <span style={{ fontSize:13, color: active ? '#e0e3e6' : '#94a3b8' }}>{label}</span>
        </div>
        {hasBadge && <div style={{ width:8, height:8, borderRadius:'50%', background:'rgb(255,99,93)' }} />}
        {count != null && <div style={{ borderRadius:4, background:'rgba(59,130,255,0.2)', padding:'2px 6px', fontSize:10, color:'#afc6ff', fontWeight:700 }}>{count}</div>}
      </div>
    </Link>
  );
}

function HashLink({ label, to, active, count }: { label: string; to: string; active?: boolean; count?: number }) {
  return (
    <Link to={to} style={{ textDecoration:'none', display:'block' }}>
      <div style={{ position:'relative', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 12px', borderRadius:8, cursor:'pointer', backgroundColor: active ? 'rgba(59,130,255,0.1)' : 'transparent', transition:'background 0.14s' }}>
        {active && <div style={{ position:'absolute', left:0, top:'50%', transform:'translateY(-50%)', width:3, height:20, borderRadius:'0 4px 4px 0', background:'linear-gradient(rgb(59,130,255) 17%,rgb(0,219,232) 100%)', boxShadow:'0 0 8px rgba(59,130,255,0.5)' }} />}
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:15, color:'rgba(148,163,184,0.5)', fontWeight:500, lineHeight:1 }}>#</span>
          <span style={{ fontSize:13, color: active ? '#e0e3e6' : '#94a3b8' }}>{label}</span>
        </div>
        {count != null && <div style={{ borderRadius:4, background:'rgba(59,130,255,0.2)', padding:'2px 6px', fontSize:10, color:'#afc6ff', fontWeight:700 }}>{count}</div>}
      </div>
    </Link>
  );
}

/* ── Decorative Orbs ── */
export function Orbs() {
  return (<>
    <div style={{ position:'absolute', right:-80, top:-160, width:303, height:278, borderRadius:'50%', background:'linear-gradient(rgb(62,56,224) 0%,rgb(0,219,232) 100%)', opacity:0.28, filter:'blur(70px)', pointerEvents:'none', zIndex:0 }} />
    <div style={{ position:'absolute', right:-80, bottom:-160, width:303, height:278, borderRadius:'50%', background:'linear-gradient(rgb(62,56,224) 0%,rgb(0,219,232) 100%)', opacity:0.15, filter:'blur(70px)', pointerEvents:'none', zIndex:0 }} />
  </>);
}

/* ── Stat Card (reusable) ── */
export function StatCard({ icon, value, label, delta, iconBg }: { icon: ReactNode; value: string | number; label: string; delta?: string; iconBg: string }) {
  return (
    <div style={{ flex:1, minWidth:0, borderRadius:12, overflow:'hidden', position:'relative', backgroundColor:'rgb(10,13,18)', border:'1px solid rgba(255,255,255,0.08)', padding:'17px 20px' }}>
      <div style={{ position:'absolute', right:-18, top:-42, width:97, height:101, borderRadius:'50%', background:'linear-gradient(rgb(62,56,224) 0%,rgb(0,219,232) 100%)', opacity:0.22, filter:'blur(24px)', pointerEvents:'none' }} />
      <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:16, position:'relative' }}>
        <div style={{ width:32, height:32, borderRadius:4, flexShrink:0, backgroundColor:iconBg, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <span style={{ background:'linear-gradient(rgb(59,130,255) 17%,rgb(0,219,232) 100%)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', display:'flex' } as CSSProperties}>{icon}</span>
        </div>
        <span style={{ fontWeight:700, fontSize:24, color:'#fff', lineHeight:1 }}>{value}</span>
      </div>
      <div style={{ fontSize:12, fontWeight:500, letterSpacing:'0.55px', color:'#94a3b8', marginBottom: delta ? 6 : 0, textTransform:'uppercase', position:'relative' }}>{label}</div>
      {delta && <div style={{ fontSize:12, fontWeight:500, letterSpacing:'0.55px', color:'#94a3b8', position:'relative' }}>{delta}</div>}
    </div>
  );
}

/* ── TopBar ── */
export function TopBar({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header style={{ height:64, flexShrink:0, backgroundColor:'rgba(10,12,17,0.6)', borderBottom:'1px solid rgba(255,255,255,0.08)', backdropFilter:'blur(24px)', WebkitBackdropFilter:'blur(24px)', display:'flex', alignItems:'center', padding:'0 32px', gap:16, position:'relative', zIndex:10 } as CSSProperties}>
      <div>
        <span style={{ fontWeight:700, fontSize:20, color:'#e0e3e6', letterSpacing:'-0.01em' }}>{title}</span>
        {subtitle && <span style={{ fontSize:12, color:'#6c7793', marginLeft:10 }}>{subtitle}</span>}
      </div>
      <div style={{ flex:1, display:'flex', justifyContent:'center' }}>
        <div style={{ position:'relative', width:512, height:42 }}>
          <div style={{ position:'absolute', inset:0, borderRadius:6, backgroundColor:'rgb(10,13,18)', border:'1px solid rgba(255,255,255,0.1)', display:'flex', alignItems:'center', padding:'0 40px' }}>
            <span style={{ fontSize:14, color:'rgba(148,163,184,0.5)', userSelect:'none' }}>Ask AI or search workspace... (Cmd+K)</span>
          </div>
          <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'rgba(148,163,184,0.5)', display:'flex', pointerEvents:'none' }}><Ic.Search /></span>
          <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', color:'rgb(0,219,232)', display:'flex', pointerEvents:'none' }}><Ic.AI /></span>
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <button style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:6, border:'none', cursor:'pointer', fontFamily:'Poppins,Inter,sans-serif', background:'linear-gradient(rgb(59,130,255) 17%,rgb(0,219,232) 100%)', boxShadow:'0 0 10px rgba(59,130,255,0.3)', color:'#05070a', fontSize:13, fontWeight:500 }}>
          <Ic.AI /> Ask Mentor
        </button>
        <button style={{ width:32, height:32, borderRadius:6, border:'none', background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#94a3b8' }}><Ic.Bell /></button>
        <button style={{ width:32, height:32, borderRadius:6, border:'none', background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#94a3b8' }}><Ic.Settings /></button>
        <div style={{ width:1, height:20, background:'rgba(255,255,255,0.1)', margin:'0 4px' }} />
        <div style={{ width:32, height:32, borderRadius:'50%', backgroundColor:'rgb(45,103,107)', border:'1px solid rgba(255,255,255,0.1)', cursor:'pointer' }} />
      </div>
    </header>
  );
}

/* ── Main AppShell ── */
export default function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const batches = useBatchStore((s) => s.batches);

  const handleLogout = async () => { await logout(); navigate("/login"); };

  const isDashboard = pathname === "/admin" || pathname.startsWith("/admin");
  const isHome = pathname === "/";
  const isDirect = pathname.startsWith("/dm");
  const isRooms = pathname.startsWith("/batch");

  const activeBatches = batches.filter((b) => b.userMembership !== null || b.type === "general").slice(0, 5);

  return (
    <div style={{ display:'flex', height:'100vh', background:'#05070a', position:'relative', overflow:'hidden', fontFamily:'Poppins,Inter,sans-serif', WebkitFontSmoothing:'antialiased' } as CSSProperties}>
      <Orbs />

      {/* ── Sidebar ── */}
      <aside style={{ width:256, flexShrink:0, height:'100vh', backgroundColor:'rgba(10,13,18,0.82)', boxShadow:'1px 0 8px rgba(255,255,255,0.15)', display:'flex', flexDirection:'column', padding:'24px 0', overflow:'hidden', position:'relative', zIndex:2 }}>

        {/* Logo */}
        <div style={{ padding:'0 24px 20px', borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
          <Link to="/" style={{ textDecoration:'none', display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:36, height:36, borderRadius:8, flexShrink:0, background:'linear-gradient(rgb(59,130,255) 0%,rgb(0,219,232) 100%)', boxShadow:'0 0 14px rgba(59,130,255,0.4)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <span style={{ fontWeight:700, fontSize:18, color:'#05070a' }}>A</span>
            </div>
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:'#e0e3e6', lineHeight:'20px' }}>AcceleratorX</div>
              <div style={{ fontSize:10, letterSpacing:'1px', color:'#94a3b8', lineHeight:'15px' }}>DISCUSSION PLATFORM</div>
            </div>
          </Link>
        </div>

        {/* Main nav */}
        <div style={{ padding:'16px 16px 8px', display:'flex', flexDirection:'column', gap:2 }}>
          <NavItem icon={<Ic.GridFill />} label="Dashboard" active={isDashboard} to="/admin" />
          <NavItem icon={<Ic.Home />} label="Home" active={isHome} to="/" />
          <NavItem icon={<Ic.Message />} label="Direct" active={isDirect} to="/dm" />
          <NavItem icon={<Ic.Hash />} label="Rooms" active={isRooms} to={activeBatches[0] ? `/batch/${activeBatches[0].id}` : "#"} />
        </div>

        <div style={{ height:1, background:'rgba(255,255,255,0.08)', margin:'4px 24px 12px' }} />

        {/* Channel sections */}
        <div style={{ flex:1, overflowY:'auto', padding:'0 16px' }}>
          <SidebarSection label="PINNED">
            <ChannelLink label="# announcements" hasBadge to="/dm" />
            <ChannelLink label="# general" active={pathname === '/dm'} to="/dm" />
          </SidebarSection>

          {activeBatches.length > 0 && (
            <SidebarSection label="ACTIVE">
              {activeBatches.slice(0, 3).map((b) => (
                <HashLink key={b.id} label={b.name} to={`/batch/${b.id}`} active={pathname === `/batch/${b.id}`} />
              ))}
            </SidebarSection>
          )}

          <SidebarSection label="ALL">
            {activeBatches.slice(0, 2).map((b) => (
              <HashLink key={b.id} label={b.name} to={`/batch/${b.id}`} active={pathname === `/batch/${b.id}`} />
            ))}
          </SidebarSection>

          <div style={{ height:1, background:'rgba(255,255,255,0.08)', margin:'8px 8px 12px' }} />

          <SidebarSection label="COURSE GROUPS">
            {activeBatches.slice(0, 2).map((b) => (
              <Link key={b.id} to={`/batch/${b.id}`} style={{ textDecoration:'none', display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:8, cursor:'pointer', color:'#94a3b8' }}>
                <span style={{ display:'flex' }}><Ic.Folder /></span>
                <span style={{ fontSize:13 }}>{b.name}</span>
              </Link>
            ))}
          </SidebarSection>

          <div style={{ height:1, background:'rgba(255,255,255,0.08)', margin:'8px 8px 12px' }} />
          <NavItem icon={<Ic.Mentor />} label="Mentorship" to="/mentor" />
        </div>

        {/* Footer */}
        <div style={{ padding:'0 16px', marginTop:8 }}>
          <div style={{ height:1, background:'rgba(255,255,255,0.08)', margin:'0 8px 8px' }} />
          {user?.role === "admin" && (
            <NavItem icon={<Ic.Settings />} label="Admin Console" active={isDashboard} to="/admin" />
          )}
          <div style={{ height:1, background:'rgba(255,255,255,0.08)', margin:'8px 8px' }} />
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px' }}>
            <div style={{ width:36, height:36, borderRadius:8, flexShrink:0, background:'linear-gradient(rgb(59,130,255) 0%,rgb(0,219,232) 100%)', boxShadow:'0 0 15px rgba(59,130,255,0.3)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <span style={{ fontWeight:700, fontSize:16, color:'#05070a' }}>{user?.username?.[0]?.toUpperCase() || "?"}</span>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, color:'#94a3b8', fontWeight:500, lineHeight:'21px' }}>{user?.username || "Admin"}</div>
              <div style={{ fontSize:11, color:'rgb(53,221,61)', lineHeight:'16px' }}>Online</div>
            </div>
            <span onClick={handleLogout} style={{ color:'#94a3b8', display:'flex', cursor:'pointer' }}><Ic.Logout /></span>
          </div>
        </div>
      </aside>

      {/* ── Main content area ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, position:'relative', zIndex:1, overflow:'hidden' }}>
        {children}
      </div>
    </div>
  );
}
