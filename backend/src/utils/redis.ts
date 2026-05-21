import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

/** Simple in-memory fallback for local development */
class MemoryCache {
  private cache = new Map<string, { value: string; expires: number | null }>();

  async get(key: string): Promise<string | null> {
    const item = this.cache.get(key);
    if (!item) return null;
    if (item.expires && item.expires < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, mode?: string, duration?: number): Promise<void> {
    let expires: number | null = null;
    if (mode === "EX" && duration) {
      expires = Date.now() + duration * 1000;
    }
    this.cache.set(key, { value, expires });
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async incr(key: string): Promise<number> {
    const item = this.cache.get(key);
    // Treat expired items as non-existent
    if (item?.expires && item.expires < Date.now()) {
      this.cache.delete(key);
      this.cache.set(key, { value: "1", expires: null });
      return 1;
    }
    const num = item ? parseInt(item.value, 10) + 1 : 1;
    // Preserve the existing expiry — do NOT overwrite it
    this.cache.set(key, { value: num.toString(), expires: item?.expires ?? null });
    return num;
  }

  async expire(key: string, seconds: number): Promise<void> {
    const item = this.cache.get(key);
    if (item) {
      item.expires = Date.now() + seconds * 1000;
    }
  }
}

let redis: Redis | MemoryCache | null = null;
let isMemoryFallback = false;

try {
  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      if (times > 1) {
        if (!isMemoryFallback) {
          console.info("ℹ️  Redis unavailable after retries — switching to Memory Fallback for local development.");
          isMemoryFallback = true;
          redis = new MemoryCache();
        }
        return null; // stop retrying
      }
      return 1000;
    },
    lazyConnect: true,
  });

  client.on("error", (err) => {
    if (!isMemoryFallback) {
      console.warn("⚠️  Redis connection failed:", err.message);
    }
  });

  client.on("connect", () => {
    console.log("✅ Redis connected");
    isMemoryFallback = false;
    redis = client;
  });

  redis = client;
  // Attempt to connect immediately to trigger the retry/fallback logic
  client.connect().catch(() => {
    // Error is handled by the 'error' listener and retryStrategy
  });
} catch {
  console.warn("⚠️  Redis client creation failed — using memory fallback");
  redis = new MemoryCache();
  isMemoryFallback = true;
}

/** Safely get a value */
export async function redisGet(key: string): Promise<string | null> {
  try {
    return redis ? await redis.get(key) : null;
  } catch {
    return null;
  }
}

/** Safely set a value with optional TTL in seconds */
export async function redisSet(key: string, value: string, ttl?: number): Promise<void> {
  try {
    if (!redis) return;
    if (ttl) {
      await redis.set(key, value, "EX", ttl);
    } else {
      await redis.set(key, value);
    }
  } catch {
    // silently fail
  }
}

/** Safely delete a key */
export async function redisDel(key: string): Promise<void> {
  try {
    if (redis) await redis.del(key);
  } catch {
    // silently fail
  }
}

/** Safely increment a key for rate limiting */
export async function redisIncr(key: string): Promise<number> {
  try {
    if (!redis) return 0;
    return await redis.incr(key);
  } catch {
    return 0;
  }
}

/** Set key expiry */
export async function redisExpire(key: string, seconds: number): Promise<void> {
  try {
    if (redis) await redis.expire(key, seconds);
  } catch {
    // silently fail
  }
}

export default redis;
