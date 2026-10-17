# Native document passage producer — cycle 0 building packet

## Scope and identity

- Root: `C:/Users/product/Desktop/KnowledgeBase`.
- Task: T008; priority tier 3, explicit central two-file implementation lease.
- Observed workspace HEAD at packet preparation: `5c4cbade2d1a8aa4815de13d587db8de3b01cc4a`. This is an observed integration HEAD, not proof of an isolated base/candidate commit.
- Candidate files are NEW, with no prior file base; candidate is working-tree bytes, no candidate commit claimed.
- Contract: `qa/contracts/goal-t008.md` C1 (real source-resolved evidence) and its source-native locator requirement. This producer alone cannot satisfy whole-task acceptance.
- Manifest: `qa/manifests/source-delivery-native-document-producer.md`; fix cycle 0; building.

## Exact changed paths and SHA256

| Path | SHA256 |
| --- | --- |
| `packages/ingest/src/sources/native-document-passages.ts` | `969C240AB924778ABDDEC49D1394B8506B6D8043CC39F0CDAB9F1DD5DDB580BE` |
| `packages/ingest/src/sources/native-document-passages.test.ts` | `CD373E831A2A1FC0A6DDE164D0A90393998FA568EF623432EC386AEB615CCBC6` |

These two new QA documents are packet/manifest metadata, outside executable candidate scope. Other workspace changes belong to other lanes; no global-clean assertion is made.

## Exported interface and behavior

`documentPagePassages(document: PageDocument, binding: NativeDocumentBinding, maxBytes = 1024): NativeDocumentPassage[]`.

`NativeDocumentBinding = {sourceId: string; headRevision: number}`.
`NativeDocumentPassage = {text: string; locator: DocumentPageSourceLocator}` from canonical `@lkb/core`.

Source is `packages/ingest/src/sources/document-pages.ts:PageDocument`. Consumer imports the new module directly; no index barrel edit. Central composition is the intended mounted consumer and remains under central ownership.

Each genuine page is split on Unicode codepoint boundaries into at most maxBytes UTF8 bytes (4..1024). UTF16 offsets refer to exact page text; SHA256 hashes that exact slice as UTF8. Empty pages emit nothing; whitespace is preserved, never trimmed or normalized. Identity binds stable caller sourceId separately from immutable documentId/documentSourceId, body revisionHash, headRevision and real pageNumber. headRevision must be a safe integer >=1, explicitly rejecting 0. Invalid/duplicate pages and lone surrogates refuse.

## Security boundary and dependencies

Pure producer: no DB, writes, auth or credential handling. It accepts a binding as data, never authority. Central publisher must verify tenant/source/body binding, persist candidate as quarantined, complete head CAS, and expose only current published authority. Canonical head deletion/revocation/replacement invalidation is downstream work. No fabricated turns, transcript sessions or timestamps are produced. Sources/WhatsApp consent lanes are untouched.

Immediate dependency fingerprints: canonical `packages/core/src/source-locator.ts:DocumentPageSourceLocator` currently requires documentId/sourceId/documentSourceId/headRevision/revisionHash/pageNumber/passage. This shared file is centrally owned and not pinned by this producer packet; broker/checker must pin the final integrated bytes. `document-pages.ts` is imported for its type only.

## Required broker checks — NOT EXECUTED

From repository root, resolve the approved existing Node runtime and run this focused command through the central <=30-second broker:

`node --test --import tsx packages/ingest/src/sources/native-document-passages.test.ts`

Expected: 3 named node:test cases, all pass. Case 1 verifies multilingual page reconstruction, genuine page identity, stable/immutable distinction, head revision, exact hash/bounds and surrogate safety. Case 2 verifies empty pages and preserved whitespace. Case 3 rejects invalid byte limits, revision 0/negative/fractional/unsafe values, empty head ID, malformed revision hash, duplicate pages and both lone-surrogate classes.

Central integration must additionally run focused typechecking and consume this API through mounted quarantined publication/head-CAS/native retrieval; those commands depend on the final central implementation and cannot be honestly specified as already executable here. Required repository contract verification remains owned by central integration. No local tests were attempted or run, and no receipts are reusable yet.

Maker runtime/interpreter resolution, test elapsed time and test outputs: unknown/not executed. Actual model token/cost usage and comparable active-time denominator: unknown; do not report measured ratios. A checker needs an assessed bounded bootstrap scope if those denominators remain unavailable. No checker verdict exists for this candidate.
