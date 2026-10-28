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

---

# Cycle 1

VERDICT: PASS (scoped to write-side; unmounted; ISS-006 read-side quarantine remains open and blocks mounting)
Cycle checked: 1
Commit checked: 2ddc33f2

Measured by issue id (my own probes and mutants on throwaway copies):
- ISS-001: ledger repro replayed verbatim: claims 2->1, turns 2->1, pending candidate of the deleted message gone, repeat ingest idempotent. FIXED.
- ISS-002: induced invalidation failure: marker retained, audit reports "approved claim evidence no longer matches its source turn", repairPendingInvalidations repaired the group, second call no-op. FIXED.
- ISS-003: the 6 cycle-0 survivors: 6/6 now KILLED (status label, excluded guard, non-approved guard, invalidate find unscoped, revoke unscoped; the maker-removed tenant guard is gone). New mutants: source dropped, audit source off, audit quote off, marker not cleared, turn not deleted, log plaintext all KILLED. Survivors: n8 snapshot guard off, s6 affected find unscoped, n6 (equivalent).
- ISS-005 (Umesh: "mark it verified with soruce as whatsapp"): status and source come from two constants in materializer.ts only; test claims all verified plus source whatsapp; audit flags a claim whose source differs (verified by edit). Schema has no source field: filed ISS-012 (low) to add it formally.
- Deletion log: row holds sessionId, sourceId, turnId, textSha256, candidateIds only; deleted text absent from the log. But the approved candidate row keeps the verbatim text (ISS-010, low, policy), and a plain SHA-256 is dictionary-guessable.

New issues: ISS-WA-REVIEW-WIRE-008 (medium: marker _id not tenant-scoped, unique-_id collision across tenants in real Mongo), -009 (medium: empty upstream snapshot wipes all turns and claims silently), -010, -011, -012 (low). Not blocking this write-side PASS but -008 and -009 should be fixed before mount.

Numbers: WhatsApp tests 51, pass 50, fail 0, skipped 1. Full apps/api: tests 948, pass 947, fail 0, skipped 1 (D2_FIXTURE_PYTHON set). tsc (temporary absolute paths tsconfig, deleted): exit 0. lint-loc: only the same 2 pre-existing stage failures (meeting-bot py 408 lines, SNAPSHOT stale). Real Mongo still unrun.
Closed: ISS-WA-REVIEW-WIRE-001, 002, 003, 005. Still open: 004, 006, 007, 008-012.

---

# Cycle 2

VERDICT: PASS (scoped to write-side; unmounted; ISS-006 read-side quarantine remains open and blocks mounting)
Cycle checked: 2
Commit checked: 611b1703

By issue id (own probes plus 12 mutants on a throwaway copy, control exit 0):
- ISS-008: ids tenant-structured and length-prefixed; boundary pair distinct; dropping the prefix is KILLED. Pre-existing and out of lane: two tenants with the same owner+group share the bare session hash.
- ISS-009: empty snapshot refused (no writes, alert + snapshot-refused row, marker kept); 10 stored: delete 5 ok, delete 6 refused; threshold, empty clause, force, refusal logging and rethrow mutants all KILLED. forceIngestGroup appears only in compose/ingest/tests; routes/whatsapp.ts calls deps.ingestGroup and wiring.whatsapp exposes only listGroups+ingestGroup: unreachable from any route. Slow drain: 8 messages deleted 1 per run were accepted down to 1; only the last is refused. Accepted by design, filed low (ISS-013).
- ISS-010: deleted text and quote redacted on approved and rejected rows; no leak in candidates, log, claims or turns; audit clean. Redaction-removed and approved-only mutants KILLED. Survivor: redaction updateOne tenant scope (redundant, ids tenant-namespaced).
- ISS-011: missing snapshot throws with turns untouched; guard-off mutant KILLED.
- ISS-012: schema/validate.py PASS (30 schemas); gen-types --check OK (30 files).

Numbers: WhatsApp tests 57, pass 56, fail 0, skipped 1. Full apps/api: tests 954, pass 953, fail 0, skipped 1 (D2_FIXTURE_PYTHON set). tsc with temporary paths tsconfig (deleted): exit 0. lint-loc: only the same 2 pre-existing stage failures. Real Mongo still unrun.
Closed: ISS-WA-REVIEW-WIRE-008, 009, 010, 011, 012. Open: 004, 006 (blocks mount), 007, 013.
