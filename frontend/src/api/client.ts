import axios from "axios";
import { useAuthStore } from "../store/authStore";
import { isEmbed, requestParentReauth } from "../embed/bridge";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// Request interceptor — attach access token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Single-flight refresh: when many requests 401 at once (e.g. on page load), they
// must share ONE /auth/refresh call instead of each firing their own. This also
// matters once refresh-token rotation lands — parallel refreshes would otherwise
// invalidate each other.
let refreshPromise: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_URL}/auth/refresh`, {}, { withCredentials: true })
      .then((res) => {
        const token: string = res.data.accessToken;
        localStorage.setItem("accessToken", token);
        useAuthStore.getState().setToken(token);
        return token;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// Response interceptor — auto-refresh on 401, otherwise pass through
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const url: string = original?.url || "";

    // Don't try to refresh if:
    //  - response wasn't 401
    //  - this request was already retried
    //  - the failing request was the refresh endpoint itself (would loop)
    //  - the failing request was the login endpoint (bad credentials, not session expiry)
    const isRefreshCall = url.includes("/auth/refresh");
    const isLoginCall = url.includes("/auth/login") || url.includes("/auth/learner-login") || url.includes("/auth/verify-otp");

    if (status !== 401 || original?._retry || isRefreshCall || isLoginCall) {
      return Promise.reject(error);
    }

    original._retry = true;
    try {
      const token = await refreshAccessToken();
      original.headers = original.headers || {};
      original.headers.Authorization = `Bearer ${token}`;
      return api(original);
    } catch (refreshErr) {
      // Refresh failed → session is truly dead. Clear state and bounce to login,
      // but only if we're not already there (prevents redirect loop on the
      // login page itself).
      localStorage.removeItem("accessToken");
      try {
        useAuthStore.getState().logout();
      } catch {}
      // Embedded in the LMS: there's no /login page to send the user to — ask
      // the parent to re-supply credentials so we can re-establish the session.
      // The App-level embed gate shows a "Connecting…" screen meanwhile.
      if (isEmbed()) {
        requestParentReauth();
      } else if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
      return Promise.reject(error);
    }
  }
);

export default api;
