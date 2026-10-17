# Verdict - iss-dupesfix-duplicate-export-names
VERDICT: PASS
Cycle checked: 0
Commit checked: 2b7423d (base 01635f6)

EXPLANATION:
- Every changed source line differs only by the renamed identifier (TileVerdict, decideTile, RowVerdict, ImportGraph, LockSpec, alertWhoHostOnly); no logic, export set or formatting change. scripts/ and any allow-list untouched.
- No stale references: the old names remain only in their long-established other files (send-now-command.ts hostOnly and its test; other Verdict/decide/Graph/Spec files untouched).
- `lint-dupes: OK (1070 unique export(s), 27 unique schema $id(s))`; lint-dirsize OK (123 dirs).
- tsc --noEmit: core 0, ingest 0, meeting-bot 0.
- Tests: tile-alignment 34/34, retention-report 31/31, alert-who-command 18/18, send-now-command 10/10, send-now 28/28, lock-guards 16/16, lock-explore 11/11.
- hostOnly ruling: the two functions differ as the manifest says. send-now's looser hostOnly is called once (send-now-command.ts:74), only to fill the refusal message text when reason is credentials-in-url; display only, no decision depends on it, and it never returns userinfo. Not a defect worth filing (note only).
- git merge-tree against codex/machine-migration-2026-10-09: clean, exit 0, no overlap.

ISSUES-WRITTEN: none
