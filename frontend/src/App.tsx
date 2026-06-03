import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/authStore";
import { Toaster } from "react-hot-toast";
import { useSocketInit } from "./hooks/useSocket";
import { useEmbedSso } from "./embed/useEmbedSso";

import AppShell from "./components/AppShell";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import BatchesPage from "./pages/BatchesPage";
import BatchPage from "./pages/BatchPage";
import ChannelChatPage from "./pages/ChannelChatPage";
import AdminPage from "./pages/AdminPage";
import MentorPage from "./pages/MentorPage";
import ProfilePage from "./pages/ProfilePage";
import DmPage from "./pages/DmPage";
import SubscriptionPage from "./pages/SubscriptionPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RoleRoute({ children, roles }: { children: React.ReactNode; roles: string[] }) {
  const user = useAuthStore((s) => s.user);
  if (!user || !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}

/**
 * Full-screen connecting / error state shown while the embedded CMS is being
 * silently signed in by the parent LMS. Styled to match the CMS dark theme so
 * it blends into the iframe rather than flashing a white screen.
 */
function EmbedScreen({ error }: { error: string | null }) {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center gap-4 text-center px-6"
      style={{ background: "#0a0d12", color: "#e2e8f0", fontFamily: "Poppins, Inter, sans-serif" }}
    >
      {error ? (
        <>
          <div className="text-[15px] font-medium" style={{ color: "#f87171" }}>
            Couldn’t open Community
          </div>
          <div className="text-[13px] max-w-sm" style={{ color: "#94afde" }}>
            {error}
          </div>
        </>
      ) : (
        <>
          <div
            className="h-9 w-9 rounded-full border-2 animate-spin"
            style={{ borderColor: "rgba(148,175,230,0.25)", borderTopColor: "#3B82FF" }}
          />
          <div className="text-[13px]" style={{ color: "#94afde" }}>
            Connecting to Community…
          </div>
        </>
      )}
    </div>
  );
}

export default function App() {
  useSocketInit();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { isEmbed, status, error } = useEmbedSso();

  // In embed mode, block the UI with a connecting/error screen until silent SSO
  // has established a session. Once authenticated we render the app normally;
  // any later session expiry is recovered in the background via the bridge.
  if (isEmbed && !isAuthenticated) {
    return <EmbedScreen error={status === "error" ? error : null} />;
  }

  return (
    <>
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
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<Shell><DashboardPage /></Shell>} />
        <Route path="/batches" element={<Shell><BatchesPage /></Shell>} />
        <Route path="/batch/:id" element={<Shell><BatchPage /></Shell>} />
        <Route path="/batch/:batchId/channel/:channelId" element={<Shell><ChannelChatPage /></Shell>} />
        <Route path="/admin" element={<Shell><RoleRoute roles={["admin"]}><AdminPage /></RoleRoute></Shell>} />
        <Route path="/mentor" element={<Shell><RoleRoute roles={["mentor"]}><MentorPage /></RoleRoute></Shell>} />
        <Route path="/profile" element={<Shell><ProfilePage /></Shell>} />
        <Route path="/dm" element={<Shell><DmPage /></Shell>} />
        <Route path="/dm/:conversationId" element={<Shell><DmPage /></Shell>} />
        <Route path="/subscription" element={<Shell><SubscriptionPage /></Shell>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
