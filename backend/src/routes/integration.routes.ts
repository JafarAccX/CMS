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
          role: "learner",
        },
      });
    }

    // 3. Sync Batch Membership (Auto-create if missing)
    let batch = await prisma.batch.findFirst({
      where: { name: { contains: batchName, mode: "insensitive" } },
    });

    if (!batch) {
      // 3.1. Get Defaults for Auto-Creation
      const defaultOrg = await prisma.organization.findFirst();
      const defaultAdmin = await prisma.user.findFirst({
        where: { role: "admin" },
      });

      if (!defaultOrg || !defaultAdmin) {
        return res
          .status(500)
          .json({ error: "System defaults missing (Org/Admin)" });
      }

      // 3.2. Create the missing batch
      batch = await prisma.batch.create({
        data: {
          name: batchName,
          org_id: defaultOrg.id,
          created_by: defaultAdmin.id,
          description: `Automatically created from CRM enrollment for ${batchName}`,
        },
      });
    }

    // 4. Add User to Batch
    await prisma.membership.upsert({
      where: {
        user_id_batch_id: { user_id: user.id, batch_id: batch.id },
      },
      update: {},
      create: {
        user_id: user.id,
        batch_id: batch.id,
        role_in_batch: "member",
      },
    });

    return res
      .status(200)
      .json({ success: true, message: "Enrolled", batchCreated: !batch });
  } catch (err) {
    console.error("CRM Integration Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
