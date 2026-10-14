# Checker verdict — wa-review-wire

VERDICT: PASS (scoped: unmounted write-side wiring only; NOT T-007 done, NOT mountable)
Cycle checked: 0
Commit checked: 6d60cae2 (lane/wa-review-wire). Full ceremony (tenancy, data writes).

## Claims verified (independent probes, throwaway copies, tracked files never modified)
1. Ingest is candidate-only: base built without indexer; probe with insert throwing, then two retries: claims/chunks/session_pages/tree_index/entities stay 0, candidates converge to 3 (no duplicates).
2. Transaction is real in code: a materialiser that writes the claim then crashes leaves claim 0 and candidate needs-review. The in-memory fixture rolls back by snapshot and ignores the session argument, so I added a session-propagation spy: claims.updateOne and whatsapp_candidates.updateOne carry `session` (mutants m19, m7, m20 killed). Real Mongo remains unproven (test skipped, no Mongo on machine).
3. Duplicate approvals: 3 concurrent approves -> 1 claim, all ok; approve then reject -> conflict, claim kept.
4. Tenancy, service level: tenant-b decide on tenant-a id -> not_found, no claim; same content in both tenants gets distinct candidate and claim ids; tenant-b invalidate on tenant-a source changes nothing. HTTP level (real express + requireAuth + wiring.reviewRouter): tenant-b key 404, wrong scope 403, bad key 401, body tenantId 400, tenant-b GET 404; tenant-a approve twice -> 200/200, 1 claim.
5. Invalidation: pending stale deleted, decided stale keeps row and loses claim (confirmed).

## Mutation results (28 mutants, throwaway copy dir, deleted afterwards)
Criterion-8 six: 6/6 KILLED (re-run by me). Others KILLED: drops session, drops tenantId from materialiser filter, no revoke, pending not deleted, ingest skips invalidation, decide skips materialise, materialise without session, no transaction, unscoped load, unscoped status update, quarantine claims/chunks ignored, quarantine unscoped.
SURVIVED (ISS-WA-REVIEW-WIRE-003): claim status verified->needs-review; personal-excluded guard in materialiser; non-approved guard in materialiser; invalidate row.tenantId guard; invalidate find unscoped; revoke deleteOne unscoped. The tenant ones are redundant belt-and-braces (each individually masked by another guard; ids embed tenant), not an exploitable hole, but unasserted.

## Defects found (shard qa/issues.wa-review-wire.jsonl)
- ISS-WA-REVIEW-WIRE-001 HIGH: an upstream-deleted message stays in turns (base ingest only upserts), so its approved claim stays trusted and pending candidates stay reviewable. Probe: claims 2 -> 2 after delete. Overclaimed in ingest.ts comment. Must be fixed before mount.
- -002 medium: invalidation not atomic with raw turn upsert; stale claim lingers if invalidation fails; audit does not check quote vs turn text.
- -003 medium: mutation survivors above.
- -004 low: edit-revert leaves approved row without claim (maker gap 5 confirmed).
- -005 HIGH POLICY (Umesh): approved chat statement -> claims.status "verified". Elsewhere verified means hand-verified and feeds analytics verified ratio; indexSession writes needs-review. Inflation risk for chat-sourced claims. The schema has no other reviewed value. Decision needed on keep verified vs a distinct approved marker; no mount until decided.
- -006 HIGH tenancy: read-side quarantine gap, exact readers: apps/api/src/ask/ask-arms.ts, ask/source-context.ts, search-store.ts, semantic-search/semantic-search-store.ts, grounded-content/reader.ts, store.ts, claims/router (via store), transcript-review/planner.ts, packages/index/src/graph/build-graph.ts (+ routes/graph), packages/ask. Pre-existing on main (old production wiring indexes WhatsApp as needs-review); NOT a regression of this lane, which is unmounted and writes strictly less. Raw turns remain readable either way. Follow-up unit scoped in the issue row.
- -007 low: latent indexSession deleteMany would remove approved wa-claims if ever run on a WhatsApp session.

## Commands and numbers
- WhatsApp tests: `node --test --import tsx src/whatsapp/review/*.test.ts src/whatsapp/*.test.ts`: tests 45, pass 44, fail 0, skipped 1.
- Probes (6): pass 6, fail 0 (file deleted before commit).
- Full apps/api (D2_FIXTURE_PYTHON set): tests 942, pass 940, fail 1, skipped 1. The one failure is src/usage/usage.test.ts "a hanging write does not delay the response" (timing under concurrent load; 9/10 clean passes and 1/10 fail in isolation). Unrelated to WhatsApp.
- tsc with temporary paths tsconfig (deleted): exit 0, no diagnostics.
- lint-loc --all: 2 failed stages, identical to the maker's note and the lane base: packages/meeting-bot/py/test_sb_join_ownership.py:408 (budget 400) and docs/SNAPSHOT.md stale. No new-file violations.
- Real-Mongo test remains skipped; criteria 9, 13, 14 not met; T-007 stays in_progress.

ISSUES-WRITTEN: ISS-WA-REVIEW-WIRE-001..007
Maker may close out this cycle as scoped PASS. Do not mount until -001, -005 (Umesh) and -006 are resolved.
