# ─── #15 FIX: Remove PM2 clustering — it breaks Socket.io state ─────────────
# ORIGINAL BUG: `pm2-runtime src/server.js -i max` spawns one process per CPU core.
# Socket.io stores room membership (which client joined which device room) in
# process memory. When a client connects to instance A and a telemetry update
# arrives on instance B, the room lookup finds nothing → real-time update is lost.
#
# Additionally:
#   • npm install pulled ALL dependencies including devDependencies (bloated image)
#   • Container ran as root (security risk — any RCE gives full host access)
#   • No health check (Railway can't detect a hung process)
#   • No .dockerignore meant node_modules and logs were sometimes re-copied
#
# FIX:
#   • Multi-stage build: builder installs deps; final image copies only production deps
#   • Single `node src/server.js` process — horizontal scaling is handled by
#     deploying multiple Railway replicas + the Socket.io Redis adapter (server.js)
#   • Non-root `node` user
#   • HEALTHCHECK so Railway restarts unhealthy instances automatically
#   • Only src/ and necessary config files are copied — no test files or logs

# ── Stage 1: install production dependencies only ────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifests first so Docker can cache this layer on rebuild
COPY package*.json ./

# ci = clean install, exact versions from package-lock.json
# --omit=dev = skip devDependencies (eslint, jest, nodemon, etc.)
RUN npm ci --omit=dev

# ── Stage 2: lean runtime image ──────────────────────────────────────────────
FROM node:20-alpine

# Run as the built-in non-root `node` user
# If an attacker exploits a code path they get user-level access, not root
USER node

WORKDIR /app

# Copy production node_modules from builder (chown to node user)
COPY --from=builder --chown=node:node /app/node_modules ./node_modules

# Copy application source — add more COPY lines here if you have other dirs
COPY --chown=node:node src ./src
COPY --chown=node:node package.json ./

EXPOSE 8000

# Health check — Railway uses this to determine if the instance is alive.
# If /api/v1/health returns non-200 three times in a row, Railway restarts the container.
HEALTHCHECK \
    --interval=30s \
    --timeout=5s \
    --start-period=10s \
    --retries=3 \
    CMD node -e "\
        require('http').get('http://localhost:8000/api/v1/health', (r) => { \
            process.exit(r.statusCode === 200 ? 0 : 1); \
        }).on('error', () => process.exit(1));"

# Single Node.js process.
# Horizontal scaling = deploy multiple Railway replicas.
# Socket.io state is shared via Redis adapter (configured in server.js).
CMD ["node", "src/server.js"]
