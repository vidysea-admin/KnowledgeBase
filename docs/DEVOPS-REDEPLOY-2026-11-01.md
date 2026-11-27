# Redeploy runbook for DevOps (2026-11-01)

> 2026-11-24: the VM steps (sections 1-8 below) are superseded by D-215 for the go-live. Follow the Cloud Run section first. Sections 1-8 stay as reference (env names, smoke checks, rollback ideas).

Goal: get the live site to the current `master`, keep it at `https://vidysea.com/knowledgebase/`, and make Mongo safe.
Names only. Never paste a secret into chat, git or a ticket. Never print `.env`.
Longer background: `docs/GO-LIVE-UBUNTU.md` (GL), `docs/user-accounts/ops.md` (UA), `docs/DEVOPS-HANDOVER.md`.

## Cloud Run go-live (D-215, 2026-11-24) — supersedes the VM steps below

State on 2026-11-24: the vendor stopped VM 34.47.136.12 on 2026-11-23, so `www.vidysea.com/knowledgebase` (302 to `https://34.47.136.12:8081/`) is dead and `kb.vidysea.com` has no DNS. The Cloud Run service `vidysea-knowledgebase` (project `vidysea-prod`, `asia-south1`) is API-only today: its pages say "Internal preview build", every app route answers 401, and on 2026-11-13 it ran `lkb_staging`. Names only below; secrets live in Secret Manager.

**Who does what.** Vendor: Cloud Build trigger from `master` (`ce5cef49`, contains `d521fec0`), the two-container service, the load balancer, Cloudflare DNS, the AWS ALB rule, the ingress lock. We supply the names and values through an agreed secure channel; the vendor applies them in Cloud Run and Secret Manager. We also run the smoke checks, first admin and indexing. Every DNS, LB, ALB, ingress and server step is shown to Umesh first and runs on his yes.

**Safety.** Merging to master triggers the vendor's Cloud Build deploy; do not merge or push to master without Umesh's yes and a heads-up to the vendor.

**Shape.** ONE Cloud Run service, TWO containers, both built from the root `Dockerfile`. No code change. Web starts after api.

| | web (ingress) | api (sidecar) |
|---|---|---|
| Build | `--target web` | `--target api` |
| Port | `PORT=8080` (Cloud Run sets it; nginx `listen ${PORT}`, nginx.conf:10; image default 80, Dockerfile:68) | no `PORT` set by us (Cloud Run injects `PORT` into the ingress container only and documents it as not user-settable); it listens on 3300 by default, `Number(process.env.PORT ?? 3300)` (server.ts:201), and `API_UPSTREAM=http://127.0.0.1:3300` relies on that |
| Probe | `GET /healthz` (200 `ok`, nginx.conf:18-22) | startup probe `GET /health` (health.ts:158; no auth, mounted before `requireAuth`, server.ts:134 vs :136; 503 if Mongo or a watcher-heartbeat read fails, health.ts:171-173) |
| Env | `APP_BASE_PATH=/knowledgebase`, `API_UPSTREAM=http://127.0.0.1:3300`, `APP_USER_ACCOUNTS=1` | see below |

`API_UPSTREAM` must be `127.0.0.1`: the compose default `http://api:3300` does not resolve on Cloud Run. nginx strips the prefix, so `/knowledgebase/api/health` reaches `/health` (nginx.conf:25-34). Leave `APP_API_BASE` and `VITE_API_BASE_URL` empty.

**api env.** Plain: `MONGODB_DB=lkb_prod` (no `LKB_I_KNOW_THIS_IS_PRODUCTION`; `lkb_prod` needs no opt-in, db-name.ts:25-31; remove `LKB_ALLOW_STAGING`), `USER_SIGNUP_TENANT=toc`, `APP_PUBLIC_ORIGIN=https://kb.vidysea.com`, `CORS_ORIGINS=https://kb.vidysea.com`, `APP_BASE_PATH=/knowledgebase`, `LKB_ASK_FAST_DEADLINE_MS=150000`, `TRUST_PROXY_HOPS` (measured, see check 8). Secrets (Secret Manager): `MONGODB_URL`, `OLLAMA_API_KEY`, `GEMINI_API_KEY`, `AUTH_CSRF_SECRET` (32+ bytes, the vendor generates it directly in Secret Manager, never print it). Optional, not needed for go-live: `TAVILY_API_KEY`, `LKB_HOSTING_*`, the WhatsApp Mongo settings. Leave every `*_STATE_DIR` and `LKB_SOURCE_INTAKE` unset. `NODE_ENV=production` comes from the image (Dockerfile:113); it makes the cookie `Secure` with the `__Secure-` prefix (cookie.ts:37-40).

**Service settings.** Request timeout 300 s (matches nginx 300 s, nginx.conf:32-33). Max instances 1 at launch: the per-IP and per-key window limiters (`rate-limit.ts:16-33`, express-rate-limit default memory store; `user-accounts/throttle.ts:81-83`, `Map`) are in memory; the login lockout state is in Mongo (`auth_throttles`, `composition/integrations/user-accounts.ts:88-108`); sessions and CSRF are Mongo/HMAC, so scaling later is safe. `--no-cpu-throttling` recommended: usage rows are written after the response (server.ts:138). The Mongo host allow-list must admit the service's egress (Direct VPC egress / NAT address).

**Public path.** Global external HTTPS load balancer + serverless NEG + Google-managed certificate (Cloud Run domain mapping is preview and not offered in `asia-south1`). Cloudflare A record `kb` -> LB IP, DNS only. The site root `/` is NOT served: only `/knowledgebase` and `/knowledgebase/` (nginx.conf:38,45), so `/` gives 403/404. The LB should redirect `/` to `/knowledgebase/`.

**First admin (needs Umesh's yes; writes `lkb_prod`).** There is no compose `indexer` here. Run from a laptop with the repo checked out, deps installed, and a network path to Mongo (allow-listed IP). `MONGODB_URL` in the environment, never echoed:
```sh
read -rs ADMIN_PASSWORD; echo             # 12+ characters
printf '%s' "$ADMIN_PASSWORD" | MONGODB_DB=lkb_prod node scripts/create-admin.mjs --tenant toc --email <admin-email> --i-know-this-is-production
unset ADMIN_PASSWORD                      # exit 0 = created or already admin; 3 = email exists, untouched; 1 = refused
```

**Indexing (needs Umesh's yes; writes `lkb_prod`).** Same laptop, `OLLAMA_API_KEY` (and `GEMINI_API_KEY` for transcribe) in the environment. Dry run first, then the real run (sync-session.mjs:25-27, 60-75):
```sh
node scripts/webinar/sync-session.mjs <sessionId> --index-existing --tenant toc --grounded-notes --dry-run
MONGO_WORK_DB=lkb_prod MONGODB_DB=lkb_prod node scripts/webinar/sync-session.mjs <sessionId> --index-existing --tenant toc --grounded-notes --i-know-this-is-production
```
About 35 min per grounded session; never kill it midway (a killed run leaves the attempt `running`; see section 6 and GL 493-502). A Cloud Run Job (image `--target build`, task timeout 1 h or more, max retries 0) can take this over later.

**Smoke checks.** Run the list below first against the run.app URL (`B=https://<service>.run.app/knowledgebase`), then against `B=https://kb.vidysea.com/knowledgebase` once DNS and the certificate work. Keep the header `Origin: https://kb.vidysea.com` on the sign-in call in both runs, because `APP_PUBLIC_ORIGIN` is fixed. This reuses section 7 with the new base.
```sh
B=https://kb.vidysea.com/knowledgebase
curl -s -o /dev/null -w '%{http_code} [%{redirect_url}]\n' $B/     # 1. 200 []
curl -fsS $B/ | grep -o '<base href="[^"]*"'                        # 2. <base href="/knowledgebase/"
JS=$(curl -fsS $B/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1); echo "$JS"   # 3. NOT index-B4U1QW49.js
curl -fsS $B/config.js                                              # 4. see expected line below
curl -fsS $B/api/health                                             # 5. {"db":"ok"}
curl -s -o /dev/null -w '%{http_code}\n' $B/api/auth/session        # 6. NOT 404 (404 = accounts off)
curl -s -o /dev/null -w '%{http_code}\n' $B/watch                   # 7. 200 (SPA deep link)
```
4. Expected `config.js` (written by 40-lkb-runtime-config.sh:19), one line: `window.__LKB_CONFIG__ = { basePath: "/knowledgebase", apiBase: "", userAccounts: true };`
5. A 401 on any app route means the old API-only build is still serving.
8. Sign-in and rate limit, after the first admin exists (needs Umesh's yes; writes `lkb_prod` auth rows: a session and auth events on sign-in, about 25 `auth_throttles` rows from the loop, composition/integrations/user-accounts.ts:94-101). Use section 7's sign-in call with `Origin: https://kb.vidysea.com`: HTTP 200 and `Set-Cookie: __Secure-lkb_sid=<redacted>; Path=/knowledgebase/api; HttpOnly; Secure; SameSite=Strict` (cookie.ts:44). Then run the forged `X-Forwarded-For` loop in `docs/user-accounts/ops.md` section 4 with `BASE=$B`: about 20 x 401, then 429. This measurement sets `TRUST_PROXY_HOPS`; never guess it. On Cloud Run the chain is client -> Google LB -> Cloud Run front end -> nginx (appends `X-Forwarded-For`, nginx.conf:30) -> api. All 401 means the value is too high; lower it and repeat. Cross-check the api log line `trust proxy: effective hops=N`. The run.app chain has no LB, so measure again on `kb.vidysea.com`.

**Last steps, in order.** (a) Checks 1-8 pass on the run.app URL and on `kb.vidysea.com`. (b) On Umesh's yes, the vendor sets the AWS ALB rule `/knowledgebase*` to a path-keeping 302 to `https://kb.vidysea.com/#{path}?#{query}`; then check `curl -sI https://www.vidysea.com/knowledgebase/ | grep -i '^location'` shows the kb host and the path. (c) On Umesh's yes, the vendor locks Cloud Run ingress to internal + Cloud Load Balancing; re-run 1-7 on `kb.vidysea.com` and confirm the run.app URL no longer answers from outside. Rollback before (b): nothing public changed. After (b): the vendor reverts the ALB rule (that returns to the dead VM link, so fix forward where possible).

## What we found today (2026-11-01)

- `https://vidysea.com/knowledgebase/` redirects the browser to `https://34.47.136.12:8081/` (a raw IP) and serves an old bundle, `index-B4U1QW49.js`.
  That bundle is from before PR #33: no csrf, no `whatsapp/links`, no qrcode, no `<base href>`. The 30 Oct redeploy never happened.
- `master` is at `a5e475e9` (PR #34 merged), plus later qa-only commits. Deploy `master`, any commit at or after `a5e475e9`.
- Production Mongo `13.202.206.101:27017` timed out from outside today. Mongo security (H1) is not confirmed.

## Compose env forwarding: fixed in bc89648d (D-212)

Earlier, `docker-compose.yml` passed none of the account or archiver variables, so `.env` values never reached the containers.
Commit `bc89648d` (D-212, approved by Umesh 2026-11-01) adds value-less pass-through lines:
api: `AUTH_CSRF_SECRET` `USER_SIGNUP_TENANT` `USER_SIGNUP_DAILY_CAP` `APP_PUBLIC_ORIGIN` `APP_BASE_PATH` `TRUST_PROXY_HOPS` `WHATSAPP_ARCHIVER_API_URL` `WHATSAPP_ARCHIVER_API_TOKEN` `WHATSAPP_ARCHIVER_API_ALLOW_PRIVATE_HTTP`;
web: `APP_USER_ACCOUNTS`.
Deploy a commit that contains `bc89648d` (check: `git merge-base --is-ancestor bc89648d HEAD && echo OK`). No override file is needed.
Until that commit is on `master`, it lives on branch `docs/devops-golive-2026-10-26`; ask Umesh which ref to deploy.

## 1. Pre-checks (10 min)

| Step | Command | Source |
|---|---|---|
| Record what is running now | `cd <repo> && git log -1 --oneline && docker compose ps && docker compose images` | |
| Tag the old images (fast rollback) | `docker tag <old-api-image> <old-api-image>:pre-2026-11-01` (same for web; names from `docker compose images`) | |
| Back up `.env` (keep mode 600, do not print) | `cp -p .env ../env.backup.2026-11-01 && chmod 600 ../env.backup.2026-11-01` | GL 64 |
| Back up the state volumes | `docker run --rm -v lkb-hosting-state:/v -v "$PWD":/b alpine tar czf /b/hosting-state.tgz -C /v .` and the same for `lkb-counsellor-state`, `lkb-join-rules-state` | compose 192-196, GL 433 |
| Back up Mongo (run on the app host; URL stays in a variable, never echoed) | `mongodump --uri "$MONGODB_URL" --db lkb_prod --out /backup/pre-2026-11-01` | GL 375 |
| Fetch and pick the target | `git fetch origin && git checkout master && git pull --ff-only && git log -1 --oneline` | |
| Confirm it contains PR #34 and the compose fix | `git merge-base --is-ancestor a5e475e9 HEAD && git merge-base --is-ancestor bc89648d HEAD && echo OK` must print `OK` | |
| No blank env lines for pass-through names | `grep -nE '^(LKB_HOSTING_[A-Z_]+\|LKB_COUNSELLOR_STATE_DIR\|WHATSAPP_[A-Z_]+)=$' .env` must print nothing | GL 95 |

## 2. H1: Mongo security (do this first; it is urgent)

On 2026-10-26 this Mongo host answered the internet with no password and held a ransom-note database (GL 25-31). Today it timed out from outside, which may mean a firewall is now in place, or the host is down. Confirm, do not assume.

1. Firewall: port 27017 open to the app host only (plus office IPs if the owner wants). Use the cloud security group or `ufw`.
2. Auth on: `lkb_app` user with `readWrite` on `lkb_prod` only, and `security.authorization: enabled` in `mongod.conf` (GL 322-332). If the host is a replica set with `security.keyFile`, authorization is already implied.
3. From OUTSIDE the network: `nc -vz -w 5 13.202.206.101 27017` must time out or be refused.
4. From the app host, without credentials: `mongosh --host 13.202.206.101 --eval 'db.adminCommand({listDatabases:1})'` must fail with an authentication error.
5. From the app host, with the app URL: `mongosh "$MONGODB_URL" --eval 'db.runCommand({ping:1})'` must return `ok: 1`.
6. `MONGODB_URL` in `.env` uses `lkb_app` and `MONGODB_DB=lkb_prod`. Other Vidysea databases share this host: tell their owners.

## 3. Pull, build, up

```sh
docker compose config -q                 # no output = env is complete (MONGODB_URL, MONGODB_DB, OLLAMA_API_KEY are required: compose 51, 53, 60)
docker compose build api web             # several minutes
docker compose up -d api web
docker compose ps                        # api and web: Up (healthy)
docker compose logs --tail=40 api        # MONGODB_URL=set MONGODB_DB=set OLLAMA_API_KEY=set (Dockerfile 125-136)
docker compose logs --tail=5 web         # "lkb: web base path '/knowledgebase' ... user accounts true|false" (40-lkb-runtime-config.sh:32)
```
Keep `WEB_PORT` equal to the port the front proxy points at (live uses 8081; compose default is 8080: compose line 116).
Do not run `migrate`. `lkb_prod` is already migrated and the migrate guard refuses it (GL 15-18, 303-309).

## 4. Proxy fix: keep the public URL on vidysea.com/knowledgebase

What this repo does: the web container serves `/knowledgebase/` and sends `/knowledgebase/api/*` to the api with `/knowledgebase/api/` cut off (nginx.conf:24-26). It never redirects to a host or port (`absolute_redirect off`, nginx.conf:14).
So the redirect to `34.47.136.12:8081` comes from OUTSIDE this repo. We do not know the outer proxy. Find it:

1. `curl -sI https://vidysea.com/knowledgebase/ | grep -i '^location'` shows where it sends you.
2. On the vidysea.com front proxy (nginx, load balancer or CDN, whichever it is), search for `34.47.136.12`, `8081`, `return 30x`, `rewrite` and `proxy_redirect` for the `/knowledgebase` path. Remove any redirect to the IP.
3. Required end state for `/knowledgebase/` (GL 132-146, UA section 3):
   - Pass to `http://<LKB-SERVER>:<WEB_PORT>` with the FULL original path. No rewrite, no prefix strip, no path after the port in `proxy_pass`.
   - Forward `Host`, `Cookie`, `Origin`, `X-Forwarded-For` (append) and `X-Forwarded-Proto` (`https`).
   - Do not hide or rewrite `Set-Cookie` (no `proxy_cookie_path`, no `proxy_hide_header Set-Cookie`). Do not cache `/knowledgebase/api/*`.
   - `client_max_body_size 1g`, `proxy_read_timeout 300s`.
   - HTTPS ends at the vidysea.com edge. The session cookie is `__Secure-lkb_sid`, `Path=/knowledgebase/api` (UA 44-54; cookie.ts). One origin, https only. A redirect to `https://<ip>:8081` breaks cookie sign-in, because the cookie belongs to vidysea.com.
4. After the flip, firewall `WEB_PORT` so only the front proxy can reach it.
Unknown to us: the proxy product and its config location. Check them; do not guess.

## 5. Env to set (names only; values from the owner; in the server `.env`, mode 600)

| Name | Where | Need | Note | Source |
|---|---|---|---|---|
| `MONGODB_URL`, `MONGODB_DB` (= `lkb_prod`), `OLLAMA_API_KEY` | api | required | no defaults | compose 51, 53, 60 |
| `APP_BASE_PATH` (= `/knowledgebase`) | web AND api | required | forwarded to api since bc89648d (D-212) | compose 110, UA 19 |
| `WEB_PORT` | web | required | as in section 3 | compose 116 |
| `CORS_ORIGINS` (= `https://vidysea.com`) | api | required | exact origin, no path | compose 58 |
| `VITE_API_BASE_URL`, `APP_API_BASE` | build / web | leave EMPTY | same-origin proxy | GL 125-126 |
| `AUTH_CSRF_SECRET` | api | required for accounts | 32+ bytes. Generate without printing: `printf 'AUTH_CSRF_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env`. Short or missing: accounts silently off | user-accounts.ts:132 |
| `USER_SIGNUP_TENANT` (= `toc`) | api | required for accounts | unset: signup and login answer 503 | user-accounts.ts:138-140 |
| `APP_PUBLIC_ORIGIN` (= `https://vidysea.com`, no path) | api | required for accounts | CSRF origin and link base | user-accounts.ts:134, admin-service.ts:102 |
| `TRUST_PROXY_HOPS` | api | required for accounts | 2 expected (front proxy, web nginx). Verify with UA section 4 | user-accounts.ts:40 |
| `USER_SIGNUP_DAILY_CAP` | api | optional | default 200 | user-accounts.ts:123 |
| `APP_USER_ACCOUNTS` (= `1`) | web | required to show sign-in | UI switch only; exact `1` or `true` | 40-lkb-runtime-config.sh:14-17 |
| `WHATSAPP_MONGO_URL`, `WHATSAPP_MONGO_DB`, `WHATSAPP_TENANT_OWNER_MAP` | api | WhatsApp groups | else `/whatsapp/groups` is 500 | compose 83-85, GL 40-42 |
| `WHATSAPP_ARCHIVER_API_URL`, `WHATSAPP_ARCHIVER_API_TOKEN` | api | optional until the archiver is deployed (W2b) | set both or neither; https only | archiver/config.ts:13-14,5-7 |
| `GEMINI_API_KEY`, `TAVILY_API_KEY` | api | optional | Tavily gives Ask a web fallback | compose 64-65 |
| `LKB_HOSTING_*` (5 names) | api | all five or none | a partial set makes every authed route 503 | GL 430-442 |

Never leave a blank `NAME=` line for the pass-through names: comment it out. Then `docker compose up -d api web`.

## 6. First admin and indexing (both write `lkb_prod`: get Umesh's yes first)

Runs inside Docker through the opt-in `indexer` compose service (the `build` stage, which carries `scripts/`, the workspace sources and tsx), so the server needs no Node or pnpm. It reads `MONGODB_URL`, `MONGODB_DB`, `OLLAMA_API_KEY` and `GEMINI_API_KEY` from the server `.env`, like the api. Build it once after each pull: `docker compose build indexer`.

```sh
read -rs ADMIN_PASSWORD; echo             # 8+ characters
printf '%s' "$ADMIN_PASSWORD" | docker compose run --rm -T -e MONGODB_DB=lkb_prod indexer node scripts/create-admin.mjs --tenant toc --email <admin-email> --i-know-this-is-production
unset ADMIN_PASSWORD                      # exit 0 = created or already admin; 3 = email exists, untouched; 1 = refused
```
(create-admin.mjs header lines 1-14; UA 107-121.)

Ask only answers from sessions that have a built tree. Legacy-seeded pages are excluded by the eligibility gate. Index each session, dry run first:
```sh
docker compose run --rm indexer node scripts/webinar/sync-session.mjs <sessionId> --index-existing --grounded-notes --tenant toc --dry-run
docker compose run --rm -e MONGO_WORK_DB=lkb_prod -e MONGODB_DB=lkb_prod indexer node scripts/webinar/sync-session.mjs <sessionId> --index-existing --grounded-notes --tenant toc --i-know-this-is-production
```
(sync-session.mjs:30, 60-75; GL 447-468.) Needs a provider key in the server `.env`: `OLLAMA_API_KEY` for summarize, claims and answer; `GEMINI_API_KEY` only for transcribe (config/ai-routing.yaml:3-14). Ask Umesh for the session ids. One session at a time. Always pass `--grounded-notes`: without it indexing is all-or-nothing and one rejected note fails the whole session. Grounded indexing is slow (about 35 min for a 64-turn session), so run it with no short timeout and never kill it mid-run: a killed run leaves the attempt `running` and the next run stops with `index_attempt_requires_recovery`. A stuck attempt: GL 493-502.

Ask uses a 20 s fast deadline by default and a real LLM answer can take about 26 s, which then shows as 'stale' with 0 sources (ISS-454). Compose now forwards `LKB_ASK_FAST_DEADLINE_MS` to the api (value-less, only when present in `.env`): set `LKB_ASK_FAST_DEADLINE_MS=150000` in the server `.env` and recreate the api, or ask in deep mode.

## 7. Smoke checks (run from outside, then from the server)

```sh
B=https://vidysea.com/knowledgebase
curl -s -o /dev/null -w '%{http_code} [%{redirect_url}]\n' $B/           # 200 []   (no redirect to an IP)
curl -fsS $B/ | grep -o '<base href="[^"]*"'                             # <base href="/knowledgebase/"
JS=$(curl -fsS $B/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1); echo "$JS"   # NOT index-B4U1QW49.js
curl -fsS "$B/$JS" | grep -c 'csrf'                                      # 1 or more
curl -fsS "$B/$JS" | grep -c 'whatsapp/links'                            # 1 or more
curl -fsS $B/config.js    # window.__LKB_CONFIG__ = { basePath: "/knowledgebase", apiBase: "", userAccounts: true };
curl -fsS $B/api/health                                                  # {"db":"ok"}  (HTTP 200; 503 {"db":"error"} if Mongo is down: health.ts:161,173)
curl -s -o /dev/null -w '%{http_code}\n' $B/api/auth/session             # NOT 404 (404 = accounts off: route not mounted, server.ts:105)
curl -s -o /dev/null -w '%{http_code}\n' $B/watch                        # 200 (SPA deep link)
```
If a grep count is 0, the string may sit in another lazy chunk: grep every `assets/*.js` named in the page, and report if none match.
Server side: `curl -fsS http://localhost:3300/health` and `curl -fsS http://localhost:<WEB_PORT>/knowledgebase/api/health` both `{"db":"ok"}`.

Sign-in (after section 6; password from a prompt, cookie value redacted):
```sh
read -rs P; printf '{"email":"<admin-email>","password":"%s"}' "$P" | curl -si -X POST $B/api/auth/login -H 'Content-Type: application/json' -H 'Origin: https://vidysea.com' --data-binary @- | sed -E 's/(__Secure-lkb_sid=)[^;]*/\1<redacted>/' | grep -iE '^HTTP|set-cookie'; unset P
# HTTP 200 and: Set-Cookie: __Secure-lkb_sid=<redacted>; Path=/knowledgebase/api; HttpOnly; Secure; SameSite=Strict
```
Then run the forged `X-Forwarded-For` loop in UA section 4 to verify `TRUST_PROXY_HOPS` (expect 401 about 20 times, then 429).

WhatsApp, with an API key that has scope `whatsapp-admin` (`read -rs K`, then `-H "Authorization: Bearer $K"`):
`GET $B/api/whatsapp/events` returns 200 (events-router.ts:43). `GET $B/api/whatsapp/links` returns a clean 503 until the archiver is deployed (W2b).

## 8. Rollback

- Fast, app only: `docker tag <old-api-image>:pre-2026-11-01 <old-api-image>` (same for web), then `docker compose up -d --no-build api web`.
- Or by code: `git checkout <commit recorded in section 1>`, `docker compose build api web`, `docker compose up -d api web` (GL 504-506). Migrations are not reversed (none run here).
- Accounts only: remove `USER_SIGNUP_TENANT` and/or `AUTH_CSRF_SECRET`, set `APP_USER_ACCOUNTS=0`, `docker compose up -d api web`. API keys keep working. No database row needs removing (UA 125-130).
- Proxy: keep a copy of the old front-proxy config before editing; restore it and reload.
- Data: Mongo restore from `/backup/pre-2026-11-01` only if data was damaged (`mongorestore`), and only with Umesh's yes.

## Not confirmed in code (verify or ask)

- Where the redirect to the raw IP comes from, and the type of the vidysea.com front proxy (not in this repo).
- `TRUST_PROXY_HOPS=2` is an assumption (UA 20); the section 7 loop decides.
- The exact status code for `/auth/session` with no cookie (expected 401; only "404 means accounts off" is confirmed).
- The exact JSON error code for `/whatsapp/links` when the archiver is unset (only "clean 503" is stated by the task).
- `WHATSAPP_ARCHIVER_API_ALLOW_PRIVATE_HTTP` exists (archiver/config.ts:15) but is not in compose either; only needed for a private-IP http archiver.
- That `csrf` and `whatsapp/links` sit in the main `index-*.js` and not a lazy chunk.
- The Mongo firewall tool (security group vs `ufw`), and whether `MONGODB_URL` already has the `lkb_app` user.
- Which session ids to index (ask Umesh).

## Server bot: settings list (plan A5, D-257, read from the code on integrate/bot-live)

"Bot" = the `docker/meeting-bot` container (Cloud Run worker pool); "API" = the hosted service `vidysea-knowledgebase` (project `vidysea-prod`, `asia-south1`). Plain values are filled in below. **Secret values are never written here**: the "Who fills" column names where each one comes from. Every row is applied only in the Phase C batch (dry run first, then Umesh's yes).

### Must be set for the finish line (pasted link and calendar meeting, notes in the live KB)

| Name | Where | Value / who fills | Why it is needed | Read at |
|---|---|---|---|---|
| `MONGODB_URL` | API + bot | **Secret.** The API already has it. Claude copies the API service's current value into a new Secret Manager secret `lkb-prod-mongodb-url` without printing it; the bot reads that secret. | Mongo connection. The API falls back to `mongodb://localhost:27017` if unset. | `apps/api/src/bootstrap.ts:14`, `queue-worker.ts:92` |
| `MONGODB_DB` | API + bot | `lkb_prod` (identical on both) | The API writes `capture_jobs` there and the bot's queue worker reads it there. | `apps/api/src/db-name.ts:25`, `queue-worker.ts:96` |
| `MONGO_WORK_DB` | bot | `lkb_prod` | The database `--index` writes the notes to; must equal `MONGODB_DB`. | `transcript-provenance.mjs:97` |
| `LKB_INDEX_PRODUCTION` | bot | `1` | Forwards D-204's production flag from the recorder (A7) and the calendar scheduler (A8). Without it notes never reach `lkb_prod`. | `record-finalize.ts`, `run-pipeline.mjs` (`validateRunGate`), `graph-finalize.mjs` |
| `GEMINI_API_KEY` | API + bot | **Secret.** The API already reads it as a secret reference; the bot gets the same Secret Manager secret (no new key). | Transcript (Gemini). | `transcribe-long-session.mjs:65` |
| `OLLAMA_API_KEY` | API + bot | **Secret.** The API already reads it (Ollama cloud, `https://ollama.com`, no Ollama server needed); the bot gets the same Secret Manager secret. | KB notes (summarize, claims, topics: `config/ai-routing.yaml`) and slide vision (`vision/plan.mjs`). The start-up check refuses the queue with indexing, the calendar, and record-once `--process-video` without it (exit 78). | `production.ts:93`, `vision/chain.ts:242` |
| `LKB_STATE_BUCKET` | bot | `vidysea-prod-kb-bot` `[ASSUMPTION: proposed name; created in Phase C]`, with a lifecycle rule that deletes `recorder/recordings/` after N days (Umesh gives N; default proposal 30) | Signed-in Chrome profile, state, lease and recordings. | `entrypoint.sh:72` |
| `LKB_STATE_PREFIX` | bot | `recorder` (the default) | Object prefix in the bucket. | `entrypoint.sh:73` |
| `LKB_SEND_NOW_QUEUE` | API + bot | `1` on both | Turns the pasted-link queue on (API) and the queue loop on (bot, run mode). | `send-now-queue.ts:118`, `entrypoint.sh:87` |
| `LKB_SEND_NOW_INDEX` | bot | `1` | A pasted-link job also runs `--process-video --index`. | `queue-worker.ts:34` |
| `LKB_TENANT_ID` | bot | `toc` | The tenant the bot works for (the same tenant as `USER_SIGNUP_TENANT=toc` on the API). | `run-pipeline.mjs:60`, `send-now-queue.ts:60` |
| `LKB_SEND_NOW_TENANTS` | API + bot | `toc` on both | The tenants the queue serves; must match on both sides. | `send-now-queue.ts:59` |
| `LKB_CAPTURE_HOST_ID` | bot | `kb-bot-1` | Stable host id. A bad value stops the bot at start (A2). | `capture-slot-readiness.ts:18-28` |
| `LKB_CALENDAR_WORKER_HOST_ID` | bot | `kb-bot-1` | Binds this worker to the hosted calendar; calendar mode refuses to start without it. | `calendar-attendance-source.mjs:142` |
| `LKB_CAPTURE_SLOTS` | bot | leave unset for one meeting at a time (A9, D-258). Needed only with `LKB_SLOT_READINESS=operator` or the later parallel pool. | Capture slot name(s). | `deps-runtime.mjs:23`, `service.mjs:6-10` |
| `LKB_SLOT_READINESS` | bot | leave unset (machine check: the live-proof recording must hold audio and video). `operator` brings back the person's signed slot acceptance and then needs 2 to 8 slots in `LKB_CAPTURE_SLOTS`. | D-257 answer 2. | `calendar-attendance-source.mjs` `checkCalendarAttendanceReady` |
| `LKB_API_URL` | bot | `https://vidysea-knowledgebase-5z2zofynhq-el.a.run.app/knowledgebase/api` `[ASSUMPTION: path checked in the Phase C dry run with one GET /webinar-operations]` | Hosted API for the calendar, join rules and tenant check. Defaults to `localhost:3300`. | `run-pipeline-deps.mjs:32` |
| `LKB_API_KEY` | bot | **Secret.** Created once with `MONGODB_DB=lkb_prod node scripts/mint-key.mjs --tenant toc --label kb-bot --i-know-this-is-production` (writes one hashed key row to `lkb_prod`: needs Umesh's yes), then piped straight into Secret Manager `lkb-prod-bot-api-key`, never printed to chat. | The bot's key for the API (calendar mode). | `run-pipeline-deps.mjs:43` |
| `LKB_ATTENDANCE_ACCOUNT` | bot | **Umesh gives it:** the Google account the bot signs in as in Phase B, and whose calendar it attends. | Calendar auto-join (finish-line test 2). | `entrypoint.sh:85` |
| `LKB_JOIN_RULES_ENFORCE` | bot | `fail-closed` | Join-rule mode; required in calendar mode. | `run-pipeline.mjs:63`, `deps-runtime.mjs:60` |
| `LKB_AUTOJOIN_DISCOVERY`, `LKB_AUTOJOIN_WEBINARS`, `LKB_AUTOJOIN_CAREER_PRIORITY`, `LKB_AUTOJOIN_TEST_DATA_ROUTING` | bot | `true` (all four) | The auto-join flags; `run-pipeline.mjs:67` refuses otherwise. | `autojoin/config.ts:63-66` |
| `VNC_PASSWORD` | bot | **Secret, one-time.** Claude generates a random one on the laptop for the Phase B sign-in only; it is never stored. Not set on the server. | `BOT_MODE=login` only. | `entrypoint.sh:64` |

### Alerts

| Name | Where | Value / who fills | Why |
|---|---|---|---|
| `LKB_ALERT_EMAIL`, `LKB_ALERT_EMAIL_TO` | bot | `true`; **Umesh gives the address** that should get failure and slot-readiness alerts (D-257). | Alert mail through gws. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | bot | Optional. Leave unset unless Umesh wants Telegram too (no token = alerts off, logged once). | Telegram alerts. |

### Leave alone or unset

- `LKB_ALLOW_STAGING`: unset on the server.
- `OLLAMA_BASE_URL`, `WEBINAR_VISION_MODEL`: unset. `OLLAMA_API_KEY` alone points at Ollama cloud for both notes and slide vision. (Corrected 2026-11-27 after the A4 review: this line earlier said Ollama stays unset, which would have recorded the meeting and then failed the screen and notes stages.)
- Image defaults set in the Dockerfile (`LKB_PYTHON`, `LKB_BROWSER_EXECUTABLE`, `LKB_CAPTURE_BACKEND=tab`, `LKB_FFMPEG_PATH`, `TZ=Asia/Kolkata`, `DISPLAY`, `PULSE_SERVER`, `LKB_BOT_PROFILE_DIR`): leave them.
- Tuning with safe defaults: `LKB_SNAPSHOT_INTERVAL_S` (300), `LKB_LEASE_TTL_S` (120), `LKB_LEASE_RENEW_S` (30), `LKB_STOP_WAIT_S` (3), `LKB_GCLOUD_TIMEOUT_S` (120), `LKB_ATTENDANCE_INTERVAL_S` (300).

### Known gaps (each has a plan unit)

- **A4, the start-up check (built, branch `wave/a4-startup-check`):** in run and record-once mode the entrypoint now stops with exit **78** before any bucket call when a setting the chosen flow needs is missing, blank, or wrong (two different database names, a protected work database without the production opt-in, `LKB_INDEX_PRODUCTION=1` without both names `lkb_prod`). The line names the setting, never its value. `LKB_ALLOW_NO_BUCKET=1` lets a queue or calendar run start without a bucket: laptop rehearsal only, never on the server. It checks that settings are present, not that Mongo answers: a wrong Mongo URL still shows up at the first queue loop.
- **A9, one calendar meeting (built, branch `wave/a9-one-slot`):** a one-shot calendar run no longer needs the signed pool-slot acceptance; the live-proof media check (audio and video in a real recording) is the machine check. The parallel pool (`--watch`) keeps the signed acceptance.
- Image `HEALTHCHECK`: Cloud Run does not read it (worker pools support only HTTP, TCP or gRPC probes and have no default probe; checked in the Cloud Run worker-pool health-check docs on 2026-11-27). The bot serves no port, so it runs on Cloud Run without a probe: the instance restarts when the entrypoint exits, and failures reach people through the alert mails. Locally, the check used to report the queue and calendar loops as unhealthy; fixed on `wave/hc-loop-modes` (the loop shell counts as alive). The `docker-compose.yml` bot service does not forward the bucket, send-now, attendance or capture settings (affects only a compose run).

## Server bot: size (measured 2026-11-27)

Measured on the laptop in the bot image with no network, no sound card, no camera and no monitor: a 90 s Meet-like page (4 moving video tiles and a tone) recorded with the recorder's own settings (1280x720, 5 fps, VP8 500 kbps, Opus 64 kbps).

| Limit | CPU (100% = one core) | Memory peak | Page frame rate | Recording |
|---|---|---|---|---|
| 1 vCPU, 2 GB | average 90%, peak 107% (full) | 416 MB | 56 fps | complete, 8.2 MB |
| 2 vCPU, 4 GB | average 84%, peak 161% | 407 MB | 61 fps | complete, 8.3 MB |

Server size: **2 vCPU, 4 GB**. One vCPU is already full on this test, and a real Meet decodes more video. The rehearsal (Phase B) confirms it on a real Meet with `docker stats`.

`/dev/shm`: the test used 1 GB. Chrome is started without `--disable-dev-shm-usage`. On the worker pool, mount an in-memory volume at `/dev/shm` (1 GiB) `[ASSUMPTION: checked in Phase C doctor mode with df -h /dev/shm]`. Phase B also runs once with Docker's default 64 MB to see whether it matters.

## Server bot: Phase B, the laptop rehearsal (nothing here touches production)

Before starting:
- The image `lkb-bot:bot-live-<commit>` is built from `integrate/bot-live` (`docker build -f docker/meeting-bot/Dockerfile`).
- The throwaway Mongo `lkb-sendnow-test-mongo` is on `127.0.0.1:27099`. The work database is `lkb_rehearsal`, never `lkb_prod` or `lkb_staging`.
- The `.env` holds `GEMINI_API_KEY` and `OLLAMA_API_KEY`. Values are passed with `-e NAME` (a name only, no value on the command line).
- A VNC viewer on the laptop (for example TigerVNC Viewer). None is installed today.
- The test Meet carries no student data. The recording goes to Gemini and Ollama.

1. **Sign-in (Umesh, about 5 min).** A Windows Chrome profile does not work in the Linux container: its cookies are encrypted with Windows DPAPI. So the sign-in happens once, inside the container.
   - Create the profile volume, then start login mode:
     - `docker volume create lkb-bot-profile`
     - `docker run --name lkb-bot-login -p 127.0.0.1:5900:5900 -e BOT_MODE=login -e VNC_PASSWORD -v lkb-bot-profile:/data/bot-profile <image>`
   - Umesh opens `127.0.0.1:5900` in the VNC viewer and signs in to Google as the bot account.
   - Stop and remove the container. The profile stays in the volume.
2. **Doctor:** `docker run --name lkb-bot-doctor -e BOT_MODE=doctor -v lkb-bot-profile:/data/bot-profile <image>` must exit 0.
3. **Local API and website** from the `integrate/bot-live` worktree, with these settings:
   - `MONGODB_URL=mongodb://127.0.0.1:27099`
   - `MONGODB_DB=lkb_rehearsal`
   - `LKB_SEND_NOW_QUEUE=1`
   - `LKB_SEND_NOW_TENANTS=toc`
   - Start the API with `pnpm --filter api dev` (port 3300) and the website with `pnpm --filter web dev`.
4. **The bot in run mode, the server's way**:
   - Limits: `--cpus=2 --memory=4g --shm-size=1g`.
   - Network: `--add-host=host.docker.internal:host-gateway`, with `MONGODB_URL=mongodb://host.docker.internal:27099`.
   - Database: `MONGODB_DB=MONGO_WORK_DB=lkb_rehearsal`.
   - Queue: `LKB_SEND_NOW_QUEUE=1`, `LKB_SEND_NOW_INDEX=1`, `LKB_SEND_NOW_TENANTS=toc`, `LKB_TENANT_ID=toc`, `LKB_CAPTURE_HOST_ID=kb-bot-1`.
   - Keys: `GEMINI_API_KEY`, `OLLAMA_API_KEY`.
   - No bucket on the laptop: `LKB_ALLOW_NO_BUCKET=1`.
   - Record `docker stats --no-stream` every 5 s into a file while it runs.
5. **The Meet (Umesh, about 10 min).** Umesh hosts a 5-minute Meet, pastes its link in the local website, and clicks Admit. Claude then checks:
   - the job row reaches `completed`;
   - `ffprobe` finds audio and video in the `.webm`, with an audio level above silence;
   - the transcript exists;
   - the notes are in `lkb_rehearsal` and Ask finds them;
   - the CPU and memory peaks;
   - a second link pasted during the meeting waits rather than running at the same time, and Cancel works.
6. **Live-proof marker for the calendar.** Calendar mode refuses to start without `data/webinar-release/live-proof.json` (`docs/webinar-release.md:73`). From the step 5 recording, after the checks pass, Claude writes it with:
   - `status: "passed"`, `backend: "tab"`, `platform: "linux"`;
   - `audio: true`, `video: true`;
   - the session id, the time and the recording path.

   Umesh reads it before Phase C. In Phase C this recording and the signed-in profile go to the bucket through `BOT_MODE=publish-proof`.
7. Anything that breaks is fixed as code with tests, and steps 4 and 5 are repeated until one run is clean. Then all containers are stopped and removed.

## Server bot: Phase C, the cloud batch (dry run first; nothing is applied before Umesh's yes)

Before the dry run, `gcloud auth login` on the laptop (Umesh). The saved login expired on 2026-11-27, so not even the read-only listing works.

The dry run is the list below. Each item shows its exact command, and the read-only checks are run and shown before anything is applied.

| # | Resource | Command (shape) | Undo |
|---|---|---|---|
| C1 | Bucket `vidysea-prod-kb-bot`, `asia-south1`, uniform access, no public access. Lifecycle rule: delete `recorder/recordings/` after N days | `gcloud storage buckets create` + `gcloud storage buckets update --lifecycle-file` | `gcloud storage rm -r gs://...` |
| C2 | Service account `kb-bot` with object read and write on that bucket only, secret access on the secrets in C3 only, and log writing | `gcloud iam service-accounts create`, then bucket-level and secret-level `add-iam-policy-binding` | delete the bindings and the account |
| C3 | Secret `lkb-prod-mongodb-url` (copied from the API service's current value, never printed) | `gcloud secrets create` with the value piped in | `gcloud secrets delete` |
| C4 | Secret `lkb-prod-bot-api-key`. `mint-key.mjs --tenant toc --label kb-bot --i-know-this-is-production` writes one hashed key row to `lkb_prod` (a production write: a separate yes in the same batch), and its output is piped straight into the secret | as in the settings list | revoke the key row, delete the secret |
| C5 | The existing `GEMINI_API_KEY` and `OLLAMA_API_KEY` secrets: access for `kb-bot` only, no new key | `gcloud secrets add-iam-policy-binding` | remove the binding |
| C6 | Bot image from `integrate/bot-live` at the named commit (no git push) | `gcloud builds submit --config` with an inline build step for `docker/meeting-bot/Dockerfile` | delete the image tag |
| C7 | Profile and live-proof upload: one local `BOT_MODE=publish-proof` run with the Phase B volume and marker, `LKB_STATE_BUCKET` set, and the laptop's gcloud login mounted read-only | `docker run ... -e BOT_MODE=publish-proof` | `gcloud storage rm` the objects |
| C8 | Worker pool `kb-bot`, 1 instance, 2 vCPU, 4 GiB, `/dev/shm` in-memory volume, service account `kb-bot`, settings from the list above. Starts in `BOT_MODE=doctor` | `gcloud run worker-pools deploy` | `gcloud run worker-pools delete` |
| C9 | Server proof: `BOT_MODE=record-once` in a Meet Umesh hosts. Shows whether Google asks the server for "verify it's you" and whether Admit works from the server | redeploy with record-once settings | redeploy doctor |
| C10 | Run mode: queue and calendar on | redeploy with run settings | scale to 0 |

Umesh gives three things with the yes:
- N, the number of days recordings are kept (30 is the proposal);
- the alert address;
- a separate yes for C4, because it writes to `lkb_prod`.
