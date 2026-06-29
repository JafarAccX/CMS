import React, { useEffect } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { useCmsAuth } from "./hooks/useCmsAuth";
import { useCmsSocketInit } from "./hooks/useCmsSocket";
import { useCmsMessageStore } from "./store/cmsMessageStore";
import { useCmsDmStore } from "./store/cmsDmStore";
import { useCmsNotificationStore } from "./store/cmsNotificationStore";
import { useCmsUiStore } from "./store/cmsUiStore";
import { configureCmsSocket } from "./hooks/useCmsSocket";
import { CmsRouter } from "./CmsRouter";
import { cmsApiClient as api } from "./api/cmsClient";
import "./cms.css";

// Each CommunityShell instance gets its own QueryClient so CMS queries are
// isolated from LMS queries (different cache keys, different stale times).
const cmsQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: Infinity,   // keep data in memory across route unmount/remount
      retry: 1,
    },
  },
});

export interface CommunityShellProps {
  /** LMS access token — used to auto-login the user into CMS */
  lmsToken: string | null;
  /** User's email — required for learnerLogin */
  userEmail: string | null;
  /** User's phone (10 digits) — required for learners, optional for mentors */
  userPhone: string | null;
  /** CMS backend base URL e.g. https://cmsapi.acceleratorx.org */
  cmsApiUrl: string;
  /** CMS Socket.IO server URL (often same as cmsApiUrl without /api) */
  cmsSocketUrl?: string;
  /** Theme from LMS — syncs instantly, no postMessage needed */
  theme?: "light" | "dark" | "system";
  /** Whether the CMS is embedded inside the LMS */
  isEmbed?: boolean;
  /** Optional: LMS-provided React component tree to render as the community UI.
   *  Pass the original CMS <App /> or a simplified view.
   *  If not provided, shows a placeholder until you wire up the full CMS components. */
  children?: React.ReactNode;
}

/** Connecting / error screen shown while learnerLogin is in flight */
function CmsConnectingScreen({ error }: { error: string | null }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        gap: "16px",
        background: "var(--ax-panel, #0d1018)",
        color: "#e2e8f0",
        fontFamily: "Poppins, Inter, sans-serif",
        padding: "24px",
        textAlign: "center",
      }}
    >
      {error ? (
        <>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p style={{ fontSize: "14px", color: "#f87171", fontWeight: 500 }}>Couldn't open Community</p>
          <p style={{ fontSize: "12px", color: "#94afde", maxWidth: "320px" }}>{error}</p>
        </>
      ) : (
        <>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              border: "2px solid rgba(148,175,230,0.25)",
              borderTopColor: "#3B82FF",
              animation: "cms-spin 0.8s linear infinite",
            }}
          />
          <p style={{ fontSize: "13px", color: "#94afde" }}>Connecting to Community…</p>
          <style>{`@keyframes cms-spin { to { transform: rotate(360deg); } }`}</style>
        </>
      )}
    </div>
  );
}

/**
 * Pre-warms the most expensive dashboard queries while the learnerLogin
 * request is still in-flight.  The moment isAuthenticated flips true,
 * DashboardPage's useQuery calls find the data already in cache and render
 * synchronously (no extra network round-trip).
 */
function CmsPrefetcher({ isAuthenticated }: { isAuthenticated: boolean }) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!isAuthenticated) return;
    // These are the same query keys DashboardPage uses — so its useQuery
    // calls hit the cache immediately instead of waiting for a new fetch.
    qc.prefetchQuery({ queryKey: ["batches"],       queryFn: async () => (await api.get("/batches")).data,       staleTime: 60_000 });
    qc.prefetchQuery({ queryKey: ["pinned-rooms"],  queryFn: async () => (await api.get("/pinned")).data,        staleTime: 60_000 });
    qc.prefetchQuery({ queryKey: ["notifications"], queryFn: async () => (await api.get("/notifications")).data,  staleTime: 30_000 });
    qc.prefetchQuery({ queryKey: ["my-classes"],    queryFn: async () => (await api.get("/my-classes")).data,     staleTime: 30_000 });
  }, [isAuthenticated, qc]);

  return null;
}

/** Inner shell — has access to QueryClient context */
function CmsShellInner({
  children,
  theme,
  isAuthenticated,
  error,
  status,
}: {
  children?: React.ReactNode;
  theme?: string;
  isAuthenticated: boolean;
  error: string | null;
  status: string;
}) {
  useCmsSocketInit();

  // Sync LMS theme into CMS
  const setTheme = useCmsUiStore((s) => s.setTheme);
  useEffect(() => {
    const resolved =
      theme === "dark" ||
      (theme === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches)
        ? "dark"
        : "light";
    setTheme(resolved);
  }, [theme, setTheme]);

  return (
    <div
      className="cms-shell-root"
      style={{ height: "100%", width: "100%", overflow: "hidden", position: "relative" }}
      data-theme={useCmsUiStore((s) => s.theme)}
    >
      {/* Pre-warm queries the instant auth resolves */}
      <CmsPrefetcher isAuthenticated={isAuthenticated} />
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: "#0d1018",
            color: "#e2e8f0",
            border: "1px solid rgba(148,175,230,0.14)",
            fontFamily: "Poppins, Inter, sans-serif",
            borderRadius: "12px",
          },
        }}
      />
      {!isAuthenticated ? (
        <CmsConnectingScreen error={status === "error" ? error : null} />
      ) : (
        children ?? <CmsRouter />
      )}
    </div>
  );
}

/**
 * CommunityShell — drop-in replacement for the iframe in LMS CommunityPage.
 *
 * Usage in LMS:
 *   <CommunityShell
 *     lmsToken={lmsAccessToken}
 *     userEmail={customer.email}
 *     userPhone={customer.phone}
 *     cmsApiUrl="http://localhost:4000"
 *     theme="dark"
 *   >
 *     <CmsApp />   ← the actual CMS React component tree
 *   </CommunityShell>
 */
export function CommunityShell({
  lmsToken,
  userEmail,
  userPhone,
  cmsApiUrl,
  cmsSocketUrl,
  theme,
  isEmbed,
  children,
}: CommunityShellProps) {
  // Sync isEmbed to store
  useEffect(() => {
    if (isEmbed !== undefined) {
      useCmsUiStore.getState().setIsEmbed(isEmbed);
    }
  }, [isEmbed]);

  // Configure socket URL (can differ from API URL in some deployments)
  useEffect(() => {
    if (cmsSocketUrl) configureCmsSocket(cmsSocketUrl);
    else if (cmsApiUrl) configureCmsSocket(cmsApiUrl.replace("/api", "").replace(/\/$/, ""));
  }, [cmsApiUrl, cmsSocketUrl]);

  // Tear down all CMS state on unmount (user left /community)
  useEffect(() => {
    return () => {
      useCmsMessageStore.getState().reset();
      useCmsDmStore.getState().reset();
      useCmsNotificationStore.getState().reset();
    };
  }, []);

  const { status, error, isAuthenticated } = useCmsAuth({
    lmsToken,
    userEmail,
    userPhone,
    cmsApiUrl,
  });

  // QueryClientProvider is ALWAYS mounted — even during the auth connecting
  // phase.  CmsShellInner handles showing the spinner vs the real UI.
  // This means the query cache is available the instant auth resolves,
  // and CmsPrefetcher can fire pre-warm fetches without remounting.
  return (
    <QueryClientProvider client={cmsQueryClient}>
      <CmsShellInner theme={theme} isAuthenticated={isAuthenticated} error={error} status={status}>
        {children}
      </CmsShellInner>
    </QueryClientProvider>
  );
}
