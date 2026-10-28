# speaker-profile-vectorless-consumer

Status: implementation-ready-awaiting-broker
**Handshake status:** implementation-ready-awaiting-broker
Fix cycle: 0

Task: T-055 / U2.4; priority tier 3, approved Knowledge Brain roadmap, D-173 as corrected by D-174. This is a new vectorless speaker consumer behavior, not another polish PASS on the old profile seam. Auth/tenancy security boundary remains fully checked.

## Scope and authority

Read-only product consumer of `qa/contracts/speaker-knowledge-vectorless.md` clauses 1–5. No QA contract edits. Separate graph helper owned by speaker_graph_maker; production composition already mounts the speaker router and returns Mongo dependencies. Existing profile endpoint and privacy decisions remain intact. No collection/document implementation changed. Human identity precision, real corpus, browser/live acceptance and full parent T-055 acceptance remain open.

## Change map / caller chain

- `apps/api/src/speaker-profiles/store.ts`: optional `getKnowledge` uses the same live preflight then read-only Mongo snapshot flow as `get`; `readSpeakerProfile(..., true)` passes projected speaker, effective current turns, visible claims/topics, current sessions and `visibleSessionIds: currentSessions.map(s => s._id)` to the pure helper. Every Mongo query remains tenant scoped. No new writes, providers or persistence cache.
- `apps/api/src/speaker-profiles/router.ts`: mounted `GET /speaker-profiles/:personId/knowledge?q=...`; sessions scope, verified tenant, strict person ID, only one scalar q at most 2000 chars. Missing helper or mismatched returned tenant/person yields generic 503. Explicit response whitelist omits tenant ID, private no-store. `routeSpeakerKnowledge` caps exact passages at 20/12000 quote characters. Graph helper refuses >512KiB output, stale/foreign evidence and oversized inventories.
- `apps/web/src/pages/knowledge/speakers/speakerProfileClient.ts`: `loadSpeakerKnowledge` validates identity, matching SHA256 revision, node/edge/statement shapes and evidence, passage count/characters, before rendering.
- `apps/web/src/pages/knowledge/speakers/KnowledgeSpeakerProfilePage.tsx`: opt-in source passage query under existing profile, source/session/topic counts, explicit unresolved/ambiguous states, exact source links. Nested consumer key follows auth-session/key/refresh/person changes; effect cancellation rejects stale responses. Repeated submit refreshes authoritative read. No automatic graph fetch or AI call.
- Corresponding API router/store tests and web transport/page tests add mounted auth/tenant/query/DTO checks, source consent revocation, revision/bounds validation and actual UI query-to-passage consumption. Existing tests retained.

Security flags: auth yes (sessions scope), tenancy yes (existing snapshot authority plus returned-view check), data writes no, credentials no new reads, external effects none. Current graph relationships reflect actual attributed claims/topics/session evidence only; curated agreement/contradiction producer is explicitly absent.

## Frozen candidate

HEAD reference: `5c4cbade2d1a8aa4815de13d587db8de3b01cc4a`. The working tree already included prior snapshot/profile privacy changes; preserve those. Do not interpret the whole HEAD diff as solely this unit. All eight files existed before this unit. This manifest is new.

SHA256:

| File | Hash |
|---|---|
| apps/api/src/speaker-profiles/router.ts | CB58852A388F065A7B8DB1D7BD502587A73F737F0421AC1759C78E7C9E4EEE6B |
| apps/api/src/speaker-profiles/store.ts | 39673D43BA16866D26DD1B2CCEE7C424A841D7168476A26897735E9DCA6C3028 |
| apps/api/src/speaker-profiles/router.test.ts | 0CB275C6769C36FA127D9D52C6FCCDA714B2AD4C941A86A2AD3CE61EAAC3530D |
| apps/api/src/speaker-profiles/store.test.ts | 48299D28B5500F784923D0E0D13DEA3F9A498A6A7EECE191B43C428A1A7E9F5F |
| apps/web/src/pages/knowledge/speakers/speakerProfileClient.ts | C2F285E16E35C91F9C198558C1D1E1641D820DB229B266C979BB28835006439A |
| apps/web/src/pages/knowledge/speakers/speakerProfileClient.test.ts | 0592805B111B1DC29DA2C333B451875A4CF05BE8C454A9A93776EEA011E5CE3E |
| apps/web/src/pages/knowledge/speakers/KnowledgeSpeakerProfilePage.tsx | 3004795FEC5C466AF0BCDB209BD558ECD0F73D65B12F9BD667A00E2E100A7279 |
| apps/web/src/pages/knowledge/speakers/KnowledgeSpeakerProfilePage.test.tsx | 2DBD619107972AE175F4084DAAF132D91243B6E6327B646B5DDEE1B8B95D3F04 |

## Required verification / evidence

Broker requests pending, no execution or PASS claim:

1. Root: `node --import tsx --test apps/api/src/speaker-profiles/router.test.ts apps/api/src/speaker-profiles/store.test.ts`.
2. apps/web: `node ../../node_modules/vitest/vitest.mjs run src/pages/knowledge/speakers` (use actual installed workspace runtime selected by broker).
3. API and web tsc noEmit via installed runtime; frozen contract verifier per broker.

Synthetic in-memory fixtures only; no live DB/provider credentials required. Private TOC source tests are deliberately skipped unless separately authorized `KB_U24_PRIVATE_TOC_TESTS=1`; this unit does not authorize it. API tests bind loopback and may require established broker permissions; this maker did not run commands. Local CPU execution belongs exclusively to the root broker. Independent checker must inspect helper's matching verdict and exact bytes, boundary tests, actual mounted route plus downstream UI. Ready-for-check only after broker evidence is attached.
