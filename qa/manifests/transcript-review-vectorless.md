# Transcript review: vectorless publication boundary

**Handshake status:** building
**Status:** building
**Fix cycle:** 0
**Task:** T-054
**Priority tier:** 3 — explicitly assigned roadmap feature; touches derived data writes and tenancy boundaries, full ceremony required.
**Contract:** qa/contracts/goal-T054.md, clauses 7–9 and 12; existing scoped PASS at qa/verdicts/t054-review-completion.md cycle 1 is retained, not promoted to parent completion.

## Authorized behavior and exact changes

- `apps/api/src/transcript-review/refresh-executor.ts`: require explicit vectorless, lexical and validated-provenance completion proof before publishing the review revision. Existing strict extraction, original-source, tenant transaction, review-head CAS and all-target atomic publication checks remain intact.
- `apps/api/src/transcript-review/refresh-executor.test.ts`: existing actual-indexer fixture uses a throwing embedding trap; new negative cases omit each vectorless completion proof and require complete rollback with original reviewed claim preservation. Existing private-fixture opt-in changes predate this unit and are preserved.
- `apps/api/src/transcript-review/mongodb.integration.test.ts`: native candidate also throws on embedding, verifies replica-set capability, and replaces same-client store reload with actual MongoClient close/reconnect.
- `qa/evidence/transcript-review-vectorless/native-acceptance.md`: isolated staging command, exact database boundary, cleanup behavior and remaining application/browser gates.

Only these implementation files are changed by this unit. Shared indexer/schema/composition, source corpora, QA contracts and verdicts are outside the lease. Before snapshots and hashes are retained under this evidence directory, reflecting the actual working tree rather than overwriting pre-existing edits.

## Dependencies and impact

- Indexing maker owns `apps/api/src/indexing/session.ts` and types. Its actual indexer must return `retrievalMode: vectorless`, `lexicalWritten`, `provenanceValidated` only after generation checks; fake success is not accepted here.
- `transactionReviewDb` serializes tenant-scoped database operations, overlays effective turns, and refuses physical original-turn writes. No changes made to it.
- Existing review service persists correction truth separately from derived refresh; failed vectorless publication retains committed correction and failed refresh for retry.
- Immediate downstream consumer is grounded-content reader in the existing refresh test, which checks current corrected quote and speaker availability.

## Security flags

Auth: unchanged. Tenancy: existing mandatory scoped transaction adapter retained. Data writes: new fail-closed gate on derived transaction publication. Credentials: no key/URL reads or output by maker; native command requires explicit coordinator staging credentials. No provider, native database, browser, service, migration execution or public release performed by maker.

## Verification request and current evidence

No test process launched by maker, per root CPU broker. Root has been asked to run:

```text
node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register.mjs apps/api/src/transcript-review/refresh-executor.test.ts
```

Private TOC opt-in remains off for the public fixture run and must be reported as a skip, not fabricated sample acceptance. API typecheck follows central indexer integration. Native execution requires the separate staging lease and runbook. Validator and independent checker remain pending. Set ready-for-check only after required broker evidence is attached and final bytes are pinned.

## Parent status

T-054 remains in progress. This is a bounded vectorless source/fixture change; native durability, application process restart, real authenticated HTTP and mounted browser acceptance are not claimed. Maker cannot PASS the unit.
