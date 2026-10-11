# Manifest — iss-scorefix-catalogue-check-and-ledger-union-fixture

**Contract:** none.
**Goal task:** none (tier 2 — CI checks red on the merged branch).
**Date:** 2026-10-11
**Fix cycle:** 0
**Dual check:** no
**Issues addressed:** ISS-SCOREFIX-001 (catalogue), ISS-SCOREFIX-002 (ledger-union fixture), ledger `qa/issues.scorefix.jsonl`.
**Status:** ready-for-check

## Part A — `lint:score` (ISS-SCOREFIX-001)

- **What it derives.** `.goal/catalogue.json` holds 57 features, each with probes and an optional `manual` verdict. `scripts/catalogue-score.mjs` derives an "auto" verdict from machine signals (live route table scraped from `apps/api/src/routes`, collection counts from live-verify evidence, SPA routes from `App.tsx`, package reachability). A manual verdict may only LOWER the auto verdict; an upgrade exits 2.
- **C1** = "POST /ask CRAG router". Probe: `routes: ["POST /ask"]`; manual PARTIAL (tree-only retrieval). Auto should be REAL.
- **Missing evidence.** `POST /ask` absent from the scraped route table: `scrapeRoutes` (`scripts/lib/catalogue.mjs`) listed only top-level `*.ts` in `apps/api/src/routes/`; the route now lives in `routes/ask/ask.ts`.
- **Cause: (i), a path move.** Commit `c979bff` (2026-10-10, "Move API production, ask and WhatsApp store into folders") moved `routes/ask.ts` -> `routes/ask/ask.ts`. No absolute/machine-specific path involved; the manual verdict was not above the evidence before the move.
- **Change.** `scrapeRoutes` now walks `routes/` recursively (skips `*.test.ts` and `node_modules`; only the top-level `stubs.ts` is read as stubs). No verdict, catalogue or PROGRESS.md edit. Regression test added to `scripts/catalogue.test.mjs`.
- **The 6 failing `catalogue-cli.test.mjs` tests** run the real catalogue and failed for the same reason (exit 2 instead of the expected codes); all pass now. No assertion touched.
- **Owner decision:** none needed.

## Part B — ledger-union fixture (ISS-SCOREFIX-002)

`selected CLI gate cannot hide duplicate ledger IDs` copied only `scripts/tracker-audit.mjs` and `scripts/lib/tracker-audit.mjs`; the former now imports `./qa/unmerged-worktrees.mjs` -> ERR_MODULE_NOT_FOUND. Fix: helper `copyWithRelativeImports` copies the entry script plus the transitive closure of its relative imports at the same paths; a sanity assert confirms the lib is in the closure. Product code and the test's assertions unchanged. `scripts/tracker-audit*` and `scripts/qa/*` are not enforcement paths (CLAUDE.md lists only `.claude/hooks/*`, `scripts/append_decision.ps1`, `.claude/settings.json`); only a test file was edited.
**Teeth:** temporarily rewrote `if (first) throw` to `if (false) throw` in the fixture's COPY of the lib; the test then FAILED (27 pass / 2 fail); restored, passes.
`G4: master's manifests and verdicts are clean` remains failing, unchanged (owner item, untouched).

## Evidence

| command | before | after |
|---|---|---|
| `node scripts/catalogue-score.mjs --check` | REFUSED ... C1: manual "PARTIAL" > auto "MISSING"; exit 2 | `OK: docs/PROGRESS.md is current (28.1% of 57 features)`; exit 0 |
| `node --test scripts/catalogue-cli.test.mjs` | 13 tests, 7 pass, 6 fail | all pass (with catalogue.test.mjs: 35/35 pass before adding the new test; catalogue.test.mjs now 23/23) |
| `node --test scripts/lib/ledger-union.test.mjs` | 29 tests, 27 pass, 2 fail (stale fixture + G4 master) | 29 tests, 28 pass, 1 fail (G4 master only) |
| `node scripts/lint-dirsize.mjs` | | `lint-dirsize: OK (123 dir(s) within budget)` |
| new test against pre-fix `scripts/lib/catalogue.mjs` | | FAILS (22 pass / 1 fail), passes with fix |

Files: `scripts/lib/catalogue.mjs`, `scripts/catalogue.test.mjs`, `scripts/lib/ledger-union.test.mjs`, `qa/issues.scorefix.jsonl`, this manifest. No file added under `scripts/` or `scripts/lib`.
