# Checker preparation — u24-speaker-attributes, cycle2

NOT READY. First focused execution is now GREEN as recorded below; mandatory mounted profile/graph consumer evidence remains unlocated. No checker dispatched. Exact root C:/Users/product/Desktop/KnowledgeBase. Baseline HEAD observed5c4cbade2d1a8aa4815de13d587db8de3b01cc4a; candidate is new uncommitted files with no prior base. Maker ownership excludes schemas/generated/barrels/composition/profile/graph and all checker-owned contracts/verdicts.

## Current attributable evidence (supersedes earlier NOT RUN notes only for these18 cases)

Sole broker receipt qa/goal-vectorless-2026-10-15/verification-quality-authority-attributes-first.json SHA256931D347BC375E768EFF2306DE06E0DDDB7C9A3CE0796978D81736FF65868BA4E and adjacent stdout SHA2568BEBFD2F3AEAFB08529839A5ECFEC09DD5A41708A96B900815A2BC1ABF211CDD: actual21PASS/0FAIL/0SKIP, exit0,3287.6866ms outer elapsed. U24 contributes18; U22 contributes3, so shared execution time is not attributed exclusively to U24. Command is receipt.command verbatim: bundled Node --test --test-concurrency=1 --test-timeout=60000 --import tsx followed by extraction-review/file-store.test.ts, extraction-review/router.test.ts, scripts/eval/extraction-authorized-import.test.mjs and the three U24 test paths below. Timeout120000ms. Candidate72cbd1fd7d6bd1d826bfbbaa352b162ab32a6e6142f144fb4ddb2e15bd9c1f8d is ordered-pin SHA256, not Git.

Read-only reconciliation independently matched all51 receipt before/after pins to current disk, zero drift; bundled runtime executable hash matched3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237. Receipt runtime v24.19.0, pnpm lock2af3aada247f31436a28f46f4803dc8b4294956c21825f7421ca37faf07d83dd, environment hash1f6b045ea8ea78388b899ea4c9e324c4cb6e81929b685d030acc40df41e48bac. Six executed U24 production/test pins equal cycle2 table; erased types.ts is not one of51 receipt pins but current disk independently matches tableF8B37E.... This receipt does not cover generated/schema/composition/profile/graph pins. Current API types/build GREEN is broker-reported; separate exact receipts must be supplied centrally before reuse, not inferred here.

Remaining immediate consumer gap: attributable functional execution of accepted attributes through actual same-snapshot profile adapter into mounted GET /speaker-profiles/:personId and knowledge graph route. The18 tests demonstrate accepted helper plus isolated HTTP router, not that actual product join. Central integration_control owns composition/policy and knowledge_profiles_maker owns profile authority/join; existing receipt requested from both. Source mount notification alone is not execution evidence. No genuine human/provider/native Mongo/browser acceptance occurred; fixtures remain synthetic. BUILDING/HOLD persists until mandatory consumer and independent check gates are satisfied.

Central subsequently confirms no such attributable attribute-consumer receipt in its context. Earlier verification-profile-accepted-four-20261015T1148.json covers relationships before attribute changes and cannot certify this unit. Central identifies qa/manifests/speaker-profile-accepted-attributes.md with4 authored focused consumer tests; execution status must be resolved with sole broker, not assumed missing or passing. This unit remains blocked on attributable actual consumer evidence, not on new helper work.

## Authored candidate hashes (SHA256)

| apps/api/src/speaker-attributes/ path | SHA256 |
|---|---|
| types.ts | F8B37EB2E9CD06DCEB94A9D102294AD6E99EAA043B31383CA98B0595B16FB061 |
| service.ts | E55154F04F650F441EBB12684DFB49737695224C0305D122FE5BE1B1B9E7D809 |
| mongo-store.ts | A0E2279F2A2E81368DE92A3BB750924F029FCA8C49658EE7A5F5FA078E636680 |
| router.ts | D2F115DCD4EA8230808B6EA844525E94329D6DF739E98B89DDBA8793FB5C6972 |
| service.test.ts | 8FDB7329AD671B72722E7F9279D8DCFDE3D3E96A5417284516A37256327DCD3A |
| mongo-store.test.ts | A9ED152998546BB5395DA9907E1C3BEB666481F0D020120CED792F570CE6E022 |
| router.test.ts | DAB447F0294298F4B49676173292343A94C3442D4157FE0E61260DA16CD15B92 |

Cycle2 history: actual API compiler diagnostic source qa/goal-vectorless-2026-10-15/verification-api-types-final-public-epoch.stdout.txt failed exit2. Its six owned diagnostics prompted test-only repairs: explicit Mongo string-ID collection generics, void transaction callback, runtime unknown-body guards, immutable readonly transcript hash fixture replacement. Assertions/18 cases preserved. Cycle1 test hashes were respectively4A63123FCB776665BFE14172D6B26A8F399417D6D3AD62749D658826801AB078,1CF6C71CB8B14773F014F7F645045C37D38640D768559387ABC2E8470BAF0828,37B00EDDE7042539C884C8727775964C50952B25A827653CCC94187CAC3F6F2D. Four production files untouched. Maker did not execute checks; no claim diagnostics now pass. Central final pin consolidation and sole broker rerun remain required.

## Interfaces and immediate consumers

- types.ts imports canonical SpeakerAttributes from @lkb/core. AttributeAuthority extends existing RelationshipAuthority with attributedTurns[{sessionId,turnId,text,speakerRef,startTurnIndex,endTurnIndex}]. Central authority must derive these only from current profile attribution and actual effective turns, excluding attributes/relations from base revision.
- createSpeakerAttributeService(store,now?) exposes propose/review/list/accepted. Explicit construction drops request extras. SHA tenant/id key prevents tenant collisions. Value must occur literally in the exact quoted current accepted-block text. Low confidence/deterministic/unresolved and same-name ambiguity cannot authorize attributes.
- acceptedSpeakerAttributes(tx,tenant,person) is reusable within an existing transaction. It revalidates current source and actor-bound human accept receipt for each row; conflicting field values are withheld individually. Returns {fields:{org?:{value,evidence},role?:...},withheldFields,revision}.
- createMongoSpeakerAttributeStore(db,authorityReader) supplies tenant/session-bound CRUD and authority in one snapshot/majority transaction; only speaker_attributes is writable. No fallback without session capability. Abort/endSession cleanup runs after failure. Inventory101 refuses rather than truncates.
- readAcceptedSpeakerAttributes(snapshotDb,tenant,person,authority) uses caller snapshot and no nested client/session. Central actual profile/graph store joins it and must clear stale cached fields plus incorporate revision/evidence into the derived output.
- createSpeakerAttributesRouter({service,contextFor}) defines POST/GET /speaker-attributes and POST /speaker-attributes/:id/review. Only verified principal tenant/key/scopes reach server policy; sessions scope required; automation cannot review. DTO strips internal identities/hashes/receipt history, minimal receipt strips extras; async failures sanitize.

Security flags: auth, tenancy, provenance/privacy and persistence writes YES. Credential/provider/external sender access NO. No identity mutation and no source collections written. Existing read projection behavior is an immediate consumer boundary, not a waived obligation. Ground truth goal-U24 clauses2/3/5/6/7/8; D-141 suggested/final boundary. No issue-fix claim/corpus substitution.

## Broker checks required, NOT RUN

From root with existing Node/tsx environment:

```
node --test --test-timeout=60000 --test-concurrency=1 --import tsx apps/api/src/speaker-attributes/service.test.ts apps/api/src/speaker-attributes/mongo-store.test.ts apps/api/src/speaker-attributes/router.test.ts
```

Use root CPU broker's outer timeout/receipt protocol.18 authored tests cover suggested/human lifecycle, foreign/stale/ambiguous/block/hash/value refusal, automation, CAS race/failure, durable deletion/revoke/reject, actor replay, conflict withholding, forged receipts, tenant keys; session-bound write facade/refusal/cleanup/overflow/same-snapshot reader; authenticated mounted HTTP shaping/policy/sanitized failures. Driver doubles and scripted policy are synthetic only.

Central must supply exact schema/generated/accessor/migration/auth mount/authority/profile/graph consumer pins and focused consumer tests before freeze; broker must run the affected checks, immediate mounted producer-review-profile/graph consumer proof, applicable schema/generated/typechecks and contracts/verify_contracts.py. Unknown commands/outputs/durations remain unknown. Existing SDK/root restrictions must be honored; this packet does not prescribe a retry of a known denied action. No broader suite, actual DB/provider/browser or human acceptance is authorized by this packet.

Maker measurements: active time/tokens/money unknown; no measured efficiency claim. Checker admission must apply installed checker skill and explicit bounded bootstrap if denominators remain unknown. Only checker writes verdict. All remaining real model/corpus/native persistence/restart/human/UI parent gates remain HOLD. Same-SHA reuse requires exact final source/environment receipts; historical profile PASS cannot certify new writer or consumer changes.
