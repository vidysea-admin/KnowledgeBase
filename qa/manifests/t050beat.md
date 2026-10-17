# t050beat - ISS-W050-002 heartbeat test
Status: checked-PASS
Fix cycle: 1
Base SHA: 0a173706 (codex/machine-migration-2026-10-09)
Candidate SHA: see lane/w16-t050beat HEAD
Changed paths: packages/core/src/pipeline-graph/session-run.test.ts (new test), qa/manifests/t050beat.md. No product code changed.
Clause: T-050 C4 (long stages / lease heartbeat). ISS-W050-002: M4 (session-run.ts everyMs > 0 -> false) survived 6/6.
Test: "ISS-W050-002: ..." counts queue heartbeats strictly inside one slow handler's 400 ms await (heartbeatMs 20): >= 2 required; then asserts beats stop after the run ends.
Checks: node --test --import tsx packages/core/src/pipeline-graph/session-run.test.ts; replay M4.
Evidence: green 7/7 x3. M4 replay (per-mutation backup, trap, HEAD hash match afterwards): pass 6 fail 1, "expected at least 2 timer beats while the slow stage ran, got 0". Stage A 5 files (--test-concurrency=1, 60s timeout): tests 34 pass 34 fail 0, 80 s (33 prior + 1 new).
ISS-W050-002: 1/1 recorded reproduction (M4) now killed.
