# Verdict: w26-composeenv

VERDICT: FAIL
Cycle checked: 1
Reviewed SHA: 9352d626fb34dde6f1872e289e86ae7a5e8086a7
(History: cycle 0 verdict FAIL at 9113881ba5b81ea438f33e6adeed802dd208b1bd, section "Cycle 0" below, kept unchanged.)
## Cycle 0 (FAIL, reviewed 9113881b)
Base: origin/master (diff `origin/master...HEAD`, 4 files: .env.example, Dockerfile, docker-compose.yml, docs/GO-LIVE-UBUNTU.md)
Method: static review plus CI (`gh pr checks 22`: ci, images, build-targets api and web all pass). No docker available; no tests run (no source changed).

## Finding 1 (blocking, proven by code reading): compose passthrough turns "T-028 off" into "all API auth returns 503"

- docker-compose.yml (api environment, 5 new lines) always injects all five names. The two state dirs have non-empty defaults, so `LKB_HOSTING_STATE_DIR` and `LKB_COUNSELLOR_STATE_DIR` are ALWAYS defined. The other three become empty strings, which are also `!== undefined`.
- apps/api/src/hosting/config.ts:13 treats an empty key as invalid and returns undefined. apps/api/src/composition/integrations/hosting.ts:59 then runs `.some(name => input.env[name] !== undefined)` and sets `result.keyStore = failedAuthentication`. apps/api/src/composition/production.ts:~296 spreads `...hosting` over `deps`, replacing the real keyStore, and server.ts:124 does `requireAuth(deps.keyStore)`. Result: every authenticated route returns 503 `hosting_unavailable` whenever the key (or any of the 3 JSON vars) is empty or missing in `.env`.
- source-jobs.ts:48 has the same `!== undefined` check, so the source-job enqueue gate returns 403 in that state.
- Before this unit, the unset case left these names undefined and the API worked normally. Any compose deployment (local, staging, or production before the five are filled in) now silently loses authentication. That is fail-closed for secrets, but it is NOT "T-028 off", and it is a regression for every deployment that does not set all five. The guide wording "else the feature fails closed (key checks return 503, no accounts)" understates this, since it is a global auth outage.
- Fix (any one): (a) do not forward unset vars as empty. For example, have the `api` entrypoint (`startup-diagnostics.sh` in Dockerfile) `unset` any `LKB_HOSTING_*` / `LKB_COUNSELLOR_STATE_DIR` that is empty, and drop the non-empty compose defaults for the two dirs, or apply them in the entrypoint only when the key is set. (b) Treat empty strings as unset in hosting.ts:59 and source-jobs.ts:48 (`!!env[name]`), with a regression test for empty-string env. (b) is a code change and needs its own contract cover. (c) Document that all five MUST be set for compose, and add a `${LKB_HOSTING_ENCRYPTION_KEY:?...}` guard. That would make T-028 mandatory, which contradicts "off unless all five". Prefer (a) or (b).

## Checks that passed
1. Secrets: no key or real values committed. `.env.example` has empty names only; the guide has format placeholders only. The diff scan for 40+ hex strings found none.
2. Key format: config.ts:13 requires `/^[0-9a-fA-F]{64}$/`. Guide text (`openssl rand -hex 32`, 64 hex, base64 rejected) is accurate. Empty key never yields a weak or default key (returns undefined), subject to Finding 1.
3. Volumes: the code reads whatever the env says. Defaults `/var/lib/lkb/hosting` and `/var/lib/lkb/counsellor` are absolute, differ, and contain no public/static/assets segment. They match the Dockerfile mkdir paths and the compose volume mount targets. The Dockerfile `mkdir -p` and `chown -R node:node` run in the `api` stage while `USER root`, before `USER node`. Default dir mode is 755, so no world-writable dirs. Named volumes inherit image ownership (UID 1000) on first mount.
4. Dockerfile: the change is only in the `api` stage; `worker-tools` and `web` are untouched. CI build-targets and images are green.
5. YAML: the added keys follow existing indentation; `volumes:` under the api service and the top-level named volumes are well formed. CI build-targets/images pass; `docker compose config` was not run (no docker).
6. Bootstrap format `{"toc":["<key-id>"]}` and origins as a JSON array of https origins with pathname "/" match config.ts:14-29.

## Notes (not issues)
- JSON values in `.env` should be single-quoted for docker compose (`LKB_HOSTING_BOOTSTRAP_ADMINS='{"toc":["k"]}'`). The guide shows no quoting.
- Consequences of the Finding 1 fix should be added to the guide: back up the volumes too, not only the key.

## Not verified
Real `docker compose config` / container start (no docker); runtime behaviour was derived from code reading, not executed.

ISSUES-WRITTEN: none
Ledger rows may NOT be flipped. Maker should fix Finding 1 and resubmit as Fix cycle 1.

---

# Cycle 1 (candidate 9352d626, diff 9113881b..9352d626)

VERDICT: FAIL
Cycle checked: 1
Reviewed SHA: 9352d626fb34dde6f1872e289e86ae7a5e8086a7

Narrow, documentation-only failure. Finding 1 from cycle 0 is resolved.

## Checks
1. No `.env.t028`: compose `env_file` with `required: false` adds nothing, and the five `environment:` lines are gone, so all five names are undefined in the container. hosting.ts:59 and source-jobs.ts:48 only act when a name is `!== undefined`, so auth is unchanged. PASS (static; no docker).
2. Complete `.env.t028` (paths /var/lib/lkb/hosting and /var/lib/lkb/counsellor, matching the volume mounts and Dockerfile node-owned dirs from cycle 0; 64-hex key; JSON admins; https origins): satisfies config.ts:13-29 and hosting.ts:66 (absolute, distinct, no public/static segment). PASS (static).
3. Partial file: hosting is undefined and a defined name is present, so `keyStore = failedAuthentication` (hosting.ts:59) and every authenticated route returns 503; source-jobs.ts:48 returns forbidden. That is a clear, fail-closed failure, but it is NOT isolated from unrelated auth. It is existing code behaviour, and the guide now says so explicitly ("answers every authenticated route 503"). Accepted as documented, not a blocker. Note only.
4. `git check-ignore -v .env.t028` matches `.gitignore:3 **/.env.*`; no tracked `.env.t028`; the diff contains no real values (names, paths and placeholders only). PASS.
5. Compose 2.24+ requirement: NOT stated in docs/GO-LIVE-UBUNTU.md, docker-compose.yml or .env.example. It appears only in qa/manifests/w26-composeenv.md. The guide (line 11) only says "Docker Engine and the compose plugin". The `required: false` syntax is rejected by older compose, which would break EVERY service's `docker compose up`, not only T-028. FAIL.
6. Other services (migrate, web, local-mongo) are untouched; env_file is only on api. CI at check time: build-targets (api, web) and images pass on both runs; `ci` was still pending on both runs. ci result not confirmed by me.

## Required fix (cycle 2, docs only)
Add to docs/GO-LIVE-UBUNTU.md section 9 (and prerequisites at line 11) that Docker Compose v2.24 or newer is required (`docker compose version`), and say what happens on older versions (compose file fails to parse). A one-line comment next to `env_file:` in docker-compose.yml is also advisable.

ISSUES-WRITTEN: none
Ledger rows may NOT be flipped yet. Not verified: docker compose config / container start (no docker); `ci` job outcome.
