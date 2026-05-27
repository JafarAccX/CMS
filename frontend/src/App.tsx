import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/authStore";
import { Toaster } from "react-hot-toast";
import { useSocketInit } from "./hooks/useSocket";

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

export default function App() {
  useSocketInit();
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
