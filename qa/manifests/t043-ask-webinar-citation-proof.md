# t043-ask-webinar-citation-proof

Status: ready-for-check
Fix cycle: 1
Priority tier: 3 - next unblocked roadmap task (T-043)
Security class: YES - touches tenant read isolation on the Ask path (cross-tenant read class, cf. ISS-078). Takes the full check.

## Unit scope

Hermetic tests in `packages/ask` proving the Ask retrieval-and-citation path over webinar-session-shaped content. Roadmap acceptance (docs/meeting-bot-roadmap.md:70): "Index into the KB ... /ask across all webinars"; done-when "which countries were suggested for Europe?" answered with a citation from the session.

The INDEXING half already exists and is tested (`scripts/webinar/sync-session.mjs --index` -> `indexSession`, `apps/api/src/indexing/session.ts`, `session.test.ts`). This unit covers only the ASK half, against in-memory fakes. It does NOT complete T-043 (see "Not proven"). T-043 stays open in TASKS.md / .goal/goal.json.

No non-test source changed. Tests only; no defect found, so no ISS-TRANSCRIPT row was filed.

## Step 1 findings

(a) Tenant scoping. It is NOT enforced by a filter inside `packages/ask`. The boundary is (1) the per-tenant tree: `apps/api/src/routes/ask/ask.ts` loads `deps.tree.load(req.auth.tenantId)` and passes that single tree to `askV2`; (2) tenant-bound injected seams built per request from the verified key: `extraCandidateArmsFor(tenantId)` (ask.ts:27-34 doc) and `createSourceHydrator(tenantId, ...)` using `scopedCollection(...)(tenantId)` (`apps/api/src/ask/source-context.ts:163-184`). Inside the package, `tenantId` is used only to stamp `recordJob` rows (`ask-v2.ts:98-112, 132-186`). What the package itself enforces is non-widening: the membership/resolve guard (`ask-v2.ts:~150-175`, ISS-157/158/159) discards any arm node not in the supplied tree and substitutes the tree's own node; the bounded path re-resolves candidates against the tree (`ask-v2.ts:~180`); `validateHydration` (`source-context.ts:77-107`) refuses hydrated nodes outside the admitted set or quotes whose nodeId/sessionRef differ; `selectNodes` resolves ids only inside the supplied tree (`select-nodes.ts` final fn). `askV2` does not validate that `tenantId` is non-empty.

(b) Citation. Built in `router.ts:internalSource` (~l.33) as `{node_id, evidence}`; `evidence.sourceQuotes[]` is attached by the (injected) hydrator and validated by `validateHydration`. Each `SourceQuote` carries `sessionRef, turnId, speakerRef, tStart, tEnd, char/byte offsets, hashes, quote, origin` (`source-context.ts:5-20`). The answer step receives strips with the `{speakerRef, turnId, sessionRef, tStart, tEnd}` tuple (`ask-v2.ts` boundedSources, `answer.ts` rebinding to trusted metadata). `AskV2Result` exposes `sources.internal` (all nodes scoring >= lower) and `answer` text; it does not expose which quote each answer sentence cited (sentence sourceIds are validated then dropped, `answer.ts` return).

(c) Existing coverage. `ask-v2.test.ts:277-372` covers ghost/foreign node from an arm, real-id wearer, and dropped-candidate reporting, with generic fixtures ("Apples are red", t1/t9) - no webinar shape, no turn timing, single session cited. `source-context.test.ts` covers packing, budgets, hydration refusal of an unknown node, `packContext` round trip of tuple fields. Not covered before: multi-session retrieval with a question answered from different sessions; an exact session/turn/speaker/time citation against a fixture; tenant-B bait outscoring the right answer; foreign quotes under an admitted node; foreign markers across prompts/ledger/audit; empty tenant; insufficient coverage on webinar content.

## Files added

- `packages/ask/src/webinar-fixture.ts` - synthetic fixture (3 tenant-A sessions, 1 tenant-B bait session, quote builder, hydrator over a quote store).
- `packages/ask/src/webinar-citation.test.ts` - 10 node:test cases.

## Criterion to test

| Criterion | Test |
|---|---|
| Europe question retrieves the right passage | "Europe question: retrieves the right passage and cites ..." |
| Citation = correct session, turn, speaker, tStart/tEnd, exact quote proof | same test (deepEqual on strip tuple and on the returned SourceQuote) |
| Retrieval ranges across sessions; second question from a different session | "retrieval ranges across sessions ..." |
| Bait (higher score, near-identical) is real | "fixture sanity" |
| Nothing from tenant B in result, audit trail, job rows, prompts | "tenant-B bait absent from context, citations, ..." |
| Arm offering B node; B node wearing A's id; selector naming a B id | three dedicated tests |
| Hydrator returning B quotes under A node / B node is refused | "a hydrator that returns tenant-B quotes ..." |
| Empty tenant does not widen scope or get defaulted | "missing/empty tenant ..." |
| Insufficient coverage reported, no answer generated | "insufficient internal coverage ..." |

## Evidence

Run from `C:\Users\product\Desktop\KnowledgeBase-lanes\transcript\packages\ask` with the codex Node runtime on PATH.

`node --test --import tsx src/webinar-citation.test.ts` -> tests 10, pass 10, fail 0, todo 0.

`node --test --import tsx src/source-context.test.ts` -> tests 18, pass 18, fail 0 (neighbour regression).

`node C:\Users\product\Desktop\KnowledgeBase\node_modules\typescript\lib\tsc.js --noEmit -p tsconfig.json` -> no output, exit 0.

Mutation testing not run (checker's job). No D-015 corpus applies: the unit does not fix a filed issue.

## Not proven

- Live path: `sync-session --index` against a work DB followed by a real `/ask` (Mongo, LLM, embeddings). Retrieval quality of the real selector/scorer on real transcripts is untested; the scorer and model here are deterministic fakes.
- Tenant filtering inside the injected seams is outside `packages/ask`: `scopedCollection` in `createSourceHydrator` and the vector/lexical arms (`apps/api/src/ask/source-context.ts`, `createAskArmsFor`), and `deps.tree.load(tenantId)` in the store. A proving test must live in `apps/api` against a two-tenant fake DB (cf. ISS-078 class). These tests show only the package does not widen what those seams return.
- Empty/missing tenant is not rejected by `askV2`; it is stamped verbatim on job rows. Rejection happens (if at all) at `requireScope("ask")` in apps/api, unverified here.
- The answer-sentence-to-quote link is not returned to callers, so the "citation" asserted is the validated quote inventory of `sources.internal` plus the strip tuple the answer was grounded on.
- T-043 remains open.
