import axios from "axios";
import { useAuthStore } from "../store/authStore";

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
      const { data } = await axios.post(
        `${API_URL}/auth/refresh`,
        {},
        { withCredentials: true }
      );
      localStorage.setItem("accessToken", data.accessToken);
      useAuthStore.getState().setToken(data.accessToken);
      original.headers = original.headers || {};
      original.headers.Authorization = `Bearer ${data.accessToken}`;
      return api(original);
    } catch (refreshErr) {
      // Refresh failed → session is truly dead. Clear state and bounce to login,
      // but only if we're not already there (prevents redirect loop on the
      // login page itself).
      localStorage.removeItem("accessToken");
      try {
        useAuthStore.getState().logout();
      } catch {}
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
      return Promise.reject(error);
    }
  }
);

export default api;
