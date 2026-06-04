# Build with repository root as the Docker context:
#   docker build -f backend/Dockerfile .

FROM node:20-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/src ./src
COPY backend/package.json ./package.json

FROM node:20-alpine
WORKDIR /app/backend
ENV NODE_ENV=production
USER node

COPY --from=backend-builder --chown=node:node /app/backend/node_modules ./node_modules
COPY --from=backend-builder --chown=node:node /app/backend/src ./src
COPY --from=backend-builder --chown=node:node /app/backend/package.json ./package.json
COPY --from=client-builder --chown=node:node /app/client/dist /app/client/dist

EXPOSE 8000
CMD ["node", "src/server.js"]
