import type { Request, Response, NextFunction } from "express";
import prisma from "../utils/prisma.js";
import {
  findCrmCustomerByContact,
  getCustomerEnrollments,
} from "../services/crm.client.js";

export async function getMyEnrollments(req: Request, res: Response, next: NextFunction) {
  try {
    const jwtUser = req.user!;
    const dbUser = await prisma.user.findUnique({ where: { id: jwtUser.id } });
    const identifier = dbUser?.email?.includes("@crm.local")
      ? dbUser.phone ?? undefined
      : dbUser?.email ?? undefined;

    if (!identifier) {
      res.status(200).json({ enrollments: [], customer: null });
      return;
    }

    const customer = await findCrmCustomerByContact(identifier).catch(() => null);
    if (!customer) {
      res.status(200).json({ enrollments: [], customer: null });
      return;
    }

    const enrollments = await getCustomerEnrollments(customer.CustId).catch(() => []);

    res.status(200).json({
      customer: {
        name: [customer.FirstName, customer.LastName].filter(Boolean).join(" "),
        email: customer.Email,
        phone: customer.Mobile,
        active: customer.Active,
      },
      enrollments: enrollments.map((e) => ({
        id: e.Id,
        batchName: e.Batch?.Batch ?? "Unknown",
        course: e.Batch?.Course ?? null,
        startDate: e.Batch?.StartDate ?? null,
        endDate: e.Batch?.EndDate ?? null,
        paymentStatus: e.PaymentStatus,
        completionStatus: e.CompletionStatus,
        active: e.Active,
      })),
    });
  } catch (err) {
    next(err);
  }
}
