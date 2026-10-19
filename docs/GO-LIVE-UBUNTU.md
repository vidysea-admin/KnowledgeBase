# Go live on Ubuntu (Docker Compose, from `master`)

One doc, one path: API (port 3300) + web (nginx, port 80) from the root `Dockerfile`.
Deeper reference: `docs/docker-deployment.md`. No secrets belong in this file or in git.

Status of this guide: written from a static review of `Dockerfile`, `docker-compose.yml`
and the package scripts. The images were NOT built or run on the machine that wrote it
(no Docker there). Run the checks below once and report anything that fails.

## 1. Prerequisites
- Ubuntu 22.04+ with Docker Engine and the compose plugin (`docker compose version`).
- Outbound HTTPS (npm, GitHub release download of yt-dlp during build, Ollama Cloud).
- A reachable MongoDB (NOT containerized by default) and an Ollama Cloud key.
- Node/pnpm on the host only if you run the key-minting script (section 6).

## 2. Clone and configure
```sh
git clone https://github.com/<org>/KnowledgeBase.git && cd KnowledgeBase
git checkout master            # use ae5e2e71 or later
cp .env.example .env && chmod 600 .env
```
Set in `.env` (names only; get values from the owner):
- `MONGODB_URL` required. Mongo connection URI.
- `MONGODB_DB` required, no default. Staging is `lkb_staging` and also needs
  `LKB_ALLOW_STAGING=lkb_staging`. Production `lkb` additionally needs
  `LKB_I_KNOW_THIS_IS_PRODUCTION=1` (see decisions below).
- `OLLAMA_API_KEY` required. Runtime only, never a build arg.
- `CORS_ORIGINS` the exact browser origin(s) of the web UI, with scheme,
  e.g. `http://<server-ip>`. nginx does not proxy the API, so the browser calls the API
  cross-origin and an unlisted origin is blocked.
- `VITE_API_BASE_URL` the URL the BROWSER uses to reach the API, e.g.
  `http://<server-ip>:3300`. It is baked into the web bundle at build time:
  changing it means rebuilding web (`docker compose build web`).
- `WEB_PORT=80` (compose default is 8080).
- Optional: `GEMINI_API_KEY` (audio transcription), `OLLAMA_CLOUD_MODEL`,
  `OLLAMA_CLOUD_VERIFIER_MODEL`.
The remaining names in `.env.example` belong to the meeting bot and scripts, not to
the api/web containers (compose forwards only the names it lists).

## 3. Build and start
```sh
docker compose build api web
docker compose up -d api web
docker compose ps
```
The first build downloads dependencies and takes several minutes. Plain
`docker build -t kb-api .` gives the same API image; `--target web` builds the UI.

## 4. Ports and health
- 3300: API. `curl -fsS http://localhost:3300/health` must return HTTP 200.
  It is unauthenticated and fails if Mongo does not ping.
- 80: web UI (nginx, serves SPA deep links such as `/sessions`).
- Open 80 (and 3300 unless a reverse proxy fronts it) in the firewall/security group.
- If the container is unhealthy: `docker compose logs api` first. The entrypoint prints
  which required variables are `set` or `MISSING`, never the values.

## 5. Chrome / meeting-bot worker (not in the compose stack)
The compose stack does NOT run the meeting bot, scheduler, watchers, OBS capture or the
Python transcription worker. They need their own host:
- The bot drives a real Chrome that must be signed in with a persistent profile
  (`LKB_BOT_PROFILE_DIR`, `LKB_BROWSER_EXECUTABLE`), run from the repo with Node/pnpm,
  Python, ffmpeg and the `gws` CLI (calendar/mail discovery).
- On Linux it needs a display: a desktop session or `xvfb-run`. OBS capture is
  Windows-only; use `LKB_CAPTURE_BACKEND=tab`.
- Honest status: it has only been operated on the existing Windows host. Several
  defaults point at `.exe` and `.venv/Scripts` paths. A headless Linux run is
  UNTESTED; expect path overrides (`LKB_PYTHON`, `LKB_GWS_PATH`, `LKB_FFPROBE`) and a
  one-time manual sign-in of the profile (CAPTCHA / 2FA cannot be automated).
- Recommendation: go live with api + web first; keep the bot on the current host,
  pointed at the same `MONGODB_URL`/`MONGODB_DB`, until Linux is proven.

## 6. First-run database step
Compose never migrates by itself. Run it once, deliberately, against the chosen DB:
```sh
docker compose --profile migrate run --rm migrate
```
It writes to `MONGODB_DB`. For production (`lkb`) it is refused unless
`LKB_I_KNOW_THIS_IS_PRODUCTION=1` is also set: the owner must approve first (D-117).
Then mint an API key for the UI/API (printed once, store it safely):
```sh
pnpm install --frozen-lockfile
node scripts/mint-key.mjs --tenant toc --label first-key
```
(`lkb` needs `--i-know-this-is-production` plus `MONGODB_DB=lkb`.) Data from other
machines is not copied by deploying; import the corpus separately if required.

## 7. Smoke test
```sh
curl -fsS  http://localhost:3300/health                      # 200
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3300/brain   # 401 without a key
curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost/             # 200 (UI)
curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost/sessions     # 200 (SPA route)
```
In a browser on another machine: open `http://<server>/`, enter the minted key, and
confirm pages load with no CORS errors in the console (if they appear, fix
`CORS_ORIGINS`; if requests go to `localhost`, rebuild web with the right
`VITE_API_BASE_URL`).

## 8. Owner decisions the team must make before real traffic
1. Domain and public hostnames (web and API). Then update `CORS_ORIGINS`, rebuild web.
2. TLS: no TLS is built in. Terminate it at a reverse proxy/load balancer (Caddy,
   nginx, cloud LB) and use `https://` in `VITE_API_BASE_URL` and `CORS_ORIGINS`.
   Do not expose plain HTTP to the internet with real keys.
3. Production DB name and authorization: use `lkb_staging` until the owner approves
   writing `lkb` (D-117, D-173). Never point a test deploy at `lkb`.
4. MongoDB auth/network: the URI must carry credentials, the cluster should accept only
   the server's IP, and Mongo is not run by this compose file (the `local-dev` profile is
   an empty throwaway DB only).
5. Where the bot runs (section 5) and who owns the signed-in Chrome profile.

## Update / rollback
`git pull && docker compose build api web && docker compose up -d api web`.
Roll back by checking out the previous commit and repeating. Migrations are not
reversed by this.
