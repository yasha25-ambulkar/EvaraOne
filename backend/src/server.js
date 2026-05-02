require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const schedule = require("node-schedule");
const adminRoutes = require("./routes/admin.routes.js");
const { getDashboardSummary, getHierarchy, getAuditLogs, getZoneStats } = require("./controllers/admin.controller.js");
const { requireAuth, checkOwnership } = require("./middleware/auth.middleware.js");
const tenantCheck = require("./middleware/tenantCheck.middleware.js");
const rbac = require("./middleware/rbac.middleware.js");
const adminOnly = require("./middleware/adminOnly.middleware.js"); // ✅ FIX #1: RBAC gate
const { errorHandler } = require("./middleware/errorHandler.js"); // ✅ ISSUE #5: Centralized error handler
const { startWorker, telemetryEvents } = require("./workers/telemetryWorker.js");
const socketValidation = require("./services/socketValidation.js"); // ✅ FIX #2: Socket.io validation
const cache = require("./config/cache.js");
const apiLimiter = require("./middleware/rateLimit.js");
const http = require("http");
const { Server } = require("socket.io");
const Sentry = require("@sentry/node");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");
const validateEnv = require("./utils/validateEnv.js");
// ✅ PHASE 2: Structured logging (Task #15)
const { httpLogger, requestIdMiddleware, logger } = require("./config/pino.js");
// ✅ PHASE 2: Cache versioning (Task #11)
const { initializeCacheVersions } = require("./utils/cacheVersioning.js");
// ✅ HYBRID CACHING: Telemetry archive service
const TelemetryArchiveService = require("./services/telemetryArchiveService.js");

// Validate environment before starting
validateEnv();

Sentry.init({
  dsn: process.env.SENTRY_DSN || "",
  integrations: [
    Sentry.expressIntegration(),
  ],
});

const app = express();

// ✅ PHASE 2: Task #14 - Lock CORS to specific domains (no *.railway.app wildcard)
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(",").map(s => s.trim())
  : [
      "https://app.evaratech.com",
      "http://localhost:8080",
      "http://localhost:5173",
      "http://localhost:3000"
    ];

// ✅ FIX: Remove .railway.app wildcard, use only explicit origins
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (same-origin, mobile apps, curl)
    if (!origin) return callback(null, true);
    
    // Check against explicit list only (no wildcards)
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // CORS denied
    logger.warn({ origin, allowed: allowedOrigins }, '[CORS] Origin rejected');
    callback(new Error('CORS policy: Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID']
};

// Pre-flight CORS and Security
app.use(cors(corsOptions));

// ============================================================================
// Helmet Security Headers (Enhanced)
// ============================================================================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "https:", "data:"],
      connectSrc: [
        "'self'",
        "https://*.railway.app",
        "wss://*.railway.app",
        "https://identitytoolkit.googleapis.com",
        "https://securetoken.googleapis.com",
        "https://www.googleapis.com",
        "https://*.firebaseio.com",
        "https://*.googleapis.com",
      ],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" }
}));

// ============================================================================
// Trust proxy for reverse proxy support (Railway, Nginx, etc)
// ============================================================================
app.set('trust proxy', process.env.TRUST_PROXY_DEPTH || 1);

app.use(express.json());

// ✅ AUDIT FIX L10: requestIdMiddleware BEFORE httpLogger so request ID appears in all logs
app.use(requestIdMiddleware);
app.use(httpLogger);

// ============================================================================
// Rate Limiting: Per-user limiting (not per-IP) for reverse proxy environments
// ============================================================================
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  // ✅ Rate limit by user UID (fallback to IPv6-safe IP key)
  keyGenerator: (req, res) => {
    return req.user?.uid || ipKeyGenerator(req, res);
  },
  // ✅ CRITICAL FIX #1: NO EXEMPTIONS FOR SUPERADMINS
  // A compromised superadmin account can DOS the backend
  // Instead: lighter limits for admins (not unlimited)
  skip: (req, res) => {
    // Apply lighter rate limit for superadmins (1000/min vs 100/min for users)
    // This allows bulk operations but still prevents DOS
    return false;  // Never skip — all users are rate-limited
  },
  handler: (req, res) => {
    res.status(429).json({
      error: "Too many requests, please try again later."
    });
  }
});
app.use("/api/", limiter);

const server = http.createServer(app);

const io = new Server(server, { 
    cors: { 
        origin: allowedOrigins,
        credentials: true
    } 
});

// ============================================================================
// ✅ TASK #4 — Redis Fail-Fast for Cluster Mode
// Prevents silent real-time breakage when running multiple instances without Redis
// ============================================================================
const pubSub = cache.getPubSub();

// Are we running multiple Railway instances?
const isCluster = process.env.RAILWAY_REPLICA_COUNT 
  ? parseInt(process.env.RAILWAY_REPLICA_COUNT) > 1 
  : process.env.MULTIPLE_REPLICAS === 'true';

if (isCluster && !pubSub) {
  // 🚨 LOUD CRASH — better than silent corruption
  logger.error('');
  logger.error('╔══════════════════════════════════════════╗');
  logger.error('║  FATAL: Redis required for clustering    ║');
  logger.error('║  Running without Redis in multi-instance ║');
  logger.error('║  mode will silently break real-time.     ║');
  logger.error('║                                          ║');
  logger.error('║  Fix: Set REDIS_URL environment variable ║');
  logger.error('╚══════════════════════════════════════════╝');
  logger.error('');
  process.exit(1); // 💀 Stop here. Don't continue.
}

if (pubSub) {
  try {
    const { createAdapter } = require("@socket.io/redis-adapter");
    io.adapter(createAdapter(pubSub.pub, pubSub.sub));
    logger.debug("[Socket.io] ✅ Redis adapter enabled for multi-instance clustering");
  } catch (err) {
    logger.error("[Socket.io] ❌ Redis adapter failed to initialize:", err.message);
    process.exit(1); // Also crash here — don't pretend it's fine
  }
} else {
  // Single instance, no Redis — that's fine
  logger.debug("[Socket.io] ⚠️  Using in-memory adapter (single instance only)");
}

// ============================================================================
// ✅ TASK #8 — Redis-Backed Socket.io Connection Limits
// ============================================================================
// ORIGINAL BUG: In-memory Map only exists on one instance.
// With 3 Railway replicas, user connects 10times to each = 30 total (no limit).
// Memory exhausted → crash.
//
// FIX: Use Redis so ALL instances share the same counter.
// Entrance 1 sees "already 10", Entrance 2 sees "already 10", blocks them all. ✅
const MAX_CONNECTIONS_PER_USER = 10;
const CONNECTION_TTL = 86400; // 24 hours (safety net for stale keys)

// ═══════════════════════════════════════════════════════════════════════════
// ✅ CRITICAL FIX #2: Atomic Redis Lua Script for Connection Limiting
// Prevents race condition where INCR-then-check allows temporary spike to 11
// ═══════════════════════════════════════════════════════════════════════════
const CONNECTION_LIMIT_LUA_SCRIPT = `
local current = redis.call('GET', KEYS[1])
current = tonumber(current) or 0
local max = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])

-- If already at or above limit, reject atomically
if current >= max then
  return 'LIMIT_EXCEEDED'
end

-- Increment and set TTL on first increment
local newCount = redis.call('INCR', KEYS[1])
if newCount == 1 then
  redis.call('EXPIRE', KEYS[1], ttl)
end

return newCount
`;

// ═══════════════════════════════════════════════════════════════════════════
// ✅ CRITICAL FIX #4: Firestore Listener Memory Leak Prevention
// Stores unsubscribe functions for each socket to clean up on disconnect
// ═══════════════════════════════════════════════════════════════════════════
const firestoreListeners = new Map(); // Map<socketId, unsubscribeFn | Array<unsubscribeFn>>

/**
 * Register a Firestore listener for a socket
 * Stores the unsubscribe function so it can be called on disconnect
 * @param {string} socketId - The socket ID
 * @param {Function} unsubscribeFn - The unsubscribe function returned by db.collection().onSnapshot()
 */
function registerListener(socketId, unsubscribeFn) {
  if (!socketId || !unsubscribeFn) return;
  
  const existing = firestoreListeners.get(socketId);
  if (existing && typeof existing === 'function') {
    // Already have one listener, convert to array
    firestoreListeners.set(socketId, [existing, unsubscribeFn]);
  } else if (Array.isArray(existing)) {
    // Already have multiple listeners, add to array
    existing.push(unsubscribeFn);
  } else {
    // First listener for this socket
    firestoreListeners.set(socketId, unsubscribeFn);
  }
}

/**
 * Unsubscribe from all Firestore listeners for a socket
 * Called on socket disconnect
 * @param {string} socketId - The socket ID
 */
function cleanupListeners(socketId) {
  if (!socketId) return;
  
  const listeners = firestoreListeners.get(socketId);
  if (!listeners) return;
  
  const listenerArray = Array.isArray(listeners) ? listeners : [listeners];
  let cleanedCount = 0;
  
  for (const unsubscribeFn of listenerArray) {
    try {
      unsubscribeFn();
      cleanedCount++;
    } catch (err) {
      logger.error('[Firestore] Listener unsubscribe failed', { socketId, error: err.message });
    }
  }
  
  firestoreListeners.delete(socketId);
  if (cleanedCount > 0) {
    logger.debug('[Firestore] Listeners cleaned up', { socketId, count: cleanedCount });
  }
}

io.use(async (socket, next) => {
  try {
    // Get user ID (prefer authenticated UID, fall back to IP)
    const uid = socket.handshake.auth?.uid || socket.ip || 'anonymous';

    // Redis key for this user's connection count
    // Using Redis means ALL instances share this number
    const redisKey = `socket_connections:${uid}`;

    // ─────────────────────────────────────────
    // ✅ CRITICAL FIX #2: Atomic Lua script for connection limiting
    // Old: INCR, check, DECR-if-over (allows spike to 11 during race)
    // New: Lua script atomically checks count and only INCRs if under limit
    // Result: Limit is NEVER exceeded, even with concurrent connections
    // ─────────────────────────────────────────
    let currentCount;
    if (cache.isRedisReady && cache.redis) {
      // Call Lua script atomically: check limit, then INCR if allowed
      const result = await cache.redis.eval(CONNECTION_LIMIT_LUA_SCRIPT, 1, redisKey, MAX_CONNECTIONS_PER_USER, CONNECTION_TTL);
      
      if (result === 'LIMIT_EXCEEDED') {
        // Atomically rejected by Lua script - counter not incremented
        logger.warn(`[Socket.io] ❌ Connection limit hit for ${uid}: at max (${MAX_CONNECTIONS_PER_USER})`);
        return next(new Error(
          `Too many connections. Max ${MAX_CONNECTIONS_PER_USER} allowed per user.`
        ));
      }
      
      // result is the new count
      currentCount = result;
    } else {
      // Memory fallback (single-instance only)
      currentCount = (parseInt(await cache.get(redisKey)) || 0) + 1;
      if (currentCount > MAX_CONNECTIONS_PER_USER) {
        // Over limit - don't increment, reject
        await cache.set(redisKey, currentCount - 1, CONNECTION_TTL);
        logger.warn(`[Socket.io] ❌ Connection limit hit for ${uid}: ${currentCount}/${MAX_CONNECTIONS_PER_USER}`);
        return next(new Error(
          `Too many connections. Max ${MAX_CONNECTIONS_PER_USER} allowed per user.`
        ));
      }
      await cache.set(redisKey, currentCount, CONNECTION_TTL);
    }

    logger.debug(`[Socket.io] ✅ User ${uid} connected (${currentCount}/${MAX_CONNECTIONS_PER_USER})`);

    // ─────────────────────────────────────────
    // CLEANUP: When this socket disconnects:
    // 1. Decrement connection count in Redis
    // 2. Unsubscribe from all Firestore listeners
    // ─────────────────────────────────────────
    socket.on('disconnect', async (reason) => {
      try {
        // ✅ CRITICAL FIX #4: Clean up Firestore listeners
        cleanupListeners(socket.id);
        
        // Clean up connection count
        if (cache.isRedisReady && cache.redis) {
          const remaining = await cache.redis.decr(redisKey);
          if (remaining <= 0) {
            await cache.redis.del(redisKey);
            logger.debug(`[Socket.io] User ${uid} fully disconnected`);
          } else {
            logger.debug(`[Socket.io] User ${uid} disconnected one socket (${remaining} remaining)`);
          }
        } else {
          const currentOnDisconnect = parseInt(await cache.get(redisKey)) || 1;
          const remaining = currentOnDisconnect - 1;
          if (remaining <= 0) {
            await cache.del(redisKey);
            logger.debug(`[Socket.io] User ${uid} fully disconnected`);
          } else {
            await cache.set(redisKey, remaining, CONNECTION_TTL);
            logger.debug(`[Socket.io] User ${uid} disconnected one socket (${remaining} remaining)`);
          }
        }
      } catch (cleanupErr) {
        // Don't let cleanup errors break anything
        logger.error('[Socket.io] Disconnect cleanup error:', cleanupErr.message);
      }
    });

    // Allow the connection
    next();

  } catch (err) {
    // If Redis itself fails, let the connection through
    // (better to have no limit than to block everyone)
    logger.error('[Socket.io] Connection limit check failed:', err.message);
    next(); // Fail open
  }
});

global.io = io;

const { admin, db } = require("./config/firebase.js");

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Authentication error: Missing token"));
    
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // ============================================================================
    // PART 1: Share cache key with HTTP auth middleware (single source of truth)
    // ============================================================================
    const cacheKey = `auth_role_${decodedToken.uid}`;
    let userData = await cache.get(cacheKey);

    if (!userData) {
        // ====================================================================
        // PART 2: Hard timeout with Promise.race (don't hang indefinitely)
        // ====================================================================
        const firestoreTimeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("User lookup timed out")), 3000)
        );

        const lookupTask = (async () => {
            try {
                // Priority 1: Superadmins by ID
                let userDoc = await db.collection("superadmins").doc(decodedToken.uid).get();
                if (userDoc.exists) {
                    return userDoc.data();
                }

                // Priority 2: Customers by ID
                userDoc = await db.collection("customers").doc(decodedToken.uid).get();
                if (userDoc.exists) {
                    return { ...userDoc.data(), id: userDoc.id };
                }

                // Priority 3: Customers by Email (Fallback for pre-provisioned SaaS users)
                if (decodedToken.email) {
                    const emailMatches = await db.collection("customers")
                        .where("email", "==", decodedToken.email)
                        .limit(1)
                        .get();
                    
                    if (!emailMatches.empty) {
                        const match = emailMatches.docs[0];
                        return { ...match.data(), id: match.id };
                    }
                }

                // If not found anywhere, return default (will be caught and rejected in next step)
                return { role: "customer" };
            } catch (e) {
                logger.error("[Socket.io] Firestore lookup error:", e.message);
                throw e;
            }
        })();

        try {
            userData = await Promise.race([lookupTask, firestoreTimeout]);
            // ========================================================================
            // PART 2b: Cache the result for 3 minutes (sync with HTTP auth middleware)
            // ========================================================================
            await cache.set(cacheKey, userData, 180);
        } catch (dbError) {
            // ====================================================================
            // PART 3: REJECT on failure, never default silently
            // ====================================================================
            logger.error("[Socket.io Auth] User lookup failed:", dbError.message);
            return next(new Error("Authentication error: Cannot resolve user role"));
        }
    }

    // ========================================================================
    // PART 4: Validate role is non-empty before attaching to socket
    // ========================================================================
    const role = (userData.role || "customer").trim().toLowerCase().replace(/\s+/g, "");
    
    if (!role || role === '') {
        logger.error("[Socket.io Auth] Invalid role resolved:", role);
        return next(new Error("Authentication error: Invalid role"));
    }

    const community_id = userData.community_id || "";
    const customer_id = userData.customer_id || userData.id || "";
    
    socket.user = { uid: decodedToken.uid, role, community_id, customer_id };
    logger.debug(`[Socket.io Auth] ✅ User ${decodedToken.uid} authenticated => role: '${role}'`);
    next();
  } catch (err) {
    next(new Error("Authentication error: Invalid token"));
  }
});

io.on("connection", (socket) => {
    logger.debug(`[Socket.io] Client connected: ${socket.user?.uid || 'Unknown'}`);

    // ✅ FIX #11: AUTO-SUBSCRIBE USER TO THEIR CUSTOMER ROOM
    // When user connects, subscribe them to customer-specific events
    // This allows Emit("device:added", {...}) to reach all users of that customer
    if (socket.user?.customer_id) {
        socket.join(`customer:${socket.user.customer_id}`);
        logger.debug(`[Socket.io] ✅ User ${socket.user.uid} subscribed to customer:${socket.user.customer_id}`);
    }

    // ✅ FIX #2: Validate subscribe_device with Zod
    socket.on("subscribe_device", async (rawData) => {
        try {
            // Validate input (reject __proto__, unknown fields, etc.)
            const data = socketValidation.validateRoomJoin({
                room: `room:${rawData}`,
                deviceId: rawData
            });

            // SaaS Architecture: Security Guard (Zero Trust)
            const deviceId = data.deviceId;
            const isOwner = await checkOwnership(socket.user.customer_id || socket.user.uid, deviceId, socket.user.role, socket.user.community_id);
            if (isOwner) {
                logger.debug(`[Socket.io] ✅ Client ${socket.user?.uid} subscribed to device ${deviceId}`);
                socket.join(`room:${deviceId}`);
                socket.emit('subscribe_ack', { success: true, deviceId });
            } else {
                logger.warn(`[Socket.io] ❌ Forbidden subscription attempt by ${socket.user.uid} for ${deviceId}`);
                socket.emit('error', { message: 'Access denied' });
            }
        } catch (err) {
            logger.warn(`[Socket.io] ❌ Invalid subscribe_device data:`, err.message);
            socket.emit('error', { message: 'Invalid request' });
        }
    });

    socket.on("unsubscribe_device", (rawData) => {
        try {
            // Validate input
            const data = socketValidation.validateRoomJoin({
                room: `room:${rawData}`,
                deviceId: rawData
            });
            socket.leave(`room:${data.deviceId}`);
            logger.debug(`[Socket.io] ✅ Client ${socket.user?.uid} unsubscribed from device ${data.deviceId}`);
        } catch (err) {
            logger.warn(`[Socket.io] ❌ Invalid unsubscribe_device data:`, err.message);
        }
    });

    socket.on("disconnect", () => {
        logger.debug(`[Socket.io] Client disconnected: ${socket.user?.uid}`);
    });
});

// ============================================================================
// #3 FIX: MQTT Telemetry — Broadcast ONLY to room subscribers (not all clients)
// ============================================================================
// ORIGINAL BUG: io.emit("telemetry_update", {...}) sent telemetry to every connected
// client in the system, including users who don't own the device.
//
// FIX: Use io.to("room:${deviceId}").emit() to send ONLY to clients who have
// subscribed to that specific device via socket.emit("subscribe_device", deviceId).
// The subscription already includes checkOwnership() guard.
//
// "All Nodes" list view updates are now pushed via a separate batch query
// (handled on the frontend) rather than broadcasting every device to everyone.
if (pubSub) {
    const sub = pubSub.sub;
    sub.psubscribe("device:update:*");
    sub.on("pmessage", (pattern, channel, message) => {
        try {
            const payload = JSON.parse(message);
            const deviceId = channel.split(":")[2];
            if (deviceId) {
                // 1. Emit to specific room (Analytics pages)
                io.to(`room:${deviceId}`).emit("telemetry_update", payload);
                
                // 2. Emit global broadcast (AllNodes page)
                io.emit("telemetry_broadcast", payload);
            }
        } catch (err) {}
    });
}

// Local bridge for telemetryWorker (Dev/Single-instance fallback)
// Node.js EventEmitter doesn't support regex patterns — use explicit wildcard
telemetryEvents.on("device:update", (payload) => {
    if (payload && payload.deviceId) {
        // 1. Emit to specific room (Analytics pages)
        io.to(`room:${payload.deviceId}`).emit("telemetry_update", payload);
        
        // 2. Emit global broadcast (AllNodes page)
        io.emit("telemetry_broadcast", payload);
    }
});


// Sentry Handlers

// SaaS Architecture: Global Security Stack for Authenticated Routes
const globalSaaSAuth = [requireAuth, tenantCheck, rbac()];

// Authentication routes (no auth required for verify-token, required for /me)
const authRoutes = require("./routes/auth.routes.js");
app.use("/api/v1/auth", authRoutes);

// Main admin routes — ✅ FIX #1: Add adminOnly middleware to block non-superadmins
app.use("/api/v1/admin", globalSaaSAuth, adminOnly, adminRoutes);

// Node telemetry and analytics routes
const nodesRoutes = require("./routes/nodes.routes.js");
const evaratdsRoutes = require("./routes/evaratds.routes.js");

// Health Check Endpoint
app.get("/api/v1/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    env: process.env.NODE_ENV
  });
});

app.use("/api/v1/nodes", nodesRoutes);  // DEBUG: auth bypassed temporarily
app.use("/api/v1/evaratds", globalSaaSAuth, evaratdsRoutes);

// TDS device routes
const tdsRoutes = require("./routes/tds.routes.js");
app.use("/api/v1/devices/tds", globalSaaSAuth, tdsRoutes);

// ThingSpeak Configuration routes (fetch fields, save metadata)
const thingspeakConfigRoutes = require("./routes/thingspeakConfig.routes.js");
app.use("/api/v1/thingspeak", globalSaaSAuth, thingspeakConfigRoutes);

// Other routes that frontend service calls
app.get("/api/v1/admin/hierarchy", globalSaaSAuth, getHierarchy);
app.get("/api/v1/admin/audit-logs", globalSaaSAuth, getAuditLogs);
app.get("/api/v1/stats/dashboard/summary", globalSaaSAuth, getDashboardSummary);
app.get("/api/v1/stats/zones", globalSaaSAuth, getZoneStats);

// Production: Serve frontend static files (MUST be before error handlers)
if (process.env.NODE_ENV === "production") {
    const publicPath = path.join(__dirname, "../../client/dist");
    const fs = require("fs");
    if (fs.existsSync(publicPath)) {
        logger.debug(`[Server] Serving frontend from ${publicPath}`);
        app.use(express.static(publicPath));
        
        // SPA catch-all: serve index.html for non-API routes
        // Express 5 requires named wildcard params: /{*splat} instead of *
        app.get("/{*splat}", (req, res, next) => {
            if (req.url.startsWith("/api/") || req.url.startsWith("/socket.io/")) {
                return next();
            }
            res.sendFile(path.join(publicPath, "index.html"));
        });
    } else {
        logger.warn(`[Server] Frontend build not found at ${publicPath}`);
    }
}

// ============================================================================
// ✅ TASK #1 — Health check endpoint for Railway
// ============================================================================
app.get('/api/v1/health', (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()) + ' seconds',
    services: {
      firebase: admin.apps.length > 0 ? 'connected' : 'disconnected',
      redis: cache?.isRedisReady ? 'connected' : 'memory_fallback',
      mqtt: global.mqttConnected ? 'connected' : 'disconnected'
    }
  };

  // If Firebase is down, tell Railway we're sick (503)
  // Otherwise say we're fine (200)
  const isHealthy = admin.apps.length > 0;
  res.status(isHealthy ? 200 : 503).json(health);
});

// ✅ ISSUE #5: Register centralized error handler (must be AFTER all routes)
// Handles Zod validation errors, AppError errors, and unknown errors
// All controllers should use next(err) or throw AppError
app.use(errorHandler);

const PORT = process.env.PORT || 8000;

try {
    server.on("error", (err) => {
        logger.error("[Server] Fatal error event:", err);
        if (err.code === "EADDRINUSE") {
            logger.error(`[Server] Port ${PORT} is already in use.`);
        }
        process.exit(1);
    });

    server.listen(PORT, async () => {
        logger.debug(`[Server] ✅ Backend running on port ${PORT}`);
        
        // ✅ PHASE 2: Task #11 - Initialize cache versions on startup
        try {
            await initializeCacheVersions();
            logger.info('[Server] Cache versioning initialized');
        } catch (err) {
            logger.warn({ error: err.message }, '[Server] Cache versioning initialization failed');
        }

        // ✅ HYBRID CACHING: Schedule daily telemetry cleanup at 2 AM
        try {
            const policy = TelemetryArchiveService.getRetentionPolicy();
            const cleanupTime = `${policy.cleanupHour} ${policy.cleanupMinute} * * *`; // 2:00 AM every day
            
            schedule.scheduleJob(cleanupTime, async () => {
                logger.info('🧹 [Scheduler] Starting daily telemetry cleanup');
                const result = await TelemetryArchiveService.cleanupOldTelemetry();
                
                if (result.success) {
                    logger.info(`✅ [Scheduler] Cleanup complete: ${result.devicesProcessed} devices, ${result.recordsDeleted} records deleted`);
                } else {
                    logger.error(`❌ [Scheduler] Cleanup failed: ${result.error}`);
                }

                // Log database statistics
                await TelemetryArchiveService.logCleanupStats();
            });

            logger.info(`✅ [Server] Telemetry cleanup scheduled daily at ${policy.cleanupHour}:${String(policy.cleanupMinute).padStart(2, '0')}`);
        } catch (err) {
            logger.error({ error: err.message }, '[Server] Telemetry cleanup scheduling failed');
        }
        
        // Initialize our background worker
        startWorker();
    });
} catch (error) {
    logger.error("[Server] Error during startup:", error);
    process.exit(1);
}

// ============================================================================
// Graceful Shutdown Handler
// ============================================================================
let isShuttingDown = false;

async function gracefulShutdown() {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    logger.debug("[Server] 🛑 Received shutdown signal, starting graceful shutdown...");
    
    // 1. Stop accepting new connections
    server.close(() => {
        logger.debug("[Server] HTTP server closed");
    });
    
    // 2. Wait for existing requests to complete (5 second timeout)
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 3. Disconnect all WebSocket clients orderly
    if (global.io) {
        global.io.disconnectSockets();
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // 4. Close Redis connection if available
    if (cache && cache.redis) {
        try {
            await cache.redis.quit();
            logger.debug("[Server] Redis connection closed");
        } catch (err) {
            logger.error("[Server] Error closing Redis:", err.message);
        }
    }
    
    logger.debug("[Server] ✅ Graceful shutdown complete");
    process.exit(0);
}

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

// Robust error guards for unexpected crashes
process.on("unhandledRejection", (reason, promise) => {
    logger.error("[Global] Unhandled Promise Rejection", { 
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
        promise: promise?.toString?.() || 'unknown'
    });
    Sentry.captureException(reason);
});

process.on("uncaughtException", (err) => {
    console.error("FATAL UNCAUGHT:", err);
    logger.error("[Global] Uncaught Exception thrown", { 
        message: err.message,
        stack: err.stack,
        code: err.code
    });
    Sentry.captureException(err);
    // Give Sentry some time to send the error before exiting
    setTimeout(() => {
        process.exit(1);
    }, 2000);
});

