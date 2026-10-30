# Checkpoint — wa-unlink-consent (coordinator A, cycle 1)
Code head b7d4f0d7 (branch head 95ab9656 = manifest only) · base bf86b0b3 · env: node v24.13.1 win32, mongod 7.0.28 replSet 127.0.0.1:27851 (own, stopped) · deps: pnpm-lock at head
- W8-4/W8-6 targeted incl. real-Mongo: 37/37 PASS, 0 skipped (archive copy, junction node_modules)
- regression: 234 pass / 0 fail / 3 skipped; migration 8/8; tsc clean; lint-loc OK
- falsification: 10 mutants, 8 RED, 2 survivors named (M8 non-active links = declared product choice, M10 redundant assertion); all restores HEAD-fidelity OK
- verdict: PASS 12/12. Remaining: none. Resume: n/a.
