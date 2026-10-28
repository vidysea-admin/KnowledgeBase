# Checker packet — T-044 generation-bound QA, cycle 0

Repository: C:\Users\product\Desktop\KnowledgeBase
Manifest: qa/manifests/t044-qa-generation-binding.md
Independent contract: qa/contracts/goal-T044.md
Status: READY-FOR-CHECK, cycle 0 — independent execution still requires a fresh sole-broker CPU lease.

## Complete change map

- scripts/lib/transcription/transcript-qa-generation.mjs exports the producer builder, raw-byte SHA256 and report validators. The builder clones the evidence and hashes bytes read AFTER the producer's canonical transcript commit. Reports must have finite positive duration, integer reconciling counts, unique/in-range indices, consistent drop/past-end flags, valid repetition spans and derived overshoot. Attempt IDs are globally unique; accepted offsets/durations fit the recording. Nonempty final output requires retained span evidence, and accepted-span output counts must sum to merged inputCount. Ordinary clamping is repaired evidence; retained invalid timing, past-end, repeated runs and nonmonotonic indices cause refusal.
- scripts/webinar/validate/transcript-qa-binding.mjs checks the exact transcript hash, authoritative duration and output count, gates merged and accepted-span anomalies, and recomputes current timing/repetition/order with the existing packages/ai/src/stt/transcript-qa.ts clamp. Rejected attempts remain metadata. It never edits or imports a second clamp implementation.
- scripts/webinar/validate/validate-session.mjs replaces count-only qaEvidence with the bound proof evaluator. It reads turns.json once into a Buffer; canonical identity, existing validator/gap checks and the recorded turnsSha256 all concern the same snapshot. It separately reads QA once and records qaSha256 for those exact bytes, or null for absence. Report absence with QA flag off preserves baseline behavior; QA flag on plus absence refuses. A present legacy unbound report refuses. Local validation publication/history remains the existing atomic path.
- Three standing test files cover builder shape/conservation, immutable snapshots, accepted/rejected audit distinction, stale same-count evidence, wrong duration, repaired clamp, malformed reports and actual validateSession/loadWebinarSession admission/refusal.

## Owners and dependent integration

The T-048 owner has the long transcription driver; final API is buildTranscriptQaGeneration({turnsBytes, durationSec, spans, merged}). Each span is {id, accepted, offsetSeconds, report}. Retain the best prefix and recursive tail contributions; rejected earlier retries remain accepted:false. Single-call fallback must discard all single-path acceptance markers. Compute binding from readFileSync(turnsPath) after writeTranscriptGeneration. QA remains exact-string `1` and OFF otherwise. Invalidate existing validation before publication even for identical turns; publish QA atomically with cleanup on failure. The central session-rows owner must compare validation.turnsSha256 with the actual original speech bytes before screen composition, and verify validation.qaSha256 against the exact report bytes/presence. A prior legacy validation cannot authorize a newly bound version:1 QA report without revalidation. Those integrations are separately attributed and must be included in the final packet pins.

## Planned focused evidence

Root must grant the CPU lease before running:

    node --import tsx --test --test-concurrency=1 scripts/lib/transcription/transcript-qa-generation.test.mjs scripts/webinar/validate/transcript-qa-binding.test.mjs scripts/webinar/validate/validate-session.test.mjs

Maker's actual root-granted execution added `--test-timeout=30000`, ran under a hidden Start-Process wrapper with outer 120 seconds and direct approved esbuild escalation, and passed 28/28 with exit 0 in 3.7819494 seconds (Node 3596.6491 ms), zero failures/skips/cancellations. Raw stdout/stderr and exact command/result/source pins are in qa/evidence/t044-qa-generation-binding/maker-receipt.json and adjacent maker-tests files. Receipt SHA256: 9655a1a968c33008232d2a024eab2601f2eb48643db0059a0d09339f243d40fb. Seven pinned source hashes were unchanged after execution. No other test/build/validator/provider/media/DB/browser work was run under that lease; the slot was released immediately.

The shared driver owner supplies its focused retained-attempt/fallback and default-off evidence. The central consumer owner supplies its stale-validation/current-generation evidence. Frozen verifier command is `python contracts/verify_contracts.py`; report empty/vacuous coverage explicitly if that remains the output. Never substitute synthetic provider output for contract clause 6 actual-audio acceptance.

## Issue corpus and limits

Canonical row: qa/issues.revalidate.jsonl ISS-REVALIDATE-001. Its recorded evidence text is the regression floor. Each applicable case and original signal must be named in the execution receipt; absent preserved original harness commands must be disclosed. No own easier corpus is substituted. Deliberate remaining baseline cases: no-QA/flag-off repetition (D-162) and monotonic overlaps lacking an approved refusal policy. ISS-REVALIDATE-002 is separate human policy. No ledger or checker verdict is modified by the maker.

Additional checker-raised corpus: unchanged canonical turns with a newly accepted past-end-tail report, QA creation after an absence-bound validation, QA removal/truncation after a hash-bound validation and publication failure leaving the explicit failed/pending gate. Final source/real consumer, attributed driver proof and shared vacuous frozen-contract receipt/pins are complete below; independent own-probe output and verdict remain pending. No required evidence is inferred from source review.

Targeted ledger count: ISS-REVALIDATE-001 3/3 recorded attack types refused (same-count replacement; exact clamped=20/dropped=5/overshoot=400 fields; swapped ordering with clean claimed metadata). The ledger does not preserve a standalone harness/commands, so these are reproducible standing-test reconstructions, not a claimed verbatim full-corpus replay. Named open scenarios: 75 identical turns/no QA/flag unset remains disabled-mode behavior under D-162; monotonic overlaps lack an approved blanket refusal policy. The issue remains open; no maker ledger update is authorized.

## Historical maker source pins before first focused execution

Tracked base commit observed with read-only Git: ed542fd01c870e5d5b64e1d72b413062d595f675. The existing two validator files' base hashes below are normalized-LF UTF-8 Git-show text hashes; they are not represented as original CRLF filesystem byte hashes. New helper files had no base. Final hashes are actual filesystem SHA256 values, captured by Get-FileHash; re-pin after any fix.

| File | SHA256 |
|---|---|
| Base validate-session.mjs (normalized LF) | efe3997f3c09f547a57d80db421cfa298649848d9dc0f11628b14c9e30c13695 |
| Base validate-session.test.mjs (normalized LF) | 627077c266c8b9e069aa9d108c66a03b963fb204719796007517a6980f9f95fc |
| scripts/lib/transcription/transcript-qa-generation.mjs | a3c01df4e602078e8c61e1744c7e75cfe3c39326a9a7c7798d8a1655e51530b5 |
| scripts/lib/transcription/transcript-qa-generation.test.mjs | b00fa3b56186c671b655db6baae5797345db1ab7c920d2a09e5e3cf9bbeb17ee |
| scripts/webinar/validate/transcript-qa-binding.mjs | 2bb52d0c84799a019f7d3b2eb83f27766ab90ad7e31caacda64d351706637178 |
| scripts/webinar/validate/transcript-qa-binding.test.mjs | 639a229e78f76731e68c59a60ea8ba1546ce7cb56d67f066d53670adcd0ad795 |
| scripts/webinar/validate/validate-session.mjs | bd0d2ee2a44bc94867447c29b1409953d2c88f66bd0b1eb6a74f48096d24f6ee |
| scripts/webinar/validate/validate-session.test.mjs | b8c590252916f157cb9b1307a70947ecc673ad86c74d00598f8784f1c386a6de |

Read-only source-budget check exited 0: owned implementation lines 78/23/148; owned test lines 55/70/272; scripts/lib direct file count 30. These are source counts only, not lint/test PASS claims. Central driver and consumer integration pins will be added to the READY receipt.

## Resumed candidate: exact committed bounds

Three owned files changed after the historical 28/28 batch and before READY: transcript-qa-binding.mjs, its test, and validate-session.test.mjs. Admission now checks original finite committed timestamps against exact 0 <= tStart <= tEnd <= D. The clamp's uncounted 1e-6 tolerance snap and the adjacent validator's D+0.5 tolerance otherwise permitted a canonical bound tEnd=D+1e-7 to evade the modification-count check. Two standing boundary probes were added. No clamp logic or capped clamp/report seam was changed. The same final three-file batch is queued with docker_checker and has not run; the historical receipt/pins remain preserved as historical evidence. Re-pin the final candidate and distinguish its new result from the earlier 28/28.

The resumed candidate's current sixteen source/dependency/contract pins and exact command are frozen in `qa/evidence/t044-qa-generation-binding/candidate-0-resume-pins.json`, created without overwrite. The actual final central execution receipt is `qa/evidence/goal-t051checker-broker-t044-final.json` with adjacent stdout/stderr: **exit 0, 30/30 PASS, zero skips/cancellations, 3147.4811 ms wall / 3044.1446 ms TAP**, UTC 2026-10-14T20:11:11.236Z to 20:11:14.390Z. All sixteen pre/post pins match. This final run includes both exact-boundary regressions and actual validateSession/loadWebinarSession admission/refusal. Historical 28/28 and its source table above remain explicitly historical. Independent checker should use the final receipt's before/after maps and current source freeze, not the historical table.

Owner-attributed driver evidence now available: `qa/evidence/goal-t051checker-broker-t048.json` and adjacent stdout/stderr. T-048 maker's fresh batch passed 27/27, exit 0, zero skips/cancellations, wall 6.1865432 seconds; all fifteen owner pins unchanged. Its READY manifest/packet is t048-single-dispatch-20261014 cycle 0. Evidence includes selected prefix/tail reconciliation, actual consumer/hash checks, pending validation, same retained speech with suspicious new QA, and atomic rename failure. This is owner-attributed maker evidence; independent T-048 verdict and actual provider/media acceptance are not inferred.

Actual final evidence hashes: T-044 broker receipt `088457fbeeff48e77e94b958c97e9980dff89b1d88b8bdb1b43869508b88dd69`; stdout `f17922a661da370d4e2701ad88a453f4694edc7dbe8a6fdb7d7796e50ed4735b`; empty stderr `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; T-048 attributed maker receipt `587dfd9e917423b8951dd9fccabdae29ca28841057db913905bb81aef97361f9`. Source freeze digest remains `b4f7193b56fb178d5f6f2fc00d92c17ad06c377dde08dbb6c403ab949ef385f7`.

Frozen-contract evidence: contracts/contracts.json currently has `stages: {}`. Central shared command/output is recorded in `qa/goal-2026-10-14/contracts-receipt.json`, with validator/registry pins in `qa/evidence/goal-t051checker-validator.json`: exit 0, PASS by vacuity, zero frozen contracts. No duplicate leaf verifier was executed. That empty-set PASS cannot certify semantic or real-audio quality. The independent checker already rechecked the actual verifier/registry hashes against those pins.

## Current shared-loader repin; existing source scope first

The checker broker correctly aborted its prelaunch as NOT RUN when shared session-rows changed from `3cc4de004a670f00683fa63a81627c2bde94c8c5416102cb66dc5995ba695401` to `3b70e6e8bd06da6747abe856ae5a37c998c190d5b8714d9b5d1e2e965f0ed053`. Independent exact inverse proves the sole delta is buildSessionFiles selecting a first speech turn by excluding `speakerRef === "screen"` or screenEvidence before metadata personId/label matching. The QA loader, transcript hash and QA digest/presence guards are byte unchanged. All six maker source files and the other nine frozen dependencies remain unchanged.

Root ordered completion of this existing scoped check first: current dependency-only pins are frozen in `qa/evidence/t044-qa-generation-binding/candidate-0-loader-repin.json`. The independent own-ten-case probe will consume the actual current loader after repin; a duplicate thirty-case batch is unnecessary and is not claimed. Historical final 30/30 remains correctly attributed to the prior full loader bytes. Trusted-private-window integration requested by the finalizer is a later separate explicit candidate/cycle; it is not covered by this source check or any resulting scoped PASS. No maker source edits may occur before this check/closeout.
