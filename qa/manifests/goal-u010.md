# U0.10 corpus-bound real-baseline runner and audit

Status: checked-PASS
**Handshake status:** checked-PASS
**Fix cycle:** 1
**Task:** U0.10; related T-021/T-022; active ALL40 goal remains unchanged.
**Priority tier:** 3, user-directed dependency-ready roadmap work.
**Classification:** security class, uncapped: explicit credentials, tenant/corpus isolation,
bounded paid I/O and evidence/checkpoint data writes. Existing u010harness has one
source-scoped PASS; it is not whole-task baseline acceptance.
**Base commit observed:** ed542fd01c870e5d5b64e1d72b413062d595f675
**Contract:** qa/contracts/goal-u010.md A1–A16, independently checker-owned.
**Packet:** qa/packets/goal-u010.md
**Maker:** /root/roadmap_status/maker_u010
**Checker:** /root/roadmap_status/checker_u010
**Verdict:** qa/verdicts/goal-u010.md, checker-owned cycle 1 source PASS; cycle 0 FAIL preserved.

## Full authorized behavior

Implement the full current corpus-bound actual generative-judge runner plus honest
auditor, not a historical-audit-only substitute. Explicit official Ollama/Gemini
adapters run the actual production createLlmScorer prompt/parser behind bounded HTTP.
All current golden IDs and all candidate sessions are scored; every actual HTTP
attempt is durably reserved first. Per-cell immutable checkpoints preserve whole
rankings, partial work and uncertain interrupted calls for verified resume.
Provider order is checked from full bound predecessor evidence (GLM, then DeepSeek,
then Gemini last). Genuine thirty-item human references reuse the independent
operator-bound T-022 export/confirmation/checked-receipt validation and the actual
computeMAE consumer. Pending/plain asserted reviews refuse before provider import.

Historical files, proxy references, production routing, Mongo/jobs, schema, trackers,
decisions, shared integration, contracts and git state are never edited here.
Source-scoped PASS cannot close U0.10: actual full model runs and genuine reviewed
thirty-pair judge agreement remain required. No new paid provider execution occurred.

## Changed paths

All are new files, no tracked base existed:

- scripts/eval/u010-corpus.mjs
- scripts/eval/u010-state.mjs
- scripts/eval/u010-provider.mjs
- scripts/eval/u010-baseline-run.mjs
- scripts/eval/u010-baseline-audit.mjs
- scripts/eval/u010-baseline-run.test.mjs
- qa/evidence/goal-u010-maker/verification.md
- this manifest and qa/packets/goal-u010.md

## Evidence

See the exact commands, exit codes, counts, durations and raw summary in the maker
verification receipt. The final central broker run passed 13/13, exit 0, 4.4133813 s;
actual production Ollama/Gemini with fake HTTP and actual computeMAE were exercised. Four
historical reports were consumed without rewriting them. Current corpus: 92 golden
questions, 29 candidates, five excluded non-session directories, 2668 full-ranking
calls per model. Existing 2200-call reports scored only 75/92.

Central frozen-validator evidence is attributed reuse only:
qa/evidence/goal-t051checker-validator.json (byte pins independently read/matched).
Exit 0, vacuous PASS; individual duration unknown. No duplicate verifier was run.
No broad suite/typecheck/global structure result is claimed.

The final thirteen-case run includes actual Gemini/fake HTTP after full verified
synthetic Ollama predecessors, no-redirect/operator-proof changes and paired-checker
findings: preimport/final source drift, exported paid entry refusing typed approval
flags, and dead acquisition recovery. Central receipt:
qa/evidence/goal-t051checker-broker-u010-final.json, SHA-256
76315611d0f4a84b290de98cd4115f1e8c07c06acfc840efb23d9a4a18b7e786.
All nine candidate/immediate dependency byte pins match before/after. The packet
contains cycle-0 source hashes. That green maker suite did not cover the independently
reproduced ownership bug; checker cycle 0 is FAIL. Whole task is HOLD.

## Cycle 1 — ISS-U010CHECKPOINT-001

Root authorized the uncapped security/data-write repair after independent actual red.
The owner token is now cryptographically unique per acquisition. Cleanup requires
successful creation, the descriptor-bound physical file identity and exact current
owner bytes; a refused contender cannot remove any owner lock. Release preserves a
replacement file even with equal token bytes. Positive PID validation precedes
liveness checks; acquisition-directory removal requires directory identity.

The exact ledger frozen-clock recipe is copied verbatim into the standing suite;
two new cases add repeated contender refusal, equal-byte replacement, corrupt owner,
post-acquisition cleanup failure and invalid PID refusal. The standing suite now
has fifteen cases. Central broker standing suite: exit 0, 15/15 PASS, TAP
3701.7637 ms, wall 3805.5458 ms, nine before/after pins unchanged.
Exact independent recorded A14 command: exit 0, 1/1 PASS; TAP 69.8137 ms,
wall 166.0382 ms; ten pins unchanged including checker corpus.
ISS-U010CHECKPOINT-001: 1/1 owner preserved against its recorded reproduction.
Receipts: qa/evidence/goal-t051checker-broker-u010-cycle1-standing.json and
qa/evidence/goal-t051checker-broker-u010-cycle1-ledger.json; hashes in packet.
No maker duplicate execution. Independent full six-probe checker suite passed 6/6,
exit 0, TAP 931.0867 ms, wall 1043.8314 ms; all ten source/dependency/probe pins
unchanged. Receipt: qa/evidence/goal-t051checker-broker-u010-cycle1-independent.json,
SHA-256 a4dce95b22dbe2ba74c70b56bc13ab21962c2874544d2e1f86d604fd521cff4d.

## Matching-cycle source close-out

Maker read the matching cycle-1 independent source PASS and verified all ten current
source/dependency/probe pins against its actual receipt with zero mismatches before
this lifecycle-only flip. Verdict SHA-256:
78ef98bc9c586cdd78094c789f784e831cf832d3a480d1d4a42c2c23b127eebd.
ISS-U010CHECKPOINT-001 is checker-closed with its permanent red/repair history.
No tests/providers/trackers/git were repeated or changed. This is source utility
close-out only. Full U0.10 remains HOLD for ordered full actual-provider baselines
and genuine thirty-pair human-reference live calibration. Next dispatch-only plan:
qa/packets/goal-u010-provider-plan.md.
