# Verdict — onair-default-on
**Cycle checked:** 0
**VERDICT: PASS**
**Checker:** A (fresh, bound to D:/KnowledgeBase, worktree .worktrees/onair-default-on)
**Policy-Version judged under:** proportional-verification/2026-10-19.17 (as pinned in manifest)
**Diff checked:** be9c8608..041f3131 (product code identical to manifest final code SHA 5af2110d; 041f3131 adds only qa files)
**Dual check:** not required (manifest trigger analysis re-read: no auth/tenancy/data-write/cross-tenant change; sender-authentication gate untouched)

## Independent evidence (re-run by checker, one file per invocation, timeout 200 s, bound tree untouched)
- C1, C2, C3, C4: onair-mail-loader.test.ts 13/13 pass. No env => lane on and wrapped loader; 0/false/off/" 0 " => base loader; env 1 beats config false, env 0 beats config true, garbage env falls to config; committed config/autojoin.json has onair {mail:true, watch:true}; missing/broken/non-object config and missing key => on; LKB_AUTOJOIN_CONFIG honoured; watch default writes the exact "1" for unset and "true", leaves "0", writes nothing when config false.
- C5: `docker compose --profile bot config` (dummy MONGODB_URL/MONGODB_DB/OLLAMA_API_KEY, no .env) lists `LKB_ONAIR_MAIL: null` and `LKB_ONAIR_WATCH: null` (count 2). .env.example lines 92-96 read directly: both names present with a comment.
- C6: strategy.test.ts 6/6 pass (tab on linux, OBS refused on linux by flag and env, win32 unchanged, platform injected). recordingBackend read at record-commands.ts:64-68; file unchanged by the diff.
- C7: docs/GO-LIVE-UBUNTU.md 5.10 read in the diff: default on, gws read-only read, env overrides, live-proof requirement, wiring paragraph. Note: the "known wiring gap" is now described as closed wiring (D-208 item 6) rather than a gap; consistent with the code, accepted.
- C8: run-pipeline-onair.test.mjs 4/4 pass (default includes OnAir candidates; =0 excludes and never reads mail; failing mail read keeps Gmail rows and "fetch failed: skipping" text cannot fail discovery; record child env has WATCH=1 at construction, "true" -> "1", explicit 0 kept). Existing createPipelineDeps users run-pipeline.test.mjs 23/23, db-guard-paths.test.mjs 18/18; record-backend 5/5; autojoin/tick-and-watch 14/14. `tsc --noEmit -p packages/meeting-bot` exit 0.
- Wiring check: only two callers of withOnairMailFromEnv (schedule-tick.ts:76 for Windows, run-pipeline-deps.mjs:78 for Linux); sb_join_onair.py:119 and onair-watch.ts:37 accept only the exact "1", which applyOnairWatchDefault writes.

## Falsification (throwaway copy under the scratchpad built from git archive HEAD, node_modules junctions unlinked afterwards with rmdir, targets verified intact; per-mutation byte backup restored, then `git hash-object` of the copy == `git rev-parse HEAD:<file>` every time)
- F1 (C1) `?? config?.mail ?? true` -> `?? false`: 12 pass 1 fail (flag test). Restored 37894a75 == HEAD.
- F2 (C2 off) `parseFlag(env.LKB_ONAIR_MAIL)` -> `parseFlag(undefined)`: RED 1 fail. Restored.
- F2b (C2 precedence) file value placed ahead of env in loadOnairConfig: RED 3 fail (config, wiring, watch tests). Restored.
- F6 (C3) config/autojoin.json onair.mail true -> false: RED (committed-config test). F6b watch true -> false: RED. Restored 7881cb7f == HEAD.
- F4 (C4) `"1"` -> `"0"`: RED 2 fail. F4b skip-write when env already set (leaves "true" as-is): RED 1 fail. Restored.
- F3 (C6 linux default) record-commands.ts default "tab" -> "obs": RED 2 fail. F3b win32-only OBS gate removed: RED 1 fail. Restored 10679716 == HEAD.
- F7 (C5) copy of docker-compose.yml with LKB_ONAIR_MAIL renamed: `docker compose config` shows only WATCH (count 1 vs 2 on HEAD). Detected.
- G1 (C8) loader wrapped by an identity: RED 2 fail. G1b wiring given an empty env (ignores LKB_ONAIR_MAIL=0): RED 1 fail. G4 forces LKB_ONAIR_MAIL=1 into the wiring: RED 1 fail.
- G2 (C8) `applyOnairWatchDefault(env, ROOT);` removed from createPipelineDeps: RED 1 fail (construction-time test). G3 OnAir lane given the Gmail failure-detecting log: RED 1 fail. All restored da600f71 == HEAD.
- One accidental in-copy edit (sed) of run-pipeline-deps.mjs was restored from the bound tree by `cp` and hash-verified (da600f71 == HEAD); the bound tree itself was never written (git status shows no tracked change).
- C7 static text: read, no executable falsification.

## Adversarial bypass hunt (auth / tenancy / data-write)
- Sender-authentication gate (DMARC on google.com, one From, topmost authserv-id) is not in the diff; the three gate tests (including "sender-gate bypass attempts are not authenticated") still pass. Flipping the default only makes the already read-only list/get lane run without an operator flag; no new scope, no send/modify/delete.
- LKB_AUTOJOIN_CONFIG is an operator-controlled path read as JSON only (existing rule); `onair` as string/array/null is ignored (tested), `__proto__`-style keys do not reach any sink, values must be strictly boolean.
- Failure isolation: OnAir errors go through the plain `log`, so a hostile mail error text ("fetch failed", "skipping") cannot trip the Gmail failure detector or drop Gmail candidates (G3 proves it).
- LKB_ONAIR_WATCH default only takes effect for an https cloudonair.withgoogle.com URL (sb_join_onair.py gate), so non-OnAir recordings are unaffected.
- Mutation of process.env by applyOnairWatchDefault is idempotent and limited to this one key.
- No tenancy, auth or database path touched.

## Issues
ISSUES-WRITTEN: none
Notes (not backlog): (1) docs 5.10 advises commenting the pass-through lines out of .env rather than leaving them blank, while .env.example ships them blank; blank is handled correctly (parseFlag("") -> use file), so this is wording only. (2) Windows scheduled-task path does not inherit the process.env watch default, already stated in the manifest.
PROPOSED-ISSUE: none

## Metrics
check_min=10 mutations=15 suite_runs=0 repeat_runs=0 cycle=0 files_run=9 tsc=1 compose=2
