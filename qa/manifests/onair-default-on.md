# Manifest — onair-default-on
**Contract:** none specific (D-207 item 4; qa/gates/kb-speed-wa-h3-2026-10-29.md "onair default-on go")
**Goal task:** none
**Date:** 2026-10-29
**Status:** ready-for-check
**Handshake status:** ready-for-check
**Fix cycle:** 0
**Dual check:** no (no trigger applies: no auth, tenancy, data write or cross-tenant read. The change only flips a default for a read-only Gmail list/get lane whose sender-authentication gate (DMARC on google.com, one From, topmost authserv-id) is untouched and still tested; no new external service, no secret, no DB access)
**Persona walk:** skip (no screen, flow or user type)
**Issues addressed:** none
**Executor:** claude-opus-5-5-subagent
**Executor rationale:** one small in-place change to one existing module plus config, compose, env, docs and tests, all within the D-207 Changes-authorized list.

## Criteria
- C1 With no `LKB_ONAIR_MAIL` in the environment the OnAir mail lane is ON (`onairMailEnabled({})` is true; `withOnairMailFromEnv` returns a wrapped loader, not the base loader).
- C2 `LKB_ONAIR_MAIL=0` (also `false`/`off`) turns the lane off and returns the base loader unchanged; `LKB_ONAIR_MAIL=1` forces it on even when the config file says off; an unrecognised env value falls back to the config value.
- C3 `config/autojoin.json` carries `onair: {mail: true, watch: true}`, read through the same path rule as the autojoin loader (`LKB_AUTOJOIN_CONFIG`, else `<repo>/config/autojoin.json`); a missing file, unreadable file, or missing key means ON; the file value `false` turns the lane off when no env is set.
- C4 `LKB_ONAIR_WATCH` default is applied: with config on and env unset or truthy, the production wiring writes the exact string `1` into the env (the Python recorder and `onair-watch.ts` accept only `1`); an explicit `0` is left alone; config `false` writes nothing.
- C5 docker-compose.yml `bot` service forwards `LKB_ONAIR_MAIL` and `LKB_ONAIR_WATCH` as value-less pass-through; `.env.example` documents both names.
- C6 OnAir on Linux records with the tab backend and can never select OBS; win32 behaviour is unchanged (tab by default, OBS only on an explicit request). Injected platform in tests.
- C7 `docs/GO-LIVE-UBUNTU.md` has an OnAir section: default on, how mails are read through gws, env overrides, live-proof requirement, and the known wiring gap.

## What changed
- packages/meeting-bot/src/calendar/onair/onair-mail-loader.ts (edited in place): new exports `loadOnairConfig`, `applyOnairWatchDefault`, `OnairLaneConfig`; `onairMailEnabled(env, config?)` is now env (via the shared `parseFlag` from autojoin/config.ts) then config then default true; `withOnairMailFromEnv` applies the watch default and reads the config; `OnairLoaderDeps.config` added. Behaviour with `LKB_ONAIR_MAIL=1` and `0` is as before.
- packages/meeting-bot/src/calendar/onair/onair-mail-loader.test.ts: the old "only exactly 1 enables" test replaced by default-on/off/force/fallback tests; new config, watch-default and production-wiring tests (temp config dirs, no network).
- config/autojoin.json: `onair` key added; `$comment` mentions LKB_ONAIR_*.
- docker-compose.yml (bot service env only): `LKB_ONAIR_MAIL:`, `LKB_ONAIR_WATCH:`.
- .env.example: both names with a comment (blank, meaning use the file).
- packages/meeting-bot/src/strategy.ts: comment only (the strategy value is a label, not the capture backend). packages/meeting-bot/src/strategy.test.ts: two tests pinning tab-on-linux and unchanged win32 for an OnAir URL with an injected platform.
- docs/GO-LIVE-UBUNTU.md: new section 5.10.

## Findings about the product (for the coordinator; not changed, outside the D-207 file list)
1. **Item 4 needed no code.** `selectJoinStrategy` only returns a label (`browser`) that feeds send-now metadata and the fixture `capture()` command. The real recorder picks its backend in `recordingBackend` (capture/record-commands.ts:64-68): default `tab`, `obs` refused off win32. The Linux scheduler also pins `--backend tab` (scripts/webinar/scheduler/dispatch.mjs:109) and `LKB_CAPTURE_BACKEND=tab` (scripts/webinar/run-pipeline.mjs:150). OnAir on Linux therefore already uses tab capture; the unit pinned that with tests and a comment, so not BLOCKED.
2. **GAP, the Linux bot never runs the OnAir mail lane.** `withOnairMailFromEnv` is called only from `buildRealScheduleTickDeps` (packages/meeting-bot/src/calendar/schedule-tick.ts:76), the Windows task-scheduler path. The Ubuntu driver `scripts/webinar/run-pipeline-deps.mjs:57-76` builds its `loadCandidates` with `createHttpCandidateLoader` directly and does not wrap it. So even with the flag on (before or after this unit) the Ubuntu bot reads no OnAir mails, and nothing writes `LKB_ONAIR_WATCH=1` into the record child env there either. Smallest fix: in run-pipeline-deps.mjs wrap that loader with `withOnairMailFromEnv(loader, env, ROOT, log, createHttpCalendarLoader(api, env.LKB_API_KEY))` (it also calls `applyOnairWatchDefault(env, ROOT)`); add the file to a D-207 amendment first. Documented in GO-LIVE section 5.10.
3. The Windows scheduled-task path does not inherit `process.env` mutations, so `applyOnairWatchDefault` in `withOnairMailFromEnv` helps the in-process/Linux case only; Windows operators keep setting `LKB_ONAIR_WATCH` in the task environment.
4. autojoin/config.ts was not edited (outside the authorized list): the `onair` key is read by a small reader in the onair folder with the same file-path rule. Folding it into `loadAutojoinConfig` would be a follow-up.

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Round: 8 files, 7 criteria, est 50 min, single builder, no checker dispatch by the builder
slow-plan: none (no container or network run; unit tests only, each under a 200 s timeout)
Tier: L (config + flag default, concurrency-free)
Base / checked state: base be9c8608; code commit 4028a424 (onair-mail-loader.ts blob 606d50ec, record-commands.ts blob 10679716 unchanged, config/autojoin.json blob 7881cb7f, docker-compose.yml blob edceea4d); the manifest commit follows and touches only qa/.
Affected tests: packages/meeting-bot/src/calendar/onair/*.test.ts, strategy.test.ts, autojoin/tick-and-watch.test.ts, autojoin/alerts.test.ts, watch/onair-watch.test.ts, capture/record-backend.test.ts, scripts/webinar/scheduler/deps-runtime.test.mjs, scripts/operations/compose-t028-env.test.mjs.
Independent review: NOT run by the builder; the checker owns review.
Not run / limits: no live gws or Gmail call, no OnAir page join, no container (disk on D: is about 2.4 GB; the bot image is about 2.8 GB unpacked) so the "doctor reports the OnAir lane enabled" container check was skipped: `setup.mjs --doctor` (outside the file list) does not print the lane state anyway. Node tests run on Windows 11, not Linux; the Linux platform is injected. Equivalent mutant: dropping the early `if (!config.mail) return base` in `withOnairMailFromEnv` survives because `withOnairMailCandidates` returns the base loader for the same condition; the early return only avoids building the gws runner.
Tests[C1]: packages/meeting-bot/src/calendar/onair/onair-mail-loader.test.ts::"flag: DEFAULT ON with no env; 0/false/off turns it off; 1 forces on; unknown values fall back to the default" + "config drives the production wiring: file off returns the base loader, file on or no file does not" — no env gives an enabled lane and a wrapped loader
Tests[C2]: same file::"flag: DEFAULT ON ..." — 0/false/off/" 0 " give the base loader; 1/true force on; env 1 beats config false, env 0 beats config true, garbage env falls back to config
Tests[C3]: same file::"config: the committed config/autojoin.json has onair.mail and onair.watch on" + "config: file keys are read, missing or unreadable files and keys default ON, env overrides each key" — reads the real committed file, temp files, LKB_AUTOJOIN_CONFIG, broken JSON, non-object key
Tests[C4]: same file::"watch default: unset env takes the config value ('1' when on), an explicit env wins" + "production wiring applies the watch default to the env it was given"
Tests[C5]: docker compose --profile bot config (dummy MONGODB_URL/MONGODB_DB/OLLAMA_API_KEY, no .env) lists LKB_ONAIR_MAIL and LKB_ONAIR_WATCH as null (pass-through); .env.example lines are static text, covered by reading the diff (no parity test exists in the repo)
Tests[C6]: packages/meeting-bot/src/strategy.test.ts::"cloudonair on linux records with tab capture and can never select OBS" + "cloudonair on win32 is unchanged: tab by default, OBS only when asked for explicitly" (injected platform)
Tests[C7]: reading docs/GO-LIVE-UBUNTU.md section 5.10 (static text; no executable test)
Pre-check[C1]: 4028a424 node --test --import tsx packages/meeting-bot/src/calendar/onair/onair-mail-loader.test.ts -> exit 0, 13 passed 0 failed t=1 blobs=packages/meeting-bot/src/calendar/onair/onair-mail-loader.ts:606d50ec
Pre-check[C2]: 4028a424 same run -> exit 0, 13 passed t=1
Pre-check[C3]: 4028a424 same run -> exit 0, 13 passed t=1 blobs=config/autojoin.json:7881cb7f
Pre-check[C4]: 4028a424 same run -> exit 0, 13 passed t=1
Pre-check[C5]: 4028a424 MONGODB_URL=mongodb://x MONGODB_DB=d OLLAMA_API_KEY=x docker compose --profile bot config -> exit 0, `LKB_ONAIR_MAIL: null` and `LKB_ONAIR_WATCH: null` in the bot service t=1 blobs=docker-compose.yml:edceea4d
Pre-check[C6]: 4028a424 node --test --import tsx packages/meeting-bot/src/strategy.test.ts -> exit 0, 6 passed 0 failed t=1
Pre-check[C7]: 4028a424 git show 4028a424:docs/GO-LIVE-UBUNTU.md | grep -n "5.10 Cloud OnAir" -> exit 0, one hit t=1
Pre-check[T1]: 4028a424 pnpm lint:structure; node scripts/snapshot.mjs --check -> exit 0, `lint:structure: OK (10 stages, 0 failed)` and `OK: docs/SNAPSHOT.md matches a fresh regeneration (183 lines, budget 200)` t=1
Pre-check[T2]: 4028a424 neighbour suites onair-address, onair-link-resolver, onair-mail-source, autojoin/tick-and-watch, autojoin/alerts, watch/onair-watch, capture/record-backend, scripts/webinar/scheduler/deps-runtime.test.mjs, scripts/operations/compose-t028-env.test.mjs -> exit 0 for each (4, 11, 14, 14, 12, 11, 5, 13, 6 passed), `npx tsc --noEmit -p packages/meeting-bot` printed nothing t=1
Falsification (per-mutation byte backup, 200 s timeout, restore on EXIT/INT/TERM, then `git hash-object` equals `git rev-parse HEAD:<file>` for every touched file, checked at the end of each run):
- F1 (C1): onair-mail-loader.ts `?? config?.mail ?? true` -> `?? false`: 12 pass 1 fail (flag test)
- F2 (C2 off): `parseFlag(env.LKB_ONAIR_MAIL)` -> `parseFlag(undefined)`: 12 pass 1 fail
- F2b (C2 force-on beats config): env/config precedence swapped: 12 pass 1 fail
- F6 (C3): config/autojoin.json `"mail": true` -> `false`: 12 pass 1 fail (committed-config test)
- F4 (C4): `env.LKB_ONAIR_WATCH = "1"` -> `"0"`: 11 pass 2 fail
- F3 (C6 linux default): record-commands.ts default `"tab"` -> `"obs"`: strategy.test.ts 4 pass 2 fail
- F3b (C6 OBS gate): record-commands.ts win32-only gate removed: 5 pass 1 fail
- F7 (C5): compose `LKB_ONAIR_MAIL:` renamed: the `docker compose config | grep` check fails (exit 1)
- C7 is static text: no executable falsification; the checker reads it.
mutant-cap-raise: one falsification per criterion; C2 carries two mutants (off path and force-on precedence)
Metrics: builder_min=50 mutants=8 policy=proportional-verification/2026-10-19.17 cycle=0 suite_runs=0 repeat_runs=0 tokens=unavailable
