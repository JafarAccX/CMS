/**
 * @acceleratorx/cms-ui — package entry point
 *
 * Module-level side effect: registers the lms:logout listener immediately when
 * the LMS bundle loads. This listener must NOT live inside CommunityShell because
 * CommunityShell is only mounted while the user is on /community. Most logouts
 * happen from other routes (e.g. /dashboard) where the shell is unmounted.
 *
 * ESM guarantees this block runs exactly once per JS context.
 */

import { useCmsAuthStore } from "./api/cmsClient";
import { useCmsSocketStore } from "./store/cmsSocketStore";
import "./cms.css";

if (typeof window !== "undefined") {
  window.addEventListener("lms:logout", () => {
    // Null-safe: socket may not exist if user never visited /community.
    // destroySocket() has an internal if(socket) guard.
    useCmsSocketStore.getState().destroySocket();
    // clearSession() removes the cms-auth-store localStorage entry so
    // the next user who logs in starts from a clean slate.
    useCmsAuthStore.getState().clearSession();
  });
}

// ── Public exports ────────────────────────────────────────────────────────────
export { CommunityShell } from "./CommunityShell";
export type { CommunityShellProps } from "./CommunityShell";

// Stores (exported for advanced use — e.g. LMS notification bell reading CMS unread count)
export { useCmsAuthStore } from "./api/cmsClient";
export { useCmsSocketStore } from "./store/cmsSocketStore";
export { useCmsMessageStore } from "./store/cmsMessageStore";
export { useCmsDmStore } from "./store/cmsDmStore";
export { useCmsNotificationStore } from "./store/cmsNotificationStore";
export { useCmsUiStore } from "./store/cmsUiStore";
export { useCmsBatchStore } from "./store/cmsBatchStore";




