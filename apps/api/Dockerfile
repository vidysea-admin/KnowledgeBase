# apps/api/Dockerfile -- production image for @lkb/api.
#
# Multi-stage: `build` bundles apps/api/src/index.ts (+ every @lkb/* workspace source it imports)
# into one plain-JS file, apps/api/dist/server.js, with esbuild (apps/api/scripts/build.mjs).
# The runtime stage ships only that bundle, the two repo directories read at runtime (schema/,
# config/) and PRODUCTION node_modules -- no tsx, no TypeScript, no workspace source tree.
#
# The bundle must sit at <root>/apps/api/dist/server.js with <root>/schema and <root>/config beside
# it: build.mjs rewrites each module's import.meta.url so those lookups resolve from that layout.
FROM node:24-slim AS base
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

# Manifests only, so `pnpm install` reruns only when a package.json or the lockfile changes.
# Every pnpm-workspace.yaml member needs its package.json here or install fails.
FROM base AS manifests
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/ai/package.json packages/ai/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/ask/package.json packages/ask/package.json
COPY packages/index/package.json packages/index/package.json
COPY packages/ingest/package.json packages/ingest/package.json
COPY packages/meeting-bot/package.json packages/meeting-bot/package.json
COPY workers/transcribe/package.json workers/transcribe/package.json
COPY apps/api/package.json apps/api/package.json

# Full install (devDependencies included: esbuild) -> bundle.
FROM manifests AS build
RUN pnpm install --frozen-lockfile
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @lkb/api build

# Production-only install for @lkb/api and what it depends on. The bundle keeps real npm packages
# (express, mongodb, dotenv, express-rate-limit) external, so they are resolved from here.
FROM manifests AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter "@lkb/api..."

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY schema ./schema
COPY config ./config
# Required runtime env: MONGODB_URL and MONGODB_DB. There is NO database default: the server refuses to
# start when MONGODB_DB is unset or empty (docker-compose.yml sets MONGODB_DB: lkb explicitly for production).
# Runtime file dependencies of the bundle: schema/index.json, config/ai-routing.yaml (both baked in
# above). The brain routes also read <root>/data/** and <root>/raw/** when present; those are
# DATA, not code, and are not in the image -- mount them (e.g. at /app/data) if /brain is needed.

USER node
EXPOSE 3300
# /health is unauthenticated and returns 503 when the db ping fails or a watcher heartbeat is
# unreadable. node:slim has no curl, so probe with node itself.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3300)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "apps/api/dist/server.js"]
