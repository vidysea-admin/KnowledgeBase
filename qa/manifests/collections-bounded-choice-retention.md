# T-055 collections bounded choice retention

**Status:** building
**Handshake status:** building
**Fix cycle:** 0
**Priority tier:** 3 — roadmap T-055
**Root:** C:/Users/product/Desktop/KnowledgeBase
**Base/candidate HEAD:** 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a plus uncommitted scoped patch
**Packet:** qa/coordination/knowledge-brain-20261015/product-delivery/collections-maker-packet.md
**Verdict target:** qa/verdicts/collections-bounded-choice-retention.md
**Contract/consumer/runtime pins:** qa/coordination/knowledge-brain-20261015/product-delivery/collections-shared-pins.json

## Scope and contract

Preserve available persisted members outside the bounded chooser on collection rename/edit; permit explicit deselection. No server-hidden unavailable member IDs exposed. Applicable qa/contracts/goal-t055.md clauses: C5 saved membership, C7 auth/tenancy/write boundaries, C8 bounded usable states, C9 immutable candidate and required verification. Full T-055 acceptance is excluded. Data-write payload behavior changes; auth and tenancy derivation do not change.

## Exact changed files and SHA256

| Path | Before | Candidate |
|---|---|---|
| apps/web/src/pages/knowledge/CuratedCollections.tsx | cc5ca5ef22cb617a2f7cc949af0dfd525819814ca9a550a389707a755b2d112b | 6af57e2b05ca643bd15a17ea2d550336dfdd2c3d210a87bb200f6395cfa4ce97 |
| apps/web/src/pages/knowledge/CuratedCollections.test.tsx | 52fda13eaf3dae715e426baf42112df27f000df413e1380a49d96d7f2cdcd1a3 | 84d89021db6758fa80b9e651c0b6d10f75b8d383e8a77884eba557f4bc92d7b3 |

Both source files tracked and initially clean. Added documentation: this manifest and linked compact packet only. No product files untracked.

## Evidence and required checks

Authored two component regressions: retain available omitted member/order on rename; explicitly deselect omitted member while preserving remaining membership. Existing unavailable-member refusal is retained. Immediate consumer: apps/web/src/pages/knowledge/collectionsClient.ts writeSavedCollection; unchanged API router/store predicates documented in packet.

Requested through sole verification broker, cwd apps/web: `pnpm exec vitest run src/pages/knowledge/CuratedCollections.test.tsx src/pages/knowledge/collectionsClient.test.ts`.

Execution pending. No test, typecheck, build, contract verifier, browser/provider/network or database execution performed by maker. Coordinator owns applicable mandatory web typecheck/build/verifier gates and final shared dependency pins. Do not promote to ready-for-check until attributed broker evidence and required checks are recorded. Independent checker and persisted verdict remain pending.

## Actual maker usage

Active seconds: null (unknown). Tokens: null (unknown). Monetary cost: null (unknown). Wait time excluded from any active-time claim. Ratio unverified; bounded BOOTSTRAP_REVIEW required when denominators are unavailable.

Dispatch helper assessment: qa/coordination/knowledge-brain-20261015/product-delivery/collections-assess-dispatch-retry2-input.json and matching result.json; BOOTSTRAP_REVIEW with protected completion reserve, ratio_verified false. Root allocation total120 active seconds/3000 allocated tokens; prospective review90/2200, finalization30/800. Placeholder reviewer is explicitly not launched with zero prior checker work; measured maker usage remains null. Two invalid helper schema/ID attempts retained alongside valid retry2; no checker phase occurred. Checker must reassess independently and retain all actual/debit charges before finalization.
