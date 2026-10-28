# source-delivery-native-ask
**Handshake status:** building
**Status:** building
**Fix cycle:** 0
**Priority tier:** 3 — approved native locator vertical slice.
**Base HEAD:** 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a
**Candidate:** working-tree bytes below; no commit created.

## Authorized slice
Lease source-context.ts, bounded-refine.ts, ask-graph.ts plus two new native test files. Existing transcript SourceQuote remains unchanged. New SourceEvidenceQuote union adds NativeSourceQuote with canonical @lkb/core NativeSourceLocator (document-page requires documentId; message requires threadId/messageId). Exact UTF16 passage length and UTF8 slice hash validated; native quote shape rejects invented speech/timestamps. Hydration binds sourceId/revisionHash to admitted original and hydrated node metadata. Optional original sourceLocator binds exact locator. Canonical current source/head/eligibility/exact text authority belongs exclusively to API resolver, not these structural checks.

## Consumers/lifecycle
sourceQuotes returns union; graph projects native source as {sourceLocator} through strict packed context. Native source origin must match locator kind. SourceContextDeps.revalidate?: (nodes: TreeIndexNode[]) => Promise<void> is mandatory for native results; graph invokes it before generation and after grounding before result assignment. Missing/changed/deleted authority throws and audits refusal. Existing transcript path retains optional hook compatibility. API worker binds revalidation; central owns core type and ask index exports. No edits to central exports/schema.

## Contract and required checks
qa/contracts/vectorless-tree-retrieval.md clauses 2/4/5/6. Scoped proof/consumer fixtures do not certify mounted production, native resolver authorization, publication readiness, UI links or no-vector mounted paths. Genuine positive Hindi document and Hinglish message public askV2 fixtures inspect grounded packed locators; mutation/deletion callbacks refuse pre-generation or post-grounding.
Sole broker, external 30-second bound: node --test --import tsx packages/ask/src/native-source-context.test.ts packages/ask/src/native-bounded-context.test.ts packages/ask/src/source-context.test.ts packages/ask/src/bounded-ask.test.ts packages/ask/src/webinar-citation.test.ts
Also ask typecheck and repository DoD verifier as centrally coordinated. No local execution performed; no PASS/readiness claimed. Maker active time/tokens/cost unknown, ratios unverified. Security flags: read evidence/source identity/revalidation; no durable writes/auth/credentials changed, tests write fake jobs in memory.

## Changed file pins
packages/ask/src/source-context.ts SHA256=0aa7e4c8bdd19c2da4fdcb19a584b9968fc2023326f3c3d0d5fabbb30649e121
packages/ask/src/bounded-refine.ts SHA256=3337cffdb6ee47b8319ffc1fe4a09d792e35e2a7927b584fa3c35ca1a1d66bf3
packages/ask/src/ask-graph.ts SHA256=fab2927b34be7e396bdb2baa65c63c5ae8d92b310a7808741cc8c432d35ca8f9
packages/ask/src/native-source-context.test.ts SHA256=5340e91621440369793c6e997faa45de9ae08b074a0798ebfe0057cc1b257c9f
packages/ask/src/native-bounded-context.test.ts SHA256=fad936a3e5120493d53587cb5570c53da0386905287db3788298a526ed777a3d
New files native-source-context.test.ts and native-bounded-context.test.ts have no base. Existing refusal candidate remains frozen in its earlier packet.

## Canonical document epoch update
Document locator requires documentId, documentSourceId (immutable PageDocument.sourceId), stable sourceId (sources._id), and positive safe-integer headRevision, plus revisionHash/page/passage. Packed context uses the same strict validator. Offset and passage hash semantics unchanged. Missing identity/head fields covered by direct proof tests. No local tests run.

Final head epoch alignment: headRevision starts at 1; zero is refused and has a direct regression case. No local execution.
