# --- Stage 1: install production dependencies only ---
FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifests first so Docker can cache this layer on rebuild
COPY package*.json ./

# ci = clean install, exact versions from package-lock.json
# --omit=dev = skip devDependencies (eslint, jest, nodemon, etc.)
RUN npm ci --omit=dev

# --- Stage 2: lean runtime image ---
FROM node:20-alpine

# Run as the built-in non-root 'node' user
# If an attacker exploits a code path they get user-level access, not root
USER node

WORKDIR /app

# Copy production node_modules from builder (chown to node user)
COPY --from=builder --chown=node:node /app/node_modules ./node_modules

# Copy application source - add more COPY lines here if you have other dirs
COPY --chown=node:node src ./src
COPY --chown=node:node package.json ./

EXPOSE 8000

# Single Node.js process
# Horizontal scaling = deploy multiple Railway replicas
# Socket.io state is shared via Redis adapter (configured in server.js)
CMD ["node", "src/server.js"]
