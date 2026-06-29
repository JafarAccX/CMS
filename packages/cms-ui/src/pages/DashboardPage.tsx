import { useEffect } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useCmsUrl } from "../hooks/useCmsNavigation";
import { cmsApiClient as api } from "../api/cmsClient";
import { useCmsAuthStore } from "../api/cmsClient";
import { useCmsBatchStore } from "../store/cmsBatchStore";
import { useCmsNotificationStore } from "../store/cmsNotificationStore";
import { useCmsSocket } from "../hooks/useCmsSocket";
import { format, isToday, isTomorrow, isThisWeek } from "date-fns";
import {
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle,
  Clock,
  Folder,
  Hash,
  MessageSquare,
  Shield,
  TrendingUp,
  Users,
  Video,
} from "lucide-react";
import { FigmaAvatarStack, FigmaOverline, FigmaStatCard, FigmaTopBar, figmaGradient } from "../components/FigmaShared";

const avatarColors = ["#3b82ff", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#00dbe8"];

function colorsForBatch(index: number, count: number) {
  const amount = Math.max(2, Math.min(4, count || 3));
  return Array.from({ length: amount }, (_, offset) => avatarColors[(index + offset) % avatarColors.length]);
}

function PinnedChannelRow({ channel, index }: { channel: any; index: number }) {
  const getUrl = useCmsUrl();
  const href = `/batch/${channel.batch?.id}`;
  return (
    <Link to={getUrl(href)} style={{ textDecoration: "none", display: "block" }}>
      <div
        style={{
          borderRadius: 12,
          background: "var(--ax-card-bg)",
          border: "1px solid var(--ax-border)",
          boxShadow: "var(--ax-shadow-card)",
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          transition: "background 0.14s, border-color 0.14s, transform 0.14s",
          cursor: "pointer",
          marginBottom: 8,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--ax-card-hover-bg)";
          e.currentTarget.style.borderColor = "var(--ax-border-strong)";
          e.currentTarget.style.transform = "translateY(-1px)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--ax-card-bg)";
          e.currentTarget.style.borderColor = "var(--ax-border)";
          e.currentTarget.style.transform = "translateY(0)";
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1, minWidth: 0 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 8,
            background: "var(--ax-tile-bg)", border: "1px solid var(--ax-border)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <span style={{ fontSize: 16, color: "var(--accent-300)", fontWeight: 700 }}>#</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ax-text)" }}>{channel.name}</span>
              <span style={{
                fontSize: 10, color: "var(--ax-muted)", background: "var(--ax-pill-bg)",
                border: "1px solid var(--ax-border)", borderRadius: 4, padding: "1px 6px",
              }}>
                Channel
              </span>
            </div>
            <div style={{ fontSize: 13, color: "var(--ax-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 380 }}>
              {channel.batch?.name ?? ""}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 12, color: "var(--ax-dim)", fontWeight: 500 }}>
                {channel._count?.messages || 0} messages
              </span>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "rgb(43,206,52)", boxShadow: "0 0 5px rgba(43,206,52,0.5)" }} />
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
          <FigmaAvatarStack colors={colorsForBatch(index, 3)} />
          <button
            type="button"
            style={{
              padding: "6px 14px", borderRadius: 6, border: "1px solid var(--ax-panel-3)",
              background: "transparent", color: "var(--ax-muted)", fontSize: 12,
              fontFamily: "Poppins", cursor: "pointer", transition: "all 0.14s", whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(59,130,255,0.1)";
              e.currentTarget.style.color = "var(--accent-300)";
              e.currentTarget.style.borderColor = "rgba(59,130,255,0.3)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--ax-muted)";
              e.currentTarget.style.borderColor = "var(--ax-border)";
            }}
          >
            Open -&gt;
          </button>
        </div>
      </div>
    </Link>
  );
}

function RoomRow({ batch, index }: { batch: any; index: number }) {
  const getUrl = useCmsUrl();
  const members = batch._count?.memberships || 0;
  const channels = batch._count?.channels || 0;
  const isOpen = batch.type === "general" || batch.type === "public";
  const href = batch.hasAccess || isOpen ? `/batch/${batch.id}` : "/subscription";

  return (
    <Link to={getUrl(href)} style={{ textDecoration: "none", display: "block" }}>
      <div
        style={{
          borderRadius: 12,
          background: "var(--ax-card-bg)",
          border: "1px solid var(--ax-border)",
          boxShadow: "var(--ax-shadow-card)",
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          transition: "background 0.14s, border-color 0.14s, transform 0.14s",
          cursor: "pointer",
          marginBottom: 8,
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.background = "var(--ax-card-hover-bg)";
          event.currentTarget.style.borderColor = "var(--ax-border-strong)";
          event.currentTarget.style.transform = "translateY(-1px)";
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.background = "var(--ax-card-bg)";
          event.currentTarget.style.borderColor = "var(--ax-border)";
          event.currentTarget.style.transform = "translateY(0)";
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1, minWidth: 0 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              background: "var(--ax-tile-bg)",
              border: "1px solid var(--ax-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 16, color: "var(--accent-300)", fontWeight: 700 }}>#</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ax-text)" }}>{batch.name}</span>
              <span
                style={{
                  fontSize: 10,
                  color: "var(--ax-muted)",
                  background: "var(--ax-pill-bg)",
                  border: "1px solid var(--ax-border)",
                  borderRadius: 4,
                  padding: "1px 6px",
                  textTransform: "capitalize",
                }}
              >
                {isOpen ? "Open" : "Course"}
              </span>
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--ax-muted)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: 380,
              }}
            >
              {batch.description || "Welcome to this learning room."}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 12, color: "var(--ax-dim)", fontWeight: 500 }}>
                {channels || members || 0} messages
              </span>
              {(batch.hasAccess || isOpen) && (
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "rgb(43,206,52)",
                    boxShadow: "0 0 5px rgba(43,206,52,0.5)",
                  }}
                />
              )}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
          <FigmaAvatarStack colors={colorsForBatch(index, members)} />
          <button
            type="button"
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: "1px solid var(--ax-panel-3)",
              background: "transparent",
              color: "var(--ax-muted)",
              fontSize: 12,
              fontFamily: "Poppins",
              cursor: "pointer",
              transition: "all 0.14s",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.background = "rgba(59,130,255,0.1)";
              event.currentTarget.style.color = "var(--accent-300)";
              event.currentTarget.style.borderColor = "rgba(59,130,255,0.3)";
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = "transparent";
              event.currentTarget.style.color = "var(--ax-muted)";
              event.currentTarget.style.borderColor = "var(--ax-border)";
            }}
          >
            {isOpen ? "Join" : "Open"} -&gt;
          </button>
        </div>
      </div>
    </Link>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type ClassItem = {
  id: string;
  topic: string;
  startDateTime: string;
  endDateTime: string;
  status: "JOIN" | "UPCOMING" | "COMPLETED";
  isInteractive: boolean;
  batchId: string;
  batchName: string;
  zoomJoinUrl: string | null;
};

function formatClassTime(iso: string): string {
  const d = new Date(iso);
  const time = format(d, "h:mm a");
  if (isToday(d)) return `Today, ${time}`;
  if (isTomorrow(d)) return `Tomorrow, ${time}`;
  if (isThisWeek(d, { weekStartsOn: 1 })) return `${format(d, "EEE")}, ${time}`;
  return `${format(d, "MMM d")}, ${time}`;
}

function classTypeLabel(c: ClassItem) {
  if (c.status === "JOIN") return "Live";
  if (c.status === "COMPLETED") return "Done";
  return c.isInteractive ? "Session" : "Class";
}

function classTypeColor(c: ClassItem) {
  if (c.status === "JOIN") return "rgb(0,219,232)";
  if (c.status === "COMPLETED") return "rgb(100,116,139)";
  return "rgb(139,92,246)";
}

// ── Mentorship card (dynamic) ──────────────────────────────────────────────

function MentorshipCard({ live, today }: { live: ClassItem[]; today: ClassItem[] }) {
  const featured = live[0] ?? today[0] ?? null;
  const isLive = featured?.status === "JOIN";

  if (!featured) {
    return (
      <div
        style={{
          borderRadius: 12,
          background: "var(--ax-card-bg)",
          border: "1px solid var(--ax-border)",
          boxShadow: "var(--ax-shadow-card)",
          padding: 20,
          textAlign: "center",
        }}
      >
        <Video size={22} style={{ color: "var(--ax-dim)", margin: "0 auto 10px" }} />
        <div style={{ fontSize: 13, color: "var(--ax-muted)" }}>No live session right now</div>
        <div style={{ fontSize: 11, color: "var(--ax-dim)", marginTop: 4 }}>Check back when your class starts</div>
      </div>
    );
  }

  return (
    <div
      style={{
        borderRadius: 12,
        background: "var(--ax-card-bg)",
        border: `1px solid ${isLive ? "rgba(0,219,232,0.25)" : "var(--ax-border)"}`,
        boxShadow: "var(--ax-shadow-card)",
        padding: 20,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        className="theme-orb"
        style={{
          position: "absolute", right: -20, top: -30, width: 80, height: 80,
          borderRadius: "50%",
          background: isLive
            ? "linear-gradient(rgb(0,219,232) 0%,rgb(59,130,255) 100%)"
            : "linear-gradient(rgb(139,92,246) 0%,rgb(59,130,255) 100%)",
          opacity: 0.15, filter: "blur(20px)",
        }}
      />
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          backgroundColor: isLive ? "rgba(0,219,232,0.1)" : "rgba(139,92,246,0.1)",
          border: `1px solid ${isLive ? "rgba(0,219,232,0.2)" : "rgba(139,92,246,0.2)"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: isLive ? "rgb(0,219,232)" : "rgb(139,92,246)",
        }}>
          <Video size={15} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {isLive && (
            <span style={{
              display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700,
              color: "rgb(0,219,232)", background: "rgba(0,219,232,0.12)",
              border: "1px solid rgba(0,219,232,0.25)", borderRadius: 4, padding: "2px 7px",
            }}>
              <span style={{
                width: 5, height: 5, borderRadius: "50%", background: "rgb(0,219,232)",
                boxShadow: "0 0 6px rgb(0,219,232)", display: "inline-block",
              }} />
              LIVE
            </span>
          )}
          <span style={{ fontSize: 10, color: "var(--ax-muted)" }}>
            {formatClassTime(featured.startDateTime)}
          </span>
        </div>
      </div>
      {/* Body */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 18, color: "var(--ax-text)", fontWeight: 600, lineHeight: "27px" }}>
          {isLive ? "Live Session" : "Upcoming Session"}
        </div>
        <div style={{ fontSize: 13, color: "var(--ax-muted)", lineHeight: "19.5px", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {featured.topic}
        </div>
        {featured.batchName && (
          <div style={{ fontSize: 11, color: "var(--ax-dim)", marginTop: 2 }}>{featured.batchName}</div>
        )}
      </div>
      {/* Footer */}
      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8 }}>
        <Calendar size={13} style={{ color: "var(--ax-dim)", flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: "var(--ax-muted)", flex: 1 }}>
          {isLive ? "In progress" : formatClassTime(featured.startDateTime)}
        </span>
        {isLive && featured.zoomJoinUrl ? (
          <a
            href={featured.zoomJoinUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "5px 12px", borderRadius: 6, border: "none",
              background: figmaGradient, color: "var(--ax-primary-action-text)",
              fontSize: 11, fontWeight: 600, fontFamily: "Poppins",
              cursor: "pointer", textDecoration: "none",
            }}
          >
            Join Now
          </a>
        ) : (
          <span style={{
            fontSize: 10, padding: "3px 9px", borderRadius: 4,
            background: "rgba(139,92,246,0.12)", color: "rgb(139,92,246)",
            border: "1px solid rgba(139,92,246,0.25)", fontWeight: 600,
          }}>
            {featured.isInteractive ? "Session" : "Class"}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Small class row card ──────────────────────────────────────────────────

function ClassRow({ item }: { item: ClassItem }) {
  const color = classTypeColor(item);
  const label = classTypeLabel(item);
  const Icon = item.status === "COMPLETED" ? CheckCircle : item.status === "JOIN" ? Video : Clock;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "11px 14px", borderRadius: 10,
      background: "var(--ax-card-bg)", border: "1px solid var(--ax-border)",
      boxShadow: "var(--ax-shadow-card)", marginBottom: 8,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        backgroundColor: `${color}22`, border: `1px solid ${color}44`,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, color,
      }}>
        <Icon size={14} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ax-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {item.topic}
        </div>
        <div style={{ fontSize: 11, color: "var(--ax-dim)", marginTop: 2 }}>
          {formatClassTime(item.startDateTime)}
          {item.batchName ? ` · ${item.batchName}` : ""}
        </div>
      </div>
      {item.status === "JOIN" && item.zoomJoinUrl ? (
        <a
          href={item.zoomJoinUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: `${color}22`, color, border: `1px solid ${color}33`, textDecoration: "none", fontWeight: 600 }}
        >
          Join
        </a>
      ) : (
        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: `${color}22`, color, border: `1px solid ${color}33` }}>
          {label}
        </span>
      )}
    </div>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  const getUrl = useCmsUrl();
  return (
    <Link
      to={getUrl(href)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 8,
        marginBottom: 4,
        transition: "background 0.14s",
        color: "var(--ax-muted)",
        textDecoration: "none",
      }}
      onMouseEnter={(event: any) => { event.currentTarget.style.background = "var(--ax-hover)"; }}
      onMouseLeave={(event: any) => { event.currentTarget.style.background = "transparent"; }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          background: "rgba(59,130,255,0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#4f7cff",
        }}
      >
        {icon}
      </div>
      <span style={{ fontSize: 13, color: "var(--ax-text)", flex: 1 }}>{label}</span>
      <ArrowRight size={12} />
    </Link>
  );
}

export default function DashboardPage() {
  const getUrl = useCmsUrl();
  const user = useCmsAuthStore((state) => state.user);
  const setBatches = useCmsBatchStore((state) => state.setBatches);
  const batches = useCmsBatchStore((state) => state.batches);
  const setNotifications = useCmsNotificationStore((state) => state.setNotifications);
  useCmsSocket();

  const { data: batchData, isLoading: batchLoading } = useQuery({
    queryKey: ["batches"],
    queryFn: async () => (await api.get("/batches")).data,
    staleTime: 5 * 60_000,      // 5 min — batch list changes rarely; socket pushes live updates
  });
  const { data: pinnedData, isLoading: pinnedLoading } = useQuery({
    queryKey: ["pinned-rooms"],
    queryFn: async () => (await api.get("/pinned")).data as { pinnedBatches: any[]; pinnedChannels: any[] },
    staleTime: 5 * 60_000,      // 5 min — pin state toggled by admin; no need to re-fetch on every visit
  });
  const { data: notifData } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => (await api.get("/notifications")).data,
    staleTime: 2 * 60_000,      // 2 min — socket pushes new notifs in real-time
  });

  const { data: classesData } = useQuery<{
    live: ClassItem[];
    today: ClassItem[];
    upcoming: ClassItem[];
    completed: ClassItem[];
  }>({
    queryKey: ["my-classes"],
    queryFn: async () => (await api.get("/my-classes")).data,
    refetchInterval: 2 * 60 * 1000, // poll every 2 min so JOIN/UPCOMING status stays current
  });

  useEffect(() => { if (batchData) setBatches(batchData); }, [batchData, setBatches]);
  useEffect(() => { if (notifData) setNotifications(notifData); }, [notifData, setNotifications]);

  const isRoomsLoading = batchLoading || pinnedLoading;

  const isLearner = user?.role === "learner";
  const isMentor  = user?.role === "mentor";
  const generalBatches = (Array.isArray(batches) ? batches : []).filter((batch) => batch.type === "general" || batch.type === "public");
  const enrolledBatches = (Array.isArray(batches) ? batches : []).filter((batch) => (
    isMentor ? batch.userMembership?.role_in_batch === "mentor" : batch.userMembership !== null
  ));

  // Stat cards are role-aware
  const stats = isLearner
    ? [
        {
          icon: <BookOpen size={20} />,
          value: String(enrolledBatches.length || 0).padStart(2, "0"),
          label: "My Enrolled Batches",
          iconBg: "rgba(52,211,153,0.2)",
        },
        {
          icon: <Video size={20} />,
          value: String(classesData?.live?.length || 0).padStart(2, "0"),
          label: "Live Right Now",
          iconBg: "rgba(0,219,232,0.2)",
        },
        {
          icon: <Calendar size={20} />,
          value: String(
            (classesData?.today?.length || 0) + (classesData?.upcoming?.length || 0)
          ).padStart(2, "0"),
          label: "Upcoming Classes",
          iconBg: "rgba(139,92,246,0.2)",
        },
      ]
    : isMentor
    ? [
        {
          icon: <Users size={20} />,
          value: String(enrolledBatches.length || 0).padStart(2, "0"),
          label: "My Batches",
          iconBg: "rgba(52,211,153,0.2)",
        },
        {
          icon: <Video size={20} />,
          value: String(classesData?.live?.length || 0).padStart(2, "0"),
          label: "Live Right Now",
          iconBg: "rgba(0,219,232,0.2)",
        },
        {
          icon: <Calendar size={20} />,
          value: String(
            (classesData?.today?.length || 0) + (classesData?.upcoming?.length || 0)
          ).padStart(2, "0"),
          label: "Upcoming Sessions",
          iconBg: "rgba(139,92,246,0.2)",
        },
      ]
    : [
        {
          icon: <Hash size={20} />,
          value: String(batchData?.length || 0).padStart(2, "0"),
          label: "Channels Available",
          iconBg: "rgba(89,149,232,0.2)",
        },
        {
          icon: <TrendingUp size={20} />,
          value: String(enrolledBatches.length || 0).padStart(2, "0"),
          label: "Enrolled in Batches",
          iconBg: "rgba(52,211,153,0.2)",
        },
        {
          icon: <BookOpen size={20} />,
          value: String(generalBatches.length || 0).padStart(2, "0"),
          label: "General Open to All",
          iconBg: "rgba(20,184,166,0.2)",
        },
      ];

  const pinnedBatches  = pinnedData?.pinnedBatches  ?? [];
  const pinnedChannels = pinnedData?.pinnedChannels ?? [];

  // Admin sees pinned rooms; mentors see assigned rooms; learners see enrolled/general rooms.
  const displayRooms = user?.role === "admin"
    ? []  // admin uses pinnedBatches + pinnedChannels directly in JSX
    : [...pinnedBatches, ...generalBatches, ...enrolledBatches]
        .filter((b, i, arr) => arr.findIndex((x) => x.id === b.id) === i)
        .slice(0, 6);

  return (
    <>
      <FigmaTopBar title="Home" />
      <div className="dashboard-layout page-scroll-content figma-scroll" style={{ padding: "32px 32px 40px", display: "flex", gap: 32 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <FigmaOverline style={{ marginBottom: 16 }}>
            {isLearner ? "My Overview" : isMentor ? "Mentor Overview" : "Admin Insights"}
          </FigmaOverline>
          <div className="responsive-stat-grid" style={{ display: "flex", gap: 16, marginBottom: 32 }}>
            {stats.map((stat) => <FigmaStatCard key={stat.label} {...stat} />)}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <FigmaOverline>{isLearner ? "My Rooms" : isMentor ? "My Batch Rooms" : "Active Rooms"}</FigmaOverline>
            <Link to={getUrl("/batches")} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#4f7cff", textDecoration: "none" }}>
              View all <ArrowRight size={14} />
            </Link>
          </div>

          <div>
            {isRoomsLoading ? (
              // Skeleton loading — show immediately while queries are in-flight
              Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    borderRadius: 12,
                    backgroundColor: "var(--ax-panel)",
                    border: "1px solid var(--ax-border)",
                    padding: "16px 20px",
                    marginBottom: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    animation: "cms-pulse 1.4s ease-in-out infinite",
                    animationDelay: `${i * 0.12}s`,
                  }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--ax-border)" }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ height: 13, borderRadius: 6, background: "var(--ax-border)", width: "55%", marginBottom: 8 }} />
                    <div style={{ height: 11, borderRadius: 6, background: "var(--ax-border)", width: "30%", opacity: 0.6 }} />
                  </div>
                  <div style={{ width: 60, height: 11, borderRadius: 6, background: "var(--ax-border)", opacity: 0.5 }} />
                </div>
              ))
            ) : user?.role === "admin" ? (
              // Admin: only pinned batches + pinned channels
              pinnedBatches.length === 0 && pinnedChannels.length === 0 ? (
                <div style={{
                  borderRadius: 12, backgroundColor: "var(--ax-panel)",
                  border: "1px solid var(--ax-border)", padding: 32,
                  textAlign: "center", color: "var(--ax-dim)", fontSize: 14,
                }}>
                  No pinned rooms yet. Pin a batch or channel to show it here.
                </div>
              ) : (
                <>
                  {pinnedBatches.map((batch, index) => (
                    <RoomRow key={batch.id} batch={batch} index={index} />
                  ))}
                  {pinnedChannels.map((channel, index) => (
                    <PinnedChannelRow key={channel.id} channel={channel} index={pinnedBatches.length + index} />
                  ))}
                </>
              )
            ) : (
              // Learner / Mentor: enrolled + general rooms
              displayRooms.length > 0 ? (
                displayRooms.map((batch, index) => <RoomRow key={batch.id} batch={batch} index={index} />)
              ) : (
                <div style={{
                  borderRadius: 12, backgroundColor: "var(--ax-panel)",
                  border: "1px solid var(--ax-border)", padding: 32,
                  textAlign: "center", color: "var(--ax-dim)", fontSize: 14,
                }}>
                  No active rooms yet.
                </div>
              )
            )}
          </div>
        </div>

        <div className="dashboard-side-panel" style={{ width: 300, flexShrink: 0 }}>

          {/* ── Mentorship: live / today's first class ── */}
          <FigmaOverline style={{ marginBottom: 16 }}>Mentorship</FigmaOverline>
          <MentorshipCard
            live={classesData?.live ?? []}
            today={classesData?.today ?? []}
          />

          {/* ── Today's classes (if more than the featured one) ── */}
          {(() => {
            const live = classesData?.live ?? [];
            const today = classesData?.today ?? [];
            // Skip the first item already shown in the big card
            const featured = live[0] ?? today[0];
            const extraLive = featured && live[0]?.id === featured.id ? live.slice(1) : live;
            const extraToday = featured && today[0]?.id === featured.id ? today.slice(1) : today;
            const extras = [...extraLive, ...extraToday];
            if (extras.length === 0) return null;
            return (
              <>
                <FigmaOverline style={{ margin: "24px 0 12px" }}>Today</FigmaOverline>
                {extras.map((c) => <ClassRow key={c.id} item={c} />)}
              </>
            );
          })()}

          {/* ── Upcoming classes ── */}
          {(classesData?.upcoming?.length ?? 0) > 0 && (
            <>
              <FigmaOverline style={{ margin: "24px 0 12px" }}>Upcoming</FigmaOverline>
              {classesData?.upcoming?.map((c) => <ClassRow key={c.id} item={c} />)}
            </>
          )}

          {/* ── Recently completed ── */}
          {(classesData?.completed?.length ?? 0) > 0 && (
            <>
              <FigmaOverline style={{ margin: "24px 0 12px" }}>Completed</FigmaOverline>
              {classesData?.completed?.map((c) => <ClassRow key={c.id} item={c} />)}
            </>
          )}

          {/* ── Empty state when no classes at all ── */}
          {classesData &&
            (classesData.live?.length ?? 0) === 0 &&
            (classesData.today?.length ?? 0) === 0 &&
            (classesData.upcoming?.length ?? 0) === 0 &&
            (classesData.completed?.length ?? 0) === 0 && (
              <div style={{ textAlign: "center", padding: "16px 0", color: "var(--ax-dim)", fontSize: 12 }}>
                No classes scheduled yet.
              </div>
            )}


          {/* ── Quick Links ── */}
          <FigmaOverline style={{ margin: "28px 0 16px" }}>Quick Links</FigmaOverline>
          {user?.role === "admin" && <QuickLink href="/admin" icon={<Shield size={14} />} label="Admin Console" />}
          {user?.role === "admin" && <QuickLink href="/batches" icon={<Folder size={15} />} label="Manage Batches" />}
          <QuickLink href="/dm" icon={<MessageSquare size={16} />} label="Direct Messages" />
          {user?.role === "mentor" && <QuickLink href="/mentor" icon={<Users size={14} />} label="Mentor Hub" />}
        </div>
      </div>
    </>
  );
}
