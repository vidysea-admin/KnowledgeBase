# Manifest: w27-ondemandwatch

Status: ready-for-check
Fix cycle: 0
Base: a9b202b422af6436c52f61dc9850ecb12fd21fc4 (origin/master)
Lane: lane/w27-ondemandwatch (C:\Users\product\Desktop\KnowledgeBase-lanes\w27-ondemandwatch)

## Changed paths (all new; no existing file edited)
- packages/meeting-bot/src/watch/onair-watch.ts
- packages/meeting-bot/src/watch/onair-watch.test.ts
- qa/manifests/w27-ondemandwatch.md

## Behaviour
Entry point `scheduleOnairWatch({slug, url, mediaDurationSec?}, deps)` for the onairmail lane. Flag `LKB_ONAIR_WATCH=1` (exact string; default OFF -> `disabled`, no claim, no launch).
- Origin allowlist `WATCH_ORIGIN_ALLOWLIST = ["https://cloudonair.withgoogle.com"]`, exact origin, path exactly `/events/<slug>` matching the slug; query/fragment dropped; port, credentials, http, subdomain, suffix hosts refused. Used only by the watch planner; live `planSendNow` is untouched.
- ASAP: start = now, no meeting time. Dedup: exclusive-create claim file `<claimDir>/<tenant>/onair-watch-<slug>.json`, never released (a failed run is not repeated). Slug is lower-cased.
- Duration: min(mediaDuration + 120 s padding, cap); unknown or invalid duration records up to the cap. Cap default 14400 s; `LKB_ONAIR_WATCH_MAX_SEC` may lower it only (integer in 1..14400).
- Launch reuses the existing tab-capture `record` command (same args as the manual-jobs worker) with env `LKB_ADMISSION_TIMEOUT_S=1`: the existing lenient non-Meet path then emits `admitted (assumed)` after 1 s, so there is no lobby wait. `0` was not used because it disables the timeout and the silence watchdog would never start.

## Not touched (byte-identical)
recorder.js, manifest.json, background.js, record-commands.ts, send-now.ts, manual-jobs/*, all py. The recorder has no page-origin allowlist (only a loopback endpoint check); the exact-host allowlist therefore lives at the watch entry. Wiring `scheduleOnairWatch` into composition / the mail lane output is not done (no consumer yet).

## Checks a checker must run
- `cd packages/meeting-bot && node --test --import tsx src/watch/onair-watch.test.ts`: pass 9, fail 0
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` (packages/meeting-bot)
- `node scripts/lint-loc.mjs --all`
- Mutations (scripts in C:\Users\product\Desktop\KnowledgeBase-lanes\w27-ondemandwatch-mut\mut.sh; per-mutation backup and trap; restored, cmp equal):
  - M1 allowlist loosened to `hostname.endsWith("withgoogle.com")`: pass 8 fail 1 (killed by "allowlist is exact")
  - M2 duration cap removed (`1e12`): pass 8 fail 1 (killed by "duration cap")
  - Harness note: a first run of the script showed both mutants surviving because `diff` (exit 1) fired the ERR trap and restored the file before the test ran; fixed with `|| true`, results above are from the corrected run.

## Evidence
See tsc/lint outputs recorded in the review packet; test output at C:\Users\product\Desktop\KnowledgeBase-lanes\w27-onair-watch-run1.txt.

## Results
- tsc meeting-bot: exit 0
- `node scripts/lint-loc.mjs` (loc stage alone): OK, 1729 files within budget. In `--all`: 8 of 10 stages exit 0; `loc` stage SIGTERM at the 120 s stage timeout under shared load (re-run alone: OK); `dependencies` stage exit 673, all 673 errors are `no-unresolvable-workspace-import` from this lane having node_modules junctions only for root, apps/api and meeting-bot (environment gap; none mention packages/meeting-bot/src/watch). Full 10/10 not demonstrated in this lane.
