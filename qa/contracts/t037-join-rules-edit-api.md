# Contract — t037-join-rules-edit-api (T-037, unit 3: edit API slice)

> Ground truth for `apps/api/src/join-rules/{deps,router}.ts` and its mount in `apps/api/src/server.ts`. Written by the checker; the maker never edits it.
> Not in scope (T-037 stays open): web UI, production wiring (`buildProductionDeps`), scheduler switch-over, revoke endpoints, audit trail.

## Security property
Only a caller holding a valid key with the required scope can read or change the rules, approvals and opt-outs, and only those of the tenant bound to that key (`req.auth.tenantId`). A write can never drop stored approvals/opt-outs, never overwrite a corrupt or foreign stored file, and never persist a rule set the engine's validator refuses.

## Criteria
1. Each of GET/PUT `/calendar/join-rules`, POST `.../approvals`, POST `.../opt-outs` answers 401 without a key or with an invalid key, 403 without the required scope; no method/path variant (HEAD, PATCH, DELETE, trailing slash, case, `//`, `..`, encoded) reaches a handler unauthenticated. The router is mounted after `requireAuth` and the rate limiter. With no store wired, every method on the prefix answers 503 (after auth).
2. The tenant comes only from `req.auth.tenantId`. Path, query, headers, and body fields (top level and nested; `tenantId`, `tenant`, `state`, `__proto__`, `constructor`) never select or change another tenant's data; unknown body fields are 400.
3. PUT loads first, preserves stored state exactly, and aborts without writing when the stored file is corrupt, wrong-tenant or non-regular (bytes unchanged, no temp file). PUT cannot carry state. A refused validation writes nothing.
4. Validation is the injected engine validator; approvals/opt-outs bind only to engine-normalised values; invalid values are 4xx and write nothing.
5. Writes for one tenant are serialised; N parallel approvals/opt-outs/PUTs all survive; a failed write does not block later writes; other tenants are not blocked.
6. Error bodies from this router carry no path, stack, store text or other tenant's id; oversize body 413; malformed JSON 4xx; no store wired 503.
7. Scope: server.ts change minimal; no engine, store, sender-trust, dependency-rule or budget file edited; no `packages/meeting-bot` import in apps/api code.
8. Tests assert 1-6 such that these mutations FAIL the suite: tenant taken from a header, from a body field; a route without `requireScope`; PUT without load-first; no mutex; no validation on PUT; a queue poisoned by one failure.
9. Manifest route table, evidence and "not delivered" match reruns.
10. (Approved scope design, cycle 1) PUT and both POST routes require the dedicated write scope `join-rules`; GET requires `calendar`; a `join-rules`-only key is 403 on GET; a `calendar`-only key is 403 on every write with no store call. No key holds `join-rules` unless it is issued deliberately.
