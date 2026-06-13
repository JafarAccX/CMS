import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import {
  isEmbed,
  getParentOrigin,
  postEmbedReady,
  requestParentReauth,
  type EmbedCredentials,
} from './bridge';

export type EmbedStatus = 'connecting' | 'authed' | 'error';

// After a failed login (esp. a 429), wait this long before trying again so we
// don't hammer the rate-limited /auth/learner-login endpoint.
const FAIL_COOLDOWN_MS = 20000;

/**
 * Drives silent SSO when the CMS is embedded by the LMS.
 *
 * On mount we announce readiness to the parent and wait for a
 * `CMS_SSO_CREDENTIALS` message (validated against the trusted parent origin),
 * then call the passwordless learner-login. The listener stays mounted for the
 * lifetime of the app so it can also service `CMS_SSO_REFRESH_NEEDED`-triggered
 * re-sends after a session expiry.
 *
 * No-op (returns `isEmbed: false`) when running standalone.
 */
export function useEmbedSso(): {
  isEmbed: boolean;
  status: EmbedStatus;
  error: string | null;
} {
  const embed = isEmbed();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [status, setStatus] = useState<EmbedStatus>(embed ? 'connecting' : 'authed');
  const [error, setError] = useState<string | null>(null);
  // Guards so multiple reauth triggers (socket reconnect, 401 interceptor,
  // duplicate parent sends) never fire overlapping/rapid learner-logins.
  const loginInFlight = useRef(false);
  const lastFailAt = useRef(0);

  // Self-heal: if we were signed in and lose the session (token expiry, or an
  // accidental logout), ask the parent to re-supply credentials instead of
  // stranding the "Connecting…" screen. This only fires on a true deauth
  // (status was 'authed') — never after a failed login (status 'error'),
  // so a bad credential can't spin into an infinite re-auth loop.
  // requestParentReauth is throttled in the bridge.
  useEffect(() => {
    if (!embed) return;
    if (!isAuthenticated && status === 'authed') {
      setStatus('connecting');
      requestParentReauth();
    }
  }, [embed, isAuthenticated, status]);

  useEffect(() => {
    if (!embed) return;
    const parentOrigin = getParentOrigin();

    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== parentOrigin) return;
      const data = event.data as
        | (EmbedCredentials & { theme?: 'light' | 'dark' })
        | undefined;
      if (!data || typeof data !== 'object') return;

      // Theme sync pushed from the LMS host.
      if ((data as any).type === 'CMS_SET_THEME') {
        const t = (data as any).theme;
        if (t === 'light' || t === 'dark') useUiStore.getState().setTheme(t);
        return;
      }

      if (data.type !== 'CMS_SSO_CREDENTIALS' || !data.email) return;

      // Don't run overlapping logins; skip if already signed in; back off after
      // a recent failure. This is what prevents the learner-login 429 storm.
      if (loginInFlight.current) return;
      if (useAuthStore.getState().isAuthenticated) {
        setStatus('authed');
        return;
      }
      if (Date.now() - lastFailAt.current < FAIL_COOLDOWN_MS) return;

      loginInFlight.current = true;
      try {
        setStatus('connecting');
        setError(null);
        await useAuthStore.getState().learnerLogin(data.phone, data.email);
        setStatus('authed');
      } catch (err: any) {
        lastFailAt.current = Date.now();
        setStatus('error');
        setError(
          err?.response?.status === 429
            ? 'Too many sign-in attempts — reconnecting shortly…'
            : err?.response?.data?.error ||
                err?.message ||
                'We could not sign you in to Community.'
        );
      } finally {
        loginInFlight.current = false;
      }
    };

    window.addEventListener('message', onMessage);
    // Announce readiness — the parent replies with the learner's credentials.
    postEmbedReady();

    return () => window.removeEventListener('message', onMessage);
  }, [embed]);

  return { isEmbed: embed, status, error };
}
