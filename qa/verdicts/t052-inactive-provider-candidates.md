# Verdict: t052-inactive-provider-candidates

VERDICT: PASS
Status: PASS
Cycle checked: 1
Reviewed SHA: f195ada7dcc1694d423f75bd25380b1e421a935d
Base: a9fac545 (diff base..candidate is manifests only; source reviewed in place and byte-pinned)
Scope: unit only (inactive provider candidate modules). NOT T-052 acceptance; C9/C10/C11 live gates stay HOLD.

## Identity
Final sha256 re-hashed and equal to the manifest close-out: registration-link-resolver.ts 133e67be...d952, zoom-registration-proof.ts 4aba9ae4...7249, registration-provider-candidates.test.ts 1499191e...7261.

## Clauses (goal-t052.md): C1, C2, C5, C7, C8, C12-C14, candidate-scoped
- INACTIVE by default (the question asked): PASS. REGISTRATION_LINK_RESOLUTION_ENABLED=false and ZOOM_PROVIDER_CORRELATION_ENABLED=false. Both entrypoints return inactive/approval-required unless enabled===true AND a trusted authorize callback (and, for the proof, readNativeEvent) is supplied. Zero DNS/GET happens before authorization (test 1 asserts calls===0). No consumer imports either module (grep of src and scripts). Neither module can submit a registration: the resolver only GETs the tracking URL, the proof only emits a private candidate.
- C2/C5 resolver: exact initial host, https only, no port/credentials/fragment/IP host, 5 hops, 15 s, 1 MiB total, every DNS answer public (allow-list style IPv6), connected peer equals pinned address, final path /webinar/register/WN. Reviewed in code; tests 2-6.
- C7/C8 proof: fresh vs baseline/consumed, chronology, receiving-side sender authentication, single Delivered-To, native Join Webinar field with exact event id, native event/recipient/interval equality, source vetoes, ambiguity refusal. Reviewed in code; tests 7-11.

## Independent evidence (my commands; outputs under scratchpad t052/)
- node --test --test-force-exit --import tsx src/calendar/registration-provider-candidates.test.ts (cwd packages/meeting-bot): exit 0, tests 11 / pass 11 / fail 0 (cand.out).
- Direct tsc (node node_modules/typescript/bin/tsc --noEmit -p packages/meeting-bot): exit 2, exactly 2 errors, both outside this unit (capture/native/windows-capture-clock.ts:169, capture/tiles/native-measurement.test.ts:70); none in resolver, proof or test (tsc.out).
- Mutation M1 (own; per-mutation byte backup, timeout 300, trap on INT/TERM/ERR, restore + cmp): flipped REGISTRATION_LINK_RESOLUTION_ENABLED to true -> test 1 "both candidates default inactive" FAILED (pass 10 / fail 1). Restored; git hash-object of the file equals git rev-parse f195ada7:<file> (3113636283...).
- contracts/verify_contracts.py: exit 0, "no frozen contracts yet -- PASS by vacuity" (vacuous, disclosed).
- No filed issue is fixed; no ISS corpus to replay (D-015 not applicable).

## Not verified / limits (retained, not waived)
- The real pinnedRegistrationGet (TLS/DNS pin/peer) and real Zoom native-metadata adapters were never executed; all tests are synthetic fixtures. I used no network.
- The proof relies on @lkb/core assessSender quoted-property auth (separate security unit). The fixture uses quoted smtp.mailfrom and passes today, but that unit's own PASS is a prerequisite before activation.
- Durable single-consume / provider-occurrence dedup, the approval adapter and activation/PIVOT are Umesh-owned gates (qa/gates/t052-zoom-confirmation-and-brevo-resolution.md untouched). The opaque tracking-URL GET may record a recipient click; this is disclosed in the gate.

## EXPLANATION (notes, not issues)
No idempotency concern here (no write, no submission); retry/idempotency belongs to source-delivery-registration-retry.

ISSUES-WRITTEN: none
Ledger rows may be flipped: yes for this unit only (manifest -> checked-PASS). T-052 stays in_progress.

## Budget
Checker actual tokens and active time are not exposed by the host (null). review_budget helper not run (no allocation input supplied). Ratio unverified; no escalation requested. Shared CPU ~100%; test wall time 41 s.
