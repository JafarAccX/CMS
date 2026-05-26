import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "../store/authStore";
import { useBatchStore } from "../store/batchStore";
import api from "../api/client";
import {
  LayoutDashboard, Home, MessageCircle, Hash, Settings,
  LogOut, ChevronDown, ChevronRight, Folder, BookOpen,
  Pin,
} from "lucide-react";

interface AppShellProps {
  children: React.ReactNode;
}

// ── Sidebar link helpers ───────────────────────────────────────────
function NavItem({
  href, icon, label, active, badge,
}: {
  href: string; icon: React.ReactNode; label: string;
  active?: boolean; badge?: number;
}) {
  return (
    <Link to={href} className="block">
      <div
        className={`relative flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
          active ? "bg-accent-100 border border-accent-200" : "hover:bg-surface-100 border border-transparent"
        }`}
      >
        {active && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full"
            style={{ background: "linear-gradient(rgb(59,130,255) 17%,rgb(0,219,232) 100%)", boxShadow: "0 0 8px rgba(59,130,255,0.5)" }} />
        )}
        <span className={active ? "text-accent-400" : "text-dim"}>{icon}</span>
        <span className={`text-[13.5px] flex-1 font-${active ? "semibold" : "medium"} ${active ? "text-accent-300" : "text-muted"}`}>
          {label}
        </span>
        {badge != null && (
          <span className={`min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center ${
            active ? "bg-accent-400 text-white" : "bg-surface-200 text-muted"
          }`}>{badge}</span>
        )}
      </div>
    </Link>
  );
}

function SidebarSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between px-3 py-1 mb-0.5">
        <span className="t-overline">{label}</span>
        <ChevronDown className="w-3 h-3 text-dim" />
      </div>
      {children}
    </div>
  );
}

function ChannelItem({
  href, label, active, hasDot, count,
}: {
  href: string; label: string; active?: boolean; hasDot?: boolean; count?: number;
}) {
  return (
    <Link to={href} className="block">
      <div className={`relative flex items-center justify-between px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
        active ? "bg-accent-100" : "hover:bg-surface-100"
      }`}>
        {active && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
            style={{ background: "linear-gradient(rgb(59,130,255) 17%,rgb(0,219,232) 100%)" }} />
        )}
        <div className="flex items-center gap-2">
          <Pin className="w-[9px] h-[15px] text-dim shrink-0" />
          <span className={`text-[13px] ${active ? "text-primary font-medium" : "text-muted"}`}>{label}</span>
        </div>
        {hasDot && <div className="w-2 h-2 rounded-full bg-red-400" />}
        {count != null && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-accent-100 text-accent-300">{count}</span>}
      </div>
    </Link>
  );
}

function HashChannelItem({ href, label, active, count }: { href: string; label: string; active?: boolean; count?: number }) {
  return (
    <Link to={href} className="block">
      <div className={`relative flex items-center justify-between px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
        active ? "bg-accent-100" : "hover:bg-surface-100"
      }`}>
        {active && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
            style={{ background: "linear-gradient(rgb(59,130,255) 17%,rgb(0,219,232) 100%)" }} />
        )}
        <div className="flex items-center gap-2">
          <span className="text-dim/50 text-[15px] font-medium leading-none">#</span>
          <span className={`text-[13px] ${active ? "text-primary font-medium" : "text-muted"}`}>{label}</span>
        </div>
        {count != null && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-accent-100 text-accent-300">{count}</span>}
      </div>
    </Link>
  );
}

// ── Main AppShell ──────────────────────────────────────────────────
export default function AppShell({ children }: AppShellProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const batches = useBatchStore((s) => s.batches);

  const { data: pinnedData } = useQuery({
    queryKey: ["pinned-rooms"],
    queryFn: async () => (await api.get("/pinned")).data as { pinnedBatches: any[]; pinnedChannels: any[] },
  });

  const handleLogout = async () => { await logout(); navigate("/login"); };

  const isDashboard = pathname === "/admin" || pathname.startsWith("/admin");
  const isHome = pathname === "/";
  const isDirect = pathname.startsWith("/dm");
  const isRooms = pathname.startsWith("/batch");

  const pinnedChannels = pinnedData?.pinnedChannels || [];
  const activeBatches = batches.filter((b) => b.userMembership !== null || b.type === "general").slice(0, 5);

  return (
    <div className="h-screen flex bg-surface overflow-hidden relative">
      {/* Decorative orbs */}
      <div className="pointer-events-none absolute right-0 -top-40 w-72 h-72 rounded-full opacity-20 blur-[80px] z-0"
        style={{ background: "linear-gradient(rgb(62,56,224) 0%,rgb(0,219,232) 100%)" }} />
      <div className="pointer-events-none absolute right-0 -bottom-40 w-72 h-72 rounded-full opacity-10 blur-[80px] z-0"
        style={{ background: "linear-gradient(rgb(62,56,224) 0%,rgb(0,219,232) 100%)" }} />

      {/* ── Sidebar ── */}
      <aside className="w-60 flex-shrink-0 hidden lg:flex flex-col border-r border-hairline relative z-10"
        style={{ backgroundColor: "rgba(10,13,18,0.85)", boxShadow: "1px 0 8px rgba(255,255,255,0.1)" }}>

        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 px-4 py-4 border-b border-hairline hover:bg-surface-100/50 transition-colors">
          <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-white font-bold text-base shadow-btn"
            style={{ background: "linear-gradient(rgb(59,130,255) 0%,rgb(0,219,232) 100%)", boxShadow: "0 0 14px rgba(59,130,255,0.35)" }}>
            A
          </div>
          <div>
            <div className="text-[14px] font-bold text-primary leading-tight">AcceleratorX</div>
            <div className="text-[10px] text-dim tracking-[0.08em] uppercase">Discussion Platform</div>
          </div>
        </Link>

        {/* Main nav */}
        <div className="px-2 pt-3 pb-1 flex flex-col gap-0.5">
          <NavItem href="/admin" icon={<LayoutDashboard className="w-[15px] h-[15px]" />} label="Dashboard" active={isDashboard} />
          <NavItem href="/" icon={<Home className="w-[15px] h-[15px]" />} label="Home" active={isHome} />
          <NavItem href="/dm" icon={<MessageCircle className="w-[15px] h-[15px]" />} label="Direct" active={isDirect} />
          <NavItem href="#rooms" icon={<Hash className="w-[15px] h-[15px]" />} label="Rooms" active={isRooms} badge={activeBatches.length || undefined} />
        </div>

        <div className="h-px bg-hairline mx-3 my-2" />

        {/* Channel sections */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 py-1">
          <SidebarSection label="PINNED">
            <ChannelItem href="/dm" label="# announcements" hasDot />
            <ChannelItem href="/dm" label="# general" active={pathname === "/dm"} />
          </SidebarSection>

          {activeBatches.length > 0 && (
            <SidebarSection label="ACTIVE">
              {activeBatches.slice(0, 3).map((b) => (
                <HashChannelItem
                  key={b.id}
                  href={`/batch/${b.id}`}
                  label={b.name}
                  active={pathname === `/batch/${b.id}`}
                />
              ))}
            </SidebarSection>
          )}

          {pinnedChannels.length > 0 && (
            <SidebarSection label="ALL">
              {pinnedChannels.slice(0, 3).map((c: any) => (
                <HashChannelItem
                  key={c.id}
                  href={`/batch/${c.batch_id}/channel/${c.id}`}
                  label={c.name}
                  active={pathname.includes(c.id)}
                />
              ))}
            </SidebarSection>
          )}

          <div className="h-px bg-hairline mx-2 my-2" />

          {/* Course groups */}
          <SidebarSection label="COURSE GROUPS">
            {activeBatches.slice(0, 3).map((b) => (
              <Link key={b.id} to={`/batch/${b.id}`} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-surface-100 transition-colors cursor-pointer">
                <Folder className="w-[13px] h-[13px] text-dim" />
                <span className="text-[13px] text-muted truncate">{b.name}</span>
              </Link>
            ))}
          </SidebarSection>

          <div className="h-px bg-hairline mx-2 my-2" />

          {/* Mentorship link */}
          <Link to="/mentor" className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-surface-100 transition-colors border border-transparent">
            <BookOpen className="w-[15px] h-[15px] text-dim" />
            <span className="text-[13.5px] font-medium text-muted">Mentorship</span>
          </Link>
        </div>

        {/* Footer */}
        <div className="px-2 pb-2 border-t border-hairline pt-2">
          {user?.role === "admin" && (
            <Link to="/admin" className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-surface-100 transition-colors border border-transparent mb-1">
              <Settings className="w-[15px] h-[15px] text-dim" />
              <span className="text-[13.5px] font-medium text-muted flex-1">Admin Console</span>
              <ChevronRight className="w-3 h-3 text-dim" />
            </Link>
          )}

          <div className="h-px bg-hairline mx-2 mb-2" />

          <div className="flex items-center gap-2.5 px-3 py-2">
            <div className="relative flex-shrink-0">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm text-white"
                style={{ background: "linear-gradient(rgb(59,130,255) 0%,rgb(0,219,232) 100%)", boxShadow: "0 0 12px rgba(59,130,255,0.3)" }}>
                {user?.username?.[0]?.toUpperCase() || "?"}
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-surface" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-primary truncate">{user?.username}</div>
              <div className="text-[11px] text-emerald-400">Online</div>
            </div>
            <button onClick={handleLogout} className="p-1.5 text-dim hover:text-red-400 rounded transition-colors" aria-label="Sign out">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content area ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
        {children}
      </div>
    </div>
  );
}
