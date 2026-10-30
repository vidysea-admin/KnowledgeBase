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
COPY schema ./schema
COPY config ./config
COPY migrations ./migrations
COPY scripts/qa/container-workflows ./scripts/qa/container-workflows
COPY scripts/eval/extraction-authorized-import.mjs ./scripts/eval/extraction-authorized-import.mjs
RUN pnpm --filter @lkb/api build

FROM manifests AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter "@lkb/api..."

FROM deps AS web-build
COPY apps/web ./apps/web
COPY packages/ingest/src/join-policy ./packages/ingest/src/join-policy
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN pnpm --filter @lkb/web build

# Separate static frontend image. ONE image serves any base path chosen at container start:
#   APP_BASE_PATH  default "/"; e.g. "/knowledgebase" (docs/GO-LIVE-UBUNTU.md, "Base path").
#   APP_API_BASE   optional explicit API base for the browser; default <base>/api (proxied by nginx).
#   API_UPSTREAM   where nginx proxies <base>/api/*; default http://api:3300.
# apps/web/nginx.conf is an envsubst template (rendered by the official entrypoint from
# /etc/nginx/templates); apps/web/docker/* are entrypoint hooks (see their headers). ${PORT} is the
# listen port (Cloud Run sets it; default 80).
FROM nginx:1.27-alpine AS web
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template
COPY apps/web/docker/18-lkb-base-path.envsh /docker-entrypoint.d/18-lkb-base-path.envsh
COPY apps/web/docker/40-lkb-runtime-config.sh /docker-entrypoint.d/40-lkb-runtime-config.sh
# Strip CR (a Windows checkout may have converted line endings) and make the hooks runnable/sourceable.
RUN sed -i 's/\r$//' /etc/nginx/templates/default.conf.template /docker-entrypoint.d/18-lkb-base-path.envsh /docker-entrypoint.d/40-lkb-runtime-config.sh \
  && chmod 0755 /docker-entrypoint.d/18-lkb-base-path.envsh /docker-entrypoint.d/40-lkb-runtime-config.sh \
  && grep -q 'listen ${PORT};' /etc/nginx/templates/default.conf.template \
  && rm -f /etc/nginx/conf.d/default.conf
ENV PORT=80 APP_BASE_PATH=/ API_UPSTREAM=http://api:3300
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["sh", "-c", "wget -q --spider http://127.0.0.1:${PORT}/healthz || exit 1"]

# Pinned official standalone tooling. Downloads happen only during the approved build.
FROM node:24-slim AS media-tool-download
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*
RUN set -eu; \
  case "${TARGETARCH:-$(dpkg --print-architecture)}" in \
    amd64) asset=yt-dlp_linux; digest=58162f9bfdc27458ea47bfcb311cf47028f17d8154a8bf7d689861d46399230a ;; \
    arm64) asset=yt-dlp_linux_aarch64; digest=b16e4dab368a816cd05d477d698a605a6ae87ccee1c8ffd38fa21d7254141fcc ;; \
    *) echo 'Unsupported media-tool architecture' >&2; exit 1 ;; \
  esac; \
  curl --fail --location --retry 2 --connect-timeout 15 --max-time 120 \
    "https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/$asset" -o /usr/local/bin/yt-dlp; \
  printf '%s  /usr/local/bin/yt-dlp\n' "$digest" | sha256sum --check -; \
  chmod 0755 /usr/local/bin/yt-dlp

FROM node:24-slim AS media-runtime
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=media-tool-download /usr/local/bin/yt-dlp /usr/local/bin/yt-dlp
ENV LKB_YT_DLP_PATH=/usr/local/bin/yt-dlp \
  LKB_FFMPEG_PATH=/usr/bin/ffmpeg LKB_FFPROBE_PATH=/usr/bin/ffprobe

# Explicit separate worker target. It requires operator configuration and never starts with the API.
FROM media-runtime AS worker-tools
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY schema ./schema
COPY config ./config
USER node
CMD ["node", "apps/api/dist/source-worker.js"]

# Last stage preserves plain `docker build .` as API. Native tools run only on opted-in requests.
FROM worker-tools AS api
ENV NODE_ENV=production
WORKDIR /app
# Cloud Run runtime. The server reads PORT (default 3300). The bundler rewrites
# import.meta.url lookups to this repository-relative layout. Credentials arrive through
# runtime environment, never image layers. Corpus files under /app/data and /app/raw are
# optional operator mounts, excluded from the image.
USER root
# Build-time sanity: entrypoints exist and parse (node --check never starts the server).
RUN set -eux; \
    test -s apps/api/dist/server.js; \
    test -s apps/api/dist/source-worker.js; \
    node --check apps/api/dist/server.js; \
    node --check apps/api/dist/source-worker.js; \
    echo "api bundle sanity OK"
# T-028 state dirs: created node-owned so compose named volumes mounted here are writable by UID 1000.
RUN mkdir -p /var/lib/lkb/hosting /var/lib/lkb/counsellor /var/lib/lkb/join-rules && chown -R node:node /var/lib/lkb
# Non-root runtime user: the image's `node` user (UID 1000). The CI smoke test
# (scripts/qa/container-workflows/run.sh) chowns its state volumes to 1000, so the UID is kept
# (the sibling autoTesting image uses 10001).
# Startup diagnostics: report presence (never values) of required env, then exec the command.
RUN printf '%s\n' \
    '#!/bin/sh' \
    'set -eu' \
    'echo "========== CONTAINER STARTUP DIAGNOSTICS =========="' \
    'echo "uid=$(id -u) PORT=${PORT:-not-set (server default 3300)}"' \
    'for name in MONGODB_URL MONGODB_DB OLLAMA_API_KEY; do' \
    '  eval "value=\${$name:-}"' \
    '  if [ -n "$value" ]; then echo "$name=set"; else echo "$name=MISSING"; fi' \
    'done' \
    'echo "========== EXECUTING APPLICATION =========="' \
    'exec "$@"' \
    > /usr/local/bin/startup-diagnostics.sh \
  && chmod 755 /usr/local/bin/startup-diagnostics.sh \
  && sh -n /usr/local/bin/startup-diagnostics.sh
USER node
EXPOSE 3300
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3300)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
ENTRYPOINT ["/usr/local/bin/startup-diagnostics.sh"]
CMD ["node", "apps/api/dist/server.js"]
