import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useCmsAuthStore } from "./api/cmsClient";

import AppShell from "./components/AppShell";
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
  const isAuthenticated = useCmsAuthStore((s) => s.isAuthenticated);
  // In the integrated module version, the parent LMS drives authentication.
  // If not authenticated, we don't redirect to /login — we let the parent know.
  if (!isAuthenticated) return null;
  return <>{children}</>;
}

function RoleRoute({ children, roles }: { children: React.ReactNode; roles: string[] }) {
  const user = useCmsAuthStore((s) => s.user);
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
 * Internal router for the CMS chat app.
 * Renders as descendant routes inside the LMS's router.
 */
export function CmsRouter() {
  return (
    <Routes>
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
  );
}
