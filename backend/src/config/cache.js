const Redis = require("ioredis");

// ─── #20 FIX: Redis authentication and TLS ───────────────────────────────────
// ORIGINAL BUG: Redis was created with only a URL — no password, no TLS.
// An attacker who can reach the Redis port can:
//   • Subscribe to "device:update:*" → intercept all real-time telemetry
//   • Publish fake device updates → corrupt analytics
//   • Read "auth_role_*" keys → enumerate user roles
//   • Read "owner_v2_*" keys → enumerate device ownership
//
// FIX:
//   • REDIS_PASSWORD / REDIS_USERNAME env vars are passed to ioredis
//   • TLS is enabled when REDIS_TLS=true (required for Redis Cloud, Upstash, etc.)
//   • getPubSub() creates two authenticated connections (pub + sub)
//   • Falls back to in-memory gracefully when Redis is not configured

function buildRedisOptions() {
    return {
        // Auth — set these in Railway environment variables
        ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
        ...(process.env.REDIS_USERNAME ? { username: process.env.REDIS_USERNAME } : {}),

        // TLS — required for Redis Cloud, Upstash, and most managed Redis services
        ...(process.env.REDIS_TLS === "true"
            ? { tls: { rejectUnauthorized: true } }
            : {}),

        // Connection timeouts
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,

        // Don't retry forever in dev — fail fast and fall back to memory
        retryStrategy: () => null,
    };
}

class MemoryCache {
    constructor() {
        this.store = new Map();
        this.cleanupInterval = setInterval(() => this._cleanup(), 60_000);
    }
    get(key) {
        const entry = this.store.get(key);
        if (!entry) return undefined;
        if (Date.now() > entry.expiry) {
            this.store.delete(key);
            return undefined;
        }
        return entry.value;
    }
    set(key, value, ttlSeconds) {
        this.store.set(key, {
            value,
            expiry: Date.now() + (ttlSeconds || 300) * 1000,
        });
    }
    del(key) { this.store.delete(key); }
    flushPrefix(prefix) {
        for (const key of this.store.keys()) {
            if (key.startsWith(prefix)) this.store.delete(key);
        }
    }
    flushAll() { this.store.clear(); }
    _cleanup() {
        const now = Date.now();
        for (const [key, entry] of this.store) {
            if (now > entry.expiry) this.store.delete(key);
        }
    }
}

class CacheProvider {
    constructor() {
        this.memory = new MemoryCache();
        this.redis = null;
        this.isRedisReady = false;

        const redisUrl = process.env.REDIS_URL;
        if (redisUrl) {
            try {
                this.redis = new Redis(redisUrl, buildRedisOptions());

                this.redis.on("connect", () => {
                    console.log("[Cache] Redis Connected");
                    this.isRedisReady = true;
                });
                this.redis.on("error", (err) => {
                    console.warn("[Cache] Redis Unavailable, using memory fallback:", err.message);
                    this.isRedisReady = false;
                });
                this.redis.on("close", () => {
                    console.warn("[Cache] Redis connection closed");
                    this.isRedisReady = false;
                });
            } catch (err) {
                console.error("[Cache] Failed to initialise Redis:", err.message);
            }
        } else {
            console.warn("[Cache] REDIS_URL not set — using in-memory cache (not suitable for production)");
        }
    }

    async get(key) {
        if (this.isRedisReady) {
            try {
                const val = await this.redis.get(key);
                return val ? JSON.parse(val) : undefined;
            } catch (e) { return this.memory.get(key); }
        }
        return this.memory.get(key);
    }

    async set(key, value, ttlSeconds = 300) {
        if (this.isRedisReady) {
            try {
                await this.redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
                return;
            } catch (e) { /* fallback */ }
        }
        this.memory.set(key, value, ttlSeconds);
    }

    async del(key) {
        if (this.isRedisReady) {
            try {
                await this.redis.del(key);
                return;
            } catch (e) { /* fallback */ }
        }
        this.memory.del(key);
    }

    async flushPrefix(prefix) {
        if (this.isRedisReady) {
            try {
                // ✅ AUDIT FIX C4: Use SCAN instead of KEYS to avoid O(N) blocking
                // KEYS * blocks the Redis event loop for ALL clients at scale.
                // SCAN uses cursor-based iteration in batches, non-blocking.
                let cursor = '0';
                do {
                    const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
                    cursor = nextCursor;
                    if (keys.length > 0) await this.redis.del(...keys);
                } while (cursor !== '0');
                return;
            } catch (e) { /* fallback */ }
        }
        this.memory.flushPrefix(prefix);
    }

    async flushAll() {
        if (this.isRedisReady) {
            try {
                await this.redis.flushall();
                return;
            } catch (e) { /* fallback */ }
        }
        this.memory.flushAll();
    }

    // ─── #20 FIX: getPubSub creates AUTHENTICATED connections ────────────────
    // The original returned two unauthenticated Redis instances.
    // Any env var that builds a Redis connection must go through buildRedisOptions().
    getPubSub() {
        if (!this.isRedisReady || !this.redis) return null;

        // ioredis requires SEPARATE connections for pub and sub — reusing the
        // main connection causes "ERR Connection in subscribe mode" errors.
        const opts = buildRedisOptions();
        const pub = new Redis(process.env.REDIS_URL, opts);
        const sub = new Redis(process.env.REDIS_URL, opts);

        pub.on("error", (e) => console.warn("[Cache:pub] Redis pub error:", e.message));
        sub.on("error", (e) => console.warn("[Cache:sub] Redis sub error:", e.message));

        return { pub, sub };
    }
}

module.exports = new CacheProvider();
