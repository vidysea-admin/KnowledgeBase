# T-044 generation-bound transcript QA

**Handshake status:** checked-PASS
**Status:** checked-PASS
**Fix cycle:** 0
**Checked:** qa/verdicts/t044-qa-generation-binding.md, Cycle checked 0; source-slice PASS only, full T-044 HOLD.
**Priority tier:** 3 — authorized T-044 roadmap implementation; existing ISS-REVALIDATE-001 is also covered.
**Authority:** D-170; root exclusive source lease relayed by goal_attachment_reader. D-162 default-off QA is preserved.
**Contract:** qa/contracts/goal-T044.md clauses 2–5 and 7 for this implementation slice; clause 6 requires separate actual audio/provider evidence before whole-task completion.
**Packet:** qa/packets/t044-qa-generation-binding.md

## Scope and security

Bind transcript QA to the actual committed canonical transcript bytes and independently probed audio duration. Persist unique attempt identities and distinguish contributing spans from discarded retries. Reject stale same-count evidence, contradictory audit metadata, retained hallucination/invalidity signals and current repeated/nonmonotonic turns. Freeze one transcript byte snapshot through validation and its evidence hash. Bind the passed validation to exact QA bytes and QA presence too, so same retained speech with a changed suspicious report cannot reuse a passed verdict.

This protects local passed validation writes that authorize downstream knowledge admission. It is the data-write/security class and is not a further non-security clamp-polish round. Existing clamp/report seams already have at least two scoped PASSes; their implementation is untouched. No authentication, credentials, tenant selection, DB mutation, schema, tracker, decision, Git, production activation or provider call is changed here.

## Owned files

New, no base existed:
- scripts/lib/transcription/transcript-qa-generation.mjs
- scripts/lib/transcription/transcript-qa-generation.test.mjs
- scripts/webinar/validate/transcript-qa-binding.mjs
- scripts/webinar/validate/transcript-qa-binding.test.mjs

Existing; tracked base commit and normalized-LF Git-show hashes are recorded in the packet:
- scripts/webinar/validate/validate-session.mjs
- scripts/webinar/validate/validate-session.test.mjs

Central integrations, not maker-owned:
- scripts/transcribe-long-session.mjs: T-048 driver owner records selected attempts and calls the generation builder after the actual turns commit.
- scripts/webinar/session-rows.mjs: central owner must refuse stale validation after a later transcript or QA change, including report creation/removal.

## Evidence state

The final source/real-consumer candidate is ready for independent check. The sole central broker ran the final three-file batch: **exit 0, 30/30 PASS, zero skips/cancellations, 3.1474811 seconds wall, TAP 3044.1446 ms**, UTC 2026-10-14T20:11:11.236Z to 20:11:14.390Z. All sixteen current source/dependency/contract pins were unchanged before/after. Actual immutable receipt and logs: `qa/evidence/goal-t051checker-broker-t044-final.json`, `.stdout.txt`, `.stderr.txt`. Source freeze: `qa/evidence/t044-qa-generation-binding/candidate-0-resume-pins.json`. This is separate from the earlier 28/28 candidate. No real provider call, browser, audio probe or whole-task acceptance is claimed.

Driver owner-attributed fresh evidence: T-048 broker batch **27/27 PASS, exit 0, zero skips/cancellations, 6.1865432 seconds wall**, `qa/evidence/goal-t051checker-broker-t048.json` and adjacent logs; fifteen owner pins unchanged. Owner manifest/packet `t048-single-dispatch-20261014` is READY cycle 0. It covers selected prefix/tail counts, actual consumer hash, pending validation, same retained speech with new suspicious QA, and atomic publication failure. Independent T-048 PASS is not inferred. Shared frozen-contract evidence is now available at `qa/goal-2026-10-14/contracts-receipt.json`, with source pins in `qa/evidence/goal-t051checker-validator.json`: exit 0, PASS by vacuity, zero frozen contracts. No leaf verifier execution or semantic-quality PASS is claimed.

**Reviewed dependency-only repin:** shared session-rows is now `3b70e6e8...f0ed053`; checker proved the exact sole delta excludes screen/screenEvidence when buildSessionFiles selects first speech metadata. QA loader/hash/presence logic is byte unchanged; own six and other nine dependency hashes are unchanged. Current sixteen-file freeze is `qa/evidence/t044-qa-generation-binding/candidate-0-loader-repin.json` (SHA256 aa30841b13d31682379f7566ce136809da63a190a23e1d1d5b3cbe946e01cfc6). The final 30/30 used the prior loader; independent own-ten-case probe will verify current consumer after this repin, with no duplicate thirty-case replay. Root ordered existing scoped source check first. New trusted-private-window integration is a separate later candidate/cycle and is excluded from any PASS of this one.

Authorized execution from repository root: `node --import tsx --test --test-concurrency=1 --test-timeout=30000 scripts/lib/transcription/transcript-qa-generation.test.mjs scripts/webinar/validate/transcript-qa-binding.test.mjs scripts/webinar/validate/validate-session.test.mjs`, hidden PowerShell Start-Process wrapper with outer 120-second timeout. Root CPU lease granted by /root/docker_checker. Required esbuild subprocess access was directly escalated and approved. Result: **exit 0, 28 tests / 28 pass / 0 fail / 0 skip / 0 cancel, 3.7819494 seconds wall, Node 3596.6491 ms**. The real validateSession → loadWebinarSession consumer accepts the clean fixture and refuses the stale turns, changed same-turn QA, malformed/presence-change and retained-anomaly fixtures.

Evidence: `qa/evidence/t044-qa-generation-binding/maker-tests.stdout.txt`, `.stderr.txt`, `maker-receipt.json` (SHA256 9655a1a968c33008232d2a024eab2601f2eb48643db0059a0d09339f243d40fb). Seven exact source hashes (six owned files plus central session-rows) match pre-test pins after execution. No DB/network/provider/browser/media encode/broad build or validator ran; the slot was released immediately after process completion.

**Resumed candidate difference, now covered by the final 30/30:** `evaluateTranscriptQaGeneration` verifies finite exact original committed bounds, independently of the clamp's modification count. The existing clamp snaps an overshoot within 1e-6 without incrementing clampedCount, while process-video validateTurns permits D+0.5. Previously those two tolerances could leave a bound raw final tEnd=D+1e-7 certifiable. Added one pure-boundary and one canonical validateSession/loadWebinarSession regression. Historical 28/28 does not cover these new bytes; the final broker 30/30 does.

Checker static review found an additional same-output/new-suspicious-QA hole: turnsSha256 alone cannot invalidate the prior verdict. The candidate now records qaSha256 (exact QA snapshot bytes, null for absence). Central integration must verify both artifacts/presence; driver integration must invalidate prior validation before publication and publish QA atomically. Standing probes cover that exact stale-QA case plus created, removed and truncated reports.

ISS-REVALIDATE-001 corpus: standing cases now cover the recorded same-count stale artifact, contradictory clamped=20/dropped=5/overshoot=400 artifact, swapped turns, repeated turns under bound QA, and selected versus rejected attempt signals. The ledger's flag-off/no-QA repeated-turn case deliberately remains opt-in baseline behavior under D-162; it must be named in the final receipt. Overlapping monotonic speaker turns are not automatically semantic hallucinations and have no new blanket refusal threshold. ISS-REVALIDATE-002 partial-policy decision remains outside this unit.

Measured targeted ledger attack types: **ISS-REVALIDATE-001: 3/3 refused** — same-count replacement, literal contradictory clamp/drop/overshoot claims, and swapped ordering hidden by claimed-clean QA. The original standalone attack harness/commands were not preserved in the ledger; the standing tests reconstruct the recorded payloads through the real validator. Two deliberately remaining recorded scenarios are explicitly outside this scoped refusal claim: 75 identical turns with QA absent/flag unset (D-162 preserves disabled behavior), and monotonic overlapping turns (no approved blanket overlap-rejection policy). This does not close the ledger issue or assert a verbatim full-corpus replay.

## Remaining acceptance

Independent checker verdict, watcher short-recording QA routing plus validation before derivation/seed, and real recorded-audio/provider comparison remain required. Driver, real validator/consumer and shared vacuous frozen-verifier source evidence and pins are now supplied. Existing p1/p2 unbound QA is historical evidence and is never silently upgraded. Full T-044 stays in progress regardless of a future scoped source PASS.

Cross-task integration gate from T-011: privacy-redacted windows must not be mistaken for accidental missing speech and retried or filled by the completeness pipeline. Validated intentional exclusions require central driver/coverage ownership; this unit does not change gap/shortfall thresholds or trust unvalidated source.privateWindows.

## Scoped closeout after explicit root resume

Reread the matching independent cycle-0 PASS persisted at 2026-10-14T20:46:27Z before the human HOLD. After explicit resume, all sixteen independently checked source/dependency/contract pins, the probe, and frozen verifier/registry still match current bytes. The independent actual ten-case current-consumer probe passed 10/10, exit 0, 601.1521 ms wall; seventeen broker pins unchanged. Receipt: qa/evidence/goal-t051checker-broker-t044-independent.json. The maker closes only this source unit's file handshake. Historical 28/28, final maker 30/30 on the prior loader, attributed driver 27/27 and independent current-consumer 10/10 stay separately attributed. No roadmap task status, verdict, contract, ledger, source or publication is changed by this closeout. Trusted privacy integration requires a separate explicitly versioned candidate and independent proof; full-parent actual provider/audio and operational gates remain HOLD.
