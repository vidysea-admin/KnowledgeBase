# Native publication checker preparation packet

**Unit/cycle:** source-delivery-native-publication / 1
**State:** building; prepared navigation packet, not ready-for-check.
**Root:** `C:/Users/product/Desktop/KnowledgeBase`
**Base/context HEAD:** `5c4cbade2d1a8aa4815de13d587db8de3b01cc4a`
**Candidate SHA:** no candidate commit; exact working-file pins below.

| New untracked path (no base) | SHA-256 |
| --- | --- |
| apps/api/src/native-evidence/publication.ts | A57808976ED7BF87623DEE0B29556CA59B3654D492D615B2E40472172D9F8801 |
| apps/api/src/native-evidence/publication.test.ts | 7FF73C0D7FCE965A50ACFA747FF71AAE8C874B28AE53CF2079496E9606BC7BE9 |

Cycle 1 narrow central-authorized typing fix: API typecheck exit 2 diagnostics at `qa/goal-vectorless-2026-10-15/verification-api-types-final-public-epoch.stdout.txt` identified non-narrowed manifest/leaf/locator/readback values, fixture possible missing root and missing required resolver fixture pageNumber. Throwing guards now explicitly return their never-returning error result; fixture checks root existence and supplies actual page.pageNumber. No casts or broad-any workarounds added; no semantics/CAS/security weakening. Supersedes cycle-0 pins only; no same-pin passing receipt exists here yet. No local tests run. Parent must rerun focused tests and compiler after all files freeze.

Only these two source paths were leased/changed by this worker. This packet and its matching manifest were separately authorized afterward. Other workers' paths and whole-worktree diff are outside this packet's ownership; parent must supply aggregate candidate pins.

## Authorized behavior and boundary

Exact API: `createNativePassageIndex(db)` returns `indexCandidate(candidate): Promise<void>` and `listLocators(tenantId, {sourceId,revisionHash}): Promise<NativeSourceLocator[]>`.

`indexCandidate` calls the actual `documentPagePassages` producer, preserving UTF-16 offsets/UTF-8 hashes and every binding: stable sourceId, immutable documentId/documentSourceId, revisionHash, positive headRevision. Each deterministic candidate branch is appended to the existing tenant tree. No candidate replaces another branch before head CAS. Full page/passage manifests are checked against persisted readback before callback success. Four CAS attempts, an 8 MB root, 10,000 total tree nodes, 500 pages and two million text units bound work. Empty individual pages remain in coverage; a document with zero passages is refused.

`listLocators` reads the exact tenant root, rejects ambiguity/oversize/corruption, selects exact stable sourceId/revisionHash, sorts branch node IDs then retains producer page/start order, and validates full coverage before returning locators. **Locators are quarantined references, not publication authority.** Every consumer must independently verify current head/consent/visibility. Late timeout work or failed head CAS may leave branches; these must remain ineligible through that authority check.

## Change map and consumers

- Producer: `packages/ingest/src/sources/native-document-passages.ts`; actual code point segmentation with UTF-16 positions and UTF-8 SHA-256.
- Owner: `apps/api/src/native-evidence/head-store.ts`; `indexCandidate` callback precedes logical source-head CAS, `loadPublished`/`isCurrent` gate reads.
- Publisher: new `publication.ts`; collection is only `tree_index`; `scopedCollection` pins every read/write tenant. Root identity uses `treeIndexRootFilter`; `indexRevision` compare-and-set preserves unrelated branches and checks persisted output.
- Resolver: `apps/api/src/native-evidence/resolver.ts`; shared runtime locator parser plus fresh owner-snapshot quote/hash validation.
- Immediate mounted factory: sibling worker's `apps/api/src/composition/integrations/native.ts` uses this exact publisher API; its final pins/tests belong to parent packet.
- Central schema/generated-type native level updates belong to another worker; local structural tree type deliberately does not edit or regenerate shared schema.

No fake sessionRef or audio times are introduced. Native levels are native-source/native-passage; each passage carries all bindings plus evidence.sourceLocator.

## Security / contracts

Auth and tenant boundaries: tenant-scoped reads/writes; malformed tenant rejected before collection access; cross-tenant reads return no root. This is data-write work and requires full independent ceremony. No credentials, provider, browser, network or real database access. No vector/embedding imports or entrypoints participate in publisher.

Applicable scoped clauses: `qa/contracts/goal-t053.md` C2 (tenant/provenance), C5 (unconfirmed write cannot signal success), C7 (exact evidence and immediate consumer). These generic clauses guide this subunit; this packet does not redefine whole T-053 or import transcript-only C8 as a native-document acceptance claim. Root's explicit native publication/head authority brief supplies this additive native behavior. Existing broader repository contracts and final parent integration/security gates remain authoritative and open; maker edited no contract.

## Required evidence / environment

Read maker skill: `skills/maker/SKILL.md`. Runtime package script supports Node `--test --import tsx`; root package requires Node >=24, tsx 4.23.13, TypeScript 5.9.3. Actual executable version/path and dependency readiness not independently measured by this worker. No environment variables/secrets needed by fixtures.

Broker-only command, cwd root, **30-second external cap**:

`node --test --import tsx apps/api/src/native-evidence/publication.test.ts`

Five authored cases: Unicode/full coverage/restart/idempotency; tree CAS preserving unrelated concurrent branches and refusing differing authority; bounded CAS/corruption/oversize/readback denial; actual headstore late timeout quarantine then resolver/revoke; competing actual head CAS retaining both indexed branches with only one current winner.

Fixture DB intercepts actual publisher collection accesses and throws/counts forbidden collections; expected zero forbidden calls at covered stages. No model/embedding port is available in this publisher, so no fictitious unused embedding-counter proof is claimed. Mounted search/Ask and actual forbidden provider ports require parent integration tests. No local test execution, exit code, duration, pass count or live behavior is claimed.

`contracts/verify_contracts.py` and appropriate same-candidate schema/type/consumer checks remain parent's required gate assessment; no mandatory check is waived by this packet. No mutations performed. No issue-ledger fix claimed or substituted reproduction corpus.

Maker actual active seconds, tokens, cost: **unknown**. Checker review must use explicit bounded bootstrap scope if denominators remain unavailable; ratio unverified. This worker did not dispatch/check or issue a verdict.
