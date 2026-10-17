# T-022 calibration human-review intake

Status: checked-PASS
**Handshake status:** checked-PASS
**Fix cycle:** 0
**Task:** T-022; related U0.10
**Priority tier:** 3 — dependency-ready roadmap task; T-021 completed under D-156.
**Base commit:** 4f449b27e8573a5fd0fb8d88bdbd2b260b1ecccd
**Packet:** qa/packets/t022-calibration-human-review.md
**Verdict:** qa/verdicts/t022-calibration-human-review.md (independent checker owned)
**Contract:** qa/contracts/t022-calibration-human-review.md (checker established C1–C5)

## Authorized scoped behavior

Prepare thirty individually unreviewed query/document pairs from fifteen evenly spaced
current golden questions, each paired with its recorded semantic best rival. Exact
current title/summary inputs are neutralized and grouped into three batches of ten.
Review-only node IDs use session IDs, not production tree paths; the production judge
consumes only title and summary. Export a separate reference artifact only after all
individual human score/approval assertions validate and bound inputs remain unchanged.

No provider calls, DB writes, gold/threshold changes, tracker edits, legacy calibration
changes or task closure. Umesh individual reviews and real live-judge calibration remain.
The file tool records approval assertions; it cannot authenticate reviewer identity.

## Changed paths and provenance

All files are new, with no tracked base:
- scripts/eval/calibration-review.mjs
- scripts/eval/calibration-review.test.mjs
- data/eval/calibration-human-review.json
- this manifest and qa/packets/t022-calibration-human-review.md

The source packet embeds exact byte lengths and SHA256 of golden/rival evidence,
current session/page files, buildTree source and production scorer source.
Existing evaluator-calibration MAE and u010harness source/artifacts remain untouched.

## Evidence and remaining check

- `node scripts/eval/calibration-review.mjs prepare --out data/eval/calibration-human-review.json`
  exit 0; tool command wall time 0.5506569 s; 30 items, three ten-item batches; all human fields null.
- Initial `node --test --test-timeout=30000 scripts/eval/calibration-review.test.mjs`
  failed before tests with runner `spawn EPERM`; exit 1; shell stopwatch 0.2951642 s.
  An escalated retry was aborted during approval after 481.2 s; no test execution followed.
- A first generation attempt importing tsx/buildTree also refused `spawn EPERM`.
  Current source removes that unnecessary subprocess path; the successful command above
  runs plain Node and projects the existing documented default title/summary inputs.
- `node --test --test-isolation=none --test-timeout=30000 scripts/eval/calibration-review.test.mjs`
  exit 0; 9/9 tests PASS; shell stopwatch 1.9310297 s; Node test duration 1778.1007 ms.
  Includes real thirty-item artifact/current source parity, pending refusal, synthetic fractional
  reference export consumed by actual computeMAE (n=30, MAE=0), no-overwrite and refusal boundaries.
- `python contracts/verify_contracts.py` exit 0; shell stopwatch 0.2186865 s.
  Output: `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`.
  Empty registry is not correctness evidence for this intake feature.

Final bytes for cycle 0 (all new; no tracked base):
- scripts/eval/calibration-review.mjs: B40D93A9DAEAC44FFB467A9889B26663DC1603C8903828FE7585A6468CE9A057
- scripts/eval/calibration-review.test.mjs: 7A8E3FE620FBE0CC09E62FC8CAD81D259A2FE745DB6490BDC728B53B1FC27D74
- data/eval/calibration-human-review.json: 99AB6556BC46D84F25AA30319FB7E1D27AFB67571389106049939FEBE1D43B61

Independent checker PASS cycle 0: qa/verdicts/t022-calibration-human-review.md,
persisted 2026-10-14T09:01:05.398Z. Checked source/test/artifact hashes above remain unchanged.
Independent checks: 9/9 tests, 44/44 source bindings, 30/30 current input bindings,
30/30 missing individual approval refusals, forged-binding refusal, actual async computeMAE
on synthetic 30-pair references (MAE 0.125), and explicit vacuous frozen-validator PASS.
ISSUES-WRITTEN: none. Close-out covers intake only; T-022/U0.10 remain open for thirty
individual real human reviews and live approved-reference judge calibration.
