# source-delivery-vectorless-language

**Handshake status:** building
**Status:** building
**Fix cycle:** 0
**Priority tier:** 3 — T-008 vectorless delivery; coordinator authorized new-only characterization.
**Base/candidate HEAD:** 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a; working-tree candidate, not committed.

## Scope
New test only: packages/ask/src/vectorless-multisource-language.test.ts (no base).
Hindi document-labelled and Hinglish message-labelled source nodes pass actual selectNodes and original-tree resolution, then public askV2 refuses missing supported source proof before scoring or answering and audits refusal. Fixture labels do not define a native locator API. No fabricated SourceQuote, speech origin or timestamps.

## Contract and limits
qa/contracts/vectorless-tree-retrieval.md clauses 2/4/6: routing metadata cannot become answer evidence; truthful source-context refusal. Positive heterogeneous/native page/message locator retrieval remains unimplemented in the inspected public seam and is not certified. SourceQuote requires transcript identifiers/times and ask-graph maps those fields explicitly. No mounted API/UI, native locator success, eligibility lifecycle or zero-vector-provider-spy acceptance claimed. No production source changes, data writes, auth/tenancy change or credentials. Only fake in-memory job writes.

## Consumer/check
askV2 -> askGraphV2 -> retrieveNode -> selectNodes/sourceCatalog -> injected hydrate -> validateHydration -> refused audit. Consumer scoring and answer must stay uncalled.
Sole broker focused command (30-second external process bound): node --test --import tsx packages/ask/src/vectorless-multisource-language.test.ts
Required follow-on: ask typecheck and repository DoD verifier as coordinated; no local execution performed.

## Pins
Test SHA256: f3d8e8e0b1bafb8f5f8a818d17b2ea39123a2e7d214595ac6f3cb871b12856e0
packages/ask/src/ask-v2.ts SHA256=f21440832de515cb0b97a481530f8f872d4872f66a87122642f1194c0a7b5f8c
packages/ask/src/ask-graph.ts SHA256=1056ce1cc0b3d11ba3222e7ef61ef7a2358379390523f9663a41b69de49a9bc5
packages/ask/src/source-context.ts SHA256=67e4e332becd86b5f65d7558888481680a81a62f3250d8031c4062a1f28ceda7
packages/ask/src/select-nodes.ts SHA256=e974d1cd6640406c28dacfd9473e3519d137b712a14d06a248c072410600a692
packages/ask/src/testUtils.ts SHA256=811e72a15a47dadcb4646dae03305762607788b0a55e8f32930234b40b865b54
packages/ask/src/tree-routing.ts SHA256=506faae6c018e635eef9e34c5b339c0ec105999ba405cae34725dbabe11077cf

## Evidence/usage
Tests pending broker; no execution receipt, PASS or readiness claim. Independent checker still required. Maker active time/tokens/cost unknown; no ratio success claimed. No browser/network/DB/provider/test execution.
