# Native source hydration maker packet

Status: building
Fix cycle: 0
Priority: tier 3, approved native document/page/message vertical slice, T-008 with T-007/T-054 immediate consumers.
Root: C:/Users/product/Desktop/KnowledgeBase
Base: 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a. Candidate is an uncommitted shared working tree; five owned new files have no base. Existing passage-lexical.ts is the sole tracked edit. Exact owned six-file SHA256 pins: native-hydration-pins.json beside this packet.

## Contract and ownership

Read skills/maker/SKILL.md. Applicable ground truth: ARCHITECTURE H3 and tenancy/schema rules; qa/contracts/goal-t008.md C1/C4/C5/C8 plus its vectorless amendment (real native locators, no fabricated audio fields); qa/contracts/whatsapp-ingestion-first-slice.md C9 trusted-reader quarantine. No contracts, schema, generated types, shared composition or governance modified.

Owned files: apps/api/src/ask/native-source-context.ts and .test.ts; apps/api/src/answer-policy/native-evidence.ts and .test.ts; apps/api/src/ask/passage-lexical.ts and new passage-lexical.test.ts. Existing immediate lexical coverage was confirmed in apps/api/src/ask/source-context.test.ts before editing. Parent additionally granted the new direct lexical test. qa/coordination/.../source-delivery is the packet lease.

## Behavior/interfaces

- createNativeSourceHydrator(tenantId,{resolver,listLocators}) returns HydrateSourcesFn. ListNativeLocators(tenantId,{sourceId,revisionHash}) enumerates trusted bounded current locators; an exact admitted sourceLocator avoids enumeration but still resolves authority. Every locator binds admitted source/revision; shared resolver alone validates canonical IDs, documentSourceId/headRevision, UTF16 passage/hash and current authority. No retrieved text fallback. Missing, stale, empty, oversized or ambiguous source refuses; canonical quoted passages receive bounded lexical ranking. Output is NativeSourceQuote with no session, speaker or audio timestamps.
- createNativeSourceRevalidator(tenantId,resolver) returns (nodes:TreeIndexNode[])=>Promise<void>; intended graph hooks before generation and after grounding. verifyNativeSourceQuotes(tenantId,quotes,resolver) is the answer-evidence release helper. Both use resolver.revalidate afresh; infrastructure failures propagate. Node identity/source/revision envelope checks precede authority.
- passageLexicalScorer accepts readonly {text,speakerRef?}[] and preserves Unicode letters/marks/numbers. Native inputs omit speaker labels; transcript callers retain their existing label contributions.

## Checks and evidence

Sixteen tests authored (native hydrator7, native release5, lexical4), none executed. Includes both locator kinds, source/revision mismatches, authority refusal/errors, no audio fields/retrieved-text contamination, duplicate identities, exact locator enumeration bypass, Unicode/Hinglish, unchanged English/calendrical cases, and real shared resolver hydration→release refusing a same-content document whose current head epoch advances. This last test is an in-memory capability fixture, not Mongo proof.

Proposed sole-broker command from repository root, after import/environment preflight and outer timeout: bundled node --import tsx --test --test-concurrency=1 --test-timeout=30000 apps/api/src/ask/native-source-context.test.ts apps/api/src/answer-policy/native-evidence.test.ts apps/api/src/ask/passage-lexical.test.ts. Expected16 tests. Existing source-context.test.ts regression, current API/Ask/core typechecks, schema/structure/frozen verification and central graph/downstream checks remain required. No local test/build, DB, provider, browser or mutation run occurred. Maker token/cost/active time unknown, not zero; no measured efficiency claim.

## Central blockers / no READY claim

Production current-source-head/eligibility loader and bounded publisher/listLocators remain central authority capabilities. Existing ask/source-context.ts dispatch, answer-evidence.ts release integration, native tree/index producer and shared Ask/core exports are owned elsewhere. Reviewer/publication/Mongo/browser full T007/T008 gates remain open. Resolver implementation is sibling-owned apps/api/src/native-evidence/resolver.ts; shared type is canonical @lkb/core NativeSourceLocator with required documentSourceId/headRevision. No global snapshot/atomicity claim follows from individual calls. Independent checker has not been dispatched or issued a verdict. This packet is building, not ready-for-check or PASS.
