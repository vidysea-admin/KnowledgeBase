# Verdict: cilinux2-d015-test-malformed-shard-row

VERDICT: PASS
Cycle checked: 0

EXPLANATION:
- Mutations on the ledger (each restored with git checkout; qa/issues.jsonl blob equals HEAD):
  - ISS-104 reproduction changed ("I am Not sure" to "Nox"): test FAILS (109 pass, 1 fail).
  - ISS-104 row id renamed (missing): FAILS.
  - ISS-104 row malformed (`{{`): FAILS, because JSON.parse throws.
  - Second ISS-104 row in another shard with truncated evidence: FAILS. Last row wins (shard order), and a disagreeing row is caught.
- Whitespace: the match is `/"id"\s*:\s*"ISS-104"/`, so `"id" : "ISS-104"` is still parsed. The spaced-id plus changed-reproduction mutation FAILS, so there is no vacuous pass for that form. Residual: a unicode-escaped id (`ISS-104`) would be skipped, but the "row missing" assert then FAILS, so it cannot pass vacuously.
- Baseline 110/110. Full packages/index suite: tests 635, pass 635, fail 0.
- Note (not backlog): last-per-id means a later-sorting shard overrides, the same as before the change.

ISSUES-WRITTEN: none
