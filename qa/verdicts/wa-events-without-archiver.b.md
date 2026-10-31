# Verdict B (blind coordinator, adversarial auth/tenancy) — wa-events-without-archiver
**VERDICT:** PASS
**Cycle checked:** 0
**Policy-Version:** proportional-verification/2026-10-19.17
**Tier / dual check:** L / required (auth trigger knowledge.ts:98). This is coordinator B. No ledger rows written.
**Subject:** uncommitted diff in apps/api on base cf244ceb (knowledge.ts, whatsapp-wiring.test.ts), manifest qa/manifests/wa-events-without-archiver.md
**check_min=** 35

## Evidence (re-run, bound tree, read-only)
- `node --test --import tsx src/composition/integrations/whatsapp-wiring.test.ts src/whatsapp/events.test.ts src/whatsapp/links/router.test.ts src/whatsapp/selection/router.test.ts` (apps/api) -> tests 39 / pass 39 / fail 0
- `npx tsc --noEmit -p .` (apps/api) -> exit 0
- Code read: events-router.ts:44-46 `requireScope("whatsapp-admin")` then tenant from `req.auth.tenantId` only (`isValidTenantId`), `after`/`limit` strictly validated, list goes through the tenant-scoped accessor (cursor of another tenant -> "unknown cursor" -> 400). routes.ts:93-94 still falls back to scope+503 when the dep is absent. requireAuth runs before mountIntegratedWorkflows (server.ts:136-139). Links and selection are still behind `multiUser` (knowledge.ts:99-100).

## Adversarial probes (throwaway, scratchpad worktree wtB = HEAD + the diff; bound tree untouched)
Probe file `.../scratchpad/wtB/apps/api/src/composition/integrations/probe-b.test.ts` composes the real `buildKnowledgeIntegrations` plus the real `createServer` perimeter via `linksRig`. The `whatsapp_events` collection is a small tenant-honouring fake (memdb ignores sort, limit and $gt); every other collection comes from memdb. The rate limiter is raised so 429 cannot mask a result. Seeded: tenant-1 has 3 events, tenant-2 has 2, and every row has an extra `secretLeak` field. Oracle: for each response, no tenant-2 id or marker in a tenant-1 body (and the reverse); never any data for anon, non-admin or other-scope callers; no `tenantId` or `secretLeak` in any body.
- 5 archiver env shapes: unset, undefined values, invalid pair, URL-only, token-only. 15 tests (3 per env), all pass. **2250 oracle checks (probe counter), 0 leaks, 0 write calls reached whatsapp_events.**
- P1 credentials: anon, bad bearer, Basic, empty bearer, garbage cookie -> 401. Keys with whatsapp-link / sessions+ask+sources+admin+users+keys / [] / case and whitespace variants / "whatsapp-admin" as a string / null scopes / a non-string element -> 403. Keys with a tenant of "", " tenant-2", `{$ne:null}` or "tenant-2\n" -> 401. Key carrying forged session fields stays tenant-1. member, viewer, pending, t2-member sessions -> 403. Suspended, no-role and "ADMIN"-role sessions -> 401. whatsapp-admin key or admin session -> 200 own tenant only (t1 gets a,c,d; t2 gets b,e; tenant-3 gets an empty feed). Tenant-selection headers (x-tenant-id, x-lkb-tenant, x-tenant, tenant-id, x-forwarded-tenant, x-original-tenant-id = tenant-2) ignored for session and key. Admin GET without origin or CSRF header -> 200 (GET is CSRF-exempt by design).
- P2 query: 17 tenant-smuggling params (tenantId, tenantId[], tenantId[$ne], __proto__[tenantId], filter[tenantId], $where, linkId, since, all, ...) -> 200, own tenant only. 13 `after` forms (other tenant's id, unknown id, uppercase, short, long, non-hex, empty, NUL, newline, `{$gt:''}`, traversal) -> all 400. Array and operator forms of after/limit, and cursor/since/afterId aliases -> no cross-tenant. Valid own cursor pages correctly, and a cursor at the end gives an empty feed. A t2 admin or key using a t1 cursor -> 400. 16 limit forms (0, -1, 501, 1e2, 0x10, 10.5, abc, NaN, Infinity, space, comma, Arabic digits...) -> 400; limit=500 -> 200. Member, viewer, anon and link-key with these params -> 403 or 401.
- P3 paths (25 variants x 8 principals): trailing slash, upper and mixed case, `/x`, `//`, `/./`, `%2F`, `%00`, `.json`, `;x=1`, `..%2F`, `%2e%2e`, `/links/events`, `/links/../events`. Non-admin, anon, link-key and pending principals never get data (401/403/404/503). Admins get 200 only for equivalent normalised forms of the same feed (own tenant only), otherwise 404 or the links 503. POST, PUT, PATCH and DELETE on `/whatsapp/events` and `/whatsapp/events/:id` for 6 principals -> 401/403/404 only, zero writes. HEAD -> 401/403. OPTIONS -> 204 CORS preflight with empty body. no-store header present on 200 and on 400.
- C3 sanity (envs without a usable archiver config): anon links 401, viewer 403, member 503, groups member 503 / viewer 403, sessions-key 403, admin-key POST links 403 -> links and selection stay fail-closed.

## Falsification (all in the scratchpad worktree, per-mutation byte backup, `timeout`, restore then HEAD-blob check)
- Green before: wiring + probe-b -> 18/18.
- M1, C2 scope dropped (`requireScope("whatsapp-admin")` removed from the events route): 1 pass / 17 fail (member, viewer and link-key reach the feed; the author's C4 and my P1, P2, P3 go red).
- M2, C2 tenant filter dropped (tenant taken from `?tenantId=`): 13 pass / 5 fail, probe oracle reports 5 leaks (P2 red).
- M0, knowledge.ts reverted to HEAD (pre-fix): P1 P2 P3 red in all 5 env shapes (route answers 503), which shows the probes exercise the change.
- Restored: `cmp` OK after M1 and M2; `git hash-object` equals `git rev-parse HEAD:` for events-router.ts (4a20f6f2...); knowledge.ts restored from backup and cmp OK; green after: 18/18, 2250 probes, 0 leaks. wtB diff was only the two intended files before removal.
- Bound tree never mutated; `git status --short apps/api` shows only the two intended modified files plus the untracked qa/ directory that existed at start.

## EXPLANATION
C1 and C2 hold under adversarial input. The feed's authorisation lives entirely in the router (`requireScope("whatsapp-admin")` -> tenant from `req.auth` -> tenant-scoped accessor), mounted after the shared requireAuth/CSRF/rate perimeter. Composing it in every environment therefore moves an admin-only read from 503 to 200, but no new principal can reach it and no tenant can read another's rows. Links and selection stay behind the archiver check (C3). The assertion change in C2/C4 replaces 503 expectations with stronger 200 + isolation expectations; I judge it legitimate (the gate answer (a) was to serve the feed).
Notes, none filed as findings:
- The fallback `else app.use('/whatsapp/events', requireScope(...), unavailable)` in routes.ts:94 is now unreachable from the production composition. Harmless; the manifest says so.
- Probe-only limitation: memdb ignores sort, limit and $gt, so my probe used a faithful tenant-honouring fake for `whatsapp_events` (the production tenant scoping is in `scopedCollection`, covered by packages/db tests, which I did not re-run).
- GET is CSRF-exempt, so an admin session with a foreign origin reads the feed (200). This is the existing perimeter design for all GETs and is not changed by this unit.
- The author's "process note" (relative-path trap) is a low process note; this check used absolute paths.

## ISSUES-WRITTEN: none
(Dual check: no ledger rows written. No PROPOSED-ISSUE lines.)
