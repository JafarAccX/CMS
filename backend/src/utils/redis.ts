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

  async mget(...keys: string[]): Promise<(string | null)[]> {
    return Promise.all(keys.map((key) => this.get(key)));
  }

  async set(key: string, value: string, mode?: string, duration?: number): Promise<void> {
    let expires: number | null = null;
    if (mode === "EX" && duration) {
      expires = Date.now() + duration * 1000;
    }
    this.cache.set(key, { value, expires });
  }

  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if ((await this.get(key)) !== null) return false;
    this.cache.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
    return true;
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async delIfValue(key: string, value: string): Promise<boolean> {
    if ((await this.get(key)) !== value) return false;
    this.cache.delete(key);
    return true;
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
  // Upstash (and any rediss:// URL) requires TLS. ioredis enables TLS
  // automatically when the URL scheme is rediss://, but we also pass
  // tls: {} explicitly so self-signed / managed certs are accepted.
  const isTls = REDIS_URL.startsWith("rediss://");

  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 0,  // fail fast — don't queue while retrying
    retryStrategy(times) {
      if (times >= 1) {
        if (!isMemoryFallback) {
          console.info("ℹ️  Redis unavailable — switching to in-memory cache.");
          isMemoryFallback = true;
          redis = new MemoryCache();
        }
        return null;
      }
      return 500;
    },
    lazyConnect: true,
    connectTimeout: 5000,   // 5s — enough for Upstash cold start
    ...(isTls ? { tls: {} } : {}),
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

/**
 * Create a dedicated pub/sub connection pair for the Socket.IO Redis adapter.
 *
 * These are SEPARATE from the cache client (the adapter needs its own connections
 * for pub/sub) and use clean options with NO memory-fallback side effects — the
 * adapter should keep retrying Redis rather than silently degrading.
 *
 * Returns null when Redis is not in use (memory-fallback mode) so the caller can
 * run Socket.IO in single-node mode.
 */
export function createAdapterPair(): { pub: Redis; sub: Redis } | null {
  if (isMemoryFallback || redis instanceof MemoryCache) return null;
  try {
    const isTls = REDIS_URL.startsWith("rediss://");
    const opts = {
      lazyConnect: true,
      connectTimeout: 5000,
      // Adapter pub/sub must stay resilient: retry on blips, but bound the
      // initial connect so a down Redis doesn't hang startup forever.
      maxRetriesPerRequest: null as null,
      retryStrategy: (times: number) => (times > 10 ? null : Math.min(times * 200, 2000)),
      ...(isTls ? { tls: {} } : {}),
    };
    const pub = new Redis(REDIS_URL, opts);
    const sub = new Redis(REDIS_URL, opts);
    return { pub, sub };
  } catch {
    return null;
  }
}

/** Safely get a value */
export async function redisGet(key: string): Promise<string | null> {
  try {
    return redis ? await redis.get(key) : null;
  } catch {
    return null;
  }
}

/** Safely get multiple values in one Redis command */
export async function redisMGet(keys: string[]): Promise<(string | null)[]> {
  if (keys.length === 0) return [];
  try {
    return redis ? await redis.mget(...keys) : keys.map(() => null);
  } catch {
    return keys.map(() => null);
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

/** Safely set a lock key only if it does not already exist */
export async function redisSetNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
  try {
    if (!redis) return false;
    if (redis instanceof MemoryCache) {
      return redis.setNx(key, value, ttlSeconds);
    }
    const result = await redis.set(key, value, "EX", ttlSeconds, "NX");
    return result === "OK";
  } catch {
    redis = new MemoryCache();
    isMemoryFallback = true;
    return redis.setNx(key, value, ttlSeconds);
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

/** Safely delete a key only if its value still matches the owner token */
export async function redisDelIfValue(key: string, value: string): Promise<boolean> {
  try {
    if (!redis) return false;
    if (redis instanceof MemoryCache) {
      return redis.delIfValue(key, value);
    }
    const result = await redis.eval(
      `if redis.call("get", KEYS[1]) == ARGV[1] then
         return redis.call("del", KEYS[1])
       else
         return 0
       end`,
      1,
      key,
      value
    );
    return result === 1;
  } catch {
    return false;
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
