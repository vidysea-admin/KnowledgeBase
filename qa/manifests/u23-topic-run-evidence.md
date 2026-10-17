# U2.3 topic-run acquisition evidence

**Handshake status:** building
Status: building
Fix cycle: 0
Task: U2.3; priority tier 3.
Packet: qa/packets/u23-topic-run-evidence.md

## Authorization and scope
Central coordinator granted two new source paths plus matching QA metadata on 2026-10-15.
Distinct acquisition-evidence behavior; no extraction-logic polish, extractor edits or barrel changes.
Actual buildTopicIndex input/output acquisition with source-byte hashes, logical completion artifacts,
known/unknown usage, degradation and downstream topic-tree evidence. No application wiring.
Ground truth: TASKS.md U2.3; qa/contracts/goal-u23.md clauses 2–6 and 8–10 boundaries;
D-163; ARCHITECTURE H3 and section 5. No new acceptance threshold or human gold.

## Candidate
Exact candidate ID: sha256:c5303a707b49776df8394657235767eeb8b697787699f7c2948864ddcaabeccf
Inventory: qa/packets/u23-topic-run-evidence.inventory.sha256.
Algorithm: SHA-256 of UTF-8 without BOM inventory of the two changed owned source/test paths,
sorted ascending; each line is repository-relative path + one ASCII space + lowercase raw-file
SHA-256 + LF, including the final LF. QA metadata/inventory are excluded to avoid self-reference.
Base/reference HEAD: 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a.
Both source files are new/untracked; no tracked base existed. Candidate is the hashes, not HEAD.
- packages/index/src/eval/topic-run-evidence.ts: b6b6908f31a2de9150d037bf15a36e9ad9a61dcf67b800aee0ba0cde14f6fcbc
- packages/index/src/eval/topic-run-evidence.test.ts: 18cc36e3fbbfc1519ad9b8235db68c50dcd6ed1d28f9e6f850cb6368444ae608

## Evidence and remaining work
Source is frozen for sole-broker execution. No tests, typecheck, contract validator, providers,
network, DB, browsers, subprocesses or raw-corpus QA copies were performed by this maker.
Eight authored tests are unexecuted. Exact broker command and dependency/sample pins are in packet.
Required: broker affected-stage/downstream receipt, frozen-contract validator evidence, then independent
checker with checker skill/assess gates. Do not mark ready-for-check before required evidence exists.
Full U2.3 remains HOLD: real configured-provider acquisition/quality, approved U2.2 item-level gold,
binding thresholds, runtime integration, actual persistence and rollout are unverified.

## Actual maker accounting
Measured source phase only: 2026-10-15T10:05:22.142Z–10:07:43.316Z, 141.174 seconds wall.
No tool waits were subtracted; phase is conservative elapsed, not provider-measured active time.
Earlier survey/reading and later packet preparation time are unmeasured; total active time, tokens and
monetary cost unknown. Do not use source-only wall as comparable whole-maker denominator.

## Broker evidence reconciliation — still building
Later sole-broker shared six-unit run executed all eight topic test names, 26/26 total PASS,
0 failed/skipped/cancelled/todo, process exit 0. This supersedes the initial unexecuted-test state
above; maker itself ran no tests. Shared receipt/actual command/runtime/environment/log pins are
recorded in packet; no standalone topic exit code or whole shared-duration debit is invented.
Candidate ID and cycle 0 unchanged. All 62 receipt pins and runtime executable rehashed current,
matching before/after. Sample source bytes were not included in that receipt's before/after inventory;
the source-bound sample test passed, but exact historical sample-byte continuity is not asserted.
Await central FINAL shared checkpoint and applicable types/build/verifier/static receipts before
ready-for-check and fresh independent checker. Real provider/gold/threshold/persistence remain unverified.

## Targeted actual-sample gap closed — still building
Sole-broker qa/goal-vectorless-2026-10-15/verification-u23-actual-sample.json records the one exact
sample case PASS, exit0, no skips/failures, elapsed383.0218ms. Both original sample hashes and
all44 actual receipt pins match before/after/current; no raw corpus copied. This closes the later
exact-sample continuity gap above without replacing/repeating shared26 evidence.
FINAL public checkpoint qa/coordination/knowledge-brain-20261015/final-shared-public-checkpoint.json
is source-frozen-not-checked, all24 pins independently rehashed current without drift. It is not a
whole-repository freeze or acceptance receipt. Candidate/cycle unchanged.
Required engineering receipts still pending: applicable types/build, frozen-contract verifier and
static checks, then independent checker admission under installed actual_total helper/root finite ceilings.
No READY/verdict issued. Provider/gold/threshold/persistence and full parent acceptance remain unverified.
