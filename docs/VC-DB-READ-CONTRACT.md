# VC read contract for the KnowledgeBase Mongo database

Audience: AI code editors working on the Virtual Counsellor (VC, `d:\vc`). Status: v1, 2026-10-28.
Umesh approved: VC reads the KB database directly to build its own answers; KB keeps improving `/ask`.
Cites are `path:line` at KB commit `80b8db43`. No connection string or secret appears here; get them
from the owner and keep them in VC's own `.env`.

## 0. Ground rules (read first)
1. **Read-only.** VC never writes, creates indexes, or runs migrations against the KB database.
   Writes go only to VC's own `virtual_counsellor` database.
2. **Tenant filter on every query** (section 3). A query without `tenantId` is a bug and a data leak.
3. **Apply the visibility rules** (section 4). Raw collections contain rows KB itself refuses to serve.
4. **Cite provenance** (section 6). An answer fact with no turn-level citation must not be presented as KB knowledge.
5. Student or personal data from VC never goes into KB queries, logs or this repo.
6. When in doubt call KB over HTTP (`POST /ask`, `GET /search`); both apply every gate below
   (`apps/api/src/routes/ask/ask.ts:51`, `apps/api/src/routes/search.ts:45`).

## 1. Which database
| Name | Role | Cite |
|---|---|---|
| `lkb_prod` | Live deployed app database. **VC reads this one.** | `docs/GO-LIVE-UBUNTU.md:15-19, 67, 240` |
| `lkb_staging` | Local pipeline writes here; opt-in only. Never point VC at it. | `docs/GO-LIVE-UBUNTU.md:18-19, 71`; `apps/api/src/db-name.ts:4-22` |
| `lkb` | Legacy production alias, protected. Do not use. | `apps/api/src/db-name.ts:5`; `docs/GO-LIVE-UBUNTU.md:68-70` |
| `global_university_db`, `pathlynks_engine`, other Vidysea DBs on the same host | Not KB. Out of scope. | `docs/GO-LIVE-UBUNTU.md:70-71`; `references/portals/lkb-live.knowledge.md` (findings row 1) |

`lkb_prod` was copied from `lkb_staging` on 2026-10-26 (23 sessions, 3238 turns, 1828 chunks, 1768 claims,
105 topics; `docs/GO-LIVE-UBUNTU.md:15-17`); new pipeline output reaches it only after KB promotes it. The live
tenant is `toc` (`docs/GO-LIVE-UBUNTU.md:20`). Keep database name and tenant id as VC configuration.

## 2. Collections VC may read
Shapes come from `schema/*.schema.json` (source of truth). Every collection leads with `tenantId`
(`schema/index.json:2`); schemas allow extra fields, so ignore what you do not know.

| Collection | Use it for | Key fields (cite) |
|---|---|---|
| `turns` | **The passages.** Verbatim transcript text; the only citable ground truth. | `_id, tenantId, sessionId, speakerRef, speakerLabel?, tStart, tEnd (seconds), text, occurredAt?` (`schema/turns.schema.json:6-17`) |
| `sessions` | One per source session: title, date, org, publish state. | `_id, tenantId, sourceId, title, date, org?, participants?, status.{transcribe,diarize,summarize,index}, indexAttempt` (`schema/sessions.schema.json:6-92`) |
| `sources` | Consent and kind of each source; join target of `sessions.sourceId`. | `_id, tenantId, kind, hash, consent.{given,recordedBy}, captureMode, url?` (`schema/sources.schema.json:6-60`) |
| `claims` | Extracted statements with turn-level evidence. | `_id, tenantId, text, status, confidence?, topicRefs?, origin?, source?, evidence[].{turnId,sessionId,quote?}` (`schema/claims.schema.json:6-83`) |
| `session_pages` | Per-session summary, key insights, decisions, action items, Q and A. | `_id, tenantId, sessionId, summary, keyInsights?, decisions?, actionItems?, qa?, evidence[], indexArtifact` (`schema/session_pages.schema.json:6-66`) |
| `chunks` | Embedding index over turns (retrieval aid, not text). | `_id, tenantId, sourceRef (= sessionId), turnRefs[], chunkIndex, vector[], dims, embeddingModel, indexArtifact` (`schema/chunks.schema.json:22-55`; `sourceRef` is a session id: `apps/api/src/semantic-search/current-corpus.ts:32`) |
| `topics` | Topic names and the sessions that discuss them. | `_id, tenantId, name, sessionRefs[]` (`schema/topics.schema.json:6-11`) |
| `tree_index` | One document per tenant: the whole routing tree (`node_id = tenant:<tenantId>`, `level: "tenant"`, nested `children`). Optional for VC. | `schema/tree_index.schema.json`; root filter `packages/index/src/tree/build.ts:49` |
| `graph_edges` | Typed edges between entities. Optional. | `_id, tenantId, from, to, type, weight?` (`schema/graph_edges.schema.json:6-12`) |
| `speakers` | Identified people (names, org, role). Read only if VC needs speaker names; treat as personal data. | `personId, aliases[], org?, role?` (`schema/speakers.schema.json:6-20`) |
| `transcript_reviews` | Human corrections to turn text. **Needed for correct text** (section 4, rule 5). | `_id, tenantId, sessionId, revision, overlay[].{turnId,text,speakerRef,speakerLabel?}` (`schema/transcript_reviews.schema.json:7, 14-34`) |

There is no `passages` collection: a passage is a `turns` row. Native documents and collections
(`document_documents`, `knowledge_collections`, tree levels `native-source` / `native-passage`) need KB's head and
revision authority to validate (`apps/api/src/visibility/knowledge.ts:45-72`); **not covered by this contract in
v1.** Use `GET /search` for them.

## 3. The tenancy filter (mandatory)
- Every KB row carries `tenantId` (`packages/db/src/lib/tenantScope.ts:2-3`). Every filter VC sends must contain
  `{ tenantId: "<tenant>" }` as a **plain string**, ANDed with anything else.
- KB's own accessor is the model: `scopedCollection(db, name)(tenantId).find(filter)` merges `{ ...filter, tenantId }`
  (`packages/db/src/lib/tenantScope.ts:25-32, 72-75`). The merge puts `tenantId` last, so a caller filter cannot override it.
- **Validate the tenant id before use**: non-empty string, no surrounding whitespace, no control characters
  (`packages/db/src/lib/tenantScope.ts:19-23`; same rule at `apps/api/src/auth.ts:37-39`). An object such as
  `{ "$ne": null }` would otherwise match every tenant. Never take the tenant from end-user input; VC derives it from
  its own configuration or the calling product's auth.
- `/ask` does the same: the tenant comes from the verified API key (`apps/api/src/routes/ask/ask.ts:51`), and the
  retrieval arms are a per-request factory so they cannot be bound once and reused across tenants
  (`apps/api/src/ask/ask-arms.ts:1-17, 77-86, 98-100`).
- After every read, assert `row.tenantId === tenant` and drop or fail on a mismatch (KB does:
  `apps/api/src/visibility/knowledge.ts:32-40`).

## 4. Visibility, freshness and withdrawal (what KB refuses to serve)
KB re-checks these on every read; there is no cached eligibility (`apps/api/src/visibility/knowledge.ts:1`). VC must do
the equivalent. Minimum rule set for a turn, claim, page or chunk to be usable:

1. **Session is published.** `sessions.status.index == "done"` AND `sessions.indexAttempt.state == "complete"` AND
   `indexAttempt.sessionId == _id` AND `indexAttempt.sourceId == sessions.sourceId`
   (`apps/api/src/indexing/generation.ts:215-216`; states `running|complete|failed|uncertain`:
   `schema/sessions.schema.json:133-139`). A `failed`, `uncertain` or `running` attempt means the session is hidden
   (fail closed; `docs/GO-LIVE-UBUNTU.md:178-179`). Two live sessions are currently index-FAILED
   (`references/portals/lkb-live.knowledge.md`, findings table).
2. **Generation matches.** Page, chunk and claim rows carry `indexArtifact.generation` (optional on claims). When
   present, use the row only if it equals `sessions.indexAttempt.generation`; rows of an abandoned generation can remain in the DB and are
   invisible to KB (`docs/GO-LIVE-UBUNTU.md:279`; `apps/api/src/ask/graph-context.ts:95`).
3. **Source is allowed (consent withdrawal).** Join `sessions.sourceId` to `sources._id`; require
   `sources.kind in {recording, document, spreadsheet, url}` and `sources.consent.given !== false`
   (`apps/api/src/visibility/knowledge.ts:28, 44-46`). `consent.given == false` is how a source is withdrawn; its
   sessions, turns, claims and pages must all disappear from VC answers.
4. **WhatsApp is excluded by default.** `sources.kind == "whatsapp-batch"` sessions are hidden from the general
   corpus (`apps/api/src/visibility/knowledge.ts:134, 149`). KB only exposes individually human-approved claims
   (`claims.source == "whatsapp"`, `status == "verified"`; `.../publication-contract.ts:3-4`) after rechecking a
   review record in `whatsapp_candidates` and `whatsapp_review_log`, which VC must not read (section 8). So: **v1 VC
   skips every `whatsapp-batch` session and every claim with `source == "whatsapp"`.** Also skip any session whose id
   appears in `whatsapp_candidates` (KB check at `knowledge.ts:48`); VC cannot see that collection, so rely on the
   `sources.kind` rule and treat this as a known residual (open item, section 10).
5. **Use the corrected text.** Original `turns.text` can be superseded by a human review. Read
   `transcript_reviews` with `_id = sha256hex(JSON.stringify(["head", tenantId, sessionId]))` (computed by
   `headId`, `apps/api/src/transcript-review/store.ts:29`); for each `overlay[]` entry whose `turnId` matches, use
   the overlay `text`, `speakerRef`, `speakerLabel` instead of the original
   (`apps/api/src/transcript-review/effective-reader.ts:9-40`). If a head exists and an overlay `turnId` no longer
   exists in `turns`, treat the whole session as unusable (reader throws at `effective-reader.ts:20`).
6. **Claim must still be consistent with its evidence.** Every `claims.evidence[]` must resolve: `turnId` exists in
   `sessionId`, session passes rules 1 to 3, and if `quote` is set it must be a literal substring of the effective turn
   text (`knowledge.ts:118-129`; `schema/claims.schema.json:76-79`). Drop the whole claim if any evidence fails.
7. **Chunks are only valid against current turns and the right model.** Use a chunk only if its `tenantId` matches,
   `sourceRef` is a visible session, every `turnRefs[]` id is a visible turn of that session, and `embeddingModel`
   equals the model VC embeds the query with and `dims == vector.length == query vector length`
   (`apps/api/src/semantic-search/current-corpus.ts:30-33`; `apps/api/src/ask/ask-arms.ts:102-104`;
   `schema/chunks.schema.json:46-54`). Vectors from different models are not comparable. Sessions with
   `indexAttempt.manifest.retrievalMode == "vectorless"` have no vector chunks; they are reachable by text only
   (`schema/sessions.schema.json:265-269`).

**Claim status: citable vs needs-review** (D-200, narrowed by D-201; `docs/DECISIONS.md:2623, 2635`)
- Enum: `verified | needs-review | conflicting` (`schema/claims.schema.json:36-43`).
- `verified`: citable as-is. `needs-review`: **citable, but VC must show it labelled as not human-reviewed** and anchor it to the verbatim turn (a claim is a paraphrase; the turn is the truth).
  Rank verified above needs-review (`packages/core/src/knowledge-outputs/evidence-builder.ts:107-108`). KB's own stored
  citations carry `claimStatus: "verified" | "needs-review"` (`schema/knowledge_outputs.schema.json:273`). Today all
  1768 live claims are `needs-review` (`docs/DECISIONS.md:2626`), so a verified-only VC filter returns nothing.
- `conflicting` (and any other value): do not cite (`evidence-builder.ts:112-113`).
- Claims have **no freshness, expiry or withdrawn field**. "Withdrawn" is expressed by the claim row disappearing,
  its evidence failing rule 6, or its source failing rule 3. "Stale" means the generation or session state in rules 1
  and 2 no longer matches. Re-evaluate on every read; do not cache eligibility.

## 5. Consistency
`lkb_prod` may be a standalone `mongod`: cross-collection reads are not one snapshot and can briefly see a half-applied
publication (`docs/GO-LIVE-UBUNTU.md:167-170`; `apps/api/src/visibility/read-snapshot.ts:11-15`). Use plain `find` with
`readConcern: "local"`, no transactions; the worst case is a momentarily stale answer, which rules 1 and 2 mostly absorb.

## 6. Provenance to cite
Every VC answer sentence that rests on KB must carry, per source used:
- `turns._id` as `turnId`, `sessionId`, `speakerRef` plus `speakerLabel` (human name when present), `tStart` and `tEnd`
  seconds (`schema/turns.schema.json:8-14`), and the verbatim `text` or `evidence.quote`.
- `sessions.title`, `sessions.date`, `sessions.sourceId` as the human-readable citation, and `sources.url` for
  `kind == "url"` (`schema/sources.schema.json:23-60`).
- For claims: `claims._id`, `status` (so the UI can label needs-review), and `evidence[].{turnId,sessionId,quote}`
  (`schema/claims.schema.json:60-83`). For pages: `session_pages.sessionId` and its `evidence[]`.
- Never show raw `speakerRef` such as `spk:0` as a name (`schema/turns.schema.json:11`); use `speakerLabel` or omit.

## 7. Indexes to use (declared; you cannot add more)
Declared (`schema/index.json`; every one leads with `tenantId`): `turns {sessionId}` (:44-56); `sessions {sourceId}` (:31-43);
`sources` unique `{hash}` (:17-30); `claims {status}` (:78-90); `session_pages` unique `{sessionId}` (:57-70);
`chunks {sourceRef}` (:138-150); `graph_edges {from}`, `{to}` (:151); `transcript_reviews` unique `{sessionId}` (:379).

Gaps: `turns` has **no text index**, so keyword search is a tenant-scoped scan (`apps/api/src/search-store.ts:39-41`);
`claims.topicRefs` and `claims.evidence.sessionId` are not indexed. Fetch visible sessions first, then `turns` by
`{tenantId, sessionId: {$in: [...]}}`. Vector search is brute-force cosine over `chunks.vector`, as KB does
(`schema/chunks.schema.json:5`; `apps/api/src/ask/ask-arms.ts:98-105`); cache in VC. Never add a Mongo index from VC.

## 8. Do NOT read (credentials, audit, operations, personal data)
- Secrets and auth: `api_keys` (`keyHash`; `schema/api_keys.schema.json`), `tenants`, `consent_policies`, `trusted_senders`,
  `registration_link_approvals`.
- Usage, audit, runs: `usage_events`, `answer_runs`, `answer_source_conflicts`, `answer_policy_*`, `eval_runs`,
  `championship_events`, `transcript_review_revisions`, `decisions`, `knowledge_outputs`.
- Pipeline and operations: `jobs`, `watch_*`, `watched_sources`, `meeting_candidates`, `automation_runs`,
  `application_operations`, `operations_schedules`, `gaps`.
- WhatsApp and review internals: `whatsapp_*`, `speaker_suggestions`, `speaker_attributes`, `speaker_relationships`.
- Anything not listed in section 2.

## 9. Access: read-only user recommendation
Do not reuse `lkb_app`; it has `readWrite` on `lkb_prod` (`docs/GO-LIVE-UBUNTU.md:151-152`). Ask the DB admin to create a
separate user (placeholders only; the owner picks the password and stores it only in VC's `.env`):
```js
use lkb_prod
db.createRole({ role: "vcKbRead", privileges: [
  { resource: { db: "lkb_prod", collection: "turns" }, actions: ["find"] },
  { resource: { db: "lkb_prod", collection: "sessions" }, actions: ["find"] },
  { resource: { db: "lkb_prod", collection: "sources" }, actions: ["find"] },
  { resource: { db: "lkb_prod", collection: "claims" }, actions: ["find"] },
  { resource: { db: "lkb_prod", collection: "session_pages" }, actions: ["find"] },
  { resource: { db: "lkb_prod", collection: "chunks" }, actions: ["find"] },
  { resource: { db: "lkb_prod", collection: "topics" }, actions: ["find"] },
  { resource: { db: "lkb_prod", collection: "transcript_reviews" }, actions: ["find"] }
], roles: [] })
db.createUser({ user: "vc_kb_ro", pwd: "<PASSWORD>", roles: ["vcKbRead"] })
```
Add `tree_index`, `graph_edges`, `speakers` only if needed. Allow VC's host IP only. The Mongo host lacks auth today
(`docs/GO-LIVE-UBUNTU.md:25-30`), so this user is meaningful only once authorization is enabled. Use a separate
pool and a short `maxTimeMS` (for example 5000) on every query.

## 10. Stability and what may change
- **Schema source of truth**: `schema/*.schema.json`; changes ship as migrations (`migrations/*.cjs`) and are
  additive by convention (for example `claimStatus` added optional: `docs/DECISIONS.md:2635-2637`). Required fields are meant
  to be stable (a change needs a DECISIONS entry); optional and unlisted fields may appear, change or vanish.
- **Versioned marker**: `indexArtifact.version` is the constant `1` on chunks, claims and pages
  (`schema/chunks.schema.json:66-68`); skip rows with any other value.
- **May change without notice**: `tree_index` node shape and ids, `indexAttempt.manifest` internals, chunk `_id`
  format (`chunk-v1:` content hash, `apps/api/src/indexing/chunk-integrity.ts:9-10`), `sourceSpans` / `rawTextSha256`
  extras on chunks, embedding model and dimension (re-embedding changes `embeddingModel`; filter on it), and the
  retrieval mode of a session.
- **Expect drift**: `/ask` becomes single-call RAG (D-203, `docs/DECISIONS.md:2657`); claims move from `needs-review`
  to `verified`; WhatsApp rules may widen. Re-read this file at every KB release.
- **Open items (ask KB, do not work around)**: (a) a `whatsapp_candidates` existence check for relabelled sources;
  (b) native document collections; (c) a published read-only view or API that applies section 4 server-side.
- **Writes are forbidden**, including "harmless" ones: no insert, update, `findOneAndUpdate`, `createIndex` or `drop`.
  KB's tenant accessor is the only sanctioned writer (`packages/db/src/lib/tenantScope.ts:77-131`); production writes
  are a human gate.

## 11. Example read queries (mongosh syntax; `T` is the validated tenant string)
```js
// 1. Published, consented, non-WhatsApp sessions (rules 1 and 3); join sources in the driver.
const T = "<tenant>";
const sessions = db.sessions.find({ tenantId: T, "status.index": "done", "indexAttempt.state": "complete" },
  { projection: { title: 1, date: 1, org: 1, sourceId: 1, "indexAttempt.generation": 1, "indexAttempt.sourceId": 1 } }).toArray();
const sources = db.sources.find({ tenantId: T, _id: { $in: sessions.map(s => s.sourceId) },
  kind: { $in: ["recording", "document", "spreadsheet", "url"] }, "consent.given": { $ne: false } }).toArray();

// 2. Turns (passages) for the allowed sessions, then apply the transcript_reviews overlay (rule 5).
const ids = sessions.filter(s => sources.some(x => x._id === s.sourceId)).map(s => s._id);
const turns = db.turns.find({ tenantId: T, sessionId: { $in: ids } }).sort({ sessionId: 1, tStart: 1 }).toArray();
const heads = db.transcript_reviews.find({ tenantId: T, sessionId: { $in: ids } }).toArray();

// 3. Citable claims for a topic, verified first, with their evidence turns (sections 4 and 6).
const topic = db.topics.findOne({ tenantId: T, name: /visa/i });
const claims = db.claims.find({ tenantId: T, topicRefs: topic?._id, status: { $in: ["verified", "needs-review"] },
  source: { $exists: false } }).limit(50).toArray();   // source absent = not WhatsApp
// then fetch evidence turns by { tenantId: T, _id: { $in: ids } }, verify rule 6, verified before needs-review.

// 4. Vector candidates: only chunks of the current model and generation (rule 7). Embed the query with the SAME model first.
const chunks = db.chunks.find({ tenantId: T, sourceRef: { $in: ids }, embeddingModel: "<model-used-for-query>", dims: 3072 },
  { projection: { sourceRef: 1, turnRefs: 1, vector: 1, "indexArtifact.generation": 1 } }).toArray();
// rank by cosine in VC code; keep chunks whose indexArtifact.generation equals the session's; cite turnRefs turns, not the chunk.
```
3072 is gemini-embedding-001, 768 nomic-embed-text (`schema/chunks.schema.json:49`); read stored `dims` and `embeddingModel`.
