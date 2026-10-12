# iss-webinarrelease-002-not-ready-after-degraded-extraction

**Handshake status:** checked-PASS
Fix cycle: 0
Lane: webrel002 (base 9e24d1f). Tier: 2 (open high issue).

## Finding: no code change needed; the defect is already fixed in HEAD
ISS-WEBINARRELEASE-002 (qa/issues.WEBINARRELEASE.jsonl) is still `open`, but every call site it cites is already
repaired by the "Grounded webinar knowledge/readiness repair" in qa/manifests/webinar-release-repair-plan.md.
No source edit was made; nothing in D-119 held files was touched.

Where readiness is computed and how degradation maps to an EXISTING status value (`status.index = failed`, schema enum
pending|processing|done|failed; no schema change):
- apps/api/src/indexing/session.ts `indexSession` (strictWebinar): summary/claims degraded, no embedder, embedding failure, chunk skip,
  or missing tree => sets `status.index=failed`, throws `strict webinar index incomplete: <reason>`, replaces no prior pages/claims/chunks/tree.
  Legacy (non-strict) default keeps optional no-embedder semantics and now returns `summary.degraded`, `claims.degraded`, `completion`.
- scripts/webinar/sync-session.mjs --index: strict; throws and emits no `index-proof.json` unless summary/claims/chunks/tree all complete.
- packages/meeting-bot/src/capture/record-finalize.ts `validateIndexProof`: record's `done` marker requires a fresh v2 strict proof, not a zero exit.
- scripts/webinar/run-pipeline.mjs `complete()`: ready only when marker + proof match tenant/session/generation/inputHash.
- Surfaced: web already renders `status.index` (SessionsListPage badge, SessionDetailPage, PastSection, KnowledgeExplorerPage), so `failed` is shown.

## Reproductions replayed (from the row + repair-plan ledger floor), by id
ISS-WEBINARRELEASE-002 (row evidence enumerates six call-site reproductions; the row records no literal case corpus):
- summary rejected / summary invalid completion: refused (session.test.ts "ISS-WEBINARRELEASE-002 strict ...", failures summary-rejected, summary-invalid)
- claims rejected / claims invalid: refused (claims-rejected, claims-invalid)
- embedding rejected / no embedder: refused (embedding-rejected, embedding-missing); plus uncited-legacy-output refused. 7/7 refuse, prior outputs untouched, never `status.index=done`
- sync skip logged with zero exit: gate present at sync-session.mjs:217; NOT covered by a direct test (see issues.webrel002.jsonl)
- weak done marker: record-commands.test.ts "ledger002 index proof refuses weak, stale, foreign and degraded generations" passes
- runner zero-exit-to-ready: run-pipeline.test.mjs "zero exit without index proof stays failed" and "ledger002 weak or stale strict markers never certify zero-exit child as ready" (6/6 attacks -> failed) pass
Open / not reproduced: none of the row's cases left open, except the untested sync-session gate above.

## Tests (node --test --import tsx; lane copy)
- apps/api/src/indexing/session.test.ts: 28 pass / 0 fail
- scripts/webinar/run-pipeline.test.mjs: 22 pass / 0 fail
- packages/meeting-bot/src/capture/record-commands.test.ts: 22 pass, 1 skipped, 0 fail
- scripts/webinar/process-video.test.mjs: 12 pass, 1 fail ("real ffmpeg synthetic video"): environment (ffmpeg), unrelated to this issue, fails identically without edits
Typecheck not run (no source change).

## Recommendation
Checker: confirm the six repro mappings above, then the owner/Approver may mark ISS-WEBINARRELEASE-002 verified (this lane does not edit the canonical ledger row).
