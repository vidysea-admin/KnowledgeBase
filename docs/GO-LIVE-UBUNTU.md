# Go live on Ubuntu (Docker Compose, from `master`)

One doc, one path: API (port 3300) + web (nginx, port 80) from the root `Dockerfile`.
Deeper reference: `docs/docker-deployment.md`. No secrets belong in this file or in git.

Status of this guide: written from a static review of `Dockerfile`, `docker-compose.yml`
and the package scripts. The images were NOT built or run on the machine that wrote it
(no Docker there). Run the checks below once and report anything that fails.

## 0. Live deployment: state and remaining DevOps steps (as of 2026-10-26)
The app is deployed and reachable over HTTPS; nginx serves the UI and proxies the API under `/api`
on the same origin. Checked from outside on 2026-10-26: `/api/health` returns `{"db":"ok"}`.

Already done (do NOT redo):
- `lkb_prod` was populated on 2026-10-26 by copying `lkb_staging` (all collections and their indexes,
  including `migrations_changelog`; `api_keys` NOT copied). Counts matched source: 23 sessions,
  3238 turns, 1828 chunks, 1768 claims, 105 topics. Section 6 `migrate` therefore finds the DB
  already migrated. The local pipeline still writes `lkb_staging`; new data does not reach live
  until it writes `lkb_prod`.
- An operator admin key (all scopes, tenant `toc`, label `umesh-admin`) exists in `lkb_prod`. Its key
  id, for `LKB_HOSTING_BOOTSTRAP_ADMINS` in section 9, is `ab8eb0de-d7c9-43cc-8b3d-b1122065a943`.
  The raw key is held by the owner only. Do not mint another `first-key` unless the owner asks.

Remaining, in this order:
1. **MongoDB security, urgent.** On 2026-10-26 the Mongo host accepted connections from the internet
   with no credentials, and contained a database named `READ__ME_TO_RECOVER_YOUR_DATA` holding a
   ransom note (an automated attack on open MongoDB). Do not pay or contact the sender. Do:
   firewall port 27017 to the app server and office IPs only; create the `lkb_app` user and enable
   authorization (section 6a); update `MONGODB_URL` on the server and on the bot machine; check
   every database on that host for missing data and restore from backup where needed. The same
   host holds other Vidysea databases, so their owners must be told.
2. **Hosting (T-028), optional.** Without it, Settings → Keys and the Dashboard key tile show
   "API keys unavailable (hosting not configured)" (`/api/keys` → 503); everything else works.
   To enable, add all five names from section 9 to the main server `.env`, using
   `LKB_HOSTING_BOOTSTRAP_ADMINS='{"toc":["ab8eb0de-d7c9-43cc-8b3d-b1122065a943"]}'` and the app's
   https origin in `LKB_HOSTING_WEBHOOK_ORIGINS`, then `docker compose up -d --build api`.
   All five or none: a partial set makes every authenticated route return 503.
3. **Provider keys.** Setup wizard (`/setup`) reports `GEMINI_API_KEY` and `TAVILY_API_KEY` unset on the
   server. Without Tavily, Ask has no web fallback. Add them to the server `.env`, restart api.
4. **WhatsApp (ships at launch).** `/api/whatsapp/groups` returns 500 until the main `.env` has
   `WHATSAPP_MONGO_URL` (and `WHATSAPP_MONGO_DB`); `WHATSAPP_TENANT_OWNER_MAP` grants each tenant its
   owner (JSON array, see `docs/whatsapp/SETUP.md`). Compose forwards the three names from `.env`;
   an absent name stays undefined in the container (then `docker compose up -d --build api`).
5. Verify (with the owner's key):
   `curl -s -H "Authorization: Bearer <key>" https://<server>/api/system-status` shows non-zero
   `sessions`, and `/api/keys` returns 200 once step 2 is done.

Full page-by-page audit of the live app: `references/portals/lkb-live.knowledge.md`.

## 1. Prerequisites
- Ubuntu 22.04+ with Docker Engine and Docker Compose v2.24 or newer (`docker compose version`).
  Older compose is untested with `docker-compose.yml`. Upgrade:
  `sudo apt-get update && sudo apt-get install --only-upgrade docker-compose-plugin` (Docker's apt repo).
- Outbound HTTPS (npm, GitHub release download of yt-dlp during build, Ollama Cloud).
- A reachable MongoDB (NOT containerized by default) and an Ollama Cloud key.
  A MongoDB replica set (a single-node replica set is fine) is RECOMMENDED but no longer required: a
  standalone `mongod` works for Ask with a consistency caveat, see section 6a.
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
- `MONGODB_DB=lkb_prod` required, no default. D-186 authorizes the deployed app.
  D-196 protects both `lkb` and `lkb_prod` (case-insensitively) on shared work/test
  paths: set `MONGO_WORK_DB` to a separate isolated database, never either production
  alias. Capture children must select that work database independently of the app
  parent. `global_university_db` remains refused; `lkb_staging` requires the exact
  `LKB_ALLOW_STAGING=lkb_staging` opt-in. Production-enabled scripts require all three:
  caller `allowProduction`, `--i-know-this-is-production`, and explicit canonical
  `MONGODB_DB=lkb` or `MONGODB_DB=lkb_prod`. These select a capability; approval to
  execute a production write is still a separate human gate (section 6).
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
- WhatsApp (launch feature): `WHATSAPP_MONGO_URL`, `WHATSAPP_MONGO_DB`, `WHATSAPP_TENANT_OWNER_MAP`.
  T-028: the five names of section 9. Compose forwards all of these from `.env` as value-less
  pass-through: a name that is absent stays UNDEFINED in the container. Never leave a blank `NAME=`
  line in `.env` for them (a blank line defines an empty string); comment the line out instead.
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
  with an isolated `MONGO_WORK_DB` selected for capture children, until Linux is proven.

## 6. First-run database step
Compose never migrates by itself. After separate human approval for the specific
migration and target database, run it deliberately:
```sh
docker compose --profile migrate run --rm migrate
```
It writes to `MONGODB_DB`. D-186 deployed-app authority does not authorize this
migration. Under D-197, `config/migrate-mongo-config.cjs` independently refuses
`lkb_prod`, including case/whitespace variants, with or without production opt-in.
Its existing production path accepts only explicit canonical `MONGODB_DB=lkb`
with the required opt-in. The `lkb_prod` app configuration above therefore cannot
run this migration; do not rename the target to get past the guard. A migration
for that target remains blocked pending a separately authorized implementation.
Neither supported configuration nor `LKB_I_KNOW_THIS_IS_PRODUCTION=1` is human approval.
After separate approval to create the production key, mint it for the UI/API
(printed once, store it safely):
```sh
pnpm install --frozen-lockfile
node scripts/mint-key.mjs --tenant toc --label first-key --i-know-this-is-production
```
Use explicit `MONGODB_DB=lkb_prod`; do not set `MONGO_WORK_DB=lkb_prod`. The script's
production opt-in does not apply to work/test captures or authorize other writes.
For the first operator admin key (every scope, incl. `answer-policy:*`, `automation:*`, `hosting`, `jobs`), add `--all-scopes`; for a narrower key use `--scopes answer-policy:read,jobs`.
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

**Replica set RECOMMENDED; a standalone mongod also works for Ask (w27-standalone).** `POST /ask`
(and `/graph`, session decisions) read through a snapshot transaction
(`apps/api/src/visibility/read-snapshot.ts`). MongoDB refuses transactions on a standalone `mongod`
(`Transaction numbers are only allowed on a replica set member or mongos`). The API now detects the
topology once per connection (`hello`: no `setName` and not a mongos means standalone; override with
`LKB_MONGO_STANDALONE=1` to force standalone or `=0` to force replica-set behaviour) and on a standalone
runs the SAME tenant-scoped queries without a session or transaction, at readConcern `local`.

Consistency caveat on standalone: the reads of one request are no longer a single point-in-time
snapshot across collections, so a request racing a publication may see it half-applied (for example a
new tree root with the previous session page). Every read is still tenant-scoped and the visibility
gates still re-check authority per read, so the risk is a momentarily stale or incomplete answer, not a
cross-tenant read. Use a replica set when you need the stricter guarantee.

Writes on standalone: index publication (`publishIndexWithCommit`), native publication
(`runNativePublicationTransaction`) and the transcript-review refresh run without a transaction. They are
safe because publication is a pointer flip, not a multi-document commit: artifacts are written under a
fresh generation id, `sessions.indexAttempt` is flipped to complete by ONE conditional single-document update,
and readers (`verifyIndexGeneration`) serve only a complete generation whose artifacts match the manifest
digests. A crash before the flip leaves the session hidden (fail closed); a crash after it leaves the new
generation live. A crashed or failed run leaves the attempt `uncertain`/`running`, and a new attempt for that
session is refused until an operator recovers it (unchanged rule: no automatic takeover of possibly-written
state). Re-indexing a live session rewrites its artifacts in place, so that session is briefly hidden.

Non-atomic on standalone (they run, but without all-or-nothing):
- Transcript-review `mutate` bumps the native publication revision before the review-head compare-and-swap, so a lost swap leaves the bump: native publications are hidden (availability only).
- Speaker-suggestions `decide` checks currency, bumps, then confirms without a transaction, so a concurrent root-only source swap can interleave in a narrow window.
- Refresh executor: a crash mid-refresh can show partially rewritten graph edges until the refresh retries.

`LKB_MONGO_STANDALONE=1` can only confirm a standalone: if `hello` reports a replica set or mongos it is ignored with a warning and transactions stay in use. `=0` forces transactions.

Still refuse with a 503 on standalone (a half-applied write there would be visible, so they need a replica
set): WhatsApp review store/decide, invalidation and the quarantine audit, and speaker attribute and
relationship edits. They are not needed for Ask.

Unknown store failures on Ask now return 503 `store_unavailable` (the real cause is logged server-side,
secrets redacted) instead of the misleading `answer_history_unavailable`.

To convert to a one-node replica set anyway, follow this order exactly. `security.keyFile` turns authorization on by
implication, so the admin user must exist BEFORE the keyFile is added, or the localhost exception
closes with no admin and you are locked out:
1. Back up first: `mongodump --uri "<MONGODB_URL>" --out /backup/pre-rs`. Converting an existing
   standalone needs mongod restarts (brief downtime); no data is lost.
2. Set `replication.replSetName: rs0` in `mongod.conf` (or `--replSet rs0`), with NO `security.keyFile`
   and no authorization yet. Restart mongod.
3. Initiate with an explicit host the API container can reach (not `localhost`):
   `rs.initiate({_id:"rs0",members:[{_id:0,host:"<host-or-ip-reachable-from-the-api-container>:27017"}]})`.
4. On the primary create an admin user, then the app user:
   `use admin` then `db.createUser({user:"admin",pwd:"<ADMIN-PASSWORD>",roles:["root"]})`
   (or `userAdminAnyDatabase` + `clusterAdmin`), then `use lkb_prod` and create `lkb_app` with
   `readWrite` on `lkb_prod` as in the block above. If users already exist, skip creating the admin and
   use your existing admin.
5. Create the keyFile: `openssl rand -base64 756 > /etc/mongo-keyfile && chmod 400 /etc/mongo-keyfile && chown mongodb:mongodb /etc/mongo-keyfile`
   (use the real mongod user and group). Add `security.keyFile: /etc/mongo-keyfile` to `mongod.conf`
   (this implies `authorization`). Restart mongod.
6. Verify: `mongosh -u admin -p --authenticationDatabase admin --eval 'rs.status().ok'` prints 1.
7. Set `MONGODB_URL` with `replicaSet=rs0` and the explicit host above (recommended). Only if the member
   host cannot be made reachable from the API, use `directConnection=true` instead of `replicaSet`.
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
- T-028: put all five in the main server `.env` (chmod 600, gitignored). Compose forwards them to the
  api container as value-less pass-through, so when a name is absent from `.env` it stays undefined and
  everything works with T-028 off. Never write blank or partial values: the API treats a
  defined-but-incomplete set (even an empty string, i.e. a blank `NAME=` line) as a misconfiguration and
  answers every authenticated route 503. All five are required together:
  `LKB_HOSTING_STATE_DIR=/var/lib/lkb/hosting` and `LKB_COUNSELLOR_STATE_DIR=/var/lib/lkb/counsellor`
  (exactly these paths; they are the named volumes `lkb-hosting-state` and `lkb-counsellor-state`, so
  state survives restarts; back the volumes up too),
  `LKB_HOSTING_ENCRYPTION_KEY` (the code requires exactly 64 hex characters = 32 bytes; generate
  with `openssl rand -hex 32`, NOT base64, which is rejected),
  `LKB_HOSTING_BOOTSTRAP_ADMINS='{"toc":["<key-id>"]}'` (key ids from `mint-key`),
  `LKB_HOSTING_WEBHOOK_ORIGINS='["https://app.example.org"]'` (https origins only).
  WARNING: a partial set makes every authenticated route return 503: fill all five or none (comment
  them out or delete them to turn T-028 off). The old optional `.env.t028` file is retired: compose no
  longer reads it. If a server already has one, move its five lines into `.env` and delete the file.
  Single-quote the JSON values. Back the key up with the volumes; losing it makes stored account
  data unreadable. Never commit it. Then `docker compose up -d --build api`.
- T-014 championship: leave `LKB_CHAMPIONSHIP` unset (it is on only when `=1`).
- T-013 avatar: no environment flag exists; leave it unannounced. The `/counsellor` page
  ships in the web bundle either way.

## Recovering a stuck index attempt
A session whose index attempt is `uncertain` (or `running` after a crash) stays hidden and the next index run refuses it
(`index_attempt_requires_recovery`). Recover ONE session at a time (no bulk mode); dry run first:
`node scripts/operations/recover-index-attempt.mjs --tenant <t> --session <s>` shows the attempt state, generation, age
and any artifacts tagged with that generation. Then add `--apply --reason "<why>"` to reset it to `failed/preflight` so a
fresh index run can claim it (one conditional update; a changed attempt gives `conflict` and writes nothing; who/when/why
are stored in `sessions.indexRecovery`). A `running` attempt under 30 min old is refused unless `--force-running`.
Database rules are the usual script guard (`lkb_staging` with `MONGO_WORK_DB`/`LKB_ALLOW_STAGING`; production only with
`--i-know-this-is-production` and `MONGODB_DB=lkb`). Nothing is deleted: leftover artifacts of the abandoned generation
stay invisible and the next index run rewrites them.

## Update / rollback
`git pull && docker compose build api web && docker compose up -d api web`.
Roll back by checking out the previous commit and repeating. Migrations are not
reversed by this.


## D-192 cross-host Calendar and Gmail worker

A hosted container cannot use the Windows Google CLI credentials. Deploying the code exposes the authenticated bridge; it does not configure or start its Windows worker.

Set these names in the hosted compose environment (the main `.env`):
- `LKB_CALENDAR_WORKER_ENABLED=1`
- `LKB_CALENDAR_WORKER_BINDINGS` to a JSON array of `{tenantId,keyId,account,hostId}`. Pin a deliberately issued active worker key, the connected Google account and the Windows host. The key must hold `calendar`, `gmail` and `operations:write`; do not grant these silently to existing keys.
- `LKB_JOIN_RULES_ENABLED=1`. Compose persists the authoritative rules at `/var/lib/lkb/join-rules`.

On the Windows worker set `LKB_TENANT_ID`, `LKB_API_URL=https://<host>/api`, the dedicated `LKB_API_KEY`, and the SAME `LKB_CALENDAR_WORKER_HOST_ID`. Google credentials remain on Windows. Start discovery without recording:

```sh
node scripts/webinar/run-pipeline.mjs --calendar-attendance-account umeshsugara@vidysea.com --discovery-only --watch
```

The loop polls every five minutes. Two missed cycles retain the inventory with a stale warning and hold new scheduling. A failed upload cannot renew old coverage. Calendar inventory starts at the verified Google Calendar's local day boundary; scan freshness uses actual acquisition time. Gmail defaults to the last 30 days, with bounded pagination and 10 body reads at once. Large messages are processed in bounded chunks; a content/link limit failure never becomes successful empty coverage.

Choose `attendanceMode: all` explicitly in the existing Join Rules editor for initial all-join validation. Deny and opt-out take precedence. Recording still requires genuine audio/video proof, reviewed independent slots and an isolated work database. Discovery-only never invokes capture/readiness or registration submission. No test recording is promoted to counselling knowledge automatically.

`POST /gmail/scan` retains its work-database fence. The web client now obtains the authenticated `X-LKB-Work-DB` binding before submitting it. A hosted app without an isolated scan database must report that missing configuration; never point a test scan at counselling production just to remove the error.

CI code deployment, configured bridge, active Windows discovery, actual attendance and production data promotion are separate states. Verify the hosted Calendar against the SAME source snapshot after rollout; do not reuse an earlier event count after the source/window changes.
