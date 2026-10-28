# Manifest - w27-aitransport
**Status:** checked-PASS — closed out 2026-10-26 (resume reconcile) citing qa/verdicts/w27-aitransport.md
**Fix cycle:** 0
**Contract:** none (fixes ISS-CILINUX4-001, ISS-OLLAMAFIRST-001, ISS-OLLAMAFIRST-002; all medium, non-security)
**Lane:** w27-aitransport (branch lane/w27-aitransport, from origin/master 4264418c)
**Backlog tier:** orchestrator-assigned (wave 4)
**Path note:** the brief named packages/ai-transport; no such package exists. The transport lives in `apps/api/src/ai-transport.ts` and was edited there.

## What changed
- ISS-CILINUX4-001 (`apps/api/src/ai-transport.ts`): `groupGone` is exported and takes injectable seams (`platform`, `kill`, `states`, `boundMs`, `pollMs`, `onBound`). On Linux, when `kill(-pgid, 0)` still succeeds it reads `/proc/<n>/stat` (`linuxGroupStates`, comm-safe parse via the last `)`), and a group whose members are all state Z (or X) counts as gone, so no 2 s spin. Only ESRCH means gone through kill; EPERM stops the wait and reports `eperm`; hitting the bound reports `bound` once. New `CliLimits.onGroupBound(reason)` carries the report (no pid, no path). Unknown member states (no /proc) fall back to the old kill-only wait. win32 stays a no-op.
- ISS-OLLAMAFIRST-001 (`packages/ai/src/vision/chain.ts`): already present on master from visionfix: 45 s per-backend default, 90 s per-call deadline (`LKB_VISION_DEADLINE_MS`), abort-on-timeout, `TransportRequest.signal` honoured by the http transport, `MIN_BACKEND_BUDGET_MS` (kept unchanged). New here: `VisionChainOptions.signal` is passed to every backend call; once aborted no later backend is tried (recorded "aborted before this backend was tried").
- ISS-OLLAMAFIRST-002 (`chain.ts`): `extractJsonObject` throws the new `VisionNonJsonError` (same fixed message). A `SyntaxError` from a caller's `validate` (JSON.parse) is mapped to the same fixed error, so the first characters of the reply no longer reach `tally.failures` or the log. New `VisionDemotion`: a backend that replied with prose is demoted after one strike (threshold configurable) to the back of ITS OWN provider group, so Ollama stays ahead of Gemini and the Ollama-first order is unchanged; serving valid JSON clears the strike. State is per `backends` array by default (WeakMap), so `routed-vision.mjs`, which reuses its backend list across frames, gets demotion with no edit; `demotion: false` disables it; only prose (not status or transport failures) demotes.

## Consumers
- `scripts/webinar/vision/routed-vision.mjs` -> `runVisionChain` (signature compatible: new options optional). `routed-vision.test.mjs` 4/4.
- `realTransport` / `createCliTransport` (apps/api): `onGroupBound` optional; `groupGone` call otherwise unchanged.

## D-015
- ISS-CILINUX4-001: 0/0. The row records no reproduction (reasoned from Linux semantics, "no Linux here"). Covered by fake-driven unit tests only; real Linux zombie behaviour is NOT reproduced locally (Windows host). Left open: needs the next Ubuntu CI run.
- ISS-OLLAMAFIRST-001: 1/1 recorded scenario (worst case 360 s and unaborted fetches): bounded by the existing deadline test and the new signal test.
- ISS-OLLAMAFIRST-002: 1/2. Replayed: the "The user w..." prose reply (unit, fake transport; no leak into tally/log; first model demoted after one call). LEFT OPEN: the live reproduction on frame230.jpg against the real glm-5.3-flash / deepseek-v4.1-flash (needs a real Ollama Cloud call; none made here). The ledger row also says think:false/format:json did not make glm comply; that is unchanged, the chain now just stops paying for it after the first frame.

## Evidence (real output, this host: Windows, node via codex runtime)
- `packages/ai`: `node --test --import tsx src/vision/chain.test.ts` -> tests 32 / pass 32 / fail 0 (8 new, 24 prior).
- `apps/api`: `node --test --import tsx src/ai-transport.test.ts` -> tests 25 / pass 25 / fail 0 (7 new, 18 prior).
- `node --test --import tsx scripts/webinar/vision/routed-vision.test.mjs` -> pass 4 / fail 0.
- tsc --noEmit: packages/ai exit 0; apps/api exit 0 (with the lane's node_modules junctions).
- `node scripts/lint-loc.mjs --all`: the aggregate run failed 3 stages (lint-tests, tracker, dependencies) with `signal=SIGTERM` because the runner's fixed 120 s per-stage timeout expired under machine load (stage=loc, dirsize, root, dupes, migrations, codex-hooks, snapshot exit 0). Those 3 stages were then run standalone with no stage timeout: lint-tests pass 18 / fail 0; tracker-audit OK (gate G1,G4,G5); dependency-cruiser "no dependency violations found". Aggregate itself is therefore NOT a clean 10/10 on this host.
- D-020 mutations (per-mutation byte backup + trap, scripts outside the repo, `cmp` against backup after each, targeted tests only):
  - M1 `st === "Z" || st === "X"` -> `st === "X"` (zombies not gone): KILLED (2 failures: all-zombie, last-live-turns-zombie).
  - M2 drop `signal: opts.signal` in chain call: KILLED (signal test).
  - M3 drop `recordNonJson`: KILLED (demotion test + validate-leak test).
  - M4 drop SyntaxError -> `VisionNonJsonError` mapping: KILLED (leak test).
  - HEAD-fidelity: see commit section below.

## Checks a checker must run
- The two focused test files above; tsc for packages/ai and apps/api; re-run the 3 slow lint stages standalone.
- Mutation M1 only proves the fake-driven path; the genuine Linux zombie path (real /proc, real orphaned grandchild) remains unverified until Ubuntu CI.

## Open / not done
- Live proof for ISS-OLLAMAFIRST-002 (see D-015). No real provider calls were made.
- `docker-compose.yml` `init: true` (suggested in the CILINUX4 fix_direction) not touched: outside the named paths.
- Ledger rows not flipped (per wave rules).
