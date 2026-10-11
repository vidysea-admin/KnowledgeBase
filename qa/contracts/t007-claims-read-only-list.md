# Contract — t007-claims-read-only-list (`GET /claims`, Claims page)

> Ground truth for `apps/api/src/claims/{router,store}.ts`, their mount in `server.ts` and wiring in
> `composition/production.ts`, and the web page `apps/web/src/pages/claims/ClaimsPage.tsx` +
> `apps/web/src/api/claims.ts`. Written by the checker. Tenancy class: full ceremony, never round-capped
> (a reachable cross-tenant read of any field is FAIL-level; see ISS-078). Later units that touch these files are held to it.

## Criteria (each machine-checkable)

1. **[T1] Tenant only from the verified key.** The router passes `req.auth.tenantId` and nothing else to the store. A `tenantId`
   query param answers 400; `x-tenant-id` / `X-LKB-Tenant` headers and any body are ignored. A missing/blank tenant on `req.auth` is refused
   (never "all tenants").
2. **[T2] Every query is tenant-scoped.** The claims page query, the session-title lookup and any count/total query go through
   `claims(tenantId)` / `sessions(tenantId)` (`scopedCollection`) only; no raw collection, no tenant-less filter. A key for tenant A obtains no
   claim, title, turn id, total, or paging signal (`truncated`) derived from tenant B's rows. A session id that exists only in another tenant
   yields `sessionTitle: null`.
3. **[A1] Auth then scope.** Mounted after `requireAuth` in `server.ts`; no key / bad key -> 401, key without `citations` scope -> 403; the
   store is not called in either case. Any new scope split must update this contract in the same unit.
4. **[B1] Bounded input.** Unknown or repeated query keys, status outside `verified|needs-review|conflicting`, limit not an integer in 1..100,
   offset not an integer in 0..10000, operator shapes (`status[$ne]=x`) -> 400 before the store. Default limit 50. The response never carries more
   than `limit` claims (otherwise 503).
5. **[R1] Read-only.** The router registers only `GET`; the store uses `find` only (no insert/update/delete/replace/bulk); the page renders no
   control other than status filter, Previous and Next.
6. **[F1] Fail closed.** `ServerDeps.claims` absent, store throwing, or a malformed store result -> 503 with the fixed body
   `{error:"claims_unavailable"}`; `Cache-Control: private, no-store` on every answer from the handler.
7. **[P1] Projection.** The store returns only `_id, text, status, confidence?, topicRefs?, evidence[{turnId, sessionId, sessionTitle}]`;
   extra claim properties (the schema allows additional ones) are never passed through. Currently NOT asserted by a test (checker mutation M15
   survived): the next unit touching the store must add an exact-field-set assertion.
8. **[W1] Web (source scope, D-024).** Claim text/titles render as React text (no `dangerouslySetInnerHTML`); the session link is built from
   `encodeURIComponent(sessionId)` under `/sessions/`; loading, empty, 401/403 and malformed-response states exist; the client refuses
   limit outside 1..100 or offset outside 0..10000 before any request.
