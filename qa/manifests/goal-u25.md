# U2.5 decisions extraction safety and parent acceptance

**Handshake status:** checked-PASS
Status: checked-PASS
Fix cycle: 1
Task: U2.5
Priority: tier 3, explicit ALL40 continuation (D-170); data-write safety is uncapped.
Authorization: ROOTGO exclusive lease received 2026-10-14 via implementation_status; only seven paths listed in packet. Shared integration and trackers belong to root/docker_runtime.
Contract: qa/contracts/goal-u25.md S1-S6 (independent checker); P1-P4 remain whole-parent gates.

## Behavior

Refuse invalid/mixed tenant/session identity, duplicate source IDs and invalid source times before provider/DB operations. A partially invalid/nonempty unusable provider response is degraded; no replacement follows. Genuine [] remains a clean result. Derive evidence/spans/owner only from real source turns.

Persist canonical tenant/session/text/evidence/source-time/owner-based IDs with proposed-only insert-only upserts before stale-only cleanup. Preserve verified/needs-review legacy rows and their IDs/content/provenance, deduplicate repeated reviewed text, and replace corrected proposal metadata with a new content ID. Every read/write carries tenant/session scope. Cleanup adds proposed status and exact prior stale IDs. Concurrent review collision refuses the update and skips cleanup. Partial upserts can add proposals but never claim atomic replacement or change/delete any prior row on failure.

Result.count retains extracted-candidate semantics; deduplication/review preservation can reduce actual writes. It does not report total stored rows or semantic quality.

## Evidence

Corrected central run 2026-10-14T20:02:23.574Z–20:02:26.735Z: exit0, tests30/pass30/fail0/cancelled0/skipped0/todo0, TAP3054.8648ms, wall3155.4434ms, all ten broker pins unchanged. Receipt qa/evidence/goal-t051checker-broker-u25.json SHA256 1D5FFF33F073F7214F5BB79C047CBC0707CD8081A19111867CECA3031A284450; exact command/stdout hashes and five owned-file hashes are in qa/packets/goal-u25.md. ISS-U25DECISIONS-001:2/2 refused; the real51turn In-Focus source passes scripted persistence and actual downstream harness with semantic.measured=false. No provider, network, browser, production Mongo, export, full-suite or mutation run performed. Current frozen registry+validator hashes match the central vacuous PASS receipt.

Earlier maker run was29/30 because its sample-count assertion incorrectly expected291; corrected to actual51 without changing source data. The fresh corrected receipt supersedes that failing candidate evidence.

## Independent close-out

qa/verdicts/goal-u25.md VERDICT: PASS, Cycle checked:1, SHA256 EDA3F2E61F3C185875838B94611DEA416918541C980F48F8337A4CDDBC60BC70. Scope is contract S1-S6 only. Independent central check exit0:4/4 selected tests passed, zero skips/cancellations, including exact ISS-U25DECISIONS-001:2/2 replays and two authored deletion-time review/provenance races. Inner wall2609.1719ms/TAP2521.0134ms; exact immutable receipt qa/evidence/goal-u25/independent-receipt.json, outer receipt qa/evidence/goal-t051checker-broker-u25-independent.json. Before closing, maker read the matching ready manifest/packet hashes, verdict cycle/hash, all five candidate hashes and all14 independent receipt pins: current_pins_checked=14, mismatches=0, exit0. No source bytes changed during close-out. Full P1-P4 and U2.2 remain HOLD; no task/ledger/goal completion or production flag promotion performed by maker.

## Parent gaps

Historical qa/verdicts/u25decisions.md PASS covers the original default-off mechanism only. U2.2 remains in_progress; no individual human decision gold/threshold acceptance inferred. Actual configured-provider decision and no-decision samples, all extraction stages, real downstream product consumption and approved semantic metrics (P1-P4) remain unproven. This safety unit cannot close U2.5 or U2.2.
