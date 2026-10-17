# Resume speaker profile — tier 3 maker checkpoint

Status: HOLD_AWAITING_GRAPH_FREEZE_AND_BROKER
Policy: managed-review/1 (draft packet, not dispatch-ready)
Fix cycle: 0

Current behavior already exists; no source changes made. Raw backups and SHA256 pins for the six leased dirty files are in checkpoint.json. HEAD/base reference is 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a; it does not identify the dirty candidate. Historical manifest stays unchanged.

Effective acceptance: qa/contracts/speaker-knowledge-vectorless.md clauses 1–5; qa/contracts/speaker-profile-vectorless-consumer.md is absent. Existing manifest explicitly names the graph contract. Security read class is uncapped. This is verification of implemented tier 3 consumer behavior, not a filed-issue fix, so no issue corpus substitution is asserted.

Static trace: getKnowledge performs restrictive live preflight, then rebuilds input and authority inside withKnowledgeReadSnapshot. All queries use tenant scope; current sessions and source visibility are re-read. readEffectiveTurns precedes projection; confirmed-block transcript hashes reject changed attribution/transcript. Accepted relationship and attribute readers receive the same snapshot capability and source-only authority; accepted attributes replace cached values, and derived revision changes on revocation. The router requires sessions scope, verified tenant/person, scalar bounded query and matching output authority; it returns explicit DTO plus bounded exact passages. Client refuses mismatched person/revision, malformed evidence and over-budget passages. No unproven bug was repaired.

Smallest broker request (no local execution):
- Root: node --import tsx --test apps/api/src/speaker-profiles/store.test.ts apps/api/src/speaker-profiles/router.test.ts
  Covers actual mounted route, tenant collision, consent revocation, source-only authority, accepted relation snapshot, accepted attribute evidence/revocation, stale transcript and safe failures. Private TOC case remains skipped.
- apps/web: node ../../node_modules/vitest/vitest.mjs run src/pages/knowledge/speakers/speakerProfileClient.test.ts
  Covers downstream response acceptance, stale revision/foreign identity and passage bounds; this request does not claim TSX integration.
- Central broker chooses API/web noEmit and frozen validator once on final combined candidate. Graph helper proof belongs to graph owner and must share freeze/pins. Actual receipt reuse is unavailable until exact SHA/environment/command matching is authenticated.

Before dispatch, resolve graph/dependency freeze, exact candidate, executed receipts, environment/lock/runtime fingerprints, applicable mutation evidence, and root runtime release. Then assemble and validate the complete managed-review/1 dispatch input; this checkpoint intentionally cannot validate as ready. Historical usage and this phase runtime total tokens/active seconds are unavailable and remain null; no efficiency success is claimed. No children or checker launched.

## 2026-10-16 qualified evidence update

Client execution gap is resolved by broker/profile-observability-receipt.json plus its raw log: exit 0, 2/2 passed, 4.047 command seconds, tree_close_completed true. Lifecycle timestamps cover setup, collection, test and completion. API broker/profile-repaired-api-uri-receipt.json records 19 pass / 1 private TOC skip. No private opt-in or new execution occurred in this audit.

All seven profile/config/setup/probe pins match the client receipt. Preserve whole-receipt limitation: historical capture/native-media-types.ts guard is absent. Current tracked capture/native/native-media-types.ts exists, is clean, and was added in d50a25c2, with a different hash. This is not an observed tracked deletion or proven byte-equivalent rename. Root was notified for central capture reconciliation. Neither the absent unrelated path nor unchanged profile bytes establishes exact combined candidate/receipt reuse.

Prepared independent-review-packet-20261016.json identifies exact scoped clauses, logic, consumers and mandatory security checks, plus one upfront synthetic preflight-to-final-snapshot withdrawal probe. Runtime actuals remain unknown; bounded BOOTSTRAP_REVIEW uses 180s/6000 actual_total token allocation with protected completion reserve, ratio unverified. First helper assessment rejected empty reviewer list; immutable input/result retained. V2 supplies explicit not-started zero-use reviewer row. Assessment is workflow admission only, never checker launch or PASS. Complete candidate/environment/mutation readiness and root runtime release remain prerequisites; no reviewer launched.
