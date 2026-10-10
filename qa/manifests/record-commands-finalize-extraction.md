# Manifest: record-commands-finalize-extraction

Lane: RECFIN (branch lane/recfin, base 78d482b)
Tier: 3 (roadmap/structure; ISS-367 high, ISS-STRUCTFIX-001)
Status: ready-for-check
Fix cycle: 0

## Purpose
Resolve what ISS-STRUCTFIX-001 asked for (get `record-commands.ts` under the 300-line source budget) without a new folder, using the home the PASS verdict of `structure-dupes-and-record-commands-loc` named: the existing `packages/meeting-bot/src/capture/record-finalize.ts`. ISS-367 STAYS OPEN (other stages still red, below).

## Moved block
- Source: `packages/meeting-bot/src/capture/record-commands.ts` lines 207-239 (33 lines): `processRecordingArtifacts` + `validateIndexProof`.
- Destination: appended at end of `packages/meeting-bot/src/capture/record-finalize.ts` (after `normalizeCapture`).
- Moved verbatim (CRLF preserved). Both functions are recording-finalize steps (post-recording process-video/index, strict index-proof check).
- Module-level bindings used: `REPO_ROOT` (already defined in record-finalize.ts as `path.resolve(HERE,"..","..","..","..")`, identical expression; HERE is the same dir), `createHash`, `spawnSync`, `readFileSync`, `writeFileSync`, `path` (all already imported there). No new imports in record-finalize.ts.
- record-commands.ts edits beyond the move: dropped now-unused imports (`createHash`, `spawnSync`, `writeFileSync`, `readFileSync`); the existing import from `./record-finalize.js` gains `processRecordingArtifacts` (still called in `runRecord`); a re-export line `export { processRecordingArtifacts, validateIndexProof } from "./record-finalize.js";` replaces the block (same position as the other re-exports).

## Import-cycle analysis
- record-finalize.ts imports only node builtins, `./reconnect-gaps.js`, `./telegram-alerts.js`. It does NOT import record-commands.ts.
- record-commands.ts already imports `./record-finalize.js` (finalizeRecordingWith, normalizeCapture) and already re-exports from it (normalizeCapture; isSilentCapture, finalizeRecordingWith).
- Direction stays record-commands -> record-finalize only: no cycle. Re-export kept, so NO importers changed (record-commands.test.ts, record-backend.test.ts, scripts/webinar/run-pipeline.mjs, cli.ts etc. untouched).

## Line counts (non-blank)
- record-commands.ts: 304 -> 271
- record-finalize.ts: 206 -> 239 (budget 300)

## loc stage BEFORE (`node scripts/lint-loc.mjs --all`)
```
lint-loc: FAIL — 4 violation(s)
  packages/index/src/pipeline/speakers-llm.ts:313 (budget 300)
  packages/meeting-bot/py/sb_join.py:1142 (budget 300)
  packages/meeting-bot/src/capture/record-commands.ts:304 (budget 300)
  scripts/watch/run-watch.mjs:556 (budget 300)
```
## loc stage AFTER
```
lint-loc: FAIL — 3 violation(s)
  packages/index/src/pipeline/speakers-llm.ts:313 (budget 300)
  packages/meeting-bot/py/sb_join.py:1142 (budget 300)
  scripts/watch/run-watch.mjs:556 (budget 300)
```

## Evidence
- Identical block: removed lines (33, excluding the 3 import lines) vs added lines (33) after `tr -d '\r'`: `diff` empty, printed `BLOCK-IDENTICAL`.
- `node scripts/lint-dirsize.mjs`: `lint-dirsize: OK (110 dir(s) within budget)` (no new file).
- `node scripts/lint-dupes.mjs`: `lint-dupes: OK (707 unique export(s), 27 unique schema $id(s))`.
- `node --test --import tsx src/capture/record-commands.test.ts`: tests 19, pass 18, fail 0, skipped 1 (includes the ledger002 index-proof test that imports `validateIndexProof` via the re-export).
- `src/capture/audio-watchdog.test.ts` (imports record-finalize): tests 18, pass 18, fail 0.
- `src/capture/record-backend.test.ts` (imports record-commands): tests 5, pass 3, fail 2. The two failures are environmental, unrelated to the moved functions: `live WebM stream is remuxed...` fails `null !== 0` because `ffmpeg`/`ffprobe` are not on PATH on this machine; `interrupted recovery...` fails `EPERM: operation not permitted, symlink` (Windows symlink privilege). NOT run against the base commit (UNVERIFIED as pre-existing; neither exercises the moved code).
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` in packages/meeting-bot: exit 0, no output.
- obs-windows.test.ts not run (does not import the moved functions).

## Still red in `lint:structure` (ISS-367 stays open)
- loc: `speakers-llm.ts` (313, packages/index, other lane), `sb_join.py` (1142), `run-watch.mjs` (556).
- root: 18 loose root files vs budget 15.
- tracker: 6 G4 "ambiguous issue ref" findings in qa/manifests and qa/verdicts.

## Note
This resolves what ISS-STRUCTFIX-001 asked for (record-commands.ts under budget) without a new folder or any budget/allowlist change. No new issues filed (qa/issues.recfin.jsonl not created).
