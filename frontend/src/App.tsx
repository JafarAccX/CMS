import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/authStore";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import BatchChatPage from "./pages/BatchChatPage";
import AdminPage from "./pages/AdminPage";
import MentorPage from "./pages/MentorPage";
import ProfilePage from "./pages/ProfilePage";
import DmPage from "./pages/DmPage";
import { Toaster } from "react-hot-toast";
import { useSocketInit } from "./hooks/useSocket";

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


export default function App() {
  useSocketInit();
  return (
    <>
      <Toaster position="top-center" toastOptions={{ style: { background: "#0d1018", color: "#e2e8f0", border: "1px solid rgba(148,175,230,0.14)", fontFamily: "Inter, sans-serif", borderRadius: "12px" } }} />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/batch/:id" element={<ProtectedRoute><BatchChatPage /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><RoleRoute roles={["admin"]}><AdminPage /></RoleRoute></ProtectedRoute>} />
        <Route path="/mentor" element={<ProtectedRoute><RoleRoute roles={["mentor"]}><MentorPage /></RoleRoute></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="/dm" element={<ProtectedRoute><DmPage /></ProtectedRoute>} />
        <Route path="/dm/:conversationId" element={<ProtectedRoute><DmPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
