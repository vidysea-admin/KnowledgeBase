# Checker verdict — whatsapp-review-foundation-20261014

VERDICT: FAIL
Cycle checked: 1

Scope: unmounted canonical WhatsApp candidate/detection/store/review-router foundation only, against the applicable portions of criteria 7, 8, 10, 11 and 12 in qa/contracts/whatsapp-ingestion-first-slice.md. Full T-007 acceptance is not certified.

Two reproducible acceptance violations remain in the frozen candidate:

1. Explicit personal/private medical detail labels evade personal exclusion. The independent fixture `Personal medical details: password=abc123` yielded approval result `ok` where `excluded` is required; the publication callback lies on that successful code path. `Private medical details` also produces no personal-excluded flag, so its proposed approved form is not refused. These are two manifestations of the same criterion-8 exclusion gap, not two independent schema defects. Personal/excluded content must not be proposed for publication.
2. An injected decision clock returning `2026-02-30T10:00:00Z` passes the store's Date.parse check. The reject operation resolves instead of refusing; source review confirms it writes the new decision/status without validating the outgoing candidate. That audit timestamp fails the canonical validator. The decision transition must validate the complete new row before any status/publisher effects (criterion 7).

Commands / evidence:

- Exact invocation: `node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register.mjs apps/api/src/whatsapp/review/detection.test.ts apps/api/src/whatsapp/review/store.test.ts apps/api/src/whatsapp/review/router.test.ts apps/api/src/whatsapp/review/validation.test.ts qa/evidence/whatsapp-review-foundation-checker.test.ts`.
- UTC command start 2026-10-14 09:12:51 UTC; completion 2026-10-14 09:12:53 UTC; tool duration 1.8641847999999999s, exit 1; runner duration 1500.1674ms. Counts: 30 tests, 27 pass, 3 fail, zero skipped/cancelled. All 21 maker tests passed on frozen final bytes; six of nine independent tests passed.
- Exact stdout, command receipt, all fourteen expected/actual SHA256 pins, and final hash-check receipt: qa/evidence/whatsapp-review-foundation-checker-cycle1.json.
- Independent probe: qa/evidence/whatsapp-review-foundation-checker.test.ts; SHA256 CFC47D33E4044ADDA0FC76008F625476D51CCAA0ECF53C579D8F53A8E4C1010A. Keep the three failing fixtures verbatim in the standing fix corpus.
- Independent final hash check at 2026-10-14T09:14:25.1367469Z: 14/14 packet pins match, zero mismatches; manifest remains ready-for-check, Fix cycle 1. The thirteen product additions and scoped compiler script are all checked; untracked additions were included. Shared core export is integration-owned.
- Independent static consumer review found zero imports/mounts of the new factory/detector/repository in server.ts or production composition. Source-grounding, exact provenance edits, tenant mismatch refusal, partial-write rollback, durable rejection, sibling isolation and missing materializer refusal passed the independent probes. Producer/store and actual authenticated loopback HTTP downstream consumption passed all maker tests on final bytes.

Attributed evidence reused (not independently rerun): maker's actual API-options compiler with nine roots/258 source files/zero diagnostics, 30 collection schema fixtures passed using existing .venv, and contracts/verify_contracts.py exit 0 with no frozen contracts (vacuous). See qa/evidence/whatsapp-review-foundation-20261014.md and the pinned scoped compiler script. Reusing these receipts does not certify global compiler/schema drift or actual Mongo.

Timing checkpoints: dispatch/initial launch timestamp unknown; first measured preparation checkpoint 2026-10-14T08:52:36.2124783Z. Source review and maker preparation preceded frozen-packet receipt at 2026-10-14T09:09:55.8374256Z; final frozen pin/source review checkpoint 09:10:42.8920639Z. No escalation or user approval was required. Serialized coordinator test-slot wait occurred; its precise request/grant interval is unknown. Test timestamps above are measured; final pin checkpoint above is measured; draft/persist start 2026-10-14 09:15:42 UTC. Exact launch-to-verdict elapsed and sampling-only review/draft durations are unknown. The 120–180s target was exceeded while the maker corrected pre-freeze boundaries and the shared runtime queue drained; no broad suite was run.

ISSUES-WRITTEN: none

Persist confirmation: verdict and exact run receipt independently read from disk at 2026-10-14T09:16:01.5517962Z. This confirmation precedes this small timing annotation; initial launch-to-confirmation remains unknown.

EXPLANATION: FAIL is based on the actual unchanged candidate, not missing broad evidence. Checker was assigned evidence/verdict ownership only; orchestrator was asked to have the authorized ledger owner file both findings. No contract was weakened, no product source was mutated, no source promotion occurred. Six criterion-8 mutation probes remain a separate gate because the coordinator did not grant mutation work. Router must remain unmounted until ingest integration, every trusted reader/aggregate quarantine, per-candidate materialization, source-edit invalidation, UI, actual Mongo transactions/restart and public Ask/citation acceptance are independently proved. Sensitive/duplicate heuristics remain conservative literal signals, not semantic or safety certification.



