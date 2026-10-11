# Manifest — t007-claims-read-only-list
**Task:** T-007 (WhatsApp -> claims ingestion review), READ-ONLY slice only. Backlog tier 3 (next unblocked roadmap task; T-007 dep T-020 is done; Q4 consent is closed by D-002 -> D-008).
**Lane:** lane/claims (ledger shard qa/issues.claims.jsonl; no issue filed this cycle).
**Status:** checked-PASS (Checked: qa/verdicts/t007-claims-read-only-list.md, cycle 0, 2a7fa08; source scope; neutral to ISS-250)
**Fix cycle:** 0

## Scope
What existed: claims are written by `indexSession` (packages/index) and read only per session (`GET /sessions/:id` in routes/brain.ts) or singly (`GET /citations/:claimId`). There was NO tenant-wide claims list route and no claims page. `POST /whatsapp/ingest` and the WhatsApp page already cover ingestion; the review/approve queue is disclosed there as a separate follow-up.

Built (read-only, no schema change, no new scope, no write/edit/approve/delete anywhere):
- NEW route `GET /claims?status=&limit=&offset=` in `apps/api/src/claims/router.ts` (subfolder: apps/api/src and apps/api/src/routes are at the 30-file limit). Same pattern as `GET /jobs`: `requireAuth` (mounted after it in `server.ts`) -> `requireScope("citations")` (existing scope; claims are what citations resolve) -> tenant taken ONLY from `req.auth.tenantId`. Strict query parser (unknown/duplicate params and malformed values answer 400 before the store), limit 1..100 (default 50), offset 0..10000, status in verified|needs-review|conflicting. `Cache-Control: private, no-store`. Store failure or unwired deps -> fixed 503 body (fail closed).
- NEW store `apps/api/src/claims/store.ts`: reads through `claims(tenantId)` / `sessions(tenantId)` (the `scopedCollection` accessors only), sorted by `_id`, `limit+1` rows read to report `truncated`; session titles resolved in one tenant-scoped `$in` query; a vanished session gives `sessionTitle: null` (never omitted).
- Wiring: `ServerDeps.claims?` optional (absent -> 503), mounted in `server.ts`; real deps in `composition/production.ts`.
- NEW web `apps/web/src/api/claims.ts` (one GET, response shape validated), `apps/web/src/pages/claims/ClaimsPage.tsx` (list with status, confidence, topics and a source citation per evidence item: session title linking to `/sessions/:id`, plus turn id; status filter, Previous/Next paging), route `/claims` in `App.tsx`, nav entry in `NavSidebar.tsx`.
- Web unit passes at SOURCE SCOPE only (D-024). No live-browser check was done and none is claimed.

## Tenant isolation proof (claims.test.ts)
Store under test is the real `createMongoClaimsListDeps` over the real `scopedCollection` against an in-memory `Db` holding tenant A and B rows (including a session id `s1` that exists in both tenants). Key A gets exactly A's claim ids [c1,c2,c3,c5]; key B gets exactly [c4] and sees "Secret B" while A's body never contains it; A's `?tenantId=B` -> 400; A's `x-tenant-id: B` header is ignored (c4 absent); a claim in A citing a session absent from A but present in B shows `sessionTitle: null`, not B's title. Wrong scope -> 403, no key / bad key -> 401, store not called.

## Evidence
- `cd apps/api && node --test --import tsx src/claims/claims.test.ts` -> `ℹ tests 8 / pass 8 / fail 0`
- `cd apps/api && node --test --import tsx src/server.test.ts` -> `ℹ pass 8 / fail 0` (existing server wiring unaffected)
- `cd apps/web && node node_modules/vitest/vitest.mjs run src/pages/claims` -> `Tests 7 passed (7)`
- `cd apps/web && ... run src/App.routes.test.tsx` -> `Tests 3 passed (3)`
- `tsc --noEmit -p tsconfig.json` in apps/api: no output (exit 0); in apps/web: no output (exit 0)
- `node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (125 dir(s) within budget)`
- `node scripts/lint-dupes.mjs` -> `lint-dupes: OK (1070 unique export(s), 27 unique schema $id(s))`
- `node scripts/lint-loc.mjs` -> FAIL 1, `packages/meeting-bot/py/sb_join.py:1142 (budget 300)`; pre-existing, untouched; no file of this slice flagged. `lint-root.mjs` (18 loose root files), the tracker stage and the dependency stage (`apps/api/src/join-rules/calendar-link-differential.test.ts -> packages/meeting-bot/src/send-now.ts`) also fail on files this slice does not touch.
- Mutations (per-mutation byte backup, restore in finally, harness untracked and deleted): 18 applied, 18 killed, 0 survived. One initially survived (web: dropping `setOffset(0)` on filter change); test "changing the status filter while on page 2 returns to offset 0" was added and re-killed it. Covered: scope check removed; tenant from `x-tenant-id` header; limit cap 100->1000; truncated forced false; Cache-Control removed; unknown-param rejection removed; response-bound check removed; skip(offset)->skip(0); limit+1->limit; sessions read as tenant "B"; status filter dropped; claims read as tenant "B"; router unmounted from server.ts; Next never disabled; session link path changed; title fallback removed; web response validation removed; offset reset removed.
- D-015: no issue is being fixed; not applicable.

## NOT covered
- No live-browser check of the page; no real MongoDB run (store tested over an in-memory Db through the real `scopedCollection`, so real index/sort/skip performance is unmeasured).
- No dedicated `claims` scope was created: the route reuses `citations`. Whether claims deserve their own scope (a SettingsPage scope-list change) is an owner call.
- `skip`/`offset` paging is O(offset) and capped at 10000; no cursor. A claim added between page loads can shift rows.
- Not WhatsApp-specific: it lists all claims of the tenant. No source-type filter exists because a claim carries no source field (would need session -> source joins).
- The review layer (topic/decision/sensitive detection, duplicate flagging, approve-before-publish queue) is NOT built; claims "status" is displayed only.
- Line endings: git warns LF->CRLF on new files (autocrlf), as on prior manifests.
