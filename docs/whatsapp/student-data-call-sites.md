# WhatsApp-derived content: external-model call sites (W11 deliverable A)

**Status:** SURVEY ONLY. Read-only; no code was changed. For human review (gate H-10) before any W11 deliverable B edit.
**Repo state:** branch `docs/devops-golive-2026-10-26`, HEAD `74568a6c`. Line numbers are against that HEAD.
**Requirement:** `docs/features/whatsapp-multiuser/spec.md` R-32; plan row W11 (`plan.md`).
**Scope of "WhatsApp-derived":** raw turns (`turns` rows of a `whatsapp-batch` source), review candidates
(`whatsapp_candidates.text`), approved claims (`claims`, `source: "whatsapp"`, `waReview`), and the tree branch
published on approval (`tree_index` native-source/native-passage nodes whose summary is the message text).

## 0. Read this first

1. **A rule already exists and it changes what "gate" means.** D-206 item 3 and
   `qa/gates/whatsapp-multiuser-grill-2026-10-29.md` Q-W1 = (b): WhatsApp-derived knowledge may reach external AI
   paths by default, as a scoped owner exception to the per-use approval rule. The code matches: the link default is
   `studentData: "no"` (`packages/db/src/collections/whatsapp-links.ts:14`, request insert at
   `apps/api/src/whatsapp/links/service.ts:153`). So deliverable B is not "block by default"; it is "make
   `yes` / `unknown` exclude, keep `no` flowing". The plan text for W11 (default `unknown`, Q-W1 = a) is stale
   against D-206 and should be reconciled by Umesh (see Open points, item 1).
2. **Raw WhatsApp text is not sent to any model today.** The review wiring is built with no indexer
   (`apps/api/src/whatsapp/review/compose.ts:43` passes `undefined`; wired by
   `apps/api/src/composition/integrations/knowledge.ts:67-80`), so the summarise / claims / decisions / topics /
   note-judge / speaker / embedding pipeline never runs over a WhatsApp session. Egress starts only AFTER a human
   approves a candidate (approved claim + published tree branch), via the **Ask / Route / Outputs** paths in section 2.
3. **One funnel, no provenance.** Every chat-model call goes through `complete()` in
   `packages/ai/src/router.ts:54` (embeddings `embed()` at `:108`) which receives only `{kind, messages}`. The router
   cannot tell whether a message contains WhatsApp text, so **the gate must sit where evidence is selected, not at the router.**

## 1. Providers reachable (the egress endpoints)

Registered at `apps/api/src/composition/production.ts:86-103` and routed by `config/ai-routing.yaml`.

| Provider | Endpoint | File:line of the network call | Chains that use it today |
|---|---|---|---|
| ollama-cloud / ollama-cloud-verifier | `https://ollama.com/api/chat` (origin pinned) | `packages/ai/src/providers/ollama-cloud.ts:44-50, 86-87` | `namemap summarize claims decisions tree-summary topics evaluator output-verifier output-generation answer ask note-judge` |
| gemini (Google) | `generativelanguage.googleapis.com ...:generateContent` and `:batchEmbedContents` | `packages/ai/src/providers/gemini.ts:59-61, 130-132` | `transcribe` (audio only), `vision` (images only) |
| gemini-flash-lite (Google) | same host, model `gemini-3.5-flash-lite` | `production.ts:88` | `route` (live /route step B) |
| ollama (local) | `OLLAMA_BASE_URL`, default `http://localhost:11434` | `packages/ai/src/providers/ollama.ts:41, 62, 115` | `speakers`, `vision`. Local by default; becomes egress if an operator points the env var off-box. No guard today |
| claude-code (CLI -> Anthropic) | spawns `claude -p` | `packages/ai/src/providers/claude-code.ts:37`; `apps/api/src/ai-transport.ts:195` | registered at `production.ts:89` but in NO chain today |
| Gemini grounded web search | `generativelanguage.googleapis.com ...:generateContent` + `google_search` | `apps/api/src/ask/ask-web-fallback.ts:130` | web fallback (wired at `production.ts:159`) |
| Tavily | `https://api.tavily.com/search` | `apps/api/src/ask/ask-web-fallback.ts:42` | NOT wired in production (comment `ask-web-fallback.ts:80-84`); kept for tests |
| Langfuse (self-hosted) / file trace | `LANGFUSE_BASE_URL` | `packages/ai/src/trace-langfuse/sink.ts:124`; `packages/ai/src/trace-registry.ts` | only if `TELEMETRY_ENABLED` and `TELEMETRY_SINK=langfuse` |
| Telegram | `api.telegram.org` | `packages/core/src/alerts/alert-sink.ts:82-101`; `packages/meeting-bot/src/capture/notify/telegram-channel.ts:45` | operational alerts |

Embedding chain: `config/ai-routing.yaml` has **no `embedding` chain** (D-173); `production.ts:136-147` and `:179`
(`semanticSearch: undefined`, `:179`) keep every embed call site dormant. They are listed in the table as DORMANT so a future
re-enable cannot reopen the hole silently.

## 2. Call-site table

Legend. **WA reach**: Y = WhatsApp text can be in the payload once content is approved; N = cannot; DORMANT = code
exists but is switched off; META = metadata only. **Gate here?**: whether a per-source / per-claim flag can be
checked at that site (Y/N/partly) given the data present there.

### 2A. Ask, Route, Outputs: the live egress paths (WA reach = Y)

| # | file:line | function / jobKind | What it sends | WA path | Provider | Gate here? | Recommended gate point |
|---|---|---|---|---|---|---|---|
| A1 | `packages/ask/src/select-nodes.ts:80` | `selectNodes` / `ask.select_nodes` | tree frontier lines `node_id \| title \| summary` (`:33-35`). For a published WhatsApp message the passage nodes carry the full message text as `summary` (`apps/api/src/native-evidence/message-revision.ts` `messageBranch`) and are offered in rounds 2-3 | approval publishes `tree_index` branch (`native-evidence/message-publication.ts` `publishApprovedMessage`) | ollama-cloud (`ask` chain) | partly: nodes carry `evidence.sourceId` only, no flag | G1: drop excluded native branches from the tree handed to `askV2` / `askFastV2` (`apps/api/src/routes/ask`, tree store `createMongoTreeStore(native.resolver)` at `production.ts:212`) |
| A2 | `apps/api/src/score.ts:57` (wired `production.ts:226`; per-request `ask/source-context.ts:275`) | `createLlmScorer` / `evaluator` | `Document title` + `Document summary` of each candidate node, i.e. the quoted WhatsApp passages | same as A1, candidate nodes after retrieval | ollama-cloud (`evaluator` chain) | partly (node level) | G1 + G2 |
| A3 | `packages/ask/src/bounded-refine.ts:82` | `boundedRefine` / `ask.refine_batch` | `packContext(batch)`: source quotes with speaker/time | bounded hydration (`ask/source-context.ts:103-240` transcript turns; `ask/native-source-context.ts:15-` native message passages) | ollama-cloud | N (strips carry no provenance flag) | G2 (hydrator) |
| A4 | `packages/ask/src/refine.ts:59` | `refine` / `ask.refine_strip` | each decomposed summary strip (non-bounded path) | node summaries (`ask-graph.ts:196`) | ollama-cloud | N | G1 |
| A5 | `packages/ask/src/answer.ts:41` and `:22` | `generateAnswer` / `ask.answer` | `{query, context}` incl. verbatim source quotes | refined context from A3/A4, or fast path `ask-v2.ts:76-79` | ollama-cloud (`ask` chain) | N | G2 |
| A6 | `packages/ask/src/answer.ts:61` | grounding judge / `ask.answer_grounding` | sentences + cited strips/sources | same | ollama-cloud | N | G2 |
| A7 | `packages/ask/src/ask-graph.ts:226` (`loggingComplete`) and `packages/ask/src/ask-v2.ts:55` | wrapper that every A1-A6 call passes through | n/a (carrier) | n/a | n/a | N | note only |
| A8 | `apps/api/src/route/route-store.ts:164-176` (wired `production.ts:177`) | `/route` step B `selectNodes` / `ask.select_nodes` | same frontier payload as A1 | same tree | **gemini-flash-lite (Google)**, i.e. a different vendor from A1 | partly | G1 (same tree filter must cover the route tree, `createMongoTreeStore` at `production.ts:177`) |
| A9 | `apps/api/src/knowledge-outputs/synthesis.ts:69` (generate) and `:46` (verify); wired `composition/integrations/answers.ts:70` and `:26` | `synthesize` / `validateItems` (`kind: "answer"`, jobKind `output-generation`, `output-verifier`) | exact quotations + occurrence metadata of authorized claims and turns | `knowledge-outputs/reader.ts:17-38` reads `claims` (incl. `source: "whatsapp"`) filtered by `visibility.claimVisible`; `evidence.ts:32-52` | ollama-cloud / ollama-cloud-verifier | Y (claim rows are in hand; session -> source -> link is one lookup) | G3 (claim reader) |
| A10 | `apps/api/src/answer-policy/answer-workflow.ts` (`:176-209`) via `answer-policy/application.ts` `askForMode` | answer workflow | no own call: it runs the Ask deps (A1-A6) and `policyAskDeps` only appends a style line (`application.ts:44-48`). It also persists candidate + evidence in the answer record store | same as A1-A6 | ollama-cloud | n/a | covered by G1/G2; see cache note in section 4 |
| A11 | `packages/ask/src/ask-graph.ts:151-153`; `ask-v2.ts:83` -> `ask/ask-web-fallback.ts:130` | web fallback `tavilySearchFn(query)` | **only the user's query string** (comment `:127-129`: "Only the query text leaves the process") | WA text reaches it only if the asker types it; not derived content | Google (Gemini grounding) | n/a | no gate needed; keep the invariant (add a test that the payload is `query` only). Note A1-A6 afterwards send web results together with internal evidence to ollama-cloud |

### 2B. Index-time pipeline (WA reach = Y only if a WhatsApp session is ever indexed; today it is NOT)

| # | file:line | function / jobKind | Sends | Reachability for WA | Provider | Gate here? | Recommended gate point |
|---|---|---|---|---|---|---|---|
| B1 | `packages/index/src/pipeline/summarize.ts:109` | `summarize` | session turns | `apps/api/src/indexing/session.ts:91` | ollama-cloud | N (turns only) | G4 |
| B2 | `packages/index/src/pipeline/claims.ts:93, 130` | `claims` (+ retry kind) | turn windows | `indexing/session.ts:92` | ollama-cloud | N | G4 |
| B3 | `packages/index/src/pipeline/notes/decisions.ts:78` | `decisions` | turns | `indexing/session.ts:253` | ollama-cloud | N | G4 |
| B4 | `packages/index/src/pipeline/notes/judge.ts:154` | `note-judge` | note + source turn text | claims/summary judge (`session.ts:91-92`) | ollama-cloud | N | G4 |
| B5 | `packages/index/src/tree/extract-topics-llm.ts:93` | `topics` | session page text | `indexing/session.ts:140, 280` (`buildTopicIndex` over `eligible.sessions`) | ollama-cloud | N | G4 |
| B6 | `packages/index/src/pipeline/speakers-llm.ts:176`, `speakers-grounded.ts:195`, `speakers-verifier.ts:70`; `apps/api/src/indexing/speaker-suggest.ts` | `speakers` / suggestions | transcript text | `indexing/session.ts:303` (flag `KB_SPEAKER_SUGGEST=1`) | local `ollama` | N | G4 |
| B7 | `apps/api/src/indexing/session.ts:117`; `chunk-write.ts:114` | `embed` (`document`) | chunk text | vector retrieval mode only; production forces `retrievalMode: "vectorless"` (`production.ts:144`) | none configured (DORMANT) | N | G4 |

How a WhatsApp session could still be indexed (this is why B is listed, not dismissed):
- `apps/api/src/composition/production.ts:183` still builds `deps.whatsapp = createMongoWhatsAppDeps(boundIndexer, ...)` WITH the indexer. It is shadowed today because `knowledge.whatsapp` (reviewed, no indexer) overrides it in the final `{...deps, ...knowledge, ...}` spread (`production.ts:263`). It is a one-line regression away from sending raw group text to ollama-cloud (`whatsapp/store.ts:239-261`). **Recommend deleting the indexer argument at `production.ts:183` in deliverable B** (edit in place, no new file).
- Other `BoundIndexer` consumers that take a session id: `composition/integrations/transcripts.ts:36` (transcript-review refresh), `connector-workflow/gaps.ts:62`, `scripts/webinar/sync-session.mjs --index`, `scripts/backfill.mjs`. They are guarded today by visibility (`visibility/knowledge.ts:198`, `ctx.source.kind !== "whatsapp-batch"`) and by being scoped to recordings, but none has a WhatsApp-specific refusal at the indexer.
- `buildTopicIndex` runs over `eligible.sessions` of the tenant (`session.ts:140`); a WhatsApp session has no `session_pages`, so it is not fed, but nothing asserts that.

### 2C. Embeddings (all DORMANT)

| # | file:line | Sends | Status |
|---|---|---|---|
| C1 | `apps/api/src/ask/source-context.ts:175` | the query only | `deps.embed` unset (`createAskArmsFor({})`, `production.ts:221`); D-173 |
| C2 | `apps/api/src/ask/ask-arms.ts:103` | the query only | same |
| C3 | `apps/api/src/semantic-search/semantic-search-store.ts:35` | the query only | `semanticSearch: undefined` (`production.ts:179`) |
| C4 | `scripts/backfill.mjs:151`, `scripts/eval-recall.mjs:68`, `scripts/lib/toc/toc-embedding-backfill.mjs:194` | document chunks | operator scripts, need an `embedding` chain that does not exist |

### 2D. Telemetry, alerts, other egress

| # | file:line | Sends | WA reach | Gate? |
|---|---|---|---|---|
| D1 | `packages/ai/src/trace.ts:9-11, 168-180`; `trace-langfuse/payload.ts:16-19` | sizes, token counts, class names, ids, `tenantId`, provider/model. Never prompt/completion text | META | none; keep the "no content" invariant under test. If a trace context ever carries `sourceId` or a link id it must stay an opaque id |
| D2 | `packages/core/src/alerts/alert-sink.ts:82`; `meeting-bot/.../telegram-channel.ts:45` | operational alert text (watch silence, meeting notices) | META today. The W9 sync script's alert is `console.error` only (`scripts/whatsapp/sync-links.mjs:225`, Telegram is plan H-13) | W9/W12 alert payloads must stay ids/counts/codes (R-41), never group subject or message text |
| D3 | `packages/meeting-bot/src/calendar/whatsapp-discovery/*` (flag `LKB_WA_DISCOVERY=1`, default OFF) | extracts meeting URLs from WA text; output carries only `{url, ts, groupIdHash, messageIdHash}` (`whatsapp-link-extractor.ts:2-6`); the URL is then joined by the bot | URL only, no text | Not a model call. It is a third-party host contact (the meeting platform) with a URL taken from chat. Umesh to decide if it needs the flag |
| D4 | `apps/api/src/whatsapp/archiver/client.ts`, `scripts/whatsapp/sync-links.mjs` | ids, jids, owner ids to the archiver service (our own, not an external AI service) | ids only | out of R-32 scope; listed for completeness |
| D5 | `packages/ai/src/stt/*`, `packages/ai/src/vision/*` (Gemini / ollama vision) | audio / images | N: WhatsApp attachments are not ingested (`packages/ingest/src/sources/whatsapp.ts:109` returns `media: []`; `publishApprovedMessage` returns for `kind === "attachment"`) | none |

## 3. Where `studentData` is today and where it would have to be carried

Today `studentData` exists only on the link row (`schema/whatsapp_links.schema.json`, `packages/db/src/collections/whatsapp-links.ts`,
set by admin approval at `apps/api/src/whatsapp/links/service.ts:168-175`). It is read by nothing downstream.

Chain and the break points:

| Hop | Where | Carries link id / flag? |
|---|---|---|
| link -> source | `apps/api/src/whatsapp/store.ts:198` stamps `sourceMeta.whatsappLinkId` (string id), only when `typeof linkId === "string"` | link id yes; flag no. **Legacy links (`linkId` null, `store.ts:134`) get NO stamp**, so no way to find their flag |
| source -> session -> turns | `store.ts:~205-260` | session has `sourceId`; turns have `sessionId` |
| source -> candidate | `whatsapp/review/detection.ts` (`WhatsAppReviewCandidate`) | `sourceId`, `sessionId`; no link id |
| candidate -> claim | `whatsapp/review/materializer.ts:17-22`, body = `{text, status, source:"whatsapp", origin, evidence[{turnId,sessionId,quote}], waReview{candidateId, kind, approvedBy, approvedAt}}` | **no source id, no link id, no flag.** Only `evidence[].sessionId` leads back (claim -> session -> source -> `sourceMeta.whatsappLinkId` -> link) |
| candidate -> tree branch | `native-evidence/message-publication.ts` -> `message-revision.ts` `messageBranch` | `evidence.sourceId` + `revisionHash` + `nativePublication.candidateId` on the node; no flag |
| tree/claims -> Ask / Route / Outputs | A1-A9 above | readers get node evidence (`sourceId`) or claim rows |

Design consequence (recommendation, not an edit): carry **the link id, not a copy of the flag**, and resolve the live
flag at read time through one helper, so an admin change takes effect without rewriting claims. Required carrying work
for deliverable B:
1. Stamp legacy links too (a stable pseudo id or a lookup by `ownerUserId` + tenant), or treat a `whatsapp-batch`
   source with no resolvable link as `unknown` (fail closed).
2. Optionally add `waReview.sourceId` (or `linkId`) in `materializer.ts:20` so claim readers need no session hop. It
   is a schema addition to `schema/claims.schema.json` (`waReview`); needs its own approval line.
3. Add the link id to the native-source branch `evidence`/`nativePublication` only if the tree filter (G1) cannot get
   it from `evidence.sourceId` -> source lookup (the lookup is enough; prefer no schema change).

## 4. Recommended gate points (for Umesh, H-10)

One predicate, `externalModelEligible(tenantId, sourceId)`, implemented once next to `claimVisible` in
`apps/api/src/visibility/knowledge.ts` (the module that already decides WhatsApp read eligibility), returning false
for a `whatsapp-batch` source whose resolved link has `studentData` in `{yes, unknown}` (and for an unresolvable
link, fail closed), true for `no` or non-WhatsApp sources. Then apply it at these points, in this order of value:

- **G1 Tree handed to Ask and Route (covers A1, A2, A4, A8, A10).** Filter excluded native-source branches out of
  the tree before `selectNodes` / `evaluator` see them (tree store `createMongoTreeStore(native.resolver)`,
  `production.ts:177` and `:212`; `treeSearch`). One filter protects both vendors (ollama-cloud and Google). Excluded
  content is then invisible to external-model Ask/Route but stays available to non-model paths.
- **G2 Source hydrators (covers A3, A5, A6).** `apps/api/src/ask/native-source-context.ts` (native message passages)
  and `apps/api/src/ask/source-context.ts` `createSourceHydrator` (transcript turns, `whatsapp-batch` rows). Drop an
  excluded passage/turn before it becomes a `SourceQuote`. This is the last point where provenance is still known;
  after it the strips are anonymous JSON. Also stops the quote reaching `answer.ts` even if G1 is bypassed.
- **G3 Claim reader for Outputs (covers A9).** `apps/api/src/knowledge-outputs/reader.ts:17-28` next to the existing
  `visibility.claimVisible` call (extra predicate on the same batch). Count the withheld claims into the existing
  "withheld" signal (`:28-29`) so the output reports "unavailable" honestly rather than silently shrinking.
- **G4 Indexer entry (covers B1-B7).** Refuse in `apps/api/src/indexing/session.ts` (single entry `indexSession`) when
  the session's source is `whatsapp-batch`: raw WhatsApp text must never be indexed. And delete the indexer argument
  at `apps/api/src/composition/production.ts:183`. Belt and braces: today only the missing wiring protects B.
- **G5 Per-use approval record (R-32 item 3).** No such record exists. Needs a store (admin action with link id,
  scope, expiry, actor) and one more input into `externalModelEligible`. Not a call-site gate itself.
- **G6 Not router level.** Do NOT gate in `packages/ai/src/router.ts`: it has no provenance. A tenant-level kill
  switch there would only be a coarse fallback and would also stop non-WhatsApp traffic.
- **Keep-as-is, add tests only:** A11 (web fallback sends the query only), C1-C3 (dormant embeds, no `embedding`
  chain), D1 (trace metadata only), D2 (alert payloads content-free).

Cache and replay hazards to include in deliverable B (inline, not separate files):
- Stored answers and outputs (`answer-policy/answer-mongo-store.ts`, `answer-record-store.ts`, `knowledge-outputs/repository.ts`) and the `/search` cache (`apps/api/src/search-cache`) hold derived text. A flag change from `no` to `yes`/`unknown` should invalidate them the same way withdrawal does (ISS-420 pattern).
- A flag change cannot recall text already sent; the doc/test should say egress is not reversible, only future sends are gated.

## 5. Open points for Umesh

1. **Plan vs decision conflict.** Plan W11 and Q-W1 recommend default `unknown` (exclude until classified). D-206 / grill Q-W1 = (b) chose allow-by-default (`no`), and the code implements `no`. Confirm that `yes` / `unknown` are the only excluding values and that new links stay `no` (plan W11 acceptance item 5 must be re-worded), or reverse D-206.
2. Legacy (env-seeded) links have no `sourceMeta.whatsappLinkId` stamp: choose between stamping them or treating unresolvable WhatsApp sources as `unknown`.
3. Is it acceptable that the web fallback (A11) stays ungated because it sends only the asker's query? (It can contain WhatsApp wording if the asker pastes it.)
4. D3 (meeting-link discovery from chat) is a URL egress to meeting platforms, off by default. In scope for R-32 or not?
5. G5 (per-use approval record): new collection / event type needed; this crosses the `whatsapp_events` W12 contract. Decide owner and shape before deliverable B.
6. Claim schema addition (`waReview.sourceId` or `linkId`) needs schema approval (H-3 style) if wanted; the survey's recommendation is to avoid it and look up through `evidence.sessionId`.

## 6. How this survey was done (for the independent re-run, W11 acceptance 4)

Searched `apps packages scripts` for provider names (`generativelanguage`, `ollama`, `gemini`, `openai`, `anthropic`,
`tavily`, `langfuse`, `telegram`), for `complete(` / `embed(` / `routeComplete` / `routeEmbed`, and traced each
`Provider` from `production.ts:86-103` and `config/ai-routing.yaml` back to its callers. A checker re-running this
should also grep for new `fetch(` / `https.request` / `spawn(` sites and for any caller of `buildIndexer` /
`BoundIndexer`. No claim here of "verified safe": not covered are `scripts/**` operator tools beyond the ones named,
the `apps/web` bundle (browser-side calls), and runtime configuration (env, `OLLAMA_BASE_URL`, `TELEMETRY_*`).
