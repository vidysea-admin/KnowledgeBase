# obsflake-iss324-stall-window-flake

**Handshake status:** checked-PASS
Fix cycle: 0
Tier: test-only flake fix (no ledger issue; no auth/tenancy/data write). Lane: lane/obsflake.

## What was wrong
`packages/meeting-bot/src/capture/obs/obs-windows.test.ts` ISS-324 tests used `openStallMs: 400` in `stagesCfg`. Spawning a bare `node -e 1` takes ~0.3 s here under load, so the stall timer fired before the child printed "starting": "no progress for 0s; last stage: spawned".

## Change (test file only; production and other meeting-bot files untouched)
- `STALL_MS = 3_000` constant, used by `stagesCfg` and the absolute-cap test.
- Progress test keeps its intent (bring-up outlasts the stall window): ticks 12 -> 35 at 100 ms = 3.5 s > 3 s.
- Cap test: `openCapMs` 1_200 -> 4_000 so the cap is still larger than the tick interval and the stall window is never what ends it.
- Stall detection is still proven by the existing fixtures that never progress: `silent` (wedges after "starting") and `stderr-then-silent`.

## Evidence
10 sequential runs of `node --test --import tsx src/capture/obs/obs-windows.test.ts`: every run `ℹ tests 8 ℹ pass 8 ℹ fail 0` (10/10).
Mutation (packages/meeting-bot/src/capture/browser/bot-child.ts line 95 `>= stallMs` -> `>= 1e12`, byte backup, restored, hash verified == HEAD blob 0e926bc5): `ℹ pass 7 ℹ fail 1` (a test fails).

## Not verified
Full suite not run; no browser/OBS opened (fake OBS + node fixture only).
