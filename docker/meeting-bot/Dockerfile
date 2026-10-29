# Linux meeting-bot image (D-205 U1): headed Chrome for Testing under Xvfb, PulseAudio null sink,
# tab-capture recording, `node scripts/webinar/run-pipeline.mjs --run --watch`.
#   docker build -f docker/meeting-bot/Dockerfile -t lkb-bot .        (context = repo root)
# Secrets are NEVER baked in: .env is excluded by .dockerignore and the compose `bot` service passes
# names through value-less. Survey: qa/evidence/bot-linux-survey-2026-10-29.md.
FROM node:24-slim

ARG DEBIAN_FRONTEND=noninteractive
# OS packages: runtime (python/venv/tk for PyAutoGUI, Xvfb, PulseAudio, ffmpeg, tini), Chrome shared
# libraries, fonts, and the X11 tools the doctor/healthcheck/login mode use.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv python3-tk python3-xlib python3-dev \
    xvfb x11vnc x11-utils xauth xdotool scrot \
    pulseaudio pulseaudio-utils ffmpeg tini tzdata ca-certificates curl procps unzip \
    libnss3 libgbm1 libasound2 libxss1 libgtk-3-0 libxtst6 libxkbcommon0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libpango-1.0-0 libcairo2 \
    libx11-xcb1 libxshmfence1 libnss3-tools \
    fonts-noto-core fonts-noto-color-emoji fonts-indic fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

# Pinned Linux gws (calendar/mail alerts): official googleworkspace/cli release v0.22.5, x86_64 musl build
# (fully static, no glibc/libssl coupling). The archive is checked against GWS_SHA256 (the release's
# published .sha256); the build FAILS on a mismatch or an empty URL/digest. No login and no credentials
# are baked in: gws OAuth on the server is a human step (volume lkb-bot-gws).
ARG GWS_VERSION=0.22.5
ARG GWS_URL=https://github.com/googleworkspace/cli/releases/download/v0.22.5/google-workspace-cli-x86_64-unknown-linux-musl.tar.gz
ARG GWS_SHA256=4db473dde4b1ab872e4ff35d769b0d4af1f1a6441a605e79d5cf8ada9c87e920
RUN set -eu; \
    [ -n "$GWS_URL" ] && [ -n "$GWS_SHA256" ] || { echo "GWS_URL and GWS_SHA256 must both be set" >&2; exit 1; }; \
    curl -fsSL "$GWS_URL" -o /tmp/gws.archive; \
    echo "$GWS_SHA256  /tmp/gws.archive" | sha256sum -c -; \
    mkdir /tmp/gws; tar -xf /tmp/gws.archive -C /tmp/gws; \
    install -m 0755 "$(find /tmp/gws -type f -name gws | head -n 1)" /usr/local/bin/gws; \
    rm -rf /tmp/gws /tmp/gws.archive; \
    gws --version | grep -F "$GWS_VERSION"

COPY docker/meeting-bot/entrypoint.sh /usr/local/bin/bot-entrypoint
COPY docker/meeting-bot/healthcheck.sh /usr/local/bin/bot-healthcheck
RUN sed -i 's/\r$//' /usr/local/bin/bot-entrypoint /usr/local/bin/bot-healthcheck \
  && chmod 0755 /usr/local/bin/bot-entrypoint /usr/local/bin/bot-healthcheck \
  && corepack enable \
  && mkdir -p /app /data/bot-profile /app/raw/webinars /app/data /home/node/.config/gws \
  && chown -R 1000:1000 /app /data /home/node \
  && chmod 0700 /data/bot-profile /app/raw/webinars /app/data /home/node/.config/gws

USER node
WORKDIR /app
RUN corepack prepare pnpm@10.33.0 --activate

# Workspace manifests first (dependency-layer cache), then the full install (tsx is a dev dependency).
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node packages/core/package.json packages/core/package.json
COPY --chown=node:node packages/ai/package.json packages/ai/package.json
COPY --chown=node:node packages/db/package.json packages/db/package.json
COPY --chown=node:node packages/ask/package.json packages/ask/package.json
COPY --chown=node:node packages/index/package.json packages/index/package.json
COPY --chown=node:node packages/ingest/package.json packages/ingest/package.json
COPY --chown=node:node packages/meeting-bot/package.json packages/meeting-bot/package.json
COPY --chown=node:node workers/transcribe/package.json workers/transcribe/package.json
COPY --chown=node:node apps/api/package.json apps/api/package.json
COPY --chown=node:node apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

# Project venv + Chrome for Testing + matching uc_driver (the doctor requires the majors to match).
COPY --chown=node:node packages/meeting-bot/py/requirements.txt packages/meeting-bot/py/requirements.txt
RUN python3 -m venv /app/.venv \
  && /app/.venv/bin/python -m pip --isolated --no-cache-dir install -r packages/meeting-bot/py/requirements.txt \
  && /app/.venv/bin/python -m seleniumbase get cft \
  && /app/.venv/bin/python -m seleniumbase get uc_driver stable

# Application source (.dockerignore excludes .env, data, raw, qa, node_modules, ...).
COPY --chown=node:node . .

ENV DISPLAY=:99 \
    LKB_PYTHON=/app/.venv/bin/python \
    LKB_BROWSER_EXECUTABLE=cft \
    LKB_CAPTURE_BACKEND=tab \
    LKB_BOT_PROFILE_DIR=/data/bot-profile \
    LKB_RECORD_DIR=/app/raw/webinars \
    LKB_FFMPEG_PATH=/usr/bin/ffmpeg \
    LKB_GWS_PATH=/usr/local/bin/gws \
    LKB_CHROME_NO_SANDBOX=1 \
    XDG_RUNTIME_DIR=/tmp/runtime-node \
    PULSE_SERVER=unix:/tmp/runtime-node/pulse/native \
    TZ=Asia/Kolkata \
    BOT_MODE=run

HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 CMD ["/usr/local/bin/bot-healthcheck"]
ENTRYPOINT ["/usr/bin/tini", "-s", "--", "/usr/local/bin/bot-entrypoint"]
