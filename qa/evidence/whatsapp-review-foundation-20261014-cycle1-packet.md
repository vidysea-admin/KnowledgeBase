# Checker packet — whatsapp-review-foundation-20261014, cycle 1

Repository: C:\Users\product\Desktop\KnowledgeBase
Maker skill: skills/maker/SKILL.md. Checker skill: skills/checker/SKILL.md.
Manifest and verdict use this slug; only checker writes `qa/verdicts/whatsapp-review-foundation-20261014.md`.

## Authorized acceptance

T-007 foundation only; tier 3; this new seam has no prior PASS. Contract `qa/contracts/whatsapp-ingestion-first-slice.md` criteria 7/8/10/11/12 govern the relevant behavior without claiming their full cross-system acceptance.

- Schema-defined claim/topic/decision/attachment candidates remain `needs-review` until an explicit decision. Required real turn provenance, canonical candidate identity, tenant namespace and visible reason flags.
- Literal topic/decision signals; credential/contact/personal-exclusion signals; normalized duplicate comparison within import and provided same-tenant known content. Attachment duplicate means matching name/MIME metadata, explicitly not matching file bytes. Absence of flags never certifies safe content.
- Real Mongo adapter preserves existing decisions through `$setOnInsert`. Exact content, attribution, timestamp and attachment edits change identity, so they cannot inherit approval.
- Tenant is validated before DB effects and included in every filter. Every returned candidate resolves exact authenticated source/session/turn evidence; invented content and removed required sensitive/exclusion flags refuse.
- Mongo `withTransaction` encloses conditional decision update and injected candidate-only materializer. Callback receives the same DB/client session. Missing callback refuses approval; thrown callback aborts; opposite terminal decisions conflict; same-action retries retain original audit actor/time. Personal-excluded approval refuses.
- Real Express router requires authenticated `whatsapp` scope, accepts only empty decision bodies, uses verified-key fingerprint as actor, returns foreign candidate as 404, and does not expose internal exception detail.

## Ownership and consumer map

New product paths: `schema/whatsapp_candidates.schema.json`, its valid/invalid fixtures; generated per-schema core type; `apps/api/src/whatsapp/review/` source/tests. Integrator generated shared `packages/core/src/index.ts`; maker did not hand-edit that file.

`detection.ts`: `detectWhatsAppReviewCandidates()` consumes real canonical Sources/Sessions/Turns plus explicit trusted attachment/known-content DTOs; outputs canonical schema type. Identity includes literal text and exact evidence, while duplicate hash normalizes text.

`store.ts`: `createMongoWhatsAppReviewRepository(db,{materialize,now})`; `list/get/insert/decide`. Reads use `withTenant`; writes use `scopedCollection`. `checkEvidence()` validates canonical schema and resolves actual turn text/attribution/time, then regenerates the matching source proposal. `decide()` transaction includes scoped status compare-and-set and materializer callback. The materializer MUST use provided session for every DB write; external effects/full-session indexSession are unsupported.

`router.ts`: standalone `createWhatsAppReviewRouter(repository)`; GET `/whatsapp/review`, GET `/whatsapp/review/:id`, POST `/whatsapp/review/:id/approve|reject`. No server/production path imports or mounts it. Errors preserve 401/403/404/409/502/503 distinctions.

`validation.ts`: derives structural validation from the canonical JSON schema, handles only its current vocabulary and refuses unsupported future keywords/types/formats. Calendar/time values are checked. It is not a general JSON Schema engine.

Actual immediate consumer exercised by `router.test.ts`: authenticated HTTP → real repository → source resolution/transaction → per-candidate injected publisher fixture. `test-fixtures.ts` emulates a serialized transactional Mongo driver with rollback; it never opens a database. Real Mongo write-conflict/retry semantics remain unverified.

## Reproduction

Exact commands/counts/durations and historical failures: `qa/evidence/whatsapp-review-foundation-20261014.md`.
Run four focused test files with the safe TS register, isolation none, concurrency one, test timeout 30 seconds, from repository root. Acquire coordinator `/root/runtime_inventory` slot before test/typecheck work. Raw tsx starts unnecessary esbuild subprocesses and is not the approved test path. Actual ephemeral loopback HTTP worked without escalation in maker run. No live DB/network/provider tests are authorized here.

Use `.venv/Scripts/python.exe schema/validate.py` (existing dependency confirmed); default Python lacks jsonschema. Scoped compiler evidence script uses actual API tsconfig and all nine new roots/transitives; wrapper bounds it at 120 seconds. Final global CI/typecheck/schema drift are integrator-owned.

No filed issue fix corpus is asserted; this is feature work. Independent static/boundary probes are welcome. Any mutation requires a separate coordinator grant, timeout, byte backup/finally restore and byte comparison. Six full criterion-8 mutation probes are outstanding, so whole detection acceptance cannot be marked complete.

## Final SHA256 at freeze

All paths relative to root. All are additions, no original/base file existed.

| Path | SHA256 |
|---|---|
| schema/whatsapp_candidates.schema.json | B49E9681890DA26E7DECC89D5FB17D00B94735581F9C79E209DAD48CF415308F |
| schema/fixtures/whatsapp_candidates/valid.json | DDFFDD73DE29E477735F7EA450BAB0CB965DDE5E1AA0DF0138AFA379A23C7683 |
| schema/fixtures/whatsapp_candidates/invalid.json | DC51F56060864B87C009A8E000A0819D3EAB397B488F232AF0387BBBB430004B |
| packages/core/src/generated/whatsapp_candidates.ts | 32F31FD21F6CFD72E3D819528878EC4C9BE659BA16C53779DD1F2EE896E60F10 |
| apps/api/src/whatsapp/review/detection.ts | 533E770878E3AD50031991DA114FA0F31E6A6876379954ABE368FBE807156F16 |
| apps/api/src/whatsapp/review/detection.test.ts | 07CBD02AEB24D70EC590BAF3542CBCB76D8BD29DC884CA56DCDCC59DCF18E04B |
| apps/api/src/whatsapp/review/store.ts | B09B8F79BA390EBCA68822BF5AB814FC4BC93A28BF9D0C9EEA7197A7CC49D33E |
| apps/api/src/whatsapp/review/store.test.ts | 9747200FEE7E78710F596FBFD579C1DE00C688860484CBA8DAA08F803CE7EDAE |
| apps/api/src/whatsapp/review/router.ts | 0F3DD50960B9BDBBA4712FCDBBEA72EA25839D2BA257AE914BD3C0CB3EBE573A |
| apps/api/src/whatsapp/review/router.test.ts | E3E46D08C63C958E460444D3D5F10571D4F73B5F29B3A1A070BD8C901BA8D033 |
| apps/api/src/whatsapp/review/validation.ts | E7020BCD04CD3E6D82C1515EF088DE3C0DA91D74D09B707252F6BD120D89FF3F |
| apps/api/src/whatsapp/review/validation.test.ts | EF682D8303B0FAC122DA79B5F6716A576DC39136D87BE5D9981ACB3C1163CAB1 |
| apps/api/src/whatsapp/review/test-fixtures.ts | 396AE050309DC64581EEFD937F3305331D90D6D5E2441E06C43D4F72DE0C4449 |
| qa/evidence/whatsapp-review-foundation-20261014-typecheck.mjs | F9933E92C864F0DBA237F01F502D63A588B95B89FAFA03CBA1B2D0E0826F6488 |

## Remaining integration gates

Do not mount the router yet. Existing ingestion calls boundIndexer and current trusted readers do not quarantine WhatsApp sessions; this unit leaves those paths untouched. Integrator must wire ingest proposals, quarantine every tree/vector/lexical/search/graph/citation/aggregate path, provide only candidate-specific transactional materialization, invalidate older approved material on source edits, then prove UI and actual Mongo/Ask/citation persistence/restart behavior. Real file attachment metadata availability and semantic topic detection remain separate.
