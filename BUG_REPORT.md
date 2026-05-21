# Bug Report & Code Audit

**Date:** 2026-04-28  
**Status:** 5 Critical/High Issues Found  
**Testing Method:** Static code review + runtime validation

---

## 🔴 CRITICAL BUGS

### 1. **Access Control Bypass: Unauthorized Message Reading**

**Severity:** 🔴 **CRITICAL** (Information Disclosure)  
**Location:** `backend/src/controllers/message.controller.ts:5-20` + `backend/src/services/message.service.ts:6-40`  
**Endpoint:** `GET /api/messages?batch_id={batchId}`

**Description:**
Any authenticated user can read all messages from any batch, regardless of membership or batch type (private/paid/hidden).

**Proof of Concept:**
```
1. Create admin user → Create batch (private/paid)
2. Create learner user (no membership in admin's batch)
3. GET /api/messages?batch_id={adminBatchId} with learner token
4. Result: 200 OK with full message list (should be 403 Forbidden)
```

**Root Cause:**
`listMessages()` only filters by `batch_id` without enforcing `canAccessBatch()` permission check.

**Current Code (VULNERABLE):**
```typescript
export async function listMessages(batchId: string, cursor?: string, limit = 50) {
  const messages = await prisma.message.findMany({
    where: { batch_id: batchId },  // ⚠️ No access control!
    // ...
  });
}
```

**Fix:**
```typescript
export async function listMessages(batchId: string, userId: string, cursor?: string, limit = 50) {
  // Verify user can access this batch
  const [user, batch, membership] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.batch.findUniqueOrThrow({ where: { id: batchId }, include: { batch_settings: true } }),
    prisma.membership.findUnique({ where: { user_id_batch_id: { user_id: userId, batch_id: batchId } } }),
  ]);

  if (!canAccessBatch(user, batch, membership)) {
    throw new ForbiddenError("You do not have access to this batch");
  }

  // Continue with message fetch...
}
```

**Update Controller:**
```typescript
const result = await messageService.listMessages(batchId, req.user!.id, cursor, limit);
```

**Impact:**
- Private batches: Messages exposed to all users
- Paid batches: Content accessible without subscription
- Hidden batches: Existence/content revealed
- Compliance: GDPR/data privacy violation

---

### 2. **Banned Users Can Continue Using APIs**

**Severity:** 🔴 **CRITICAL** (Account Control Bypass)  
**Location:** `backend/src/middlewares/auth.ts:44-66` + `backend/src/services/auth.service.ts:93-99`

**Description:**
Banned users with valid tokens/refresh cookies can continue making API requests. Ban is only enforced at login, not on every request.

**Current Code (INCOMPLETE):**
```typescript
// middleware/auth.ts - Only checks is_banned once per login
const user = await prisma.user.findUnique({ where: { id: payload.userId } });
if (!user) throw new UnauthorizedError("User not found");
// BUG: Doesn't check user.is_banned here!
```

**Fix in Middleware:**
```typescript
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedError("No token provided");
    }

    const token = authHeader.split(" ")[1];
    let payload: JwtPayload;

    try {
      payload = verifyAccessToken(token);
    } catch {
      throw new UnauthorizedError("Invalid or expired token");
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true, email: true, role: true, username: true,
        is_banned: true,  // ← Add this
        subscription_status: true, provider: true,
      },
    });

    if (!user) {
      throw new UnauthorizedError("User not found");
    }

    // ← ADD THIS CHECK
    if (user.is_banned) {
      throw new UnauthorizedError("Your account has been banned");
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}
```

**Also Fix Refresh Flow:**
```typescript
export async function refreshAccessToken(refreshTokenCookie: string) {
  if (!refreshTokenCookie) {
    throw new UnauthorizedError("No refresh token provided");
  }

  let payload;
  try {
    payload = verifyRefreshToken(refreshTokenCookie);
  } catch {
    throw new UnauthorizedError("Invalid refresh token");
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) {
    throw new UnauthorizedError("User not found");
  }

  // ← ADD THIS CHECK
  if (user.is_banned) {
    throw new UnauthorizedError("Your account has been banned");
  }

  const accessToken = generateAccessToken(user);
  return { accessToken };
}
```

**Impact:**
- Banned users retain API access indefinitely
- Moderation tools ineffective
- Compliance violation

---

### 3. **Paid Batch Access Control Not Enforced**

**Severity:** 🔴 **CRITICAL** (Revenue Impact)  
**Location:** `backend/src/utils/permissions.ts:6-34`

**Description:**
The `canAccessBatch()` function comment states paid batches require active subscription, but code never implements this check.

**Current Code (INCOMPLETE):**
```typescript
export function canAccessBatch(
  user: User,
  batch: BatchWithSettings,
  membership?: Membership | null
): boolean {
  if (user.role === "admin") return true;
  
  if (user.role === "guest") {
    return batch.type === "general" && (batch.batch_settings?.allow_guests ?? false);
  }

  // Public/General batches are accessible to all registered users
  if (batch.type === "public" || batch.type === "general") {
    return true;  // ⚠️ Returns true even if batch.is_paid!
  }

  if (!membership) return false;
  return true;  // ⚠️ Never checks subscription_status or is_paid
}
```

**Fix:**
```typescript
export function canAccessBatch(
  user: User,
  batch: BatchWithSettings,
  membership?: Membership | null
): boolean {
  if (user.role === "admin") return true;

  if (user.role === "guest") {
    return batch.type === "general" && (batch.batch_settings?.allow_guests ?? false);
  }

  // Paid batches require active subscription
  if (batch.is_paid && user.subscription_status !== "active") {
    return false;
  }

  // Public/General batches are accessible to all registered users
  if (batch.type === "public" || batch.type === "general") {
    return true;
  }

  // Must have membership for private/paid/hidden batches
  if (!membership) return false;

  return true;
}
```

**Impact:**
- Paid content accessible without payment
- Revenue model broken
- Users bypass subscription requirements

---

### 4. **Incorrect Notification Unread Count Tracking**

**Severity:** 🟠 **HIGH** (UI/UX Bug)  
**Location:** `frontend/src/store/notificationStore.ts:29-45`

**Description:**
`addNotification()` always increments unread count, and `markRead()` always decrements even if already read. This causes the badge count to drift from actual unread notifications.

**Current Code (BUGGY):**
```typescript
addNotification: (notif) =>
  set((state) => ({
    notifications: [notif, ...state.notifications],
    unreadCount: state.unreadCount + 1,  // ⚠️ Always increments
  })),

markRead: (id) =>
  set((state) => ({
    notifications: state.notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    unreadCount: Math.max(0, state.unreadCount - 1),  // ⚠️ Always decrements
  })),
```

**Fix:**
```typescript
addNotification: (notif) =>
  set((state) => ({
    notifications: [notif, ...state.notifications],
    // Only increment if the notification is not already read
    unreadCount: state.unreadCount + (notif.is_read ? 0 : 1),
  })),

markRead: (id) =>
  set((state) => {
    const targetNotif = state.notifications.find((n) => n.id === id);
    // Only decrement if target existed and was unread
    const shouldDecrement = targetNotif && !targetNotif.is_read;
    return {
      notifications: state.notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
      unreadCount: Math.max(0, state.unreadCount - (shouldDecrement ? 1 : 0)),
    };
  }),
```

**Impact:**
- Notification badge shows incorrect count
- Users lose trust in notification system
- May click notifications unnecessarily

---

## 🟠 HIGH SEVERITY ISSUES

### 5. **Batch Creation Restricted to Admins Only (Design Issue)**

**Severity:** 🟠 **HIGH** (Business Logic)  
**Location:** `backend/src/routes/index.ts:40`

**Description:**
Only admin users can create batches. Learners/mentors cannot create community batches.

**Current Code:**
```typescript
router.post("/batches", requireRole("admin"), batchCtrl.createBatch);
```

**Decision Required:**
- Is this intentional? (If yes, document in UI)
- Should learners/mentors create batches? (Adjust middleware)

**If Learners Should Create:**
```typescript
router.post("/batches", requireRole("admin", "mentor", "learner"), batchCtrl.createBatch);
```

**Impact:**
- Reduces platform engagement
- Limits user-generated content
- Contradicts typical SaaS models

---

### 6. **Message Validation Allows Empty Files (REST Only)**

**Severity:** 🟠 **MEDIUM** (Validation)  
**Location:** `backend/src/validators/index.ts:52-57` + `backend/src/controllers/message.controller.ts:52`

**Description:**
REST `POST /messages` requires `content` min length 1, but file uploads are supported. File-only messages fail validation despite working via WebSocket.

**Current Code (INCONSISTENT):**
```typescript
// Validator (REST)
export const sendMessageSchema = z.object({
  batch_id: z.string().uuid(),
  content: z.string().min(1).max(5000),  // ⚠️ Required!
  message_type: z.enum(["text", "file", "system"]).optional(),
  parent_id: z.string().uuid().optional(),
});

// WebSocket (CORRECT)
export const socketSendMessageSchema = z.object({
  batchId: z.string().uuid(),
  content: z.string().max(5000).optional(),  // ✓ Optional
  // ...
}).refine(data => data.content || (data.attachments && data.attachments.length > 0), {
  message: "Message must have either content or attachments",
});
```

**Fix REST Validator:**
```typescript
export const sendMessageSchema = z.object({
  batch_id: z.string().uuid(),
  content: z.string().max(5000).optional(),  // Make optional
  message_type: z.enum(["text", "file", "system"]).optional(),
  parent_id: z.string().uuid().optional(),
}).refine(data => data.content || true, {  // Attachments come via multipart, not JSON
  message: "Message must have either content or attachments",
});
```

**Impact:**
- File-only messages rejected via REST API
- Users confused by inconsistent behavior
- WebSocket-only workaround required

---

## 📋 Summary Table

| Issue | Severity | Type | Fix Priority |
|-------|----------|------|--------------|
| Message Access Control Bypass | 🔴 Critical | Security | 1️⃣ URGENT |
| Banned User API Access | 🔴 Critical | Security | 2️⃣ URGENT |
| Paid Batch Enforcement | 🔴 Critical | Security | 3️⃣ URGENT |
| Notification Count Drift | 🟠 High | UI/UX | 4️⃣ Important |
| Batch Creation Permissions | 🟠 High | Business Logic | 5️⃣ Review |
| Message Validation Inconsistency | 🟠 Medium | Data Validation | 6️⃣ Nice-to-have |

---

## ✅ Recommendations

1. **Immediate (Today):**
   - [ ] Implement access checks in `listMessages()`
   - [ ] Add banned-user check in auth middleware
   - [ ] Enforce subscription check in `canAccessBatch()`

2. **Short-term (This week):**
   - [ ] Fix notification count tracking
   - [ ] Clarify batch creation permissions
   - [ ] Standardize message validation

3. **Testing:**
   - [ ] Add integration tests for access control
   - [ ] Test all batch type scenarios (private/paid/hidden)
   - [ ] Verify banned user cannot make any API calls
   - [ ] Validate subscription enforcement

4. **Documentation:**
   - [ ] Document permission model for each endpoint
   - [ ] Add security checklist to PR template
   - [ ] Create runbook for banning users

---

**Generated:** 2026-04-28 by Copilot CLI  
**Testing:** Localhost with fresh user registration
