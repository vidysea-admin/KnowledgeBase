# T036 cycle 1 current dependency reconciliation — preparation only

Status: HOLD for matching-cycle handoff; not an independent verdict. No test/build/DB/provider/browser commands run. Canonical manifest/packet remain in_progress cycle 1; canonical verdict remains HOLD cycle 0. Exact current HEAD and all 25 historical/current SHA256 comparisons are in pins.json. Historical receipt and outputs remain untouched.

Historical actual command: qa/goal-vectorless-2026-10-15/verification-t036-20261015T0721.json, own exitCode 0, before=after all 25 pins; sibling stdout records 46 tests/pass, zero failures/skips/cancellations, including original three independent probes. This corrects stale packet text saying execution pending. Historical actual receipt does not match current dependency identity: exactly six changed inputs; nineteen unchanged, including DB accessor/test, tenant scope, Gmail producer, schema/DTO, loader, lock, contract, original independent probe and auto-join.test.ts. No unconditional current-byte reuse qualification.

## Attributable drift and consumers

- store.ts: current createMeetingCandidatesDeps retains the same five provenance allowlist fields and tenant-owner check, accessor call and counters. Git diff from 5c4cbade shows only unrelated createMongoTreeStore/nativeEvidence argument here. This comparison is a nearby committed baseline, not authenticated reconstruction of the historical receipt bytes.
- routes/meeting-candidates.ts: adds separate authenticated work-DB-bound public-webinars/scan callback. Existing Gmail scan/list/decision routes and provenance DTO remain. That separate discovery gate is not closed by this unit.
- composition/production.ts: broad vectorless/native/lazy database changes and configured public discovery; meetingCandidates still spreads createMeetingCandidatesDeps(), adding only discoverPublicWebinars. Current independent probe imports factory directly, so it cannot establish production mounting.
- core/index.ts: speaker attribute/relationship and source-locator exports added; existing meeting_candidates and webinar-types exports preserved.
- auto-record-policy.ts: adds optional registration-attempt preSubmitEvidence shape; trust/refusal selection helpers remain.
- auto-join.ts: cycle-1 refusal preservation remains; subsequent candidate-specific trust callback adds original candidate reference and optional trustedSendersForCandidate only after rejection/source-refusal/link-source barriers. Immediate new consumer is schedule-tick.ts -> projectApprovedSenderTrust. No executed failure is asserted.

## Narrow broker request

First admit a bounded independent checker under checker skill assess gate, preserving unknown legacy telemetry and all prior charges; do not relabel existing unit actual_total without same-unit reconciliation. Maker must reconcile matching-cycle packet with historical receipt and exact current pins; no source fix is requested by this preparation.

Sole root CPU broker, once frozen, may run:
C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe --test --test-concurrency=1 --test-timeout=30000 --test-name-pattern="^(T036 |actual factory refresh reconstructed model retains rejected decision and zero counts$|healthy approved control remains eligible through actual loader and selector$|new refusal evidence on approved legacy link remains blocking after reconstructed factory refresh$)" --import tsx packages/meeting-bot/src/calendar/auto-join.test.ts qa/evidence/t036-provenance-refresh-independent-20261015.mjs

Expected selected floor: four cycle-1 T036 tests plus original three independent cases; 7 selected passes, remaining nodes skipped by pattern. Repository cwd, KB_U24_PRIVATE_TOC_TESTS=0, outer timeout 120000ms. Do not rerun all 46. Capture genuine executable/version/environment/argv/exit/output/timings and all before/after/current pins; original probe unchanged. Any drift aborts attribution. Add currently imported runtime dependencies to pins, not merely old 25.

Relevant current consumer security coverage: join-rules/join-rules-approved-trust-tick.test.ts nodes `saved deny and both source/session opt-outs dominate persisted approval`, `candidate-specific approval does not admit another candidate and preserves global overlap selection`, `off and everyWebinar retain their existing selection policy and do not project new approvals`. Prefer exact current-byte existing receipts from that unit after checker reuse validation; otherwise request only these named nodes in a separate broker phase, not the whole suite. A refusal-plus-persisted-approval interaction is statically dominated by refusal before callback; checker decides whether a contract-derived independent probe is additionally required.

No new product issue inferred from drift. Current packet repair, independent matching-cycle persisted verdict/readback and telemetry reconciliation remain required. Full parent T036/T052, production/public acquisition, actual Mongo compatibility/durability and connected-host gates remain HOLD. This finite preparation records actual usage unknown; no efficiency success claimed.
