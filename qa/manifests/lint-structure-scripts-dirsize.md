# lint-structure-scripts-dirsize

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 3 (roadmap hygiene; D-124/D-125 red `lint:structure`). Class: no code or data write. Verdict by the checker only.
Lane: lane/dirsize. Lane ledger `qa/issues.dirsize.jsonl`: no findings filed (file not created). Existing ledger rows untouched.

## Result: NO RELOCATION MADE (the premise is stale)
At HEAD b9e6f80 the top-level `scripts/` directory holds 32 files and its budget is 32 (`structure.config.json` -> `dirsize.overrides.scripts = 32`). `lint-dirsize` does NOT flag `scripts`. Nothing was moved; moving files with no violation would only churn references. If another lane lands a 33rd top-level script, the least-coupled move candidates would be one-off TOC tools (`recover-toc.mjs`, `validate-toc-migration.py`, `fix-corrupted-speaker-labels.mjs`) into an existing subdirectory, with package.json / `test:lint` / docs references updated.

## Budget governance (read-only)
Budgets live in `structure.config.json` (D-003, T-017), enforced by `scripts/lint-dirsize.mjs`; per-directory `overrides` came from D-017 (supersedes D-016) and later raises are DECISIONS-governed (`Changes-authorized: structure.config.json`). Raising a budget is therefore an Approver decision; not done here.

## Evidence: `lint:structure` (lint-loc.mjs --all, node off PATH) at HEAD b9e6f80, before and after (identical, no change made)
10 stages, 4 failed:
- loc FAIL (1): `packages/meeting-bot/py/sb_join.py:1142 (budget 300)`
- dirsize FAIL (3): `packages/meeting-bot/src/calendar: 31 files (budget 30)`; `apps/api/src: 32 files (budget 31)`; `apps/api/src/routes: 32 files (budget 30)`
- root FAIL (1): 18 loose files against 15 (includes `structure.config.json`, `tsconfig.base.json`)
- tracker FAIL: 9 gating G4 "ambiguous bare issue id" findings (manifests medium-fix-batch-2-2026-10-10, r1-attention-alerts, t-031-audio-watchdog, t-033-bot-tests, t034-tab-capture-extension-logic-tests, t036-calendar-description-link-scan, t037-join-rules-stale-lock-takeover, u3-notify-channels, u4b-heartbeat-collection) plus 11 advisory
- OK: dupes, migrations, codex-hooks, snapshot, lint-tests (18/18), dependencies (848 modules)

## Deferred / suggested fixes (not done)
- dirsize apps/api/src 32/31 and routes 32/30: deferred, other lanes are adding files there; move a cohesive group into an existing subfolder, or an Approver-authorised override.
- dirsize packages/meeting-bot/src/calendar 31/30: out of scope (packages/); move a cohesive file group (e.g. the CAS test) into a subfolder.
- loc sb_join.py: split into modules (stopped earlier, tests need a real browser) or Approver-authorised exception.
- root 18/15: move TASKS/HANDOFF/AGENTS or config files under docs/ or config/, or Approver-authorised budget change.
- tracker G4: requalify bare ids as ISS-<LANE>-NNN in the 9 manifests.

## NOT covered
No budget changed, no enforcement code touched, no scripts moved, no tests run beyond the lint's own stage.
