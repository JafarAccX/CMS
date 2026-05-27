import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, MessageCircle, MoreVertical, Paperclip, Phone, Plus, Search, Send, Smile, Video, X } from "lucide-react";
import api from "../api/client";
import { useAuthStore } from "../store/authStore";
import { useDmStore } from "../store/dmStore";
import { useUiStore } from "../store/uiStore";
import { useSocket } from "../hooks/useSocket";
import TypingIndicator from "../components/TypingIndicator";
import { figmaGradient } from "../components/FigmaShared";

const roleBadge: Record<string, { bg: string; color: string; label: string }> = {
  mentor: { bg: "rgba(0,94,100,0.2)", color: "rgb(0,219,232)", label: "MENTOR" },
  admin: { bg: "rgba(79,124,255,0.15)", color: "#afc6ff", label: "ADMIN" },
  learner: { bg: "rgba(59,73,94,0.2)", color: "#94a3b8", label: "LEARNER" },
};

const avatarColors = [
  "linear-gradient(140deg,#7fe6f0,#2bb8d4 60%,#0e7490)",
  "linear-gradient(140deg,#ff9d8c,#f56b56 60%,#c9442f)",
  "linear-gradient(140deg,#b78bff,#7c5cff 60%,#5b3ee0)",
  "linear-gradient(140deg,#6ee7c7,#14b89a 60%,#0e7e6a)",
  "linear-gradient(140deg,#ffd58a,#e5a64a 60%,#aa6f1a)",
  "linear-gradient(140deg,#8aa3ff,#4f6bff 60%,#3940cc)",
];

function badgeFor(role?: string) {
  return roleBadge[(role || "learner").toLowerCase()] || roleBadge.learner;
}

function avatarFor(user: { id?: string; role?: string }, index = 0) {
  const role = (user.role || "").toLowerCase();
  if (role === "mentor") return avatarColors[0];
  if (role === "admin") return avatarColors[1];
  const seed = user.id ? Array.from(user.id).reduce((sum, char) => sum + char.charCodeAt(0), 0) : index;
  return avatarColors[seed % avatarColors.length];
}

function timeLabel(value?: string) {
  if (!value) return "";
  try {
    const date = new Date(value);
    const diff = Date.now() - date.getTime();
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))}m`;
    if (diff < day) return `${Math.floor(diff / hour)}h`;
    if (diff < day * 2) return "Yesterday";
    return format(date, "EEE");
  } catch {
    return "";
  }
}

function ContactRow({
  conversation,
  index,
  online,
  active,
}: {
  conversation: any;
  index: number;
  online: boolean;
  active: boolean;
}) {
  const other = conversation.otherUser;
  const unread = conversation.unreadCount > 0;

  return (
    <Link to={`/dm/${conversation.id}`} style={{ textDecoration: "none", display: "block" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 12px",
          borderRadius: 10,
          background: active ? "rgba(59,130,255,0.1)" : "transparent",
          cursor: "pointer",
          position: "relative",
          transition: "background 0.14s",
        }}
        onMouseEnter={(event) => {
          if (!active) event.currentTarget.style.background = "rgba(255,255,255,0.04)";
        }}
        onMouseLeave={(event) => {
          if (!active) event.currentTarget.style.background = "transparent";
        }}
      >
        {active && (
          <div
            style={{
              position: "absolute",
              left: 0,
              top: "50%",
              transform: "translateY(-50%)",
              width: 3,
              height: 32,
              borderRadius: "0 4px 4px 0",
              background: figmaGradient,
              boxShadow: "0 0 8px rgba(59,130,255,0.5)",
            }}
          />
        )}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: avatarFor(other, index),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            {other.username?.[0]?.toUpperCase()}
          </div>
          {online && (
            <span
              style={{
                position: "absolute",
                right: 0,
                bottom: 0,
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "rgb(53,221,61)",
                border: "2px solid #05070a",
                boxShadow: "0 0 5px rgba(53,221,61,0.5)",
              }}
            />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
            <span style={{ color: "#e0e3e6", fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {other.username}
            </span>
            <span style={{ color: "#424c64", fontSize: 11, marginLeft: 8, flexShrink: 0 }}>
              {timeLabel(conversation.updated_at || conversation.lastMessage?.created_at)}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ flex: 1, color: "#6c7793", fontSize: 12, lineHeight: "18px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", maxWidth: 230 }}>
              {conversation.lastMessage?.content || `Message ${other.username}`}
            </p>
            {unread && (
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: figmaGradient,
                  color: "#05070a",
                  fontSize: 10,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginLeft: 6,
                }}
              >
                {conversation.unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

function StartCard({ onNew }: { onNew: () => void }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
      <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(59,130,255,0.08)", border: "1px solid rgba(59,130,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <MessageCircle size={42} color="rgba(59,130,255,0.42)" strokeWidth={1.4} />
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#e0e3e6", marginBottom: 8 }}>Your Messages</div>
        <div style={{ fontSize: 14, color: "#6c7793", lineHeight: 1.6, maxWidth: 280 }}>Send private messages to mentors, learners, and team members.</div>
      </div>
      <button
        type="button"
        onClick={onNew}
        style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 20px", borderRadius: 8, border: "none", cursor: "pointer", background: figmaGradient, boxShadow: "0 0 14px rgba(59,130,255,0.3)", color: "#05070a", fontSize: 13, fontWeight: 600 }}
      >
        <Plus size={14} />
        New Message
      </button>
    </div>
  );
}

function MessageBubble({ message, isMe, activeConv, userId }: { message: any; isMe: boolean; activeConv: any; userId?: string }) {
  const senderName = isMe ? "Me" : message.sender?.username || activeConv.otherUser.username;
  const avatarUser = isMe ? { id: userId, role: "admin" } : activeConv.otherUser;

  return (
    <div style={{ display: "flex", gap: 12, flexDirection: isMe ? "row-reverse" : "row", marginBottom: 16 }}>
      {!isMe && (
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: avatarFor(avatarUser), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
          {senderName?.[0]?.toUpperCase()}
        </div>
      )}
      <div className="dm-message-bubble" style={{ maxWidth: "62%", display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start" }}>
        {!isMe && <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 4 }}>{senderName}</span>}
        <div
          style={{
            borderRadius: isMe ? "16px 0 16px 16px" : "0 16px 16px 16px",
            background: isMe ? "linear-gradient(135deg,rgba(59,130,255,0.25),rgba(0,219,232,0.15))" : "linear-gradient(rgb(10,14,20),rgb(12,24,37))",
            border: `1px solid ${isMe ? "rgba(59,130,255,0.3)" : "rgb(30,41,59)"}`,
            padding: "10px 14px",
            color: "#e0e3e6",
            fontSize: 14,
            lineHeight: 1.6,
            opacity: message.isOptimistic ? 0.62 : 1,
          }}
        >
          {message.content}
        </div>
        <span style={{ fontSize: 10, color: "#424c64", marginTop: 4 }}>{format(new Date(message.created_at), "hh:mm a")}</span>
      </div>
    </div>
  );
}

function RightUtilityPanel({ activeConv, online }: { activeConv: any; online: boolean }) {
  const badge = badgeFor(activeConv.otherUser.role);
  const files = ["hooks-patterns.pdf", "design-system.fig", "notes.md"];

  return (
    <aside className="dm-right-panel" style={{ width: 280, flexShrink: 0, borderLeft: "1px solid rgba(255,255,255,0.07)", background: "rgba(10,13,18,0.7)", backdropFilter: "blur(12px)", padding: "24px 20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 24, position: "relative", zIndex: 2 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, paddingBottom: 20, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: avatarFor(activeConv.otherUser), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: "#fff", boxShadow: "0 0 20px rgba(59,130,255,0.2)" }}>
          {activeConv.otherUser.username?.[0]?.toUpperCase()}
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#e0e3e6" }}>{activeConv.otherUser.username}</div>
          <span style={{ display: "inline-flex", marginTop: 5, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: badge.bg, color: badge.color, border: `1px solid ${badge.color}33` }}>
            {badge.label}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: online ? "rgb(53,221,61)" : "#424c64", boxShadow: online ? "0 0 5px rgba(53,221,61,0.5)" : "none" }} />
          <span style={{ fontSize: 12, color: online ? "rgb(53,221,61)" : "#6c7793" }}>{online ? "Online" : "Offline"}</span>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6c7793", marginBottom: 12, paddingBottom: 6, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>Today</div>
        {[
          { color: "rgb(59,130,255)", title: "1:1 Mentoring", sub: "with Alex Johnson", time: "2:00 PM" },
          { color: "rgb(0,219,232)", title: "Course Outline V2", sub: "Pending Approval", action: "Review" },
        ].map((item) => (
          <div key={item.title} style={{ borderRadius: 10, background: "rgb(10,12,17)", border: "1px solid rgba(255,255,255,0.08)", padding: "14px 14px 14px 18px", marginBottom: 8, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: item.color, boxShadow: `0 0 10px ${item.color}80` }} />
            {item.time && <div style={{ fontSize: 10, color: "#6c7793", marginBottom: 2 }}>{item.time}</div>}
            {item.sub && <div style={{ fontSize: 10, color: item.color, marginBottom: 2 }}>{item.sub}</div>}
            <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{item.title}</div>
            {item.action && <button type="button" style={{ marginTop: 6, fontSize: 11, color: item.color, background: "none", border: "none", cursor: "pointer", padding: 0 }}>{item.action} -&gt;</button>}
          </div>
        ))}
      </div>

      <div>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6c7793", marginBottom: 12, paddingBottom: 6, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>Shared Files</div>
        {files.map((file) => (
          <div key={file} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, marginBottom: 4 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: "rgba(59,130,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#afc6ff", flexShrink: 0 }}>
              {file.split(".").pop()?.toUpperCase()}
            </div>
            <span style={{ fontSize: 12, color: "#94a3b8", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

function ConversationDrawer({
  users,
  search,
  onSearch,
  onClose,
  onStart,
}: {
  users: any[];
  search: string;
  onSearch: (value: string) => void;
  onClose: () => void;
  onStart: (id: string) => void;
}) {
  return (
    <aside
      className="dm-drawer"
      style={{
        width: 330,
        position: "absolute",
        right: 14,
        top: 14,
        bottom: 14,
        zIndex: 20,
        background: "rgba(10,13,18,0.98)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        boxShadow: "-30px 0 70px rgba(0,0,0,0.35)",
        padding: "18px 18px 12px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h2 style={{ color: "#e0e3e6", fontSize: 16, fontWeight: 700 }}>Start your conversation with</h2>
        <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", display: "flex" }}>
          <X size={16} />
        </button>
      </div>
      <div style={{ position: "relative", marginBottom: 14 }}>
        <Search size={13} color="#424c64" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Find a conversation..."
          style={{ width: "100%", height: 30, borderRadius: 5, background: "rgb(7,9,13)", border: "1px solid rgb(30,41,59)", color: "#e0e3e6", fontSize: 11, padding: "0 58px 0 30px", fontFamily: "Poppins" }}
        />
        <div style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", display: "flex", gap: 3 }}>
          {["Cmd", "K"].map((key) => (
            <span key={key} style={{ height: 16, minWidth: 16, borderRadius: 3, background: "rgba(50,53,56,0.5)", color: "#424c64", fontSize: 7, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>
              {key}
            </span>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", flex: 1, minHeight: 0 }}>
        {users.map((item, index) => {
          const badge = badgeFor(item.role);
          return (
            <button key={item.id} type="button" onClick={() => onStart(item.id)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "7px 4px", border: "none", background: "transparent", color: "#e0e3e6", cursor: "pointer", textAlign: "left" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: avatarFor(item, index), display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700 }}>
                {item.username?.[0]?.toUpperCase()}
              </div>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 11, fontWeight: 700 }}>{item.username}</span>
                  <span style={{ borderRadius: 3, padding: "1px 4px", background: badge.bg, color: badge.color, fontSize: 7, fontWeight: 700 }}>{badge.label}</span>
                </span>
                <span style={{ display: "block", fontSize: 10, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.email}</span>
              </span>
              <span style={{ color: "#94a3b8", fontSize: 15 }}>-&gt;</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

export default function DmPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const conversations = useDmStore((state) => state.conversations);
  const setConversations = useDmStore((state) => state.setConversations);
  const messages = useDmStore((state) => state.messages);
  const setMessages = useDmStore((state) => state.setMessages);
  const dmTypingUsers = useUiStore((state) => state.dmTypingUsers);
  const onlineUsers = useUiStore((state) => state.onlineUsers);
  const { joinDm, leaveDm, sendDm, startDmTyping, stopDmTyping, markDmRead } = useSocket();
  const [input, setInput] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [showDrawer, setShowDrawer] = useState(false);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [conversationId, showDrawer]);

  const { data: convData, refetch: refetchConvs } = useQuery({
    queryKey: ["dm-conversations"],
    queryFn: async () => (await api.get("/dm/conversations")).data,
  });
  useEffect(() => { if (convData) setConversations(convData); }, [convData, setConversations]);

  const { data: msgData } = useQuery({
    queryKey: ["dm-messages", conversationId],
    queryFn: async () => (await api.get(`/dm/conversations/${conversationId}/messages`)).data,
    enabled: !!conversationId,
  });
  useEffect(() => { if (msgData && conversationId) setMessages(conversationId, msgData.messages); }, [msgData, conversationId, setMessages]);

  const { data: dmUsers = [] } = useQuery<any[]>({
    queryKey: ["dm-users"],
    queryFn: async () => (await api.get("/dm/users")).data,
    enabled: showDrawer,
  });

  useEffect(() => {
    if (!conversationId) return;
    joinDm(conversationId);
    markDmRead(conversationId);
    return () => { leaveDm(conversationId); };
  }, [conversationId, joinDm, leaveDm, markDmRead]);

  useEffect(() => {
    const container = messagesScrollRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages, conversationId]);

  const activeConv = conversations.find((conversation) => conversation.id === conversationId);
  const convMessages = conversationId ? messages[conversationId] || [] : [];
  const currentDmTyping = conversationId ? dmTypingUsers[conversationId] || [] : [];
  const filteredConversations = conversations.filter((conversation) => {
    const query = conversationSearch.trim().toLowerCase();
    return !query || conversation.otherUser.username.toLowerCase().includes(query);
  });
  const drawerUsers = dmUsers.filter((item: any) => {
    const query = userSearch.trim().toLowerCase();
    return !query || item.username?.toLowerCase().includes(query) || item.email?.toLowerCase().includes(query);
  });

  const handleTyping = () => {
    if (!conversationId) return;
    startDmTyping(conversationId);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => stopDmTyping(conversationId), 2000);
  };

  const handleSend = () => {
    if (!input.trim() || !conversationId || !user) return;
    const tempId = Math.random().toString(36).slice(2);
    useDmStore.getState().addOptimisticMessage(conversationId, {
      id: tempId,
      tempId,
      conversation_id: conversationId,
      sender_id: user.id,
      content: input.trim(),
      is_read: false,
      created_at: new Date().toISOString(),
      sender: { id: user.id, username: user.username, role: user.role },
      attachments: [],
    });
    sendDm(conversationId, input.trim(), tempId, []);
    setInput("");
    refetchConvs();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const startNewConversation = async (targetUserId: string) => {
    const { data } = await api.post("/dm/conversations", { targetUserId });
    setShowDrawer(false);
    refetchConvs();
    navigate(`/dm/${data.id}`);
  };

  const activeOnline = activeConv ? onlineUsers.has(activeConv.otherUser.id) : false;

  return (
    <div className="dm-layout" style={{ height: "100%", minHeight: 0, width: "100%", display: "flex", background: "#05070a", color: "#e0e3e6", overflow: "hidden", position: "relative" }}>
      <aside className={`dm-contact-panel ${activeConv ? "dm-contact-panel--has-active" : ""}`} style={{ width: 384, flexShrink: 0, background: "rgba(16,20,22,0.5)", borderRight: "1px solid rgba(66,71,84,0.15)", backdropFilter: "blur(12px)", display: "flex", flexDirection: "column", position: "relative", zIndex: 2 }}>
        <div style={{ padding: "24px 24px 16px", borderBottom: "1px solid rgba(66,71,84,0.1)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button type="button" onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", display: "flex", padding: 4, cursor: "pointer" }}>
                <ArrowLeft size={16} />
              </button>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: "#e0e3e6", letterSpacing: "-0.02em" }}>Direct Messages</h1>
            </div>
            <button type="button" onClick={() => setShowDrawer(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 6, border: "1px solid rgba(66,71,84,0.25)", background: "rgba(50,53,56,0.3)", color: "#e0e3e6", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", cursor: "pointer" }}>
              <Plus size={10} />
              New
            </button>
          </div>

          <div style={{ position: "relative" }}>
            <Search size={16} color="#424c64" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input
              value={conversationSearch}
              onChange={(event) => setConversationSearch(event.target.value)}
              placeholder="Find a conversation..."
              style={{ width: "100%", height: 42, borderRadius: 8, border: "1px solid rgb(30,41,59)", background: "rgb(7,9,13)", color: "#e0e3e6", fontFamily: "Poppins", fontSize: 14, padding: "0 72px 0 40px" }}
            />
            <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", display: "flex", gap: 3 }}>
              {["Cmd", "K"].map((key) => (
                <span key={key} style={{ minWidth: 20, height: 22, borderRadius: 4, background: "rgba(50,53,56,0.5)", border: "1px solid rgba(66,71,84,0.2)", color: "#424c64", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{key}</span>
              ))}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
          <div style={{ color: "#6c7793", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", padding: "8px 4px 6px", marginBottom: 2 }}>Recent</div>
          {filteredConversations.map((conversation, index) => (
            <ContactRow key={conversation.id} conversation={conversation} index={index} online={onlineUsers.has(conversation.otherUser.id)} active={conversation.id === conversationId} />
          ))}
          {filteredConversations.length === 0 && <p style={{ color: "#424c64", fontSize: 12, textAlign: "center", paddingTop: 24 }}>No conversations yet</p>}
        </div>
      </aside>

      <main className="dm-main" style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", position: "relative", zIndex: 1 }}>
        {activeConv ? (
          <>
            <header className="dm-main-header" style={{ height: 64, flexShrink: 0, background: "rgba(10,12,17,0.6)", borderBottom: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(24px)", display: "flex", alignItems: "center", padding: "0 24px", gap: 16 }}>
              <button type="button" className="dm-chat-back" onClick={() => navigate("/dm")} style={{ background: "transparent", border: "none", color: "#94a3b8", display: "none", padding: 4 }}>
                <ArrowLeft size={17} />
              </button>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: avatarFor(activeConv.otherUser), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff" }}>
                  {activeConv.otherUser.username?.[0]?.toUpperCase()}
                </div>
                {activeOnline && <div style={{ position: "absolute", bottom: 0, right: 0, width: 9, height: 9, borderRadius: "50%", background: "rgb(53,221,61)", border: "2px solid #05070a" }} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: "#e0e3e6" }}>{activeConv.otherUser.username}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: badgeFor(activeConv.otherUser.role).bg, color: badgeFor(activeConv.otherUser.role).color, border: `1px solid ${badgeFor(activeConv.otherUser.role).color}33` }}>
                    {badgeFor(activeConv.otherUser.role).label}
                  </span>
                </div>
                <span style={{ fontSize: 12, color: activeOnline ? "rgb(53,221,61)" : "#6c7793" }}>{activeOnline ? "Online" : "Offline"}</span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {[<Phone size={16} />, <Video size={16} />, <MoreVertical size={16} />].map((icon, index) => (
                  <button key={index} type="button" style={{ width: 34, height: 34, borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8" }}>
                    {icon}
                  </button>
                ))}
              </div>
            </header>

            <div ref={messagesScrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "24px 24px 8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "0 0 20px" }}>
                <div style={{ flex: 1, height: 1, background: "rgb(30,41,59)" }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#424c64", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>Today</span>
                <div style={{ flex: 1, height: 1, background: "rgb(30,41,59)" }} />
              </div>
              {convMessages.map((message) => (
                <MessageBubble key={message.id} message={message} isMe={String(message.sender_id).toLowerCase() === String(user?.id).toLowerCase()} activeConv={activeConv} userId={user?.id} />
              ))}
            </div>

            <TypingIndicator users={currentDmTyping} />
            <div style={{ padding: "12px 20px 20px", flexShrink: 0 }}>
              <div style={{ borderRadius: 12, background: "rgba(5,7,10,0.3)", border: "1px solid rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", padding: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px" }}>
                  <button type="button" style={{ color: "#6c7793", background: "none", border: "none", cursor: "pointer", display: "flex", padding: 4 }}>
                    <Paperclip size={15} />
                  </button>
                  <textarea
                    value={input}
                    onChange={(event) => {
                      setInput(event.target.value);
                      handleTyping();
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={`Message ${activeConv.otherUser.username}...`}
                    rows={1}
                    style={{ flex: 1, resize: "none", background: "none", border: "none", color: "#e0e3e6", fontSize: 14, lineHeight: 1.6, padding: "0 4px", fontFamily: "Poppins" }}
                  />
                  <button type="button" style={{ color: "#6c7793", background: "none", border: "none", cursor: "pointer", display: "flex", padding: 4 }}>
                    <Smile size={16} />
                  </button>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 12px 8px" }}>
                  <button type="button" onClick={handleSend} disabled={!input.trim()} style={{ display: "flex", alignItems: "center", gap: 6, border: "none", borderRadius: 6, background: figmaGradient, color: "#05070a", padding: "6px 16px", fontSize: 12, fontWeight: 600, cursor: input.trim() ? "pointer" : "not-allowed", opacity: input.trim() ? 1 : 0.5 }}>
                    <Send size={14} />
                    Send
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <StartCard onNew={() => setShowDrawer(true)} />
        )}

        {showDrawer && (
          <ConversationDrawer
            users={drawerUsers}
            search={userSearch}
            onSearch={setUserSearch}
            onClose={() => setShowDrawer(false)}
            onStart={startNewConversation}
          />
        )}
      </main>

      {activeConv && <RightUtilityPanel activeConv={activeConv} online={activeOnline} />}
    </div>
  );
}
