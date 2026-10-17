# Independent verdict — T-022 calibration human review intake

VERDICT: PASS
Cycle checked: 0
ISSUES-WRITTEN: none

## Scope and remaining gates

PASS covers only `qa/contracts/t022-calibration-human-review.md` clauses 1–5: current neutral intake, source/input binding, per-item approval assertion validation, refusal boundaries, separate reference export and existing MAE consumption. Existing evaluator-calibration scope/Non-goals remain binding. It does not close T-022/U0.10, approve labels, authenticate Umesh, or calibrate a live judge. All thirty real human reviews remain pending; live scoring and independent final calibration are required. No provider/DB/routing/threshold or tracker changes occurred in this unit.

## Checked final bytes

Validated against ready-for-check manifest and packet, cycle 0, and rechecked immediately before this verdict:

| Path | SHA-256 |
|---|---|
| scripts/eval/calibration-review.mjs | B40D93A9DAEAC44FFB467A9889B26663DC1603C8903828FE7585A6468CE9A057 |
| scripts/eval/calibration-review.test.mjs | 7A8E3FE620FBE0CC09E62FC8CAD81D259A2FE745DB6490BDC728B53B1FC27D74 |
| data/eval/calibration-human-review.json | 99AB6556BC46D84F25AA30319FB7E1D27AFB67571389106049939FEBE1D43B61 |
| qa/contracts/t022-calibration-human-review.md | D2F832D463BF7C3E6B2C5AFBE19174A6F59BEA5118AC51819C074204CD976978 |
| qa/evidence/t022-calibration-human-review-checker.mjs | C6F6AF0446FEDE2DF6DEDA1F8852BC819E573073E1057E715A565C74B40B396F |

All candidate files are new/untracked; no tracked base diff exists. Read the complete new source/tests, selected real packet data via the independent probe, production `build.ts` session-node construction, `score.ts` prompt inputs, and `calibration.ts` consumer. No prior PASS naming this new intake seam found. This is not a filed-issue fix, so no ledger reproduction corpus applies.

## Independent evidence

Exact product/test commands and independently observed results:

1. `node --test --test-isolation=none --test-timeout=30000 scripts/eval/calibration-review.test.mjs` — exit 0; 9/9 PASS, no skips; measured shell stopwatch 0.9798969 s; Node duration 861.9004 ms. Covers real packet parity/pending refusal, neutral diverse batches, synthetic fractional MAE, query/title/ID/batch tampering, source-byte drift, score/reviewer/date validation, stale rival/traversal/tenant refusal, and output no-overwrite. Single-process runner avoids the already known sandbox child-process restriction. Temporary fixture cleanup is bounded to verified named temporary roots; no product file was mutated.
2. `node qa/evidence/t022-calibration-human-review-checker.mjs` — exit 0; measured shell stopwatch 2.1987196 s. Independently checked **44/44 source hashes and byte counts**, **30/30 current query/title/summary hashes and neutral reviews**, **15 expected/rival pairs**, **three ten-item batches**, **30/30 single-item missing approvals refused**, and forged input hash refused. In-memory synthetic scores 0.375 consumed by the real asynchronous `computeMAE` with predictions 0.5 yielded **n=30, MAE=0.125**. Synthetic human assertions were never written to the real packet or a reference artifact. Exact emitted output:

```json
{"inputPairs":30,"questions":15,"batches":[10,10,10],"sourceHashes":44,"neutralRatings":30,"missingIndividualApprovalsRefused":30,"tamperedBindingRefused":true,"syntheticDownstream":{"n":30,"mae":0.125},"staleLegacyQueries":30,"legacyPairs":30,"syntheticApprovalsWrittenToDisk":0,"humanApprovals":0}
```

3. `python contracts/verify_contracts.py` — exit 0; measured shell stopwatch 0.1680535 s. Output: `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`. This validator provides no functional acceptance evidence; the scoped checks above do.

Every focused command finished normally; Node suite has its 30-second test bound. No source mutation run, browser, esbuild or live provider was used.

Attributed maker evidence reused for the real exclusive-create preparation command: `node scripts/eval/calibration-review.mjs prepare --out data/eval/calibration-human-review.json`, exit 0, tool wall time 0.5506569 s, final packet hash above. Real packet parity and all source/inputs were independently reproduced. Maker's 9/9 test and validator claims were independently rerun, not relied on alone.

## Findings and limits

The projection equals the default production session-node title and page summary used by the judge; review-only session IDs are explicitly distinguished from production tree paths. Packet ordering is deterministic and carries no proxy reference score. Source hashes and full immutable-packet comparison prevent retaining approvals after drift or tampering. Each individual finite score, Umesh assertion, nonempty rationale and canonical valid UTC timestamp is checked. File-tool assertions cannot establish actual human identity; this limitation is explicit in source, packet and exported provenance.

Independent inspection confirms **30/30 legacy proxy queries are absent from the current golden set**. The legacy set/results were retained separately; they cannot establish current human calibration. No thresholds were changed. This source PASS certifies the intake utility, not historic proxy results or human gold.

## Timing and phase checkpoints

Dispatch/launch timestamp was not measured; the first recorded checkpoint was **2026-10-14T08:39:22.8044847Z** during preliminary scope inventory. Preliminary review and maker-readiness/resource waiting preceded final verification; exact durations of those waits are unknown. Approval requested/resolved: none for checker execution; narrow new QA contract creation was authorized by the coordinator. Maker's earlier aborted escalation is attributed maker history, not checker execution.

Final ready scope/hash review checkpoint: **2026-10-14T08:57:48.5674536Z**. Commands ran after the runtime coordinator's explicit test GO and completed by measured checkpoint **2026-10-14T08:59:00.9984679Z**, with per-command durations above. Individual command start/end UTC timestamps were not separately captured. Slot released immediately afterward. Review/final-hash checkpoint: **2026-10-14T08:59:37.8199360Z**. Draft/persist start and confirmation follow below.

The 120–180 second launch-to-verdict target was exceeded because this checker was dispatched before maker readiness and waited for required final evidence and the shared-CPU slot. That is not a claimed measured breakdown: dispatch and wait intervals remain unknown. Final checks were completed rather than omitted; elapsed timing from the first measured checkpoint is recorded below, not represented as exact dispatch-to-verdict latency.

EXPLANATION: Scoped acceptance satisfied with no findings. Whole-task human/live-quality gates remain pending. No broad suite or contract relaxation occurred.

Persist marker UTC: 2026-10-14T09:01:05.2634816+00:00. Elapsed from first measured checkpoint: 1302.4589969 seconds; exact dispatch-to-verdict elapsed unknown.
