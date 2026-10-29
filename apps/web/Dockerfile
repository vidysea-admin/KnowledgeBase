# apps/web/Dockerfile — production image for @lkb/web. Two real stages: build the static
# bundle with the full pnpm workspace (same reasoning as apps/api/Dockerfile: the whole
# workspace is copied in for `pnpm install` to resolve correctly), then serve the built `dist/`
# from a tiny nginx image -- unlike apps/api, apps/web IS compiled ahead of time (`vite build`),
# so nothing but the static output and nginx itself ships in the final image.
FROM node:24-slim AS base
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

FROM base AS deps
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
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY apps/web ./apps/web
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN pnpm --filter @lkb/web build

FROM nginx:1.27-alpine AS runtime
# Same runtime contract as the root Dockerfile's `web` target: APP_BASE_PATH / APP_API_BASE / API_UPSTREAM.
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template
COPY apps/web/docker/18-lkb-base-path.envsh /docker-entrypoint.d/18-lkb-base-path.envsh
COPY apps/web/docker/40-lkb-runtime-config.sh /docker-entrypoint.d/40-lkb-runtime-config.sh
RUN sed -i 's/\r$//' /etc/nginx/templates/default.conf.template /docker-entrypoint.d/18-lkb-base-path.envsh /docker-entrypoint.d/40-lkb-runtime-config.sh \
  && chmod 0755 /docker-entrypoint.d/18-lkb-base-path.envsh /docker-entrypoint.d/40-lkb-runtime-config.sh \
  && rm -f /etc/nginx/conf.d/default.conf
ENV PORT=80 APP_BASE_PATH=/ API_UPSTREAM=http://api:3300
EXPOSE 80
# nginx:alpine ships busybox wget. 127.0.0.1 (not localhost) avoids an IPv6 ::1 miss.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["sh", "-c", "wget -q --spider http://127.0.0.1:${PORT}/healthz || exit 1"]
