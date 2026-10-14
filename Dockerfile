# Production images from the repository root. Default target: api.
#   docker build -t lkb-api .
#   docker build --target web --build-arg VITE_API_BASE_URL=https://api.example.com -t lkb-web .
# Deployment requirements and optional data mounts: docs/docker-deployment.md.
FROM node:24-slim AS base
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

# Copy every workspace manifest before installing to retain dependency-layer caching.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/package.json
COPY packages/ai/package.json packages/ai/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/ask/package.json packages/ask/package.json
COPY packages/index/package.json packages/index/package.json
COPY packages/ingest/package.json packages/ingest/package.json
COPY packages/meeting-bot/package.json packages/meeting-bot/package.json
COPY workers/transcribe/package.json workers/transcribe/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

FROM manifests AS deps
RUN pnpm install --frozen-lockfile

# Keep `build` available for the Compose opt-in migration service.
# Bundling includes workspace TypeScript sources; real npm dependencies stay external.
FROM deps AS build
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @lkb/api build

FROM manifests AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter "@lkb/api..."

FROM deps AS web-build
COPY apps/web ./apps/web
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN pnpm --filter @lkb/web build

# Separate static frontend image. The existing nginx configuration handles SPA routes.
FROM nginx:1.27-alpine AS web
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:80/ || exit 1

# Last stage makes plain `docker build .` produce the API image.
FROM node:24-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
# The bundler rewrites import.meta.url lookups to this repository-relative layout.
COPY schema ./schema
COPY config ./config
# Credentials arrive through runtime environment, never image layers. Corpus files
# under /app/data and /app/raw are optional operator mounts, excluded from the image.
USER node
EXPOSE 3300
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3300)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "apps/api/dist/server.js"]
