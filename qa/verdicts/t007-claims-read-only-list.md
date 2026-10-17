# t007-claims-read-only-list — independent checker

VERDICT: PASS
Cycle checked: 0
Commit checked: 6e12023 (lane/claims, base 3ee94a2)
Scope: source scope for the web page; no live database, no live browser (D-024). Store exercised over the real `scopedCollection` + in-memory `Db`.
ISSUES-WRITTEN: none

## EXPLANATION
Re-derived from the diff, not from the manifest.

**Tenancy.** The store issues exactly two queries: `claims(tenantId).find(filter)` (filter = optional status; sort/skip/limit+1) and
`sessions(tenantId).find({_id:{$in:ids}})` for titles. There is no count query; the paging signal is `limit+1` rows of the same tenant-scoped
query. Both go through `scopedCollection`, whose `withTenant` merges `tenantId` last (a client filter cannot override it) and
`assertValidTenantId` rejects blank/object tenants. `requireAuth` already 401s a key with no valid tenant (ISS-AUTHSCOPE-001) and the router
re-checks. Tenant comes only from `req.auth.tenantId`; `?tenantId=` -> 400, `x-tenant-id` ignored (M12 killed). A claim whose session lives
only in B gets `sessionTitle: null`; the title lookup is tenant-scoped (M2, M3 killed). No cross-tenant read found.

**Auth/scope.** requireAuth (server.ts:80) precedes the mount (line 89), same as its neighbours; 401/403 tested with the store uncalled.
Reusing `citations` is acceptable: `GET /citations/:claimId` already returns the WHOLE claim document plus turn text and session for the same
tenant to the same scope, so the list exposes a strict subset (no turn text, no extra properties) and widens nothing. The claim schema has no
reviewer-note or internal field. No new scope needed before merge.

**Input.** Key allow-list, single-valued, strict-regex integers, limit<=100, offset<=10000, status vocabulary; `status[$ne]=x`, arrays, empty
values, `limit=0/-1/1e2/abc` all 400 before the store. No 500 path (store errors -> fixed 503).

**Read-only.** Router has only `router.get`; store only `find`; page has only the select and Previous/Next. No insert/update/delete/replace/bulk
in apps/api/src/claims/.

**Wiring.** production.ts wires `createMongoClaimsListDeps()` (real accessors); absent deps -> 503 (tested through createServer). `/claims` does
not collide with another route.

**Web.** Text rendered as React text (no `dangerouslySetInnerHTML`, grep clean); link is `/sessions/${encodeURIComponent(id)}` from an id;
loading/empty/error/403/malformed states tested; client validates bounds.

**Mutations (mine, 18; per-mutation byte backup, restore in finally, hash-object == HEAD blob after each): 17 killed, 1 survived.** Killed:
claims read as tenant B; titles read as tenant B; withTenant drops tenantId in tenantScope.ts; limit+1->limit; truncated forced false; scope
check removed; requireAuth removed; tenantId query accepted; limit cap, offset cap, duplicate-param check, status vocabulary check removed;
status filter ignored; offset ignored; tenant from header; router unmounted; unavailable default serving 200. SURVIVED: M15, store spreading
the whole claim (`...c`) instead of the explicit projection, because no test asserts the exact response field set. Not a live leak today
(explicit projection in place; claims carry no sensitive extra fields), low severity, so a note only; contract criterion P1 records it.

**Gates (run here).** claims.test.ts 8/8; server.test.ts 8/8; ClaimsPage.test.tsx 7/7; App.routes.test.tsx 3/3; `tsc --noEmit` apps/api exit 0,
apps/web exit 0; lint-dirsize OK (125 dirs; new api files are in apps/api/src/claims/, apps/api/src stays at 41 entries, web/src/api 20,
web/src/pages 34); lint-dupes OK; lint-loc fails only on `packages/meeting-bot/py/sb_join.py:1142` (pre-existing, untouched; no new file flagged).
Dependency stage: the reported failure is `apps/api/src/join-rules/calendar-link-differential.test.ts -> packages/meeting-bot/src/send-now.ts`,
a file last changed by 5fe97b9 and absent from this unit's diff, so PRE-EXISTING at 3ee94a2, not introduced here; dependency-cruiser on the new
files alone: no violations. `git merge-tree` against codex/machine-migration-2026-10-09: clean, no conflicts.

**Notes (low, not backlog).** (a) Next from offset 10000 asks for 10025, the client refuses it and the page shows a generic error; unreachable in
practice. (b) Offset paging can shift if claims are added between loads (disclosed in the manifest).

## Merge conditions
1. None technical. The manifest flip to checked-PASS is the maker's close-out.
2. ISS-250 (separate condition): T-007's pending Approver decision is the multi-file "WhatsApp candidate lifecycle" plan (extend the claims
   schema/generated type into approved/rejected candidates, change indexSession and ids). No durable gate file exists (qa/gates has no t007
   file). This slice is NEUTRAL to it: no schema or indexSession change, it reads the CURRENT `status` enum (verified|needs-review|conflicting),
   adds no scope and no write action. Coupling only: if the decision changes the status vocabulary, the three hard-coded copies (router.ts
   CLAIM_STATUSES, web api/claims.ts, ClaimsPage) need a follow-up edit. That is rework, not a contradiction; no "do not merge before the
   Approver rules on ISS-250" hold.
