import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import {
  isEmbed,
  getParentOrigin,
  postEmbedReady,
  type EmbedCredentials,
} from './bridge';

export type EmbedStatus = 'connecting' | 'authed' | 'error';

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
  const [status, setStatus] = useState<EmbedStatus>(embed ? 'connecting' : 'authed');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!embed) return;
    const parentOrigin = getParentOrigin();

    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== parentOrigin) return;
      const data = event.data as EmbedCredentials | undefined;
      if (!data || data.type !== 'CMS_SSO_CREDENTIALS') return;

      try {
        setStatus('connecting');
        setError(null);
        await useAuthStore.getState().learnerLogin(data.phone, data.email);
        setStatus('authed');
      } catch (err: any) {
        setStatus('error');
        setError(
          err?.response?.data?.error ||
            err?.message ||
            'We could not sign you in to Community.'
        );
      }
    };

    window.addEventListener('message', onMessage);
    // Announce readiness — the parent replies with the learner's credentials.
    postEmbedReady();

    return () => window.removeEventListener('message', onMessage);
  }, [embed]);

  return { isEmbed: embed, status, error };
}
