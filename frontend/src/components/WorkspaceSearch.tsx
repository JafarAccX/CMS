import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { BookOpen, Hash, Home, MessageCircle, Search, Settings, Sparkles, User } from "lucide-react";
import api from "../api/client";
import { useAuthStore } from "../store/authStore";

type SearchResult = {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: ReactNode;
};

export default function WorkspaceSearch({ height = 40 }: { height?: number }) {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const { data: batchesData } = useQuery({
    queryKey: ["batches"],
    queryFn: async () => (await api.get("/batches")).data,
  });
  const { data: pinnedData } = useQuery({
    queryKey: ["pinned-rooms"],
    queryFn: async () => (await api.get("/pinned")).data as { pinnedChannels?: any[] },
  });

  const results = useMemo(() => {
    const items: SearchResult[] = [
      { id: "home", label: "Home", description: "Open workspace home", href: "/", icon: <Home size={15} /> },
      { id: "direct", label: "Direct messages", description: "Open your conversations", href: "/dm", icon: <MessageCircle size={15} /> },
      { id: "rooms", label: "Rooms", description: "Browse all learning rooms", href: "/batches", icon: <Hash size={15} /> },
      { id: "profile", label: "Profile settings", description: "Manage your profile", href: "/profile", icon: <User size={15} /> },
    ];

    if (user?.role?.toLowerCase() === "learner") {
      items.push({ id: "mentor", label: "Ask Mentor", description: "Start a mentor conversation", href: "/dm?askMentor=1", icon: <Sparkles size={15} /> });
    }
    if (user?.role === "admin") {
      items.push({ id: "admin", label: "Admin console", description: "Manage users and workspace", href: "/admin", icon: <Settings size={15} /> });
    }
    if (user?.role === "mentor") {
      items.push({ id: "mentorship", label: "Mentorship", description: "Open mentor workspace", href: "/mentor", icon: <BookOpen size={15} /> });
    }

    const batches = Array.isArray(batchesData) ? batchesData : batchesData?.batches || [];
    for (const batch of batches) {
      items.push({
        id: `batch-${batch.id}`,
        label: batch.name,
        description: batch.description || "Learning room",
        href: `/batch/${batch.id}`,
        icon: <Hash size={15} />,
      });
    }

    for (const channel of pinnedData?.pinnedChannels || []) {
      items.push({
        id: `channel-${channel.id}`,
        label: channel.name,
        description: channel.batch?.name ? `Channel in ${channel.batch.name}` : "Pinned channel",
        href: `/batch/${channel.batch_id}/channel/${channel.id}`,
        icon: <Hash size={15} />,
      });
    }

    const normalized = query.trim().toLowerCase();
    return normalized
      ? items.filter((item) => `${item.label} ${item.description}`.toLowerCase().includes(normalized)).slice(0, 8)
      : items.slice(0, 8);
  }, [batchesData, pinnedData, query, user?.role]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
      }
      if (event.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, []);

  useEffect(() => setActiveIndex(0), [query]);

  const choose = (result: SearchResult) => {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    navigate(result.href);
  };

  return (
    <div ref={rootRef} className="app-topbar-search" style={{ position: "relative", width: "100%", maxWidth: 512 }}>
      <Search size={15} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "var(--ax-placeholder)", pointerEvents: "none", zIndex: 1 }} />
      <input
        ref={inputRef}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((index) => Math.min(index + 1, results.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter" && results[activeIndex]) {
            event.preventDefault();
            choose(results[activeIndex]);
          }
        }}
        placeholder="Ask AI or search workspace... (Cmd+K)"
        aria-label="Search workspace"
        aria-expanded={open}
        aria-controls="workspace-search-results"
        style={{
          width: "100%",
          height,
          borderRadius: 6,
          background: "var(--ax-field-bg)",
          border: "1px solid var(--ax-border)",
          color: "var(--ax-text)",
          padding: "0 42px",
          fontFamily: "Poppins, Inter, sans-serif",
          fontSize: 13,
          outline: "none",
        }}
      />
      <Sparkles size={13} style={{ position: "absolute", right: 13, top: "50%", transform: "translateY(-50%)", color: "var(--accent-400)", pointerEvents: "none" }} />

      {open && (
        <div id="workspace-search-results" role="listbox" style={{ position: "absolute", top: height + 8, left: 0, right: 0, padding: 6, borderRadius: 10, background: "var(--ax-panel)", border: "1px solid var(--ax-border)", boxShadow: "var(--ax-shadow-card), 0 18px 50px rgba(0,0,0,0.2)", zIndex: 100 }}>
          {results.length ? results.map((result, index) => (
            <button
              key={result.id}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(result)}
              style={{ width: "100%", border: 0, borderRadius: 7, background: index === activeIndex ? "var(--ax-hover)" : "transparent", color: "var(--ax-text)", padding: "9px 10px", display: "flex", alignItems: "center", gap: 10, textAlign: "left", cursor: "pointer", fontFamily: "Poppins, Inter, sans-serif" }}
            >
              <span style={{ color: "var(--accent-300)", display: "flex" }}>{result.icon}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{result.label}</span>
                <span style={{ display: "block", fontSize: 11, color: "var(--ax-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{result.description}</span>
              </span>
            </button>
          )) : (
            <div style={{ padding: "18px 12px", textAlign: "center", color: "var(--ax-muted)", fontSize: 12 }}>
              No workspace results for "{query}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}
