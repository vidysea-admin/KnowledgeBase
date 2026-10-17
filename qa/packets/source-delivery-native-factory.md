# Native production factory — cycle 0

Status: building; new-source candidate only, no PASS claimed.
Root: C:/Users/product/Desktop/KnowledgeBase.
Observed shared HEAD: 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a. Both owned files are NEW and had no base. Other source files are independently owned integration dependencies, not modified here.
Exact pins: qa/coordination/knowledge-brain-20261015/source-delivery/native-factory-pins.json.
Candidate fingerprint (ordered scoped file map, not commit): 7370a5e2a6e9b773dbfa1e6d67a8a6ef3963e85f1548958df213bae281ce6ac7.

## Authorized behavior and applicable boundaries

Root explicitly leased NEW apps/api/src/composition/integrations/native.ts and native.test.ts, actual production factory plus its public mock checks. Pure construction only; no real DB/provider/network/browser/local tests. Root alone owns production/server mounting. No schema/contracts/decisions/enforcement edits. Security class: tenant binding, consent/current eligibility, immutable-vs-current revision disclosure boundary; not subject to non-security round cap.

Applicable inherited requirements include qa/contracts/goal-t007.md acceptance3 quarantine/current material and4 stale edits/deletions/tenant-scoped publication,6 current-byte/downstream evidence; document/watched provenance and current downstream-consumption boundaries in qa/contracts/goal-t053.md C1-C3/C7-C8 where central routes use these consumers. These are narrow shared-authority implementation boundaries, not complete T-007/T-053 acceptance or a replacement parent contract. No checker-owned contract was changed. Dedicated native/whole-product acceptance remains central/checker responsibility.

## Actual implementation and consumers

buildNativeIntegrations({db:Pick<Db,'collection'>,knowledgeStore:Pick<KnowledgeStore,'getDocument'>,messageAuthority?:NativeMessageAuthority}) returns {headStore,resolver,listLocators,nativeSources:(tenantId)=>({hydrate,revalidate})}.

Actual factory constructs createNativePassageIndex(db), injects its real indexCandidate into createNativeDocumentHeadStore and loads documents through knowledgeStore.getDocument with tenant. These constructors perform no reads/writes/provider calls. One createNativeEvidenceResolver is shared by returned resolver, enumeration filter, actual Ask hydration and release revalidation.

Document loadCurrent reloads headStore.loadPublished(tenant,stableSourceId), which checks consent/current publication and rereads current source around document loading. Factory independently matches stable sourceId, immutable documentId/documentSourceId, headRevision>=1, revisionHash/currentRevisionHash, tenant and page. Immutable old-document existence never supplies current authority. Returned eligible:true is derived only from that current published-head load.

listLocators first checks current head/revision, invokes actual persisted publisher enumeration, then resolves every locator through that same authority. Stale/quarantined branches are dropped even if old immutable content and tree branches remain. Inventory has max10,000 candidates; duplicated exact valid locator identities are collapsed. Infrastructure errors propagate rather than fabricate empty success.

Optional trusted NativeMessageAuthority provides loadCurrent and listLocators. Missing authority yields null/empty and cannot fall back to immutable documents. Resolver invokes message load only for parsed message locators; enumeration accepts only message locators on the message-owner branch. WA owner will supply its actual transactional capability; no fake approved-message proof was added here. Typed owner adapter may narrow locator.kind before calling its message-specific loadCurrent.

nativeSources(tenant) returns actual createNativeSourceHydrator(tenant,{resolver,listLocators}) and createNativeSourceRevalidator(tenant,resolver). Production graph/API mounting is root-owned; vertical.test.ts mounted fixture is owned by sibling t007_review_receipt_cases, not this factory maker. Exact same exported factory is intended for those consumers, not a mirrored mock pipeline.

## Pins and ownership

- NEW owned native.ts: e3809141c5bf25c06e4026db3f41066ea6e67a502aff980911a5119c0016c12b
- NEW owned native.test.ts: a57ab9b859a300c6c8ea48c5baa607e2d361cd5dc987a9537e4e50cdf1d221a5
- Actual sibling publisher publication.ts: 653b2e2ab976363705b10dc23a5717e9bed9885dde3a1fb1a64abd4fdfb4af15
- Other immediate head-store/resolver/hydration/revalidator pins are in the linked map. They are scoped fingerprints, not an asserted full-transitive freeze. Central consumer mounting/schema-generated identities need the central receipt.

## Prepared broker check

From repository root, coordinator's preflighted Node executable/importer, with30-second outer bound:
`node --import tsx --test apps/api/src/composition/integrations/native.test.ts`
Expected3 new public synthetic tests; not run locally. Receipt count/exit/duration UNKNOWN until broker execution.

1. Actual factory construction performs zero source/document/tree reads/writes; actual headStore.publish runs the real persisted publisher, authoritative resolution, actual native Ask hydration and release revalidation; foreign tenant refuses.
2. Actual replacement/idempotent retry leaves old immutable content present, fresh factory restart refuses stale locators, stale release revalidation refuses, exact document/source/head/page forgeries refuse and revocation hides current evidence.
3. Absent trusted message capability refuses evidence without immutable-document reads.

Public fake Mongo protocol supports actual collection operations, not an alternate index/resolver pipeline. Only sources/tree_index collections are allowed; unexpected/vector collection access throws and is counted. Prepared tests assert zero forbidden collection attempts during applicable publish/hydrate/revalidate/restart/retry paths. No embedding/vector provider function port exists on these actual constructors; no claim of instrumented provider-function coverage, model routing, mounted search/Ask, WA positive approval or production evidence follows from an unused injected counter. Sibling vertical/mounted test owns full path evidence.

## Remaining gates and metrics

Central mounted callers, actual WA authority, search/graph/API/citation integration, generated schema/compiler evidence, frozen-contract checks and sole independent verdict are pending. Provider-free keyword/tree source is implemented, but broad production/static/runtime vector absence remains a central evidence gate. Live DB/native transaction/restart/consent/host/provider proofs are not replaced by these mocks. Actual active maker seconds/tokens/cost UNKNOWN; use policy BOOTSTRAP_REVIEW with ratio unverified if denominators remain absent. Existing parent tasks stay open.
