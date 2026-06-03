import { Router } from "express";
import { authenticate, requireRole } from "../middlewares/auth.js";
import { rateLimiter } from "../middlewares/rateLimiter.js";
import { authRateLimiter, byEmail, byLoginIdentifier } from "../middlewares/authRateLimiter.js";
import { upload } from "../middlewares/upload.js";

import * as authCtrl from "../controllers/auth.controller.js";
import * as otpAuthCtrl from "../controllers/otp-auth.controller.js";
import * as batchCtrl from "../controllers/batch.controller.js";
import * as channelCtrl from "../controllers/channel.controller.js";
import * as memberCtrl from "../controllers/member.controller.js";
import * as messageCtrl from "../controllers/message.controller.js";
import * as modqueueCtrl from "../controllers/modqueue.controller.js";
import * as notifCtrl from "../controllers/notification.controller.js";
import * as subCtrl from "../controllers/subscription.controller.js";
import * as adminCtrl from "../controllers/admin.controller.js";
import * as mentorCtrl from "../controllers/mentor.controller.js";
import * as profileCtrl from "../controllers/profile.controller.js";
import * as dmCtrl from "../controllers/dm.controller.js";
import * as learnerCtrl from "../controllers/learner.controller.js";
import uploadRoutes from "./upload.routes.js";

const router = Router();

// Apply rate limiting globally to all API routes
router.use(rateLimiter);

// Stricter, dedicated limiters for sensitive auth endpoints (per IP + per target).
const loginLimiter = authRateLimiter({ prefix: "login", windowSeconds: 60, max: 12, identifier: byLoginIdentifier });
const otpSendLimiter = authRateLimiter({ prefix: "otp-send", windowSeconds: 60, max: 6, identifier: byLoginIdentifier });
const otpVerifyLimiter = authRateLimiter({ prefix: "otp-verify", windowSeconds: 60, max: 12, identifier: byLoginIdentifier });
const forgotLimiter = authRateLimiter({ prefix: "forgot", windowSeconds: 60, max: 6, identifier: byEmail });
const resetLimiter = authRateLimiter({ prefix: "reset", windowSeconds: 60, max: 10 });

// ── Auth ──────────────────────────────────────────────────
router.post("/auth/register", authCtrl.register);
router.post("/auth/login", loginLimiter, authCtrl.login);
router.post("/auth/forgot-password", forgotLimiter, authCtrl.forgotPassword);
router.post("/auth/reset-password", resetLimiter, authCtrl.resetPassword);
router.post("/auth/learner-login", loginLimiter, authCtrl.learnerLogin);
router.post("/auth/refresh", authCtrl.refresh);
router.post("/auth/logout", authCtrl.logout);
router.post("/auth/send-otp", otpSendLimiter, otpAuthCtrl.handleSendOtp);
router.post("/auth/verify-otp", otpVerifyLimiter, otpAuthCtrl.handleVerifyOtp);

// Protect all routes below
router.use(authenticate);

router.get("/auth/me", authCtrl.getMe);

// ── Upload ────────────────────────────────────────────────
router.use("/upload", uploadRoutes);

// ── Batches ───────────────────────────────────────────────
router.get("/batches", batchCtrl.listBatches);
router.post("/batches", requireRole("admin"), batchCtrl.createBatch);
router.get("/batches/:id", batchCtrl.getBatch);
router.patch("/batches/:id", requireRole("admin"), batchCtrl.updateBatch);
router.delete("/batches/:id", requireRole("admin"), batchCtrl.archiveBatch);
router.post("/batches/:id/pin", requireRole("admin"), channelCtrl.toggleBatchPin);

// ── Channels ──────────────────────────────────────────────
router.get("/batches/:id/channels", channelCtrl.listChannels);
router.post("/batches/:id/channels", requireRole("admin", "batch_moderator"), channelCtrl.createChannel);
router.get("/channels/:id", channelCtrl.getChannel);
router.patch("/channels/:id", requireRole("admin", "batch_moderator"), channelCtrl.renameChannel);
router.delete("/channels/:id", requireRole("admin"), channelCtrl.deleteChannel);
router.post("/channels/:id/pin", requireRole("admin"), channelCtrl.toggleChannelPin);

// User-scoped pinned items (for dashboard "Active rooms")
router.get("/pinned", channelCtrl.listPinned);

// ── Members ───────────────────────────────────────────────
router.get("/batches/:id/members", memberCtrl.listMembers);
router.post("/batches/:id/members", requireRole("admin", "batch_moderator"), memberCtrl.addMember);
router.delete("/batches/:id/members/:userId", requireRole("admin"), memberCtrl.removeMember);
router.patch("/batches/:id/members/:userId/role", requireRole("admin"), memberCtrl.updateMemberRole);

// ── Messages ──────────────────────────────────────────────
router.get("/messages", messageCtrl.listMessages);
router.post("/messages", upload.array("files", 5), messageCtrl.createMessage);
router.delete("/messages/:id", messageCtrl.softDeleteMessage);
router.post("/messages/:id/pin", messageCtrl.pinMessage);
router.delete("/messages/:id/unpin", messageCtrl.unpinMessage);
router.post("/messages/:id/flag", messageCtrl.flagMessage);

// ── Mod Queue ─────────────────────────────────────────────
router.get("/mod-queue", requireRole("admin", "batch_moderator"), modqueueCtrl.listModQueue);
router.patch("/mod-queue/:id", requireRole("admin", "batch_moderator"), modqueueCtrl.updateModQueue);

// ── Notifications ─────────────────────────────────────────
router.get("/notifications", notifCtrl.getNotifications);
router.patch("/notifications/read-all", notifCtrl.markAllRead);
router.patch("/notifications/:id/read", notifCtrl.markRead);

// ── Subscriptions ─────────────────────────────────────────
router.get("/subscriptions/me", subCtrl.getSubscription);
router.post("/subscriptions/upgrade", subCtrl.upgrade);
router.post("/subscriptions/cancel", subCtrl.cancel);

// ── Profile ───────────────────────────────────────────────
router.get("/profile", profileCtrl.getProfile);
router.patch("/profile", profileCtrl.updateProfile);
router.post("/profile/change-password", profileCtrl.changePassword);

// ── Admin ─────────────────────────────────────────────────
router.get("/admin/stats", requireRole("admin"), adminCtrl.getStats);
router.get("/admin/users", requireRole("admin"), adminCtrl.listUsers);
router.post("/admin/users", requireRole("admin"), adminCtrl.createUser);
router.patch("/admin/users/:id/ban", requireRole("admin"), adminCtrl.toggleBanUser);
router.patch("/admin/users/:id/role", requireRole("admin"), adminCtrl.updateUserRole);
router.get("/admin/logs", requireRole("admin"), adminCtrl.listLogs);
router.get("/admin/pinned", requireRole("admin"), adminCtrl.listPinned);
router.get("/admin/broadcast-channels", requireRole("admin"), adminCtrl.listBroadcastChannels);
router.post("/admin/sync-crm", requireRole("admin"), adminCtrl.syncCrm);

router.delete("/admin/messages/:id", requireRole("admin"), adminCtrl.hardDeleteMessage);
router.post("/admin/broadcast", requireRole("admin"), adminCtrl.broadcast);
router.post("/admin/fix-crm-batch-types", requireRole("admin"), adminCtrl.fixCrmBatchTypes);

// ── Mentor ────────────────────────────────────────────────
router.get("/mentor/batches", requireRole("mentor"), mentorCtrl.listAssignedBatches);
router.get("/mentor/batches/:id/members", requireRole("mentor"), mentorCtrl.listBatchMembers);

// ── Learner ──────────────────────────────────────────────
router.get("/learner/enrollments", learnerCtrl.getMyEnrollments);

// ── Direct Messages ───────────────────────────────────────
router.get("/dm/users", dmCtrl.listDmUsers);
router.get("/dm/status", dmCtrl.getUsersStatus);
router.get("/dm/status/:userId", dmCtrl.getUserStatus);
router.get("/dm/conversations", dmCtrl.listConversations);
router.post("/dm/conversations", dmCtrl.startConversation);
router.get("/dm/conversations/:id/messages", dmCtrl.getMessages);
router.post("/dm/conversations/:id/messages", dmCtrl.sendMessage);

export default router;
