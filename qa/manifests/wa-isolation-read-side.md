# Manifest — wa-isolation-read-side
**Contract:** none specific; plan unit W7 in `docs/features/whatsapp-multiuser/plan.md` (approved `qa/gates/plan-approved-whatsapp-multiuser.md`), requirements R-25..R-30. Authorization: plan approval; consent is out of scope (D-210).
**Goal task:** whatsapp-multiuser W7 `wa-isolation-read-side`
**Date:** 2026-10-30
**Policy-Version:** proportional-verification/2026-10-19.17
**Status:** ready-for-check
**Handshake status:** ready-for-check
**Fix cycle:** 0
**Dual check:** required
dual-trigger: tenancy apps/api/src/whatsapp/owner-config.ts:184
**Persona walk:** skip (no screen; API and review-router authority only)
**Issues addressed:** ISS-API-003, ISS-WAOWNER-002, ISS-WAOWNER-005
**Executor:** claude-sonnet-5-5 (build subagent, worktree `.worktrees/wa-isolation-read-side`, branch `wave/wa-isolation-read-side`, base aa8ef31a)
**Round:** one round, est 150 min, tier H by the tenancy and raw-content-read trigger.

## Criteria
1. Two owners in one tenant: A's session gets A's sessions and review candidates and 404 for B's raw session id; an admin sees both; an admin read of B's raw content writes an audit event.
2. A viewer and a non-owner member get 404/403 on raw WhatsApp sessions, turns and candidates, and still get approved claims through Search/Ask (Q2=2a); never raw turns of an unapproved candidate; never any content from tenant B.
3. ISS-API-003: the ledger's recorded reproductions re-run verbatim; report `ISS-API-003: n/n` refused to echo raw upstream text; the 502 body is `{error, code, linkId}` only.
4. Cross-owner duplicate: the same message captured by A and B yields one candidate flagged `duplicate` with a pointer, neither auto-merged nor dropped.
5. Legacy links are admin-only to read.
6. Adversarial: guessing a candidate id from another owner, replaying an approve with a swapped tenant header or body, sending `groupJid` of another owner, using a Bearer key without `whatsapp-admin` against a non-legacy link; all fail without side effects.

## What changed (base aa8ef31a, build head 5c59dc45, test pin 0af31c8f)
- `apps/api/src/whatsapp/owner-config.ts`: `WhatsAppGroupNotFoundError`; `actorBase`/`auditWho`/`callerOf`; `createWhatsAppRawAccess(db)` (line 184), the single raw-read authority (`forSource`, `forCandidate`, `forSession`, `auditAdminRead`). Fail closed: any doubt, a link/owner disagreement, a cross-tenant link or a throwing database is a deny. Owner view only for a session whose `userId` equals a non-empty `link.userId`; otherwise `whatsapp-admin` or deny; legacy links (userId null), plain keys and unresolvable links are admin-only. A non-owner admin read writes `admin.raw_read` (ids and counts only) before any content is returned; a failed audit write returns nothing.
- `apps/api/src/routes/whatsapp.ts`: caller from `whatsAppCallerFromAuth(req.auth)`, validated optional `linkId` (24-hex else 400), `ownerUserId` shown to admins only, 409 `ambiguous_link`, 404 `not_found` for an absent or non-permitted group, 503 for unavailable, and a closed 502 body `{error:"whatsapp_ingest_failed", code, linkId}` with `code` in `archive_unreachable|snapshot_shrink_refused|store_transaction_unavailable|unknown` (closes ISS-API-003).
- `apps/api/src/whatsapp/store.ts`: driver errors map to Unavailable/NotConfigured on list and fetch; `linkId` on group rows; `scope.linkId` only narrows; guarded stamp of `sourceMeta.whatsappLinkId` (once, `$exists:false`), none for legacy ingest.
- `apps/api/src/whatsapp/review/router.ts`, `apps/api/src/whatsapp-review/review-source.ts`: authority check before any evidence is read (404 indistinguishable for absent and unauthorized), per-source list filtering with one audit event per foreign link, decision actor `actorId@link:<linkId>`, no side effects for a non-owner approve/reject.
- `apps/api/src/whatsapp/review/ingest.ts`: scope passed through to `ingestGroup`; marker stores `linkId`; `knownContent` now includes the tenant's other-session candidates so the later capture is flagged `duplicate` with a pointer (nothing merged or dropped). `review/invalidate.ts`: `SnapshotShrinkError.name` set so the route classifier recognises it. `review/compose.ts`: header comment fixed, `access` option, `repairPendingInvalidations` re-ingests with an internal admin caller narrowed by the stored link id, skipping ambiguous markers.
- `apps/api/src/routes/brain.ts`, `apps/api/src/composition/integrations/trusted-readers.ts`, `apps/api/src/composition/integrations/knowledge.ts`: `GET /sessions` and `GET /sessions/:id` take a read context; WhatsApp sessions only for owner or admin (detail audited for non-owner admin; 503 if the audit write fails); other sessions and calls without a read context unchanged.
- Test support: `whatsapp/review/test-fixtures.ts` (`insertOne`, `seed`), `whatsapp/review/wire-fixtures.ts` (`$exists`, `insertOne`). Updated tests: `review/router.test.ts`, `whatsapp-review/review-source.test.ts`, `routes/whatsapp.test.ts`, `whatsapp/route-tenant.test.ts`, `native-evidence/message-vertical.test.ts`. New: `whatsapp/isolation-read-side.test.ts` (15), `whatsapp/isolation-write-side.test.ts` (11).

## Evidence
Pre-check[1]: 0af31c8f node --test --import tsx apps/api/src/whatsapp/isolation-read-side.test.ts -> 15 passed, 0 failed
Pre-check[2]: 0af31c8f node --test --import tsx apps/api/src/whatsapp/isolation-read-side.test.ts -> 15 passed, 0 failed
Pre-check[3]: 0af31c8f node --test --import tsx apps/api/src/whatsapp/isolation-write-side.test.ts -> 11 passed, 0 failed
Pre-check[4]: 0af31c8f node --test --import tsx apps/api/src/whatsapp/isolation-write-side.test.ts -> 11 passed, 0 failed
Pre-check[5]: 0af31c8f node --test --import tsx apps/api/src/whatsapp/isolation-read-side.test.ts -> 15 passed, 0 failed
Pre-check[6]: 0af31c8f node --test --import tsx apps/api/src/whatsapp/isolation-read-side.test.ts apps/api/src/whatsapp/isolation-write-side.test.ts -> 26 passed (15/11), 0 failed
Regression: 0af31c8f node --test --import tsx apps/api/src/whatsapp/review/router.test.ts apps/api/src/whatsapp-review/review-source.test.ts apps/api/src/routes/whatsapp.test.ts apps/api/src/whatsapp/route-tenant.test.ts apps/api/src/native-evidence/message-vertical.test.ts -> 33 passed, 0 failed; the wider affected set at 5c59dc45 was 384 tests, 380 pass, 0 fail, 4 skipped (real replica-set Mongo, no mongod available)
Static: 0af31c8f pnpm -s lint:structure -> OK (10 stages, 0 failed); tsc --noEmit in apps/api exit 0
Tests[1]: apps/api/src/whatsapp/isolation-read-side.test.ts — W7-1 tests: own-link list, candidate get/approve 404 parity, actor `actorId@link`, `admin.raw_read` event (ids and counts only, none for the owner), fail-closed audit
Tests[2]: apps/api/src/whatsapp/isolation-read-side.test.ts — W7-2 tests: viewer/member/plain key on candidates, source route authority before reader, sessions detail and list, consent-withdrawn raw read refused to everyone
Tests[3]: apps/api/src/whatsapp/isolation-write-side.test.ts — ISS-API-003 recorded reproductions 1 and 2, authored corpus, closed 502 body, ISS-WAOWNER-002 route mapping (409, 404, linkId validation); the updated apps/api/src/routes/whatsapp.test.ts asserts the closed body
Tests[4]: apps/api/src/whatsapp/isolation-write-side.test.ts — cross-owner duplicate flag with pointer, tenant-bounded duplicates, stamp, repair path
Tests[5]: apps/api/src/whatsapp/isolation-read-side.test.ts — legacy link admin-only (W7-2/5 test) and ISS-WAOWNER-005 pins (caller derivation and authority-level empty userId)
Tests[6]: apps/api/src/whatsapp/isolation-read-side.test.ts apps/api/src/whatsapp/isolation-write-side.test.ts — W7-6 adversarial tenant swap, forged body and query, unresolvable-id 404, plain key against non-legacy link, store narrowing for foreign groupJid
D-015 measurement: ISS-API-003: 2/2 recorded reproductions refused to echo (repro 1: plain upstream Error "whatsapp_msg Mongo unreachable" from ingestGroup; repro 2: driver error with host:port from the fetch path; both from qa/issues.api.jsonl row ISS-API-003). Separately the authored corpus of 9 shapes: 9/9 refused; every 502 body is exactly {error, code, linkId}.
Falsification[1]: in `review/router.ts` disable the audit (`if (false && audit && !decision.ownerView)`) -> 2 tests red (the admin.raw_read event test and the list audit); restored -> green
Falsification[2]: in `trusted-readers.ts` delete `if (!kind.decision.allowed) return null;` -> 2 tests red (sessions detail and list for viewer/member/plain key); restored -> green
Falsification[3]: in `routes/whatsapp.ts` add the upstream `message` to the 502 body -> 3 tests red across write-side and routes/whatsapp.test.ts; restored -> green
Falsification[4]: in `review/ingest.ts` drop the other-session candidates from `knownContent` -> 1 test red (the cross-owner duplicate test); restored -> green. Also removing the stamp line in `store.ts` -> 2 tests red (stamp, narrowing); restored -> green
Falsification[5]: in `owner-config.ts` let a legacy link through (`|| link?.userId === null`) -> 4 tests red; restored -> green. A first mutant (`|| true` ahead of the typeof guard) survived because it was equivalent; the real mutation of the empty-userId guard (`link.userId.length > 0`) also survived, so a test was added at the authority level (0af31c8f) and that mutant is now red (1 test)
Falsification[6]: in `review/router.ts` approve ignore the authority result (`if (!base)` for `if (!allowed || !base)`) -> 3 tests red; restored -> green
Mutation safety (D-020): every mutation used `scripts/lib/mutate.mjs apply`/`restore` per mutation, `timeout 240` on the test run, no EXIT trap; after each restore `git hash-object <file>` equalled `git rev-parse HEAD:<file>` (all restored=yes) and `mutate.mjs assert-clean` reported none outstanding.
Round est 150 min

## Open points (declared, not defects)
1. **Plain keys and legacy links are admin-only for raw and review reads.** This is plan W7 acceptance 5 and fails closed, but it conflicts with R-24's "continuity for scripts": a non-admin script key that reviewed legacy-link candidates before now gets 404. Needs the product owner's call on whether those scripts get a `whatsapp-admin` key.
2. **The pending-invalidation marker is keyed by `groupJid` alone**, so two owners with the same group in one tenant can collide on one marker. Pre-existing; reported, not fixed (outside the W7 file list).
3. **The marker's `linkId` is only the caller-supplied scope's linkId** and is null when none was supplied; repair then runs unnarrowed as the internal admin caller, and an ambiguous jid stays pending rather than guessing.
4. **`GET /sessions` list is metadata only and is not audited.** Detail reads by a non-owner admin are audited (count = turns returned).
5. **Reviewed-guidance views of WhatsApp sessions are no longer shown to other members** through `GET /sessions` (404). Approved claims still reach Search/Ask/citations through the separate trusted readers (Q2=2a); a checker should confirm that path (criterion 2, second half) against the claim readers, which this unit did not alter.
6. **The duplicate pointer is the opaque candidate id of the other owner's earlier capture.** It is not dereferenceable by a non-owner (the candidate route 404s), so it leaks no content, but it does confirm that another capture of the same text exists in the tenant. Accept or tighten to a boolean plus count.
7. **4 tests skipped: they need a real replica-set Mongo** (no mongod available here). The fake Mongo fixtures were used, so transactional behaviour of the duplicate and stamp writes is not proven against real Mongo; the checker should run them where mongod exists.
8. **Tests were written after the implementation** because of a context compaction mid-build; the falsification runs above are the evidence that they bite.
9. Consent code was not touched or extended (D-210).
