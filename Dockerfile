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

# Order matters: standalone first, then static + public (avoids overwriting)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
