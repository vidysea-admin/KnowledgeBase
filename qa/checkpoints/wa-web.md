# Checkpoint wa-web (checker a, cycle 0)
Base 80073a37, Head c772be75. Bound root .worktrees/wa-web unchanged (git status clean; hash-object == HEAD blob on touched files).
Evidence: vitest 27 + 34 + tsc 0 re-run in an isolated git-archive copy (junctioned node_modules); 10 mutants in per-mutant copies (m1-m7, m8a, m9b, m9c; order-swap variant of ISS-WASEL-002 not run); live walk 38/38 in qa/evidence/browser-wa-web-2026-10-30-checker/report.json; tarball qrcode-generator 2.0.4 integrity matched lockfile.
Mutation results: m1 W10-1 RED, m2 W10-2 RED, m3 W10-3 RED, m4 W10-4 RED, m5 W10-5 RED, m6 W10-6 RED, m7 W10-7 RED, m9b ISS-WASEL-002 RED, m9c ISS-WALINKS-009 call-site RED, m8a (QR_POLL_MIN_MS 3000 -> 2000) SURVIVED (test imports the constant).
