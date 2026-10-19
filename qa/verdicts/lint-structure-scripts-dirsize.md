# Verdict: lint-structure-scripts-dirsize

Cycle checked: 0
Verdict: PASS

Superseded check: `git log lane/dirsize --not codex/machine-migration-2026-10-09` shows one commit (accca195, manifest-only). Not superseded; no code in the diff, so mutation testing, tsc and package tests are not applicable (diff is 1 added .md file).

Claims verified:
- scripts/ top-level holds 32 files at base b9e6f802 (git ls-tree count 32); `structure.config.json` dirsize.overrides.scripts = 32. Confirmed.
- `node scripts/lint-dirsize.mjs` at lane HEAD reports exactly 3 violations: meeting-bot/src/calendar 31/30, apps/api/src 32/31, apps/api/src/routes 32/30. Matches the manifest.
- No relocation made, no budget or enforcement file touched. Confirmed.
- Not re-run: the loc, root and tracker stage numbers (outside this unit's claim; lint:structure not re-run).

Note: on current main scripts/ has 31 files (budget 32) and schema override 40 exists, so the conclusion still holds.

ISSUES-WRITTEN: none
