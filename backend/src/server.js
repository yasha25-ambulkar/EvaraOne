require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const adminRoutes = require("./routes/admin.routes.js");
const { getDashboardSummary, getHierarchy, getAuditLogs, getZoneStats } = require("./controllers/admin.controller.js");
const { requireAuth, checkOwnership } = require("./middleware/auth.middleware.js");
const tenantCheck = require("./middleware/tenantCheck.middleware.js");
const rbac = require("./middleware/rbac.middleware.js");
const { startWorker, telemetryEvents } = require("./workers/telemetryWorker.js");
const cache = require("./config/cache.js");
const apiLimiter = require("./middleware/rateLimit.js");
const http = require("http");
const { Server } = require("socket.io");
const morgan = require("morgan");
const Sentry = require("@sentry/node");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const validateEnv = require("./utils/validateEnv.js");

// Validate environment before starting
validateEnv();

Sentry.init({
  dsn: process.env.SENTRY_DSN || "",
  integrations: [
    Sentry.expressIntegration(),
  ],
});

const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(",") 
  : [
      "https://app.evaratech.com",
      "http://localhost:8080",
      "http://localhost:5173",
      "http://localhost:3000"
    ];

// In production on Railway, allow same-origin requests
const corsOptions = {
  origin: process.env.NODE_ENV === "production" 
    ? (origin, callback) => {
        // Allow requests with no origin (same-origin, mobile apps, curl)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin) || origin.endsWith('.railway.app')) {
          return callback(null, true);
        }
        callback(new Error('Not allowed by CORS'));
      }
    : allowedOrigins,
  credentials: true
};

// Pre-flight CORS and Security
app.use(cors(corsOptions));

// Relax Helmet for development/local communication if needed
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(express.json());
app.use(morgan("combined"));

// Consolidate Rate Limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 100, // Limit each IP to 100 requests per `window` (here, per minute)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { error: "Too many requests, please try again later." }
});
app.use("/api/", limiter);

const server = http.createServer(app);

const io = new Server(server, { 
    cors: { 
        origin: allowedOrigins,
        credentials: true
    } 
});

global.io = io;

const { admin, db } = require("./config/firebase.js");

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Authentication error: Missing token"));
    
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // SaaS Architecture: Resolve role and community from Firestore
    let userData = { role: "customer" };
    try {
        // Priority 1: Superadmins by ID
        let userDoc = await db.collection("superadmins").doc(decodedToken.uid).get();
        if (userDoc.exists) {
            userData = userDoc.data();
        } else {
            // Priority 2: Customers by ID
            userDoc = await db.collection("customers").doc(decodedToken.uid).get();
            if (userDoc.exists) {
                userData = { ...userDoc.data(), id: userDoc.id };
            } else if (decodedToken.email) {
                // Priority 3: Customers by Email (Fallback)
                const emailMatches = await db.collection("customers")
                    .where("email", "==", decodedToken.email)
                    .limit(1)
                    .get();
                if (!emailMatches.empty) {
                    const match = emailMatches.docs[0];
                    userData = { ...match.data(), id: match.id };
                }
            }
        }
    } catch (e) {
        console.warn("[Socket.io] User lookup failed:", e.message);
    }

    const role = (userData.role || "customer").trim().toLowerCase().replace(/\s+/g, "");
    const community_id = userData.community_id || "";
    const customer_id = userData.customer_id || userData.id || "";
    
    socket.user = { uid: decodedToken.uid, role, community_id, customer_id };
    next();
  } catch (err) {
    next(new Error("Authentication error: Invalid token"));
  }
});

io.on("connection", (socket) => {
    console.log(`[Socket.io] Client connected: ${socket.user?.uid || 'Unknown'}`);

    socket.on("subscribe_device", async (deviceId) => {
        // SaaS Architecture: Security Guard (Zero Trust)
        const isOwner = await checkOwnership(socket.user.customer_id || socket.user.uid, deviceId, socket.user.role, socket.user.community_id);
        if (isOwner) {
            console.log(`[Socket.io] Client ${socket.user?.uid} subscribed to device ${deviceId}`);
            socket.join(`room:${deviceId}`);
        } else {
            console.warn(`[Socket.io] Forbidden subscription attempt by ${socket.user.uid} for ${deviceId}`);
        }
    });

    socket.on("unsubscribe_device", (deviceId) => {
        socket.leave(`room:${deviceId}`);
    });

    socket.on("disconnect", () => {
        console.log(`[Socket.io] Client disconnected`);
    });
});

// SaaS Architecture: Distributed Telemetry (Redis Pub/Sub)
const pubSub = cache.getPubSub();
if (pubSub) {
    const sub = pubSub.sub;
    sub.psubscribe("device:update:*");
    sub.on("pmessage", (pattern, channel, message) => {
        try {
            const payload = JSON.parse(message);
            const deviceId = channel.split(":")[2];
            if (deviceId) {
                io.to(`room:${deviceId}`).emit("device:update", payload);
            }
        } catch (err) {}
    });
}

// Local bridge for telemetryWorker (Dev/Single-instance fallback)
// Node.js EventEmitter doesn't support regex patterns — use explicit wildcard
telemetryEvents.on("device:update", (payload) => {
    if (payload && payload.deviceId) {
        io.to(`room:${payload.deviceId}`).emit("device:update", payload);
    }
});


// Sentry Handlers

// SaaS Architecture: Global Security Stack for Authenticated Routes
const globalSaaSAuth = [requireAuth, tenantCheck, rbac()];

// Main admin routes
app.use("/api/v1/admin", globalSaaSAuth, adminRoutes);

// Node telemetry and analytics routes
const nodesRoutes = require("./routes/nodes.routes.js");
// Health Check Endpoint
app.get("/api/v1/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    env: process.env.NODE_ENV
  });
});

app.use("/api/v1/nodes", globalSaaSAuth, nodesRoutes);

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
        console.log(`[Server] Serving frontend from ${publicPath}`);
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
        console.warn(`[Server] Frontend build not found at ${publicPath}`);
    }
}

// Sentry error handler must be after all controllers and routes
Sentry.setupExpressErrorHandler(app);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal Server Error" });
});

const PORT = process.env.PORT || 8000;

try {
    server.on("error", (err) => {
        console.error("[Server] Fatal error event:", err);
        if (err.code === "EADDRINUSE") {
            console.error(`[Server] Port ${PORT} is already in use.`);
        }
        process.exit(1);
    });

    server.listen(PORT, () => {
        console.log(`[Server] ✅ Backend running on port ${PORT}`);
        // Initialize our background worker
        startWorker();
    });
} catch (error) {
    console.error("[Server] Error during startup:", error);
    process.exit(1);
}

// Robust error guards for unexpected crashes
process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
    Sentry.captureException(reason);
});

process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception thrown:", err);
    Sentry.captureException(err);
    // Give Sentry some time to send the error before exiting
    setTimeout(() => {
        process.exit(1);
    }, 2000);
});
