# Hearth frontend Dockerfile for Railway deployment.
# Mirrors the enchanted-spoon frontend build: multi-stage, Next.js standalone output.
#
# Note: Hearth has NO NEXT_PUBLIC_* build args. Every secret (HEARTH_DEVICE_TOKEN
# and, in later phases, the upstream API tokens) is a RUNTIME env var consumed
# only in route handlers / middleware. Nothing sensitive is baked into the bundle.
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Use `npm install` instead of `npm ci`: the lockfile is generated on Windows,
# which prunes the Linux/wasm optional deps of @tailwindcss/oxide (@emnapi/*).
# `npm ci`'s strict sync check then fails on Alpine. `npm install` reconciles
# the correct platform deps at build time while still honoring pinned versions.
RUN npm install --no-audit --no-fund

# Rebuild the source only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
# su-exec: lets the entrypoint drop from root to the app user (see below).
RUN apk add --no-cache su-exec

# Order matters: standalone first, then static + public (avoids overwriting)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# The server runs as the unprivileged "nextjs" user. There is deliberately no
# USER line: the entrypoint starts as root only to make the data volume
# (HEARTH_DATA_DIR, mounted root-owned by Railway) writable by that user, then
# drops to it with su-exec before starting node. The sed strips CRs in case the
# script was checked out on Windows.
COPY scripts/docker-entrypoint.sh /usr/local/bin/hearth-entrypoint
RUN sed -i 's/\r$//' /usr/local/bin/hearth-entrypoint && chmod 755 /usr/local/bin/hearth-entrypoint

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["hearth-entrypoint"]
CMD ["node", "server.js"]
