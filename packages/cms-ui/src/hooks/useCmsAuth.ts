import { useEffect, useState } from "react";
import { configureCmsApi, learnerLogin, useCmsAuthStore } from "../api/cmsClient";
import { useCmsSocketStore } from "../store/cmsSocketStore";

export type CmsAuthStatus = "connecting" | "authed" | "error";

interface UseCmsAuthOptions {
  lmsToken: string | null;
  userEmail: string | null;
  userPhone: string | null;
  cmsApiUrl: string;
}

/**
 * Drives silent SSO for the CMS when embedded as a native module in the LMS.
 *
 * - When lmsToken is present and email is available → calls learnerLogin
 * - When lmsToken goes null (LMS logout) → tears down CMS session + socket
 * - Does not re-fire if already authenticated with the same token
 */
export function useCmsAuth({ lmsToken, userEmail, userPhone, cmsApiUrl }: UseCmsAuthOptions) {
  const isAuthenticated = useCmsAuthStore((s) => s.isAuthenticated);
  const [status, setStatus] = useState<CmsAuthStatus>(isAuthenticated ? "authed" : "connecting");
  const [error, setError] = useState<string | null>(null);

  // Configure the CMS Axios client baseURL once on mount / URL change
  useEffect(() => {
    if (cmsApiUrl) configureCmsApi(cmsApiUrl);
  }, [cmsApiUrl]);

  useEffect(() => {
    // LMS logged out → lmsToken became null.
    // Tear down CMS session here as belt-and-suspenders alongside the
    // module-level lms:logout listener (which handles logout from non-community routes).
    if (lmsToken === null) {
      useCmsAuthStore.getState().clearSession();
      useCmsSocketStore.getState().destroySocket();
      setStatus("connecting");
      setError(null);
      return;
    }

    if (!userEmail) {
      setError("No email available on this account — cannot open Community. Please contact support.");
      setStatus("error");
      return;
    }

    // Already authenticated in this session — skip re-login.
    if (isAuthenticated) {
      setStatus("authed");
      return;
    }

    setStatus("connecting");
    setError(null);

    learnerLogin(userEmail, userPhone ?? "")
      .then((data) => {
        useCmsAuthStore.getState().setSession(data.user, data.accessToken, data.sources ?? null);
        setStatus("authed");
      })
      .catch((err: unknown) => {
        const axiosErr = err as { response?: { status?: number; data?: { error?: string } }; message?: string };
        setStatus("error");
        setError(
          axiosErr?.response?.status === 429
            ? "Too many sign-in attempts — please wait a moment and try again."
            : axiosErr?.response?.data?.error ?? axiosErr?.message ?? "Could not connect to Community."
        );
      });

    // Dependencies: lmsToken changes = potential new session; userEmail/userPhone
    // are required for learnerLogin. userPhone added even though it loads
    // synchronously today — cheap insurance against future async profile loads.
  }, [lmsToken, userEmail, userPhone, isAuthenticated]);

  return { status, error, isAuthenticated };
}
