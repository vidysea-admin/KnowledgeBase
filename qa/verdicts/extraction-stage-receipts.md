# Verdict: extraction-stage-receipts (cycle 0)

Date: 2026-10-26. Bound to D:/KnowledgeBase, HEAD a8d3c0f4 (branch docs/devops-golive-2026-10-26). Mode A, resume-reconcile dispatch.
Contract: qa/contracts/goal-u22.md (P1-P4, S4 as scoped) + qa/contracts/parallel-extraction-adjudication.md clauses 3, 5.
Policy-Version: proportional-verification/2026-10-19.17 (manifest has no pin; current block version used). The manifest's admission HOLD is superseded by policy .12 (ratio diagnostic only).

## Check plan
Logic changed (2 additive read-only .mjs files) -> candidate identity, focused test, own CLI, one falsification per scoped criterion in a copy, diff scope. No UI, live, security/prod-write trigger or provider call.
Candidate: both files equal HEAD blobs (git hash-object == rev-parse HEAD:). LF-normalised SHAs 6465571a... / 1808871b... equal the manifest pins; the worktree is CRLF via autocrlf, so raw SHAs differ: not drift.
Diff scope: 2 new files (commit 0f3d9bb4), nothing removed, nothing outside "What changed".

## Evidence
1. Bound tree, focused test `node --test --import tsx scripts/eval/extraction-stage-receipts.test.mjs`: 2 pass, 1 FAIL (test 1, `Error: packet-drift` thrown by pre-existing loadBundle, extraction-review.mjs:25). Cause is workspace data, not unit code: data/eval/extraction-adjudication-packet.json is `i/lf w/crlf` while its pin is the LF hash. The sibling `scripts/eval/extraction-review.test.mjs` fails identically in the same tree (pre-existing; no baseline-reds.md exists). The bound-tree CLI refuses generically (exit 2, only {version,complete:false,failure:"stage-receipt-refused",humanGold:false}): fail-closed, no diagnostics, as P1 requires.
2. Byte-faithful copy of HEAD in scratch (outside the bound root; per-file EOLs restored until every pin matched raw: index.json, 8 batches, 46 session artifacts; the 3 ignored synthetic-* dirs added). CLI exit 2: 35 declared / 29 acquired / 6 failed; 72 claims / 80 citations / 14 invalid; raw, parsed, filtered 0 of 35 available with rows null; persisted 29 available / 6 unavailable; complete false; 29 artifacts, 23 packetBound; humanGold false; semanticLabelsImported 0; bindingThresholds null; request refused `stage-evidence-unavailable` for all four stages; no forbidden text key present. Only deviation from the maker's test: undeclaredDirectories is 0, not 2 (ISS-389). With that one literal changed in the copy: 3/3 pass, 0 skipped.
3. `python -B contracts/verify_contracts.py` (system python, .venv absent here): exit 0, "no frozen contracts yet -- PASS by vacuity".

## Criteria (scoped; parent gates stay unmet by design)
Each falsification: green-before in the copy, red-after on the named assertion, copy discarded.
| Id | Result | Evidence |
|---|---|---|
| P1 bind to measured bytes, unavailable stays failure | met | item 1 refuses on drifted bytes; item 2 counts; F1 `failedCases:0` -> test:7 red; F1b `packetBound: true \|\|` -> test:13 red |
| P2 stages separate, missing explicit | met | F2 `complete:true` -> test:18 red; F2b raw rows 0 not null -> test:9 red |
| P3 no gold from declarations | met | F3 `humanGold:true` -> test:20 red |
| P4 no implied threshold, validator | met | F4 `bindingThresholds:0.5` -> test:20 red; item 3 |
| S4 downstream consumer, no imported labels | met | F5 drop duplicate-stage check -> test:27 red; requireStages applied to the real receipt in item 2 |
| Adj-3 unavailable = acquisition failure | met | item 2 (6 failed, none a zero-row success); F1 |
| Adj-5 humanGold false, thresholds null, text-free output | met | item 2; F6 CLI emits error detail -> test:36 red |
Mutants beyond the floor: 0. Not established (reported, not failed): full parent P1-P4, actual Umesh approval, raw/parsed/filtered acquisition, thresholds.

FAILURES: none.
Filed, non-blocking: ISS-389 (low, test pins stray-dir count 2, real value 0), ISS-390 (medium, CRLF/LF drift of pinned eval data makes loadBundle refuse in this checkout, also reds extraction-review.test.mjs), ISS-391 (low, process, wall over 10 min).
Note for the maker: this PASS certifies the code at HEAD. The unit's real-data test is not green in this checkout until the pinned data EOLs are restored (ISS-390). No repair cycle is warranted: neither cause is in the unit's files.

VERDICT: PASS
SCOREBOARD: 7/7 scoped criteria met, 0/0 invariants
TIER: S (two additive read-only files, no existing caller, no L trigger)
CAPABILITY-COVERAGE: 8/8 floor falsifications reproduced (manifest has no table; mapped by checker)
LIVE-BROWSER: not-applicable (scripts/eval/*.mjs)
ISSUES-WRITTEN: ISS-389, ISS-390, ISS-391
EXECUTOR: claude-sonnet-subagent
EXPLANATION: The unit's code is the committed candidate and behaves per contract on pinned bytes, failing closed on drifted ones. Its own real-data test is red in this checkout for workspace reasons (CRLF drift of byte-pinned data, plus a stale stray-directory count), both filed. The parent P1-P4 gates remain open as the manifest states.
Metrics: start=2026-10-26T21:48:50+05:30 end=2026-10-26T22:04:00+05:30 wall_min=15 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=8 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=910 mutants=0 defects_unit=0 defects_6c=0 slow: EOL-faithful copy reconstruction 8
