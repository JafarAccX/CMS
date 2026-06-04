/**
 * Embed bridge.
 *
 * When the CMS is rendered inside an <iframe> by the LMS (Community screen),
 * it runs in "embed mode". The parent LMS — which has already authenticated
 * the learner — is the session-keeper: it hands us the learner's email/phone
 * over postMessage so we can silently call /auth/learner-login, and it re-sends
 * them whenever our session expires. This avoids any second login and does not
 * depend on the (third-party, often blocked) refresh cookie.
 *
 * Mode and parent origin are captured once at page load from the query string
 * (`?embed=1&parentOrigin=<lms-origin>`), because in-app navigation can drop
 * the query params.
 */

const params = new URLSearchParams(window.location.search);

const EMBED = params.get('embed') === '1';

let parentOrigin = '';
const rawParent = params.get('parentOrigin');
if (rawParent) {
  try {
    parentOrigin = new URL(rawParent).origin;
  } catch {
    parentOrigin = '';
  }
}

/** True only when we're framed AND we know the trusted parent origin. */
export function isEmbed(): boolean {
  return EMBED && parentOrigin !== '' && window.parent !== window;
}

export function getParentOrigin(): string {
  return parentOrigin;
}

export type EmbedCredentials = {
  type: 'CMS_SSO_CREDENTIALS';
  email: string;
  phone: string;
};

function postToParent(message: unknown): void {
  if (!isEmbed()) return;
  window.parent.postMessage(message, parentOrigin);
}

/** Tell the parent we're ready to receive credentials. */
export function postEmbedReady(): void {
  postToParent({ type: 'CMS_EMBED_READY' });
}

// Throttle re-auth requests: a burst of 401s + socket reconnects must not spam
// the parent (which would re-call the rate-limited /auth/learner-login → 429).
// 10s keeps the worst-case retry rate well under the login limiter (12/min).
let lastReauthRequest = 0;

/** Ask the parent to re-send credentials so we can re-establish the session. */
export function requestParentReauth(): void {
  const now = Date.now();
  if (now - lastReauthRequest < 10000) return;
  lastReauthRequest = now;
  postToParent({ type: 'CMS_SSO_REFRESH_NEEDED' });
}
