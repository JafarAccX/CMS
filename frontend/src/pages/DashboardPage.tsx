import { useEffect } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import api from "../api/client";
import { useAuthStore } from "../store/authStore";
import { useBatchStore } from "../store/batchStore";
import { useNotificationStore } from "../store/notificationStore";
import { useSocket } from "../hooks/useSocket";
import {
  ArrowRight,
  BookOpen,
  Calendar,
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

function RoomRow({ batch, index }: { batch: any; index: number }) {
  const members = batch._count?.memberships || 0;
  const channels = batch._count?.channels || 0;
  const isOpen = batch.type === "general" || batch.type === "public";
  const href = batch.hasAccess || isOpen ? `/batch/${batch.id}` : "/subscription";

  return (
    <Link to={href} style={{ textDecoration: "none", display: "block" }}>
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

function MentorshipCard() {
  return (
    <div
      style={{
        borderRadius: 12,
        background: "var(--ax-card-bg)",
        border: "1px solid var(--ax-border)",
        boxShadow: "var(--ax-shadow-card)",
        padding: 20,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          right: -20,
          top: -30,
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: "linear-gradient(rgb(0,219,232) 0%,rgb(59,130,255) 100%)",
          opacity: 0.15,
          filter: "blur(20px)",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            backgroundColor: "rgba(0,219,232,0.1)",
            border: "1px solid rgba(0,219,232,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgb(0,219,232)",
          }}
        >
          <Video size={15} />
        </div>
        <span style={{ fontSize: 10, color: "var(--ax-muted)" }}>Starts 2:00 PM</span>
      </div>
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 18, color: "var(--ax-text)", fontWeight: 600, lineHeight: "27px" }}>Live Session</div>
        <div style={{ fontSize: 13, color: "var(--ax-muted)", lineHeight: "19.5px", marginTop: 4 }}>
          Advanced Hooks Deep Dive.
        </div>
      </div>
      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: "linear-gradient(140deg,#7fe6f0,#2bb8d4 60%,#0e7490)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 700,
            color: "#fff",
          }}
        >
          M
        </div>
        <span style={{ fontSize: 12, color: "var(--ax-muted)" }}>with mentor</span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          style={{
            padding: "5px 12px",
            borderRadius: 6,
            border: "none",
            background: figmaGradient,
            color: "var(--ax-primary-action-text)",
            fontSize: 11,
            fontWeight: 600,
            fontFamily: "Poppins",
            cursor: "pointer",
          }}
        >
          Join Now
        </button>
      </div>
    </div>
  );
}

function UpcomingCard({ title, time, type, color }: { title: string; time: string; type: string; color: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        borderRadius: 10,
        background: "var(--ax-card-bg)",
        border: "1px solid var(--ax-border)",
        boxShadow: "var(--ax-shadow-card)",
        marginBottom: 8,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: `${color}22`,
          border: `1px solid ${color}44`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          color,
        }}
      >
        <Calendar size={14} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--ax-text)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 11, color: "var(--ax-dim)", marginTop: 2 }}>{time}</div>
      </div>
      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: `${color}22`, color, border: `1px solid ${color}33` }}>
        {type}
      </span>
    </div>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <Link
      to={href}
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
      onMouseEnter={(event) => { event.currentTarget.style.background = "var(--ax-hover)"; }}
      onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; }}
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
  const user = useAuthStore((state) => state.user);
  const setBatches = useBatchStore((state) => state.setBatches);
  const batches = useBatchStore((state) => state.batches);
  const setNotifications = useNotificationStore((state) => state.setNotifications);
  useSocket();

  const { data: batchData } = useQuery({
    queryKey: ["batches"],
    queryFn: async () => (await api.get("/batches")).data,
  });
  const { data: pinnedData } = useQuery({
    queryKey: ["pinned-rooms"],
    queryFn: async () => (await api.get("/pinned")).data as { pinnedBatches: any[]; pinnedChannels: any[] },
  });
  const { data: notifData } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => (await api.get("/notifications")).data,
  });

  useEffect(() => { if (batchData) setBatches(batchData); }, [batchData, setBatches]);
  useEffect(() => { if (notifData) setNotifications(notifData); }, [notifData, setNotifications]);

  const generalBatches = batches.filter((batch) => batch.type === "general");
  const enrolledBatches = batches.filter((batch) => batch.userMembership !== null);
  const stats = [
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

  const displayRooms = [...(pinnedData?.pinnedBatches || []), ...generalBatches, ...enrolledBatches]
    .filter((batch, index, list) => list.findIndex((item) => item.id === batch.id) === index)
    .slice(0, 6);

  return (
    <>
      <FigmaTopBar title="Home" />
      <div className="dashboard-layout page-scroll-content figma-scroll" style={{ padding: "32px 32px 40px", display: "flex", gap: 32 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <FigmaOverline style={{ marginBottom: 16 }}>Admin Insights</FigmaOverline>
          <div className="responsive-stat-grid" style={{ display: "flex", gap: 16, marginBottom: 32 }}>
            {stats.map((stat) => <FigmaStatCard key={stat.label} {...stat} />)}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <FigmaOverline>Active Rooms</FigmaOverline>
            <Link to="/batches" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#4f7cff", textDecoration: "none" }}>
              View all <ArrowRight size={14} />
            </Link>
          </div>

          <div>
            {displayRooms.length > 0 ? (
              displayRooms.map((batch, index) => <RoomRow key={batch.id} batch={batch} index={index} />)
            ) : (
              <div
                style={{
                  borderRadius: 12,
                  backgroundColor: "var(--ax-panel)",
                  border: "1px solid var(--ax-border)",
                  padding: 32,
                  textAlign: "center",
                  color: "var(--ax-dim)",
                  fontSize: 14,
                }}
              >
                No active rooms yet.
              </div>
            )}
          </div>
        </div>

        <div className="dashboard-side-panel" style={{ width: 300, flexShrink: 0 }}>
          <FigmaOverline style={{ marginBottom: 16 }}>Mentorship</FigmaOverline>
          <MentorshipCard />

          <FigmaOverline style={{ margin: "28px 0 16px" }}>Upcoming</FigmaOverline>
          <UpcomingCard title="React Hooks Deep Dive" time="Today, 2:00 PM" type="Live" color="rgb(0,219,232)" />
          <UpcomingCard title="System Design Review" time="Tomorrow, 11:00 AM" type="Session" color="rgb(139,92,246)" />
          <UpcomingCard title="UI/UX Critique" time="Thu, 3:30 PM" type="Workshop" color="rgb(52,211,153)" />

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
