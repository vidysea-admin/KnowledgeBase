# Fixture clock repair maker fragment — FROZEN cycle 2

Lease: packages/meeting-bot/src/capture/workspace/tab-session-workspace.test.ts only.
Base/source fingerprints: fixture-clock-pin.json; raw pre-edit bytes: backups/tab-session-workspace.test.ts.pre-clock.

Two changed lines: add performance.now mock using current - initial logical epoch, and restore it in the existing finally before restoring Date.now. Both clocks advance by the same delta in this synthetic fixture, allowing the production discontinuity guard to assess its intended steady-clock case. Every assertion, producer origin, cross-tenant/slot attack and downstream check remains byte-identical. Dedicated clock-jump privacy regression and all production source are untouched. Comparison with backup confirms the exact two replacements; git diff --check exits 0.

No tests/build run. Actual maker tokens/active usage unknown. No PASS claim. Local milestone commit and independent checker are parent responsibilities. Applicable behavior/clauses, latest failure receipt and proposed gate rationale: diagnosis-current.md. This change supplies no actual browser calibration or full T-034 task proof.
