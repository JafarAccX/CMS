# Full Integration Guide: CRM AcceleratoX ↔ Chat App (CMS)

This document provides the exact implementation steps to automatically sync learners and batch assignments from your CRM to your Chat Application.

---

## 1. CMS Backend Implementation (The Receiver)
This part goes into your **CMS (Chat App)** codebase.

### A. Define the Integration Route
Create a new file: `backend/src/routes/integration.routes.ts`

```typescript
import { Router } from "express";
import prisma from "../utils/prisma.js";

const router = Router();

// Endpoint for CRM to enroll users
router.post("/crm-enroll", async (req, res) => {
  const { email, firstName, lastName, batchName, apiKey } = req.body;

  // 1. Security Check
  if (apiKey !== process.env.CRM_INTEGRATION_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // 2. Sync User
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          username: `${firstName} ${lastName}`.trim(),
          password_hash: "CRM_MANAGED", // Placeholder
          role: 'learner',
        }
      });
    }

    // 3. Sync Batch Membership (Auto-create if missing)
    let batch = await prisma.batch.findFirst({
      where: { name: { contains: batchName, mode: 'insensitive' } }
    });

    if (!batch) {
      // 3.1. Get Defaults for Auto-Creation
      const defaultOrg = await prisma.organization.findFirst();
      const defaultAdmin = await prisma.user.findFirst({ where: { role: 'admin' } });

      if (!defaultOrg || !defaultAdmin) {
        return res.status(500).json({ error: "System defaults missing (Org/Admin)" });
      }

      // 3.2. Create the missing batch
      batch = await prisma.batch.create({
        data: {
          name: batchName,
          org_id: defaultOrg.id,
          created_by: defaultAdmin.id,
          description: `Automatically created from CRM enrollment for ${batchName}`
        }
      });
    }

    // 4. Add User to Batch
    await prisma.membership.upsert({
      where: { user_id_batch_id: { user_id: user.id, batch_id: batch.id } },
      update: {},
      create: {
        user_id: user.id,
        batch_id: batch.id,
        role_in_batch: 'member'
      }
    });
    
    return res.status(200).json({ success: true, message: "Enrolled", batchCreated: !batch });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
```

### B. Register the Route
Add this to your `backend/src/index.ts`:
```typescript
import integrationRoutes from "./routes/integration.routes.js";
// ...
app.use("/api/integration", integrationRoutes);
```

---

## 2. CRM Backend Implementation (The Sender)
This part goes into your **CRM-AcceleratoX-backend** (NestJS).

### Locate the "Hook" Point
Based on code analysis, the best place is **`src/customers/customers.service.ts`** inside the **`createAndEnroll`** method.

### Add the Sync Logic
Add this logic right after the `enrollment` is successfully created in the database:

```typescript
// Inside customers.service.ts -> createAndEnroll()

const chatAppUrl = process.env.CHAT_APP_URL || "https://your-chat-app.com";
const chatAppKey = process.env.CHAT_APP_INTEGRATION_KEY;

try {
  const response = await fetch(`${chatAppUrl}/api/integration/crm-enroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: customer.Email,
      firstName: customer.FirstName,
      lastName: customer.LastName,
      batchName: batch.Batch, // From the Batch entity found in CRM
      apiKey: chatAppKey
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    this.logger.error(`Chat App Sync Failed: ${errorData.error}`);
  } else {
    this.logger.log(`Learner ${customer.Email} successfully synced to Chat App`);
  }
} catch (error) {
  this.logger.error('Error connecting to Chat App integration endpoint', error);
}
```

---

## 3. Environment Configuration
Add these variables to your `.env` files in both projects.

**CMS `.env`:**
```env
CRM_INTEGRATION_KEY=your_random_secure_token_here
```

**CRM `.env`:**
```env
CHAT_APP_URL=http://localhost:4000
CHAT_APP_INTEGRATION_KEY=your_random_secure_token_here
```

---

## 4. Testing the Flow
1. **CMS Side**: Start the backend and ensure the `/api/integration/crm-enroll` route is active.
2. **CRM Side**: Perform a test enrollment of a learner in the CRM dashboard.
3. **Check Logs**: Verify in the CRM console if the "Success" log appears.
4. **Check Chat App**: Log in to the Chat App as an Admin and verify that the new user exists and is a member of the correct batch.

## 5. Security & Fail-Safe
*   **Retries**: If the Chat App is down, the CRM should log the error but **not** fail the entire enrollment process.
*   **Validation**: The Chat App checks for `email` uniqueness automatically using `upsert`.
*   **Batch Naming**: It is vital that the `Batch` name in CRM exactly matches (or is contained within) the `name` of the Batch in the Chat App.
