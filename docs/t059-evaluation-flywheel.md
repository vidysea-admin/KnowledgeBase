# Evaluation-loss recovery API (T-059 foundation)

The flywheel starts from a saved, scored evaluation where the AI score is strictly below the counsellor score. It preserves that loss, records the missing-knowledge gap, accepts provided/public/notes content through the existing intake adapter, re-indexes its session, and asks the original question again. The new answer is a separate **internal, unscored, needs-review** evaluation. Content arriving or an answer being generated never establishes an improvement.

T-022's actual thirty human reviews and live calibration, T-043's complete accepted live indexed-session/cited Ask proof, and T-059's own live before/after review remain required. Existing T-043 evidence includes real cited Ask attempts on legacy-unbound staging transcripts, with a partial index and temporary tree; the full prerequisite remains HOLD. This source foundation does not close those tasks.

## Operator sequence

All requests use the existing API-key authentication. Inspection requires `compete` and `gaps`; both write operations require `compete`, `gaps`, `ingest` and `ask`. The tenant comes only from the verified key. Unknown body fields, including client tenant overrides, refuse.

1. `POST /evaluations/:originalEvalRunId/gap` with `{}` creates or returns the deterministic source-pending gap for the saved loss. Ties, wins, missing/invalid scores and foreign runs refuse.
2. `POST /evaluations/:originalEvalRunId/retest` with `{ "sourceUrl": "https://…", "requestId": "operator-attempt-1" }` executes capture, index and retest. Keep the same request ID when retrying a request whose response was lost. Request IDs contain 1–80 letters, digits, hyphens or underscores. A received source cannot be rebound to another URL.
3. `GET /evaluations/:originalEvalRunId/flywheel` inspects the persisted loss snapshot, source receipt, index/output digests, current stage and safe failure stage. The retest response includes the distinct child evaluation ID and retained answer/citations.
4. Review that child through the existing evaluation workflow. This foundation supplies no fabricated score, automatic win or calibrated-loss closure.

A retry can return the same historical child after an operator records an internal score. It preserves that score and the original evaluation; it does not turn the score into calibrated approval or mark the loss resolved.

The existing `/gaps` reader/dashboard can inspect the gap. Its stored `received` status means verified same-tenant source/session/transcript content arrived. The independent flywheel stage remains `captured`, `indexed` or `retested`; a failed index/Ask is not hidden by `received`. Safe failure history survives successful retries.

## Persistence and recovery

The gap ID hashes the complete `(tenant, original evaluation ID)` tuple. Its immutable snapshot/fingerprint binds the original question, answers, evidence, counsellor context, scores and credibility. Changed original inputs refuse rather than silently rewriting this lineage. A deterministic child ID hashes `(tenant, gap ID, request ID)`. Only a hash of the supplied URL is stored in flywheel metadata; recording-share URLs are not echoed. Upserts preserve the first accepted row and compare-and-set revisions prevent concurrent callbacks from overwriting newer progress.

A ten-minute persisted attempt lease prevents two flywheel requests from advancing the same gap concurrently. Provider stages have a two-minute deadline (a host may configure a shorter deadline). A deadline records a safe failure and retains the lock until expiry, because the existing external seams cannot be falsely represented as cancelled. A later retry can acquire an expired lease after a process interruption. Capture/index receipts survive transient Ask or child-write failures, and recovery after a child write can repair its head reference without generating the answer again. Stale callbacks cannot regress head state. This lease does not cancel a running external intake/index provider or fence unrelated index writers: the service checks its ownership and rereads capture and indexed output before further progress. A hanging provider/host and live cancellation proof remain operational acceptance gates.

Capture verifies actual scoped source, session and nonempty stored transcript turns, valid timing/speaker identity, consent and provided/public/notes mode. The receipt retains source digest, ordered transcript digest and concrete turn IDs. Index success requires the real version-2 complete/tree-written receipt, matching session/turn count, nonempty attempt generation and healthy stored vectors. It rereads the captured input and actual tenant tree/session node/chunks, storing their digests. The return-only index generation is attempt lineage; it is not represented as a generation field persisted by the indexer.

The Ask adapter requires the existing request-bound hydration factory. It consumes the same tenant tree and actual `askV2` policy/router dependencies, and refuses changed output digests. Insufficient coverage and refusal remain in the saved answer. Untrusted summaries do not replace source hydration.

## Configuration and remaining gates

`createEvaluationFlywheelRouter(undefined)` returns a safe 503 after authorization. Root composition requires `LKB_EVALUATION_FLYWHEEL=1`, an actual isolated `lkb_t059_*` database, source-intake and a request-bound Ask factory. `LKB_SOURCE_INTAKE=1` separately controls the existing intake path. A usable host supplies `createEvaluationFlywheel({ store, intake, index, ask })` using `createMongoFlywheelStore(db)`, the configured source-intake dependency, a bound real indexer and `buildFlywheelAsk(askDeps)`. Source intake without configured transcription remains unavailable. Dependency presence is not proof of operational readiness. Root integration owns server/production mounting, canonical schema/generated metadata and any migration.

The new Mongo write seam deliberately accepts only isolated `lkb_t059_*` databases. It refuses `lkb`, staging, shared work databases and ambiguous names. There is no new approval to write production through this seam. Do not weaken that guard to make a live proof appear green.

Focused fixture evidence exercises actual intake planning/persistence, grounded `indexSession`, scoped stored tree/chunks, production source hydration and `askV2` with offline model/embedding responses. It proves source composition and exact session/turn/speaker/time/quote consumption. It is not a real recording, provider calibration, human evaluation or live championship result.

## Existing evidence and future live artifact map (2026-10-15)

The metadata-only reconciliation is `qa/evidence/goal-t059-maker/live-prerequisites-20261015.json`. It preserves cycle1 source/API checked-PASS, the original replay FAIL and all prior receipts. No source behavior, provider, database, browser or Git operation was performed for this reconciliation. Existing metadata is a dated record; current deployed configuration, actual stored loss availability and calibrated head-to-head scores are UNVERIFIED without a separately authorized readback/run.

T022's saved review packet contains30 items and0 approved declarations; its independent verdict records0/30 genuine owner judgments. The30-pair derived-reference provider calibration and the older heuristic MAE are proxy evidence. The packet rubric judges a query against title+summary; those retrieval relevance scores cannot be transplanted into an AI-versus-counsellor answer comparison.

T043's `qa/evidence/t043-live-2026-10-12/summary.md` records real staging Ask/citation attempts on tenant `toc`, explicitly legacy-unbound data. It records751/1905 embedded chunks across9/21 seeded sessions, a temporary19-session deterministic tree, query-embedding quota failure/tree-only fallback and incomplete coverage. `qa/contracts/goal-t043.md` explicitly leaves full index/Ask criteria unproved. The newer p2 validation in its packet is input readiness, not a successful sync/index/Ask run; its tenant differs. Existing real attempts remain real evidence, but they neither close full T043 nor bind T059's future captured source/index/child. Do not silently import that staging corpus into the separate `lkb_t059_*` namespace.

| Gate | Concrete artifacts still required |
|---|---|
| L1 prerequisites | Independent final30 authenticated human reference judgments tied to current input hashes, real judge/router/model/prompt/calibration receipts and accepted full T043 sync/index/cited-Ask proof. T021's baseline authority remains D156. |
| L2 actual loss and capture | Authorized exact test DB and verified-key tenant; actual stored original evaluation ID, original question/answers/citations/finite comparable scores and reviewer/scorer provenance; immutable input fingerprint and deterministic gap readback. Provided-first source permission/consent, actual source/session/turn-content receipt and transcript digest must match the missing knowledge. No actual eligible stored row was verified here. |
| L3 index and consumption | Actual bounded index invocation/run receipt for that captured session, complete healthy output and tenant-scoped persisted tree/chunk/source readback. Bind transcript/tree/chunk digests to the immediate actual Ask consumer. Index UUID alone, a queued job or unrelated previous staging tree is insufficient. |
| L4 comparable before/after | Unchanged original question and frozen comparison context; separate child ID with exact returned citations/refusals/coverage; genuine reviewer/scorer provenance, same rubric/scale/calibration/model/prompt/policy/input bindings and independent before/after report. Preserve both raw outcomes and report loss, tie, gain, worsening or unavailable judgment. No automatic improvement requirement; unresolved loss remains actionable. |
| L5 operational recovery | Separately authorized bounded interruption/failure at a declared durable boundary, actual pending/failure readback and restart receipt; stable original/child IDs, unchanged latest head, no duplicate capture/index/Ask side effects or foreign writes. Name any unproved external cancellation/unrelated-index-writer modes. Offline fault tests remain supplementary. |

Until those artifacts exist, L1–L5 and full T059 remain HOLD. API manual/internal scores establish neither authenticated human provenance nor calibrated semantic superiority by themselves. An answer's existence, different wording or new citation establishes no judged win. No private question, answer, review rationale, recording, credential or DB document is copied into the reconciliation artifact.
