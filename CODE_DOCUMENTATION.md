# CMS — Complete Code Documentation

> **Project**: AcceleratorX Community / CMS  
> **Language**: TypeScript (backend) + TypeScript/React (frontend)  
> **Database**: PostgreSQL via Prisma ORM  
> **Cache**: Redis (auth cache, socket scaling, typing indicators, online status)  
> **Real-time**: Socket.IO with Redis adapter (multi-node)  
> **Frontend**: React 18 + Vite + Tailwind CSS v4 + Zustand + @tanstack/react-query  
> **Package manager**: npm  

---

## Table of Contents

1. [Database Schema (Prisma)](#1-database-schema-prisma)
2. [Backend Entry Point](#2-backend-entry-point-backendsrcindexts)
3. [Routes](#3-routes)
4. [Middleware Pipeline](#4-middleware-pipeline)
5. [Controllers → Services → Database](#5-controllers--services--database)
6. [Socket.IO Real-Time Layer](#6-socketio-real-time-layer)
7. [Outbox & Reliability](#7-outbox--reliability)
8. [CRM & LMS Integration](#8-crm--lms-integration)
9. [Utilities & Helpers](#9-utilities--helpers)
10. [Frontend Architecture](#10-frontend-architecture)
11. [Zustand Stores](#11-zustand-stores)
12. [Authentication Flow](#12-authentication-flow)
13. [Permission Model](#13-permission-model)

---

## 1. Database Schema (Prisma)

**File**: `backend/prisma/schema.prisma`  
Every model, field, and relation explained line by line.

---

### 1.1 Generator & Datasource

```
generator client {
  provider = "prisma-client-js"
}
```
- The Prisma generator produces a type-safe JS client at build time. This instruction tells Prisma to use its standard JS client generator.

```
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```
- `provider = "postgresql"` — Prisma generates PostgreSQL-specific SQL.
- `url = env("DATABASE_URL")` — reads the connection string from `.env` at runtime.

---

### 1.2 Enums

| Enum | Values | Purpose |
|---|---|---|
| `UserRole` | `admin`, `mentor`, `batch_moderator`, `learner`, `guest` | Global user tier |
| `Provider` | `crm`, `website` | Where user identity originates |
| `SubscriptionStatus` | `free`, `active`, `expired` | CMS-level subscription state |
| `BatchType` | `general`, `private`, `paid`, `public`, `hidden` | Visibility/access level |
| `MembershipRole` | `member`, `mentor`, `moderator` | Role within a specific batch |
| `MessageType` | `text`, `file`, `system` | Message content type |
| `SubPlan` | `free`, `pro` | Subscription plan tier |
| `SubStatus` | `active`, `expired`, `cancelled` | Subscription lifecycle |
| `NotificationType` | `new_message`, `mention`, `admin_action`, `mod_action` | What triggered a notification |
| `ModQueueStatus` | `pending`, `resolved`, `escalated` | Moderation workflow state |
| `ModQueuePriority` | `low`, `medium`, `high` | Urgency of a moderation flag |

---

### 1.3 Models

#### `User` (line 85–125)

```
id                  String             @id @default(uuid()) @db.Uuid
username            String             @unique
email               String             @unique
password_hash       String
role                UserRole           @default(learner)
provider            Provider           @default(website)
crm_customer_id     String?            @unique
crm_mentor_id       String?            @unique
subscription_status SubscriptionStatus @default(free)
is_banned           Boolean            @default(false)
bio                 String?            @db.Text
phone               String?
avatar_url          String?
created_at          DateTime           @default(now())
updated_at          DateTime           @updatedAt
```

- `id`: UUID primary key — generated server-side, never exposed for enumeration.
- `username`: unique display name used in `@mentions`.
- `email`: unique — used for login and account recovery.
- `password_hash`: bcrypt hash stored at 12 rounds. Special sentinel values `CRM_MANAGED` and `OTP_MANAGED` mean "the user authenticates via CRM/OTP, not a local password".
- `role`: global permission tier. `learner` is the default for self-registration; `admin` and `mentor` are typically CRM-provisioned.
- `provider`: tracks identity source — `website` for self-registered, `crm` for CRM-synced users.
- `crm_customer_id`: foreign key to the CRM customer record — populated when learner logs in via CRM.
- `crm_mentor_id`: foreign key to the CRM mentor record — populated when a mentor SSOs via CRM.
- `subscription_status`: tracks the in-app subscription level (defaults to free; paid = active).
- `is_banned`: soft ban flag — checked on every auth middleware invocation and socket connection.

**Relations** (line 102–117):
- `memberships Membership[]` — user's batch membership rows (many-to-many via Membership model).
- `messages Message[] @relation("SenderMessages")` — all messages sent by this user.
- `batches_created Batch[] @relation("BatchCreator")` — batches the user created (admin only).
- `channels_created Channel[] @relation("ChannelCreator")` — channels the user created.
- `subscription Subscription?` — 1:1 subscription record.
- `admin_logs AdminLog[] @relation("ActorLogs")` — audit trail entries triggered by this user.
- `notifications Notification[]` — notifications received.
- `pinned_messages PinnedMessage[]` — messages this user pinned.
- `mod_queue_reported ModQueue[] @relation("Reporter")` — mod queue items this user reported.
- `mod_queue_reviewed ModQueue[] @relation("Reviewer")` — mod queue items this user reviewed.
- `conversations_as_a Conversation[] @relation("ConvUserA")` — DMs where user is participant A.
- `conversations_as_b Conversation[] @relation("ConvUserB")` — DMs where user is participant B.
- `direct_messages DirectMessage[] @relation("DMSender")` — DM messages sent.
- `message_reactions MessageReaction[]` — reactions this user placed.
- `password_reset_tokens` — password reset flow tokens.
- `refresh_tokens` — JWT refresh session tokens.

**Indexes** (lines 119–123):
- `@@index([phone])` — speeds up phone-based login lookups.
- `@@index([is_banned])` — efficient filtering when building the DM user list (excludes banned users).
- `@@index([role])` — role-based admin queries.
- `@@index([created_at(sort: Desc)])` — new-user-first admin pagination.
- `@@index([role, created_at(sort: Desc)])` — combined role-filtered + new-first pagination.

---

#### `Subscription` (lines 297–308)

```
id         String    @id @default(uuid()) @db.Uuid
user_id    String    @unique @db.Uuid
plan       SubPlan   @default(free)
status     SubStatus @default(active)
started_at DateTime @default(now())
expires_at DateTime?
```

- 1:1 relation with User. Tracks plan (free/pro), lifecycle status, and optional expiry date for paid subscriptions.

---

#### `Batch` (lines 171–199)

```
id          String    @id @default(uuid()) @db.Uuid
org_id      String    @db.Uuid
name        String
description String?
type        BatchType @default(general)
is_paid     Boolean   @default(false)
is_pinned   Boolean   @default(false)
crm_batch_id String?  @unique
crm_course   String?
crm_course_id String?
crm_start_date DateTime?
crm_end_date DateTime?
crm_active Boolean?
crm_deleted Boolean?
crm_batch_type String?
crm_image String?
crm_last_synced_at DateTime?
created_by  String    @db.Uuid
created_at  DateTime  @default(now())
```

- `org_id`: groups batches under an organization.
- `type`: determines who can access (public/general = open; private/paid/hidden = membership-gated).
- `is_pinned`: dashboard pin for important batches.
- CRM fields (`crm_batch_id`, `crm_course`, etc.): populated by the CRM sync job — CMS is a read-through cache of CRM batch data.
- `created_by`: the admin who created the batch in CMS.

---

#### `Channel` (lines 201–219)

```
id         String   @id @default(uuid()) @db.Uuid
batch_id   String   @db.Uuid
name       String
is_pinned  Boolean  @default(false)
created_by String   @db.Uuid
created_at DateTime @default(now())
updated_at DateTime @updatedAt
```

- Lives inside a batch. Channels are the chat rooms — users join/leave via Socket.IO rooms named `channel:${channelId}`.
- `is_pinned`: pinned sidebar channel.

---

#### `Membership` (lines 242–256)

```
id            String         @id @default(uuid()) @db.Uuid
user_id       String         @db.Uuid
batch_id      String         @db.Uuid
role_in_batch MembershipRole @default(member)
joined_at     DateTime       @default(now())
```

- The junction table between User and Batch — this IS the access credential.
- `role_in_batch`: `mentor` or `moderator` grants elevated permissions inside that batch.
- `@@unique([user_id, batch_id])` — a user can join each batch only once.
- Membership is created either by admin manually, or automatically by the CRM enrollment sync.

---

#### `Message` (lines 258–282)

```
id           String      @id @default(uuid()) @db.Uuid
channel_id   String      @db.Uuid
sender_id    String      @db.Uuid
content      String
message_type MessageType @default(text)
is_deleted   Boolean     @default(false)
deleted_at   DateTime?
parent_id    String?     @db.Uuid
seq_id       Int
created_at   DateTime    @default(now())
```

- `seq_id`: a deterministic, monotonically increasing integer per channel (guaranteed by `ChannelMessageSequence`). Enables reliable cursor-based pagination without race conditions.
- `parent_id`: enables threaded replies.
- `is_deleted`: soft-delete — content is blanked but the row is retained. The retention purge job hard-deletes after a window.

---

#### `OutboxEvent` (lines 451–464)

```
id           BigInt    @id @default(autoincrement())
aggregate    String    // 'channel' | 'dm' | 'notification'
aggregate_id String    @db.Uuid
event        String    // socket event name, e.g. 'receive_message'
rooms        String[]  // socket rooms to emit to
payload      Json
published    Boolean   @default(false)
created_at   DateTime  @default(now())
published_at DateTime?
```

- Core reliability mechanism. Every real-time message (channel or DM) writes an OutboxEvent in the **same DB transaction** as the message row. If the process crashes between commit and socket emit, the relay catches up on restart.
- `published=false` rows are drained in ID order with `FOR UPDATE SKIP LOCKED` for safe parallel relay workers.

---

## 2. Backend Entry Point

**File**: `backend/src/index.ts`

```
Line 1-7       Imports: express, http, cors, cookie-parser, socket.io, fs, path
Line 9          @socket.io/redis-adapter — multi-node Socket.IO scaling
Line 11-18     Internal module imports
Line 20-21     app = express(), server = http.createServer(app)
Line 28-36     Trust proxy config (Cloudflare/Vercel/Nginx) for correct IP-based rate limiting
Line 38-47     CORS origin parsing from env, with localhost fallbacks
Line 50-57     Socket.IO server initialization with CORS config
Line 58         initSockets(io) — attaches all socket event handlers
Line 59         app.set("io", io) — exposes io instance via req.app.get("io")
Line 65-83     setupSocketScaling() — async, attaches Redis adapter if available
Line 84         void setupSocketScaling() — fire-and-forget, doesn't block server startup
Line 89         startOutboxRelay(io) — background loop that re-publishes unpublished events
Line 90         startDeletedMessagePurgeJob() — cron that hard-deletes soft-deleted messages after retention period
Line 93-101    Middlewares: requestLogger → CORS → express.json() → cookieParser
Line 108-117   X-Frame-Options removal + CSP frame-ancestors for LMS embedding
Line 120-124   Static file serving at /uploads for uploaded media
Line 127-130   Route registration: /api/integration (no auth) + /api (auth required)
Line 133       errorHandler — must be last middleware to catch all downstream errors
Line 135-140   HTTP server listens on PORT (4000 default)
Line 142-148   SIGTERM graceful shutdown handler
```

---

## 3. Routes

**File**: `backend/src/routes/index.ts`

```
Line 1-5       Import Express Router, auth middlewares, upload middleware
Line 7-22      Import all controllers (namespace import style: * as XCtrl)
Line 24         Create Express Router()
Line 27         Global rate limiter applied to ALL routes in this router
Line 30-34      Dedicated rate limiters for sensitive auth endpoints
                   - loginLimiter: 12 attempts per 60s per login identifier
                   - otpSendLimiter: 6 OTP sends per 60s
                   - otpVerifyLimiter: 12 OTP verifies per 60s
                   - forgotLimiter: 6 password resets per 60s per email
                   - resetLimiter: 10 password resets per 60s
Line 37-45     Auth routes (register, login, forgot-password, reset-password, learner-login, refresh, logout, OTP)
Line 48         authenticate middleware — all routes below require a valid JWT
Line 50         GET /auth/me — returns current user profile
Line 53         Upload sub-router mounted at /upload
Line 56-61     Batch CRUD + pin toggle (admin only for write ops)
Line 63-69     Channel CRUD + pin toggle (moderators+ can create/rename, admin can delete)
Line 72         GET /pinned — user's personal pinned channels (for dashboard)
Line 75-78     Member management (admin only)
Line 81-86     Message routes (list, create with file upload, soft-delete, pin, unpin, flag)
Line 89-90     Mod queue (list + update status)
Line 93-95     Notifications (list, mark all read, mark single read)
Line 98-100    Subscription (get, upgrade, cancel)
Line 103-105   Profile (get, update, change-password)
Line 108-121   Admin routes (stats, metrics, user management, logs, broadcast, CRM sync)
Line 124-125   Mentor routes (assigned batches, batch members)
Line 128        Learner routes (enrollments)
Line 131        Classes (CRM-backed schedule)
Line 134-140   Direct Messages (list users, status, conversations, send message)
```

---

## 4. Middleware Pipeline

### 4.1 `auth.ts` — JWT Authentication + Role Guard

**File**: `backend/src/middlewares/auth.ts`

```
Line 11         AUTH_USER_CACHE_TTL = 30 seconds — Redis cache TTL for user rows
Line 12-14      authUserCacheKey() — generates Redis key: "auth:user:${userId}"
Line 17-19      clearAuthUserCache() — evicts cached user after role/ban changes
Line 22-36      Type augmentation: adds req.user with typed shape to Express Request
Line 42-97      authenticate middleware:
                   - Reads Bearer token from Authorization header
                   - Verifies JWT signature and expiry
                   - Looks up user in Redis cache first (30s TTL)
                   - On cache miss: queries Postgres and caches result
                   - Checks is_banned — throws UnauthorizedError if banned
                   - Attaches req.user object (id, email, role, username, etc.)
Line 103-113    requireRole(...roles):
                   - Checks req.user.role is in the allowed roles list
                   - Returns 403 (ForbiddenError) if not authorized
                   - Returns 401 (UnauthorizedError) if req.user is missing
```

### 4.2 `errorHandler.ts`
Global Express error handler — formats all errors as consistent JSON `{ error, statusCode }`. Must be the last middleware.

### 4.3 `rateLimiter.ts` + `authRateLimiter.ts`
- General rate limiter: applied to all API routes.
- Auth rate limiters: per-IP and per-target (email/phone) for sensitive endpoints, using Redis counters with sliding windows.

### 4.4 `upload.ts`
Multer-based multipart form parser. Handles file uploads (images, PDFs, videos) with size/type validation and stores to disk.

### 4.5 `requestLogger.ts`
Logs every incoming request: method, path, status, duration, IP.

---

## 5. Controllers → Services → Database

The app follows a **3-layer architecture**:

```
HTTP Request
  → Controller (parse & validate input)
    → Service (business logic, DB calls)
      → Prisma Client (SQL generation)
```

### 5.1 Auth Controller + Service

**Controller**: `backend/src/controllers/auth.controller.ts`  
**Service**: `backend/src/services/auth.service.ts`

```
auth.controller.ts:
  Line 8-22   register()        → POST /auth/register
  Line 24-39  login()           → POST /auth/login
  Line 45-53  forgotPassword()  → POST /auth/forgot-password
  Line 60-68  resetPassword()   → POST /auth/reset-password
  Line 75-90  learnerLogin()    → POST /auth/learner-login (SSO, no password)
  Line 92-109 refresh()         → POST /auth/refresh (rotation)
  Line 111-119 logout()         → POST /auth/logout (revoke refresh token)
  Line 121-131 getMe()          → GET  /auth/me

auth.service.ts (key functions):
  registerUser()     (line 48)   — hashes password, creates user + free subscription, issues JWT + refresh token
  loginUser()        (line 112)  — multi-provider login:
                                     1. CRM provider: try CRM staff auth first, then CRM mentor, then local CMS user, then CRM customer lookup
                                     2. Website provider: try local CMS user, then CRM customer (auto-provision)
  learnerLogin()     (line 461)  — SSO path for LMS embed: phone+email match against CRM → no password
  findOrCreateLearnerUser() (line 358) — finds existing CMS user or creates one from CRM customer data
  requestPasswordReset() (line 577) — generates SHA-256 hashed token, stores in DB, sends email with link
  resetPassword()    (line 622)  — validates token, hashes new password, invalidates all existing refresh tokens
  refreshAccessToken() (line 659) — validates refresh token cookie, rotates it, issues new access token
  fetchEnrichedData() (line 386) — fetches CRM enrollments + LMS profile data in parallel for login response
```

**Password security**:
- Bcrypt at 12 rounds (`BCRYPT_ROUNDS = 12`)
- Timing-safe dummy hash comparison for "user not found" paths (line 46, 207) — prevents user enumeration via timing analysis

**Refresh token rotation** (`session.service.ts`):
- Each refresh call issues a new refresh token and revokes the old one.
- Tokens stored in Redis with metadata (user-agent, IP).

---

### 5.2 Message Service

**File**: `backend/src/services/message.service.ts`

```
loadChannelContext()     (line 10)  — loads channel + batch + membership in parallel (single query optimization)
listMessages()           (line 27)  — cursor-paginated message fetch with permission check
createMessage()          (line 89)  — validates permissions, allocates seq_id in transaction, creates message + attachments, parses @mentions, creates notifications
softDeleteMessage()      (line 164) — blanks content, sets is_deleted, logs admin action if moderator did it
hardDeleteMessage()      (line 198) — admin-only: fully removes message, attachments, pins, mod queue refs
pinMessage()             (line 220) — moderator+ only: creates PinnedMessage row
unpinMessage()           (line 252) — removes PinnedMessage row
flagMessage()            (line 273) — creates ModQueue entry for moderator review
parseMentions()          (line 318) — regex-scans @username patterns, resolves against batch members, returns user IDs
```

**`seq_id` allocation** (`message-sequence.service.ts`):  
Each channel and conversation has a `ChannelMessageSequence` / `ConversationMessageSequence` row tracking `last_seq`. When creating a message, `last_seq + 1` is atomically incremented in a transaction. This gives each message a stable, sortable sequence number without relying on timestamp order.

---

### 5.3 DM (Direct Message) Service

**File**: `backend/src/services/dm.service.ts`

Handles 1:1 conversations:
- `startConversation()` — creates Conversation row, enforces uniqueness (user_a_id < user_b_id).
- `sendMessage()` — allocates DM seq_id, writes message + outbox event in transaction.
- `getMessages()` — cursor-paginated DM history.
- `markAsRead()` — bulk-updates is_read for all messages in a conversation from the other user.

---

### 5.4 Mod Queue Service

**File**: `backend/src/services/modqueue.service.ts`

- `listModQueue()` — returns all flagged messages with reporter, priority, status.
- `updateModQueue()` — moderator resolves or escalates a flagged item, logs admin action.

---

### 5.5 Batch, Channel, Member, Class Services

| Service | Responsibility |
|---|---|
| `batch.service.ts` | CRUD for batches, pin/unpin, archive |
| `channel.service.ts` | CRUD for channels within batches, pin/unpin |
| `member.service.ts` | Add/remove members, update role in batch |
| `classes.service.ts` | Fetches CRM class schedule for a batch, merges with CRM sync data |

---

## 6. Socket.IO Real-Time Layer

**File**: `backend/src/sockets/index.ts`

```
Line 18-31      ServerToClientEvents — typed events the server emits:
                  receive_message, user_joined, user_left, typing_indicator,
                  notify_user, notification_read, mod_queue_updated,
                  reaction_updated, receive_dm, dm_typing, dm_read,
                  user_online, user_offline

Line 41-55      ClientToServerEvents — events the client sends:
                  join_channel, leave_channel, send_message, typing_start/stop,
                  mark_read, join_dm, leave_dm, send_dm, dm_typing_start/stop,
                  mark_dm_read, toggle_reaction

Line 99-118     Socket authentication middleware:
                  - Reads JWT from socket.handshake.auth.token (Bearer or raw)
                  - Verifies token, loads user from DB
                  - Rejects banned users immediately
                  - Attaches userId + username to socket.data

Line 120-396    io.on("connection", ...) — per-socket handlers:
```

**Channel events** (lines 138–290):
```
join_channel  → validates access, joins room "channel:${id}", broadcasts user_joined
leave_channel → leaves room, broadcasts user_left
send_message  → validates permissions, creates message in DB transaction + outbox event,
                 fast-path publishes socket emit, parses @mentions, sends notifications
toggle_reaction → toggles MessageReaction row, broadcasts updated reactions to channel
typing_start/stop → sets Redis key with 5s TTL, broadcasts typing event
mark_read     → marks notifications as read
```

**DM events** (lines 303–387):
```
join_dm       → validates the user is in the conversation, joins "dm:${conversationId}"
leave_dm      → leaves room
send_dm       → calls sendDirectMessage() (message + outbox in transaction), fast-publishes, sends notification to other user
mark_dm_read  → marks all unread DMs as read, emits dm_read event to other participant
dm_typing_start/stop → broadcasts typing indicator within DM room
```

**Lifecycle** (lines 389–395):
```
disconnect → clears heartbeat interval, deletes Redis online key, broadcasts user_offline
```

**Heartbeat** (lines 133–135):  
Every 15 seconds, each socket sets `user:online:${userId}` in Redis with a 30s TTL. The presence system is eventual — a missed heartbeat expires after 30s.

---

## 7. Outbox & Reliability

**File**: `backend/src/services/outbox.service.ts`

```
Purpose: Guarantee zero-lost real-time events even if the process crashes after DB commit but before socket emit.

enqueueOutbox(tx, input)   (line 44) — writes OutboxEvent row INSIDE the same Prisma transaction as the domain write
publishNow(io, row)        (line 61) — fast path: emits socket event immediately after commit, marks published=true
drainOnce(io, filter?)     (line 86) — background relay: SELECT ... FOR UPDATE SKIP LOCKED to safely drain unpublished rows
                               Multiple server nodes can run drainOnce concurrently without duplicate processing.
startOutboxRelay(io)       (line 131) — starts the relay; runs once on startup to flush crash survivors,
                               then polls every 2s. Drains full batches of 100 in a loop to clear backlogs.
getEventsSince()           (line 158) — resync support: replays outbox events for a channel/conversation
                               newer than the client's last seen ID. Lets offline clients catch up.
```

---

## 8. CRM & LMS Integration

### 8.1 CRM Client

**File**: `backend/src/services/crm.client.ts`

```
Line 15        CRM_BASE_URL — endpoint of the CRM (NestJS) backend
Line 20-22     CRM credentials from env (service account for server-to-server calls)
Line 27        CRM_CUSTOMER_CACHE_TTL = 10 minutes — Redis cache for customer lookups
Line 33-46     Cache helpers: getCachedCustomer / setCachedCustomer
Line 139-210   Service token management:
                  - fetchServiceToken() — login with service account, cache token for 12 min
                  - tokenInflight deduplication prevents parallel login storms
                  - 401 retry with forced token refresh
Line 212-252   crmGet(path) — authenticated GET with retry-on-401, metrics, timeout
Line 254-290   crmPostInternal(path, body) — HMAC-signed POST for internal mentor endpoints
Line 292-316   fetchAllPages() — auto-paginates through paged CRM responses
Line 324-340   loginCrmStaff() — CRM admin/staff login (used for CRM-provider SSO)
Line 342-352   verifyCrmMentorLogin() — HMAC-signed internal call to verify mentor credentials
Line 358-401   findCrmCustomerByContact() — look up learner by email or phone, multi-cache-key
Line 406-423   findCrmCustomerByCustId() — lookup by CRM customer ID
Line 428-436   getCustomerEnrollments() — fetch active enrollments for batch sync
Line 508-514   getCrmClassesForBatch() — fetch scheduled classes for a batch
Line 533-561   getBatchStudents() — fetch enrolled students for a batch
```

**CRM sync** (`crm-sync.service.ts`):  
Periodic/admin-triggered job that:
1. Fetches all active CRM batches and upserts them into the `Batch` table.
2. Fetches all active enrollments and upserts `Membership` rows (provisioning batch access for learners).
3. Reconciles mentors and batch-mentor assignments.

---

### 8.2 LMS Client

**File**: `backend/src/services/lms.client.ts`

Fetches enriched learner data from the LMS:
- `getLmsLearnerData(custId)` — retrieves learner profile (education, skills, experience, company, designation) and enrolled courses.
- Results are merged into the login response as `sources.lms` and `sources.crmEnrollments`.

---

## 9. Utilities & Helpers

| File | Purpose |
|---|---|
| `utils/jwt.ts` | `generateAccessToken()` (RS256/HMAC) + `verifyAccessToken()` with expiry check |
| `utils/redis.ts` | Redis connection factory + `createAdapterPair()` for Socket.IO Redis adapter |
| `utils/prisma.ts` | Singleton PrismaClient instance |
| `utils/cookies.ts` | `setRefreshCookie()` (HttpOnly, Secure, SameSite=Strict) + `clearRefreshCookie()` |
| `utils/errors.ts` | AppError base class + subclasses: BadRequest(400), Unauthorized(401), Forbidden(403), NotFound(404), Conflict(409), ValidationError(422) |
| `utils/logger.ts` | Structured logger (Pino/logging library wrapper) |
| `utils/metrics.ts` | `incrementCounter()` + `observeHistogram()` — Prometheus-style metrics for CRM requests, outbox events, socket connections |
| `utils/throttle.ts` | `consumeCooldown()` — Redis-based cooldown (e.g. 60s between password reset emails) |
| `utils/permissions.ts` | `canAccessBatch()`, `canSendMessage()`, `canModerate()`, `canAdmin()`, `canEscalate()` |
| `utils/params.ts` | URL parameter extraction helpers |

---

## 10. Frontend Architecture

```
frontend/src/
  main.tsx          — app bootstrap
  App.tsx           — route definitions + route guards
  index.css         — Tailwind base + CSS custom properties (theme tokens)
  api/client.ts     — Axios instance with auth interceptor + 401 refresh logic
  embed/
    bridge.ts       — postMessage bridge for LMS iframe embedding
    useEmbedSso.ts  — silent SSO flow inside iframe
  hooks/
    useSocket.ts    — connects to Socket.IO, reconnects on auth refresh
  store/            — Zustand state
  components/       — shared UI components
  pages/            — route-level page components
```

---

## 11. Frontend Stores (Zustand)

All stores use `zustand/persist` to serialize to `localStorage` — survives page refresh.

| Store | File | State Shape | Purpose |
|---|---|---|---|
| `authStore` | `authStore.ts` | `user, accessToken, isAuthenticated, sources` | Login state, token management, embed SSO data |
| `messageStore` | `messageStore.ts` | `messages: Record<channelId, Message[]>` | Per-channel message cache with optimistic UI support |
| `dmStore` | `dmStore.ts` | conversations + messages | DM conversations and messages |
| `socketStore` | `socketStore.ts` | connection status | Socket.IO connection state |
| `notificationStore` | `notificationStore.ts` | notifications list | Unread count, mark-as-read |
| `batchStore` | `batchStore.ts` | batches list | Cached batch data for sidebar |
| `uiStore` | `uiStore.ts` | theme, sidebar state | Dark/light mode, UI preferences |

**Key patterns in messageStore** (`frontend/src/store/messageStore.ts`):
- `addOptimisticMessage()` — inserts a fake message with `isOptimistic: true` and `tempId` BEFORE server confirms.
- `removeOptimisticMessage()` — removes the temp message once the real one arrives (matched by `tempId`).
- `appendMessage()` — dedupes optimistic messages by `tempId` when the real message arrives.
- `updateReactions()` — merges server-pushed reaction updates into the local cache.

---

## 12. Authentication Flow

### 12.1 Website Provider Login

```
Client                         Backend
  |                               |
  |  POST /auth/login             |
  |  { identifier, password }     |
  |-----------------------------> |
  |                               |  validate input (zod)
  |                               |  lookup user by email/phone
  |                               |  bcrypt.compare(password, hash)
  |                               |  issue JWT (access + refresh)
  |  { user, accessToken }        |
  |<----------------------------- |
  |                               |  setRefreshCookie (HttpOnly)
  |                               |
  |  Browser stores:              |
  |  - accessToken in localStorage|
  |  - refreshToken in HttpOnly   |
  |    cookie                      |
```

### 12.2 CRM Provider Login (3-step fallback)

```
Client                         Backend
  |  POST /auth/login             |
  |  { identifier, provider:"crm" }|
  |-----------------------------> |
  |                               |  Step 1: Try CRM staff auth
  |                               |  → if admin → upsertAndIssueAdmin()
  |                               |  Step 2: Try CRM mentor auth
  |                               |  → if mentor → upsertAndIssueMentor()
  |                               |  Step 3: findLocalUser() in CMS DB
  |                               |  → if found with real password → issueTokens()
  |                               |  Step 4: CRM customer lookup by email/phone/crm_id
  |                               |  → findOrCreateLearnerUser() → issueTokens()
  |                               |  Background: sync batch memberships + enrich data
  |  { user, accessToken }        |
  |<----------------------------- |
```

### 12.3 Learner SSO (LMS Embed)

```
LMS (parent)                    CMS
  |                               |
  |  POST /auth/learner-login     |
  |  { phone, email } (no password)|
  |-----------------------------> |
  |                               |  lookup CRM customer by phone
  |                               |  verify email matches CRM record
  |                               |  findOrCreateLearnerUser()
  |                               |  issueTokens() (no password needed)
  |  { user, accessToken }        |
  |<----------------------------- |
```

### 12.4 Token Refresh Flow

```
401 Response from any API call
  |                               |
  |  POST /auth/refresh (single-flight)  |
  |-----------------------------> |
  |                               |  verify refresh token from HttpOnly cookie
  |                               |  rotate: issue new refresh token, revoke old
  |                               |  issue new access token
  |  { accessToken }              |
  |<----------------------------- |
  |  Retry original request with  |
  |  new access token             |
```

**Single-flight refresh** (`frontend/src/api/client.ts:26-43`):  
When multiple parallel requests 401 simultaneously, they all await the same `refreshPromise`. This prevents refresh-token rotation conflicts where parallel refreshes would invalidate each other.

---

## 13. Permission Model

**File**: `backend/src/utils/permissions.ts`

```
canAccessBatch(user, batch, membership?)
  admin           → always true
  guest           → batch.type === "general" AND batch_settings.allow_guests
  public/general  → any registered user
  mentor          → membership?.role_in_batch === "mentor"
  private/paid/hidden → membership MUST exist (regardless of role)
  (membership is the access credential — CRM provisioning = paid)

canSendMessage(user, batch, membership?)
  is_banned       → false
  guest           → false (read-only)
  !canAccessBatch → false
  otherwise       → true

canModerate(user, membership?)
  admin           → true
  moderator role  → true
  otherwise       → false

canAdmin(user)
  admin           → true
  otherwise       → false
```

**Key insight about paid batches**:  
Payment is NOT checked in-app. The CRM only provisions a `Membership` row for learners who have paid. The presence of the Membership row IS the proof of payment. This avoids circulating "free" subscription_status as a gate that would immediately lock all CRM-synced learners.

---

## 14. Frontend Pages & Routing

**File**: `frontend/src/App.tsx`

```
Route                    Component           Guard
/login                   LoginPage           Public
/register                RegisterPage        Public
/                        DashboardPage       Protected + Shell
/batches                 BatchesPage         Protected + Shell
/batch/:id               BatchPage           Protected + Shell
/batch/:batchId/channel/:channelId  ChannelChatPage  Protected + Shell
/admin                   AdminPage           Protected + Shell + admin role
/mentor                  MentorPage          Protected + Shell + mentor role
/profile                 ProfilePage         Protected + Shell
/dm                      DmPage              Protected + Shell
/dm/:conversationId      DmPage              Protected + Shell
/subscription            SubscriptionPage    Protected + Shell
```

**Route guards** (`App.tsx:20-30`):
- `ProtectedRoute`: checks `useAuthStore(s => s.isAuthenticated)` — redirects to `/login` if false.
- `RoleRoute`: checks `useAuthStore(s => s.user?.role)` against allowed roles — redirects to `/` if mismatch.
- `Shell`: wraps any page in `ProtectedRoute + AppShell` (sidebar + header layout).

**Embed mode** (`App.tsx:45-73`):  
When loaded inside the LMS iframe, the app blocks rendering with a "Connecting…" spinner until the LMS supplies credentials via `postMessage`. The `useEmbedSso()` hook handles the silent SSO handshake with the parent frame.

---

## 15. Data Flow: Sending a Channel Message

```
Frontend (ChannelChatPage)
  |
  | 1. User types message, clicks Send
  | 2. addOptimisticMessage(channelId, { tempId, content, ... })
  | 3. api.post("/messages", { content, channelId, attachments })
  |    OR socket.emit("send_message", { channelId, content, tempId })
  |
  |==================================== Backend ====================================|
  |
  Socket handler (sockets/index.ts:159)
  |  4. validate with Zod schema
  |  5. loadChannelContext() → channel + batch + membership
  |  6. canSendMessage() check
  |
  prisma.$transaction(async (tx) => {
  |   7. allocateChannelMessageSeq() → seq_id (atomic increment)
  |   8. tx.message.create({ data, include: sender, attachments, reactions, parent })
  |   9. enqueueOutbox(tx, { aggregate: "channel", aggregateId: channelId,
  |          event: "receive_message", rooms: [`channel:${channelId}`], payload: message })
  |   → both rows commit atomically
  })
  |  10. publishNow(io, outboxEvent) → fast-path emit to "channel:${channelId}"
  |  11. parseMentions() → look up @username in batch members
  |  12. prisma.notification.create() for each mention
  |  13. io.to(`user:${targetId}`).emit("notify_user", notification)
  |
  |==================================== Frontend ====================================|
  |
  Socket listener (useSocket.ts)
  |  14. receives "receive_message" with real message (matched by tempId)
  |  15. removeOptimisticMessage(channelId, tempId) — removes the fake message
  |  16. appendMessage(channelId, realMessage) — inserts server-confirmed message
  |
  Other clients in same channel
  |  17. receive "receive_message" → appendMessage() → message appears in their UI
```

---

## 16. Key Configuration

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection (optional — falls back to memory cache) |
| `CLIENT_ORIGIN` | Comma-separated allowed CORS origins |
| `JWT_SECRET` | HMAC secret for access tokens |
| `CRM_BASE_URL` | CRM (NestJS) backend URL |
| `CRM_SERVICE_EMAIL/PASSWORD` | Service account for CRM server-to-server calls |
| `CRM_INTERNAL_HMAC_SECRET` | HMAC secret for signing internal CRM mentor endpoints |
| `UPLOAD_DIR` | Disk directory for file uploads (default: ./uploads) |
| `FRAME_ANCESTORS` | LMS origins allowed to embed CMS in iframe |
| `TRUST_PROXY` | Reverse proxy trust level (1 in production) |
| `VITE_API_URL` | Frontend API base URL |
| `VITE_SOCKET_URL` | Socket.IO server URL |

---

## 17. Technology Stack Summary

```
Backend
  Express 5 + TypeScript
  Socket.IO 4 + @socket.io/redis-adapter
  Prisma 5 (PostgreSQL)
  Redis (ioredis)
  Zod (validation)
  bcrypt + JWT (auth)
  express-fileupload / multer (uploads)

Frontend
  React 18 + TypeScript
  Vite 6
  Tailwind CSS 4
  Zustand 4 (persist to localStorage)
  @tanstack/react-query
  axios
  socket.io-client
  react-hot-toast
  lucide-react (icons)
  framer-motion (animations)
```

---

## 18. Security Measures

| Measure | Where |
|---|---|
| Bcrypt at 12 rounds | `auth.service.ts:36` |
| Timing-safe dummy hash | `auth.service.ts:46,207` — prevents user enumeration |
| HttpOnly + Secure + SameSite Strict cookies | `utils/cookies.ts` |
| Refresh token rotation | `session.service.ts` — rotate on every use |
| Per-IP rate limiting | `middlewares/authRateLimiter.ts` |
| Global rate limiting | `middlewares/rateLimiter.ts` |
| Password reset cooldown (60s) | `utils/throttle.ts` |
| Banned user check on every request + socket connect | `middlewares/auth.ts`, `sockets/index.ts` |
| Soft-delete with admin audit log | `message.service.ts:188-193` |
| CSRF-safe: custom header on all mutations | `api/client.ts` interceptor |
| OWASP-sanitized "Invalid credentials" message | `auth.service.ts:208` — same timing for valid/invalid users |

---

*End of documentation.*
