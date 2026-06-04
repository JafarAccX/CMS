import prisma from "../utils/prisma.js";
import { getCrmClassesForBatch, type CrmClass } from "./crm.client.js";

export interface ClassItem {
  id: string;
  topic: string;
  startDateTime: string;
  endDateTime: string;
  /** "JOIN" = live now, "UPCOMING" = scheduled, "COMPLETED" = done */
  status: "JOIN" | "UPCOMING" | "COMPLETED";
  isInteractive: boolean;
  batchId: string;
  batchName: string;
  zoomJoinUrl: string | null;
}

export interface UserClassesResponse {
  live: ClassItem[];
  today: ClassItem[];
  upcoming: ClassItem[];
  completed: ClassItem[];
}

/**
 * Fetch and categorise CRM classes for all batches the user belongs to.
 *
 * Categories:
 *   live      – Status = JOIN (in-progress right now)
 *   today     – Status = UPCOMING, starts today
 *   upcoming  – Status = UPCOMING, starts after today (max 6)
 *   completed – Status = COMPLETED, most-recent first (max 3)
 */
export async function getUserClasses(userId: string): Promise<UserClassesResponse> {
  const memberships = await prisma.membership.findMany({
    where: { user_id: userId },
    include: { batch: { select: { id: true, name: true, crm_batch_id: true } } },
  });

  // Only batches that have a CRM link
  const batchMap = new Map<string, string>(); // crm_batch_id → batch name
  for (const m of memberships) {
    if (m.batch.crm_batch_id) {
      batchMap.set(m.batch.crm_batch_id, m.batch.name);
    }
  }

  if (batchMap.size === 0) {
    return { live: [], today: [], upcoming: [], completed: [] };
  }

  // Fetch classes for all batches in parallel; individual failures are swallowed
  const settled = await Promise.allSettled(
    [...batchMap.keys()].map((id) => getCrmClassesForBatch(id))
  );

  const raw: CrmClass[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") raw.push(...r.value);
  }

  // Deduplicate by CRM Id
  const seen = new Set<string>();
  const unique = raw.filter((c) => {
    if (seen.has(c.Id)) return false;
    seen.add(c.Id);
    return true;
  });

  const toItem = (c: CrmClass): ClassItem => ({
    id: c.Id,
    topic: c.Topic,
    startDateTime: c.ClassStartDateTime,
    endDateTime: c.ClassEndDateTime,
    status: (["JOIN", "UPCOMING", "COMPLETED"].includes(c.Status) ? c.Status : "UPCOMING") as ClassItem["status"],
    isInteractive: c.IsInteractiveClass ?? false,
    batchId: c.BatchId,
    batchName: batchMap.get(c.BatchId) ?? "",
    zoomJoinUrl: c.ZoomJoinURL ?? null,
  });

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const live = unique
    .filter((c) => c.Status === "JOIN")
    .map(toItem);

  const today = unique
    .filter((c) => {
      if (c.Status !== "UPCOMING") return false;
      const start = new Date(c.ClassStartDateTime);
      return start >= todayStart && start <= todayEnd;
    })
    .map(toItem)
    .sort((a, b) => +new Date(a.startDateTime) - +new Date(b.startDateTime));

  const upcoming = unique
    .filter((c) => {
      if (c.Status !== "UPCOMING") return false;
      return new Date(c.ClassStartDateTime) > todayEnd;
    })
    .map(toItem)
    .sort((a, b) => +new Date(a.startDateTime) - +new Date(b.startDateTime))
    .slice(0, 6);

  const completed = unique
    .filter((c) => c.Status === "COMPLETED")
    .map(toItem)
    .sort((a, b) => +new Date(b.startDateTime) - +new Date(a.startDateTime))
    .slice(0, 3);

  return { live, today, upcoming, completed };
}
