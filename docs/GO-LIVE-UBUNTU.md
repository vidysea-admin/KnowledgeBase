# Go live on Ubuntu (Docker Compose, from `master`)

One doc, one path: API (port 3300) + web (nginx, port 80) from the root `Dockerfile`.
Deeper reference: `docs/docker-deployment.md`. No secrets belong in this file or in git.

Status of this guide: written from a static review of `Dockerfile`, `docker-compose.yml`
and the package scripts. The images were NOT built or run on the machine that wrote it
(no Docker there). Run the checks below once and report anything that fails.

## 1. Prerequisites
- Ubuntu 22.04+ with Docker Engine and Docker Compose v2.24 or newer (`docker compose version`).
  Older compose cannot parse `docker-compose.yml` (`env_file` with `required: false`). Upgrade:
  `sudo apt-get update && sudo apt-get install --only-upgrade docker-compose-plugin` (Docker's apt repo).
- Outbound HTTPS (npm, GitHub release download of yt-dlp during build, Ollama Cloud).
- A reachable MongoDB (NOT containerized by default) and an Ollama Cloud key.
  The MongoDB MUST be a replica set (a single-node replica set is fine); a standalone
  `mongod` is not enough, see the REQUIRED note in section 6a.
- Node/pnpm on the host only if you run the key-minting script (section 6).

## 2. Clone and configure
```sh
git clone https://github.com/<org>/KnowledgeBase.git && cd KnowledgeBase
git checkout master            # use ae5e2e71 or later
cp .env.example .env && chmod 600 .env
```
Set in `.env` (names only; get values from the owner):
- `MONGODB_URL` required. Mongo connection URI with the product's dedicated user
  (section 6a). Placeholder: `mongodb://lkb_app:<PASSWORD>@<mongo-host>:27017/lkb_prod?authSource=lkb_prod`.
- `MONGODB_DB=lkb_prod` required, no default. Authorized for the deployed app by D-186
  (supersedes the D-117 no-production-writes stance for the app only). The guards still
  refuse `lkb`, `global_university_db` and unflagged `lkb_staging` (D-173), so `lkb_prod`
  needs no extra opt-in flag. Set `MONGO_WORK_DB=lkb_prod` too when running scripts
  from section 6.
- `OLLAMA_API_KEY` required. Copy it from the bot machine's `.env` into the server `.env`
  by hand; never commit it, paste it in chat or print it. Runtime only, never a build arg.
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
It writes to `MONGODB_DB` (`lkb_prod`, D-186). The legacy `lkb` stays refused unless
`LKB_I_KNOW_THIS_IS_PRODUCTION=1`; do not use it.
Then mint an API key for the UI/API (printed once, store it safely):
```sh
pnpm install --frozen-lockfile
node scripts/mint-key.mjs --tenant toc --label first-key
```
(Run it with `MONGODB_DB=lkb_prod MONGO_WORK_DB=lkb_prod`; the legacy `lkb` is not used.)
Data from other machines is not copied by deploying; import the corpus separately.

### 6a. Dedicated Mongo user for the product (D-186)
Create it once on the Mongo host as an admin; the team picks the password, which goes
only into the server `.env`, never into git, chat or logs. Placeholders only:
```js
use lkb_prod
db.createUser({ user: "lkb_app", pwd: "<PASSWORD>", roles: [{ role: "readWrite", db: "lkb_prod" }] })
```
Then enable authentication (`security.authorization: enabled` in `mongod.conf`, restart
mongod; managed clusters already enforce it), bind Mongo to the server's IP only, and set
`MONGODB_URL` with the credentials as in section 2 (URL-encode special characters in the
password). Check: `mongosh "<MONGODB_URL>" --eval 'db.runCommand({ping:1})'`.

**REQUIRED for Ask: Mongo must be a replica set.** `POST /ask` (and `/graph`, session decisions)
read through a snapshot transaction (`apps/api/src/visibility/read-snapshot.ts`, no fallback). On a
standalone `mongod` every one of them fails with `Transaction numbers are only allowed on a replica
set member or mongos`, and Ask returns 503 `answer_history_unavailable` (the generic wrapper hides
the cause; `/health` stays 200). A one-node set is enough. Set it up in this order (the order matters, so you cannot lock yourself out):
1. Before you start: converting an existing standalone needs one `mongod` restart (brief downtime) and
   a backup first: `mongodump --uri "<MONGODB_URL>" --out /backup/pre-rs`. No data is lost.
2. Create the keyFile (required for `--replSet` once auth is on):
   `openssl rand -base64 756 > /etc/mongo-keyfile && chmod 400 /etc/mongo-keyfile && chown mongodb:mongodb /etc/mongo-keyfile`
   (use the real mongod user and group).
3. In `mongod.conf` set `replication.replSetName: rs0` and `security.keyFile: /etc/mongo-keyfile`.
   Do NOT set `security.authorization: enabled` yet. Restart mongod.
4. Initiate with an explicit host that the API container can reach (not `localhost`):
   `rs.initiate({_id:"rs0",members:[{_id:0,host:"<host-or-ip-reachable-from-the-api-container>:27017"}]})`.
5. Create the `lkb_app` user (section 6a above) on the primary, then set
   `security.authorization: enabled` and restart mongod. (If auth was already on, use the localhost
   exception from a shell on the Mongo host for `rs.initiate`, then authenticate as an admin.)
6. Recommended: add `replicaSet=rs0` to `MONGODB_URL` (with the explicit host above). Only if the member
   host cannot be made reachable from the API, use `directConnection=true` instead; it still supports
   the transaction, but then do not add `replicaSet`.
Check: `mongosh "<MONGODB_URL>" --eval 'db.hello().setName'` prints the set name.
Ask does NOT depend on the T-028 env in section 9.

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
2. TLS (decided: Let's Encrypt behind the team's proxy): no TLS is built in. Put Caddy
   (automatic Let's Encrypt, `app.example.org { reverse_proxy localhost:80 }` plus an
   API host `api.example.org { reverse_proxy localhost:3300 }`) or nginx with
   `certbot --nginx -d app.example.org -d api.example.org` in front. Open 80/443 for
   the ACME challenge. Use `https://` in `VITE_API_BASE_URL` and `CORS_ORIGINS`, rebuild
   web, and do not expose plain HTTP to the internet with real keys.
3. Database (decided, D-186): `lkb_prod`, with the dedicated user of section 6a. Never
   point a test deploy at it.
4. MongoDB network: accept only the server's IP. Mongo is not run by this compose file
   (the `local-dev` profile is an empty throwaway DB only).
5. The bot stays on the current Windows machine (section 5), pointed at the same
   `MONGODB_URL`/`MONGODB_DB`; the team owns the signed-in Chrome profile.

## 9. Launch feature flags (D-189)
At launch only T-028 counsellor accounts is on; T-013 avatar and T-014 championship wait.
- T-028 hosting env gates `/keys`, `/hosting`, `/webhooks`, operations schedules, automation and capture
  readiness. Without the five names, `/keys` answers 503 `hosting_unavailable` by design. Ask is unaffected.
- T-028: put all five in a separate file `.env.t028` next to `docker-compose.yml` (chmod 600,
  gitignored), NOT in `.env`. Compose reads it only if it exists, so without the file the
  five names stay undefined and everything works with T-028 off. Never create the file with
  blank or partial values: the API treats a defined-but-incomplete set (even an empty string) as a
  misconfiguration and answers every authenticated route 503. All five are required together:
  `LKB_HOSTING_STATE_DIR=/var/lib/lkb/hosting` and `LKB_COUNSELLOR_STATE_DIR=/var/lib/lkb/counsellor`
  (exactly these paths; they are the named volumes `lkb-hosting-state` and `lkb-counsellor-state`, so
  state survives restarts; back the volumes up too),
  `LKB_HOSTING_ENCRYPTION_KEY` (the code requires exactly 64 hex characters = 32 bytes; generate
  with `openssl rand -hex 32`, NOT base64, which is rejected),
  `LKB_HOSTING_BOOTSTRAP_ADMINS='{"toc":["<key-id>"]}'` (key ids from `mint-key`),
  `LKB_HOSTING_WEBHOOK_ORIGINS='["https://app.example.org"]'` (https origins only).
  WARNING: a partially filled `.env.t028` makes every authenticated route return 503: fill all five or
  none (delete the file to turn T-028 off).
  Single-quote the JSON values. Back the key up with the volumes; losing it makes stored account
  data unreadable. Never commit it. Then `docker compose up -d --build api`.
- T-014 championship: leave `LKB_CHAMPIONSHIP` unset (it is on only when `=1`).
- T-013 avatar: no environment flag exists; leave it unannounced. The `/counsellor` page
  ships in the web bundle either way.

## Update / rollback
`git pull && docker compose build api web && docker compose up -d api web`.
Roll back by checking out the previous commit and repeating. Migrations are not
reversed by this.
