# ==============================================================================
# Multi-Stage Production Dockerfile for FinSight API (Node.js 20 Alpine)
# ==============================================================================

# Stage 1: Dependency resolution and caching
FROM node:20-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Stage 2: Minimal, hardened production runtime
FROM node:20-alpine AS runner
WORKDIR /app

# Install dumb-init for proper PID 1 signal forwarding and curl for container health check
RUN apk update && apk upgrade && apk add --no-cache dumb-init curl

# Copy production node_modules from dependencies stage
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .

# Set secure environment defaults
ENV NODE_ENV=production \
    PORT=5000

# Non-root user for container security hardening
USER node

# Expose API port
EXPOSE 5000

# Container healthcheck targeting Express healthcheck endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

# dumb-init forwards SIGINT and SIGTERM to node for graceful container shutdown
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "index.js"]
