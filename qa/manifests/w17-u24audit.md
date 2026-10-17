# w17-u24audit

**Handshake status:** ready-for-check
Status: ready-for-check
Fix cycle: 0
Lane: lane/w17-u24audit · Base: a0391420 · Candidate: see the lane HEAD commit ("w17-u24audit") · Tier: medium ledger rows (no auth/tenancy/data-write), light ceremony.

## Issues addressed (ledger rows NOT flipped; checker/integrator flips them)
- **ISS-U24SMART-002** (qa/issues.u24smart.jsonl): finding at base — `scripts/lib/audit-closed-class.mjs` already speaks the grounded reply shape `{label, name, evidenceQuote, evidenceKind}` (landed by commits 5fa25015 / 52c1b294 under ISS-U24SMART-002/-004) and has `--self-test`, but nothing in the repo exercised it as a test. This unit adds the missing standing regression test and exports the probe (CLI guarded by an entry-point check) so it is testable.
- **ISS-284** (qa/issues.jsonl): `u2-4-phase3-precision-regate.md` gains section "Evidence-directory disclosure" listing all 41 files in `qa/evidence/u2-4-phase3-precision-regate-2026-09-22/` with bytes, sha256 and purpose, including the undisclosed `07-per-block.mjs` and `per-block-results.json`, plus the corpus-drift note (ISS-290 pin is the durable fix). No evidence deleted, no verdict touched. ISS-282 (precision gate) untouched.

## Changed paths
- scripts/lib/audit-closed-class.mjs (export `shipsAsPerson, probeCurrent, selfTest, setProbeShape`; run CLI only when executed directly)
- scripts/qa/audit-closed-class.test.mjs (new; in scripts/qa because scripts/lib is at the 30-file dirsize budget)
- qa/manifests/u2-4-phase3-precision-regate.md (disclosure section, additions only)
- qa/manifests/w17-u24audit.md (this file)

## D-015 corpus count
`ISS-U24SMART-002: 409/409` — the row's recorded reproduction (legacy-shape probe never sees a bypass) is replayed against the 409-word closed-class corpus: with a planted gate-less extractor the current probe reports 409/409 bypasses; the legacy-shaped probe is detected as vacuous (control throws). Compliant production extractor: 0 bypasses (60-word slice in test; full 409 via CLI: `LIVE BYPASSES: 0 / 409`). The row's text records one failure shape, not a word list; nothing left open.

## Checks a checker must run (repo root of lane; node on PATH from codex runtime; needs node_modules junctions at root and packages/index)
1. `node --test --import tsx scripts/qa/audit-closed-class.test.mjs` -> tests 5, pass 5, fail 0.
2. `node scripts/lib/audit-closed-class.mjs --self-test` -> both CAUGHT/DETECTED, rc 0; `node scripts/lib/audit-closed-class.mjs` -> 0 / 409.
3. `node scripts/lint-loc.mjs --all` -> stages loc, dirsize, root, dupes, migrations, codex-hooks, snapshot, lint-tests, tracker exit 0; `dependencies` stage exit 1239 = unresolved workspace imports (e.g. apps/api test importing express) from the lane's incomplete node_modules junction, none cite audit-closed-class; environment gap, not a unit failure.
4. `node scripts/tracker-audit.mjs --gate g1,g4,g5` -> rc 0 (only pre-existing advisory G4 lines).
5. D-020 mutation: `replyFor` forced to the legacy shape -> 3 of 5 tests fail and `--self-test` throws "vacuous"; restored, `git hash-object` identical and `cmp` clean, tests 5/5 again.
6. Verify the 41 sha256 values: recompute `sha256sum` of each file in the evidence dir and compare with the manifest table (all 41 matched at authoring).
