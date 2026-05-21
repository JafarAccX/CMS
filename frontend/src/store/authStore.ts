import { create } from "zustand";
import { persist } from "zustand/middleware";
import api from "../api/client";

interface User {
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

interface CrmProfile {
  custId: string;
  email?: string | null;
  mobile?: string | number | null;
  firstName?: string | null;
  lastName?: string | null;
  active?: boolean;
  profilePicture?: string | null;
}

interface CrmEnrollment {
  batchId: string;
  batchName?: string;
  course?: string;
  startDate?: string;
  endDate?: string;
  paymentStatus?: string;
  completionStatus?: string;
  active?: boolean;
}

interface LmsProfile {
  CustId?: string;
  Email?: string | null;
  FirstName?: string | null;
  LastName?: string | null;
  ProfilePicture?: string | null;
  Skills?: string | null;
  Education?: string | null;
  YearOfExperience?: number | null;
  CurrentCompany?: string | null;
  Designation?: string | null;
  Mobile?: string | number | null;
  [k: string]: unknown;
}

interface LmsCourse {
  courseTitle?: string;
  courseImage?: string;
  batchName?: string;
  startDate?: string;
  endDate?: string;
  enrollmentDate?: string;
  paymentStatus?: string;
  completionStatus?: string;
  finalPrice?: number;
  isActive?: boolean;
  [k: string]: unknown;
}

export interface LoginSources {
  crm: CrmProfile | null;
  lms: { profile: LmsProfile | null; courses: LmsCourse[] } | null;
  crmEnrollments: CrmEnrollment[] | null;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  sources: LoginSources | null;
  login: (identifier: string, password: string, provider: string) => Promise<void>;
  learnerLogin: (phone: string, email: string) => Promise<void>;
  sendOtp: (identifier: string, method: "phone" | "email", provider: string) => Promise<{ requestId?: string }>;
  verifyOtp: (identifier: string, otpCode: string, method: "phone" | "email", provider: string, requestId?: string) => Promise<void>;
  register: (username: string, email: string, phone: string, password: string, provider: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
  setToken: (token: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      sources: null,

      login: async (identifier, password, provider) => {
        const { data } = await api.post("/auth/login", { identifier, password, provider });
        localStorage.setItem("accessToken", data.accessToken);
        set({
          user: data.user,
          accessToken: data.accessToken,
          isAuthenticated: true,
          sources: data.sources ?? null,
        });
      },

      learnerLogin: async (phone, email) => {
        const { data } = await api.post("/auth/learner-login", { phone, email });
        localStorage.setItem("accessToken", data.accessToken);
        set({
          user: data.user,
          accessToken: data.accessToken,
          isAuthenticated: true,
          sources: data.sources ?? null,
        });
      },

      sendOtp: async (identifier, method, provider) => {
        const payload = method === "phone"
          ? { phoneNumber: identifier, provider }
          : { email: identifier, provider };
        const { data } = await api.post("/auth/send-otp", payload);
        return { requestId: data.requestId };
      },

      verifyOtp: async (identifier, otpCode, method, provider, requestId) => {
        const payload: any = { otpCode, provider };
        if (method === "phone") {
          payload.phoneNumber = identifier;
          if (requestId) payload.requestId = requestId;
        } else {
          payload.email = identifier;
        }
        const { data } = await api.post("/auth/verify-otp", payload);
        localStorage.setItem("accessToken", data.accessToken);
        set({
          user: data.user,
          accessToken: data.accessToken,
          isAuthenticated: true,
          sources: data.sources ?? null,
        });
      },

      register: async (username, email, phone, password, provider) => {
        const { data } = await api.post("/auth/register", { email, phone, username, password, provider });
        localStorage.setItem("accessToken", data.accessToken);
        set({ user: data.user, accessToken: data.accessToken, isAuthenticated: true, sources: null });
      },

      logout: async () => {
        try { await api.post("/auth/logout"); } catch {}
        localStorage.removeItem("accessToken");
        set({ user: null, accessToken: null, isAuthenticated: false, sources: null });
      },

      setUser: (user) => set({ user }),
      setToken: (token) => {
        localStorage.setItem("accessToken", token);
        set({ accessToken: token });
      },
    }),
    {
      name: "auth-store",
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
        sources: state.sources,
      }),
    }
  )
);
