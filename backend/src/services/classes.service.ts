import prisma from "../utils/prisma.js";
import { redisGet, redisSet } from "../utils/redis.js";
import { getCrmClassesForBatchStrict, type CrmClass } from "./crm.client.js";

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

const EMPTY_CLASSES: UserClassesResponse = { live: [], today: [], upcoming: [], completed: [] };
const CLASSES_FRESH_TTL_SECONDS = 60;
const CLASSES_STALE_TTL_SECONDS = 24 * 60 * 60;
const refreshInflight = new Map<string, Promise<UserClassesResponse>>();

function classesFreshKey(userId: string) {
  return `classes:user:${userId}:fresh`;
}

function classesStaleKey(userId: string) {
  return `classes:user:${userId}:stale`;
}

async function readCachedClasses(key: string): Promise<UserClassesResponse | null> {
  try {
    const raw = await redisGet(key);
    return raw ? (JSON.parse(raw) as UserClassesResponse) : null;
  } catch {
    return null;
  }
}

async function writeCachedClasses(userId: string, data: UserClassesResponse) {
  const payload = JSON.stringify(data);
  await Promise.all([
    redisSet(classesFreshKey(userId), payload, CLASSES_FRESH_TTL_SECONDS),
    redisSet(classesStaleKey(userId), payload, CLASSES_STALE_TTL_SECONDS),
  ]);
}

function refreshClassesCache(userId: string) {
  const existing = refreshInflight.get(userId);
  if (existing) return existing;

  const refresh = fetchUserClassesFromCrm(userId)
    .then(async (data) => {
      await writeCachedClasses(userId, data);
      return data;
    })
    .finally(() => refreshInflight.delete(userId));

  refreshInflight.set(userId, refresh);
  return refresh;
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
  const fresh = await readCachedClasses(classesFreshKey(userId));
  if (fresh) return fresh;

  const stale = await readCachedClasses(classesStaleKey(userId));
  if (stale) {
    void refreshClassesCache(userId).catch((err) => {
      console.error("[classes] Background CRM refresh failed:", err);
    });
    return stale;
  }

  try {
    return await refreshClassesCache(userId);
  } catch (err) {
    console.error("[classes] CRM class fetch failed and no cache is available:", err);
    return EMPTY_CLASSES;
  }
}

async function fetchUserClassesFromCrm(userId: string): Promise<UserClassesResponse> {
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
    return EMPTY_CLASSES;
  }

  // Fetch classes in parallel but capped at 5 concurrent CRM requests.
  // Firing all at once for large batch counts floods the CRM and slows the response.
  const batchIds = [...batchMap.keys()];
  const CONCURRENCY = 5;
  const raw: CrmClass[] = [];

  for (let i = 0; i < batchIds.length; i += CONCURRENCY) {
    const chunk = batchIds.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(chunk.map((id) => getCrmClassesForBatchStrict(id)));
    const rejected = settled.filter((r) => r.status === "rejected");
    if (rejected.length === chunk.length) {
      throw new Error("CRM class fetch failed for all batches in a chunk");
    }
    for (const r of settled) {
      if (r.status === "fulfilled") raw.push(...r.value);
    }
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
