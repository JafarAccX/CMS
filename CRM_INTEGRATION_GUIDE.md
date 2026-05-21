# CRM Integration Guide: Linking External Data

This guide outlines the strategies and technical steps to link your existing CRM (containing user info, course purchases, and batch data) with the AcceleratorX Learning platform.

## 1. Integration Strategies

Depending on your CRM's capabilities, choose one of these three methods:

### A. Webhook Strategy (Recommended)
When a user buys a course or joins a batch in your CRM, the CRM sends a `POST` request to your app's backend.
- **Pros**: Real-time updates, low server load.
- **Best for**: Instant enrollment after purchase.

### B. Polling / Cron Job
Your backend periodically (e.g., every 5 minutes) asks the CRM API for new updates.
- **Pros**: Simple to implement if CRM doesn't support webhooks.
- **Best for**: Non-urgent bulk data sync.

### C. On-Demand Sync
The app fetches CRM data only when a user logs in.
- **Pros**: Data is always fresh when the user needs it.
- **Best for**: Verifying subscription status.

---

## 2. Recommended Data Mapping

To ensure the systems talk correctly, map your CRM fields to the App database fields:

| CRM Field | App Database Field (Prisma) | Description |
| :--- | :--- | :--- |
| `User ID` / `Email` | `User.email` | Primary unique identifier |
| `Full Name` | `User.username` | User's display name |
| `Purchase Status` | `User.subscription_status` | Maps to 'active', 'free', etc. |
| `Batch Assigned` | `Membership` table | Link between User and Batch |
| `Phone Number` | New `User.phone` field | (Optional) For SMS notifications |

---

## 3. Implementation Steps (Backend)

### Step 1: Create an Integration Endpoint
Create a secure route in your Node.js backend to receive CRM data.

```typescript
// backend/src/routes/crm.routes.ts
router.post("/crm/webhook", verifyCrmSignature, async (req, res) => {
  const { email, batchName, purchaseType } = req.body;
  
  // 1. Find or Create User
  // 2. Assign to Batch based on batchName
  // 3. Update subscription status
});
```

### Step 2: Security (API Keys)
Always secure the connection. Use a "Secret Token" that only your CRM and your App know.
- Store this in your `.env` as `CRM_WEBHOOK_SECRET`.
- Validate the `X-CRM-Signature` header in every request.

### Step 3: Batch Auto-Enrollment logic
When the CRM notifies you of a purchase, your service should:
1. Identify the user by email.
2. Find the Batch ID matching the course name.
3. Create a record in the `Membership` table with `role_in_batch: 'member'`.

---

## 4. Example Scenario: Course Purchase

1. **CRM**: Learner "John" buys "AI Crash Course".
2. **CRM**: Sends Webhook to `https://your-app.com/api/crm/webhook`.
3. **App Backend**: 
   - Verifies the signature.
   - Checks if "John" exists; creates him if not.
   - Looks up the "AI Crash Course" batch.
   - Adds "John" to that batch automatically.
4. **App Frontend**: Next time John logs in, the "AI Crash Course" chat appears in his sidebar instantly.

## 5. Security Best Practices
- **IP Whitelisting**: Only allow requests from your CRM's IP addresses.
- **Idempotency**: Ensure that if the CRM sends the same webhook twice, it doesn't create duplicate memberships.
- **Logging**: Keep an `admin_logs` entry for every CRM-initiated action for debugging.
