# codexwave1 execution-wave1 takeover (lane/codexwave1)

**Handshake status:** checked-PASS — closed out 2026-10-26 (resume reconcile) citing qa/verdicts/codexwave1-build.md (cycle-1 PASS section, line 43)
Status: ready-for-check
Fix cycle: 1
Responds to: qa/verdicts/codexwave1-build.md (cycle 0 FAIL, b3479a07), issues ISS-CODEXWAVE1-003..007.
Main merged in first (codex/machine-migration-2026-10-09 incl. jobreap, apitests, indextests): clean, no conflicts.

## Fix cycle 1 changes and D-015 counts by issue id

- **ISS-CODEXWAVE1-003 (high): 2/2 recorded failing tests now pass.** Diagnosis differs from the filed cause. `<SemanticResults>` is explicit-request only (button; no effect dispatches a fetch) and is NOT the extra fetch: with the SearchPage mount removed the same 2 tests still failed. The extra call is `GET /sessions/:id/grounded-content`, issued on mount by `GroundedContentPanel`, which the t040-grounded-content-consumer manifest tells the integrator to render in SessionDetailPage (pre-existing integration, covered by its own SessionDetailPage test). Fix: `routeSuggestions` in `apps/web/src/pages/search/SearchPage.test.tsx` now also answers grounded-content with an empty valid payload, exactly as commit ab8322b2 did for speaker-suggestions; the ordered inner mock, call counts and assertions are unchanged. `SemanticResults` stays as contracted (explicit trigger, no flag needed). SearchPage dir: 4 files / 37 of 37 pass.
- **ISS-CODEXWAVE1-004 (medium): 34/34 files removed** (`git rm`): data/registration-checker-fixtures-GaLngI/ (28), registration-checker-probe.mjs, -probe.test.mjs, -vitest.config.mjs, registration-d099-{builder,main-fault,worker-idle}-probe.py. grep found no importer outside qa/evidence logs and the historical .handoffs inventory. SNAPSHOT.md regenerated.
- **ISS-CODEXWAVE1-005 (medium): partly fixed.** `scripts/webinar/supervisor/install-supervisor.test.mjs` line 91 now dot-sources the lane's own script via `import.meta.url` (`script` variable) instead of the main-tree path. Left open, by name: the 28 test-shaped files under qa/evidence/ with absolute paths; they are outside every test glob, the issue's fix direction is only "keep out of globs", and they are historical evidence.
- **ISS-CODEXWAVE1-006 (low): closed by merge**; lint-loc --all exit 0.
- **ISS-CODEXWAVE1-007 (low): environmental, no code change.** Lane `node_modules/@lkb/*` junctions point at MAIN tree packages, so a plain `tsc -p apps/api/tsconfig.json` in a lane reports false errors (e.g. `@lkb/core` has no `WhatsappCandidates`, implicit any in whatsapp/review/detection.ts). Use a temporary tsconfig with `paths` to the lane's own `packages/*/src`; run that way both apps are clean.
- docs/SNAPSHOT.md regenerated with `node scripts/snapshot.mjs`; `--check` OK (143 lines).
- Also: `Read-LkbBoundedStreams $process 1000` in the stream-cap test became `60000`. That test asserts the 64 KiB cap, not the deadline; the 1000 ms deadline made it fail 8/8 on this CPU-saturated machine.

## Evidence (lane worktree, node on PATH)

- apps/web full vitest: Test Files 81 passed (81), Tests 816 passed (816).
- apps/api full (`D2_FIXTURE_PYTHON`=main .venv python): ℹ tests 933 / pass 933 / fail 0.
- tsc web and api via temporary paths tsconfig (deleted): exit 0 and exit 0. Plain tsc web exit 0; plain api shows the false junction errors above.
- web build: `vite build` exit 0 (`tsc -b` not used, same junction reason; tsc proven separately).
- `pnpm test:webinar` equivalent (pnpm absent; same node --test command): 195 tests, 193 pass, 2 fail on a CPU-saturated machine (LoadPercentage 100, live Chrome worker): send-now-host launch test passes 5/5 alone (16/16 file); supervisor stream-cap test then fixed. Supervisor file after the fix: 9/10 and 7/8 full-file runs; remaining intermittent failure is `cycle0 recorded independent reproduction ... cannot hang` (wall-clock deadline test). Timing-load flake, not a logic failure; re-run on an idle machine.
- lint-loc --all exit 0; lint-dirsize OK (179 dirs); lint:structure OK.

## Left open for checker

Wall-clock supervisor/send-now tests flake when CPU is saturated; qa/evidence absolute-path files (above).
