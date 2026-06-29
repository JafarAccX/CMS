import { create } from "zustand";
import { persist } from "zustand/middleware";
import axios from "axios";

// ─── Axios client ─────────────────────────────────────────────────────────────
// NOTE: Module-level singleton. configureCmsApi() sets the baseURL once on
// CommunityShell mount. Safe for all normal browser usage (one JS context).
export const cmsApiClient = axios.create({
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// Single-flight refresh: parallel 401s share one /auth/refresh call.
let refreshPromise: Promise<string> | null = null;

function refreshCmsToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = cmsApiClient
      .post("/auth/refresh", {}, { withCredentials: true })
      .then((res) => {
        const token: string = res.data.accessToken;
        localStorage.setItem("cms-accessToken", token);
        useCmsAuthStore.getState().setToken(token);
        return token;
      })
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

cmsApiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("cms-accessToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

cmsApiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const url: string = original?.url || "";
    const isRefreshCall = url.includes("/auth/refresh");
    const isLoginCall = url.includes("/auth/learner-login") || url.includes("/auth/login");

    if (status !== 401 || original?._retry || isRefreshCall || isLoginCall) {
      return Promise.reject(error);
    }

    original._retry = true;
    try {
      const token = await refreshCmsToken();
      original.headers = original.headers || {};
      original.headers.Authorization = `Bearer ${token}`;
      return cmsApiClient(original);
    } catch {
      localStorage.removeItem("cms-accessToken");
      useCmsAuthStore.getState().clearSession();
    }
    return Promise.reject(error);
  }
);

export function configureCmsApi(baseUrl: string) {
  cmsApiClient.defaults.baseURL = baseUrl;
}

// ─── learnerLogin ──────────────────────────────────────────────────────────────
// Single implementation shared by both LMS-prop flow and standalone app.
export async function learnerLogin(email: string, phone: string) {
  const { data } = await cmsApiClient.post("/auth/learner-login", { email, phone });
  return data;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface CmsUser {
  id: string;
  username: string;
  email: string;
  role: string;
  provider: string;
  subscription_status: string;
  is_banned: boolean;
  bio?: string;
  phone?: string;
  avatar_url?: string;
}

interface CmsAuthState {
  user: CmsUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  sources: any | null;
  setSession: (user: CmsUser, token: string, sources?: any) => void;
  setToken: (token: string) => void;
  setUser: (user: CmsUser) => void;
  clearSession: () => void;
  logout: () => Promise<void>;
}

// ─── Auth Store ────────────────────────────────────────────────────────────────
// Renamed key: "cms-auth-store" (was "auth-store") to avoid collision with LMS.
export const useCmsAuthStore = create<CmsAuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      sources: null,

      setSession: (user, token, sources = null) => {
        localStorage.setItem("cms-accessToken", token);
        set({ user, accessToken: token, isAuthenticated: true, sources });
      },

      setToken: (token) => {
        localStorage.setItem("cms-accessToken", token);
        set({ accessToken: token });
      },

      setUser: (user) => set({ user }),

      // Called by: module-level lms:logout handler (index.ts) AND useCmsAuth
      // when lmsToken goes null. Safe to call even when not authenticated.
      clearSession: () => {
        localStorage.removeItem("cms-accessToken");
        localStorage.removeItem("cms-auth-store");
        set({ user: null, accessToken: null, isAuthenticated: false, sources: null });
      },

      logout: async () => {
        try { await cmsApiClient.post("/auth/logout"); } catch {}
        localStorage.removeItem("cms-accessToken");
        localStorage.removeItem("cms-auth-store");
        set({ user: null, accessToken: null, isAuthenticated: false, sources: null });
      },
    }),
    {
      name: "cms-auth-store", // ← renamed from "auth-store"
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
        sources: state.sources,
      }),
    }
  )
);
