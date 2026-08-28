# =============================================================================
# PulseTrace — Production Multi-Stage Docker Build
# =============================================================================
#
# Targets:
#   api    — API server + worker (node:20-alpine)
#   nginx  — Dashboard SPA reverse proxy (nginx:alpine)
#
# Build:
#   docker build -t pulsetrace:latest --target api .
#   docker build -t pulsetrace:nginx --target nginx .
#
# The "api" target is the default.
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: deps — Install all dependencies (including dev for build)
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app

# Copy workspace manifests first for better layer caching.
# Changing source code won't re-trigger a full npm ci.
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/dashboard/package.json ./apps/dashboard/

RUN npm ci

# ---------------------------------------------------------------------------
# Stage 2: build — Compile API and dashboard
# ---------------------------------------------------------------------------
FROM deps AS build
WORKDIR /app

# Copy TypeScript configs (needed for compilation)
COPY tsconfig.json ./
COPY apps/api/tsconfig.json ./apps/api/

# Copy dashboard build configs
COPY apps/dashboard/tsconfig.json ./apps/dashboard/
COPY apps/dashboard/vite.config.ts ./apps/dashboard/
COPY apps/dashboard/tailwind.config.js ./apps/dashboard/
COPY apps/dashboard/postcss.config.js ./apps/dashboard/
COPY apps/dashboard/index.html ./apps/dashboard/

# Copy Prisma schema and migrations (needed for prisma generate)
COPY apps/api/prisma ./apps/api/prisma

# Copy source code
COPY apps/api/src ./apps/api/src
COPY apps/dashboard/src ./apps/dashboard/src

# Generate Prisma Client
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma

# Build API (TypeScript → JavaScript)
RUN npm run build

# Build dashboard (Vite production build)
RUN npm run build:dashboard

# ---------------------------------------------------------------------------
# Stage 3: api — Production API server + worker
# ---------------------------------------------------------------------------
FROM node:20-alpine AS api
WORKDIR /app

# Prisma requires OpenSSL at runtime for the query engine
RUN apk add --no-cache openssl

# Security: run as non-root user
RUN addgroup -S pulsetrace && adduser -S pulsetrace -G pulsetrace

# Install production dependencies only
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/dashboard/package.json ./apps/dashboard/
RUN npm ci --omit=dev

# Copy Prisma CLI from full deps (devDependency, required for migrate deploy).
# The prisma package contains the CLI binary needed at runtime for migrations.
COPY --from=deps /app/node_modules/prisma ./node_modules/prisma
COPY --from=deps /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

# Copy generated Prisma Client (created by prisma generate in build stage)
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

# Copy compiled API output
COPY --from=build /app/apps/api/dist ./apps/api/dist

# Copy Prisma schema and migrations (needed for migrate deploy at startup)
COPY --from=build /app/apps/api/prisma ./apps/api/prisma

# Copy production entrypoint script
COPY scripts/start.sh ./scripts/start.sh
RUN chmod +x ./scripts/start.sh

# Set ownership for non-root user
RUN chown -R pulsetrace:pulsetrace /app

USER pulsetrace

EXPOSE 4000

# Liveness probe: verifies the HTTP process is reachable.
# We use /health (not /health/ready) because /health/ready checks
# Postgres/Redis dependencies — a failed dependency shouldn't mark
# the container as "unhealthy" during startup or transient outages.
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

CMD ["./scripts/start.sh"]

# ---------------------------------------------------------------------------
# Stage 4: nginx — Dashboard SPA + API reverse proxy
# ---------------------------------------------------------------------------
FROM nginx:alpine AS nginx

# Remove default nginx site config
RUN rm -f /etc/nginx/conf.d/default.conf

# Copy custom nginx configuration
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built dashboard assets from build stage
COPY --from=build /app/apps/dashboard/dist /usr/share/nginx/html

EXPOSE 80

# Liveness probe: verify nginx is serving the SPA
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
