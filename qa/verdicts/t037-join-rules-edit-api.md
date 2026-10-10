# Verdict — t037-join-rules-edit-api

VERDICT: FAIL
Cycle checked: 0
Scope: maker commit dd11749. Contract `qa/contracts/t037-join-rules-edit-api.md`. Security class (auth, tenancy, data writes), full ceremony, uncapped.
Why FAIL: the production code holds on auth, tenancy and state preservation in every probe, but two tenancy mutations of the write path survive the unit's tests (ISS-T037API-001). That is criterion 8; it is a test gap, not a live exploit.

## Commands (portable node, each under `timeout`)
- `cd apps/api && node --test --import tsx src/join-rules/router.test.ts` -> tests 13, pass 13, fail 0
- `... router.test.ts src/server.test.ts src/routes/calendar.test.ts` -> tests 33, pass 33, fail 0
- `node --test --import tsx scripts/qa/join-rules-edit-api.test.ts` (repo root) -> tests 4, pass 4, fail 0
- `cd apps/api && node <main>/node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0
- `git show --stat dd11749` -> deps.ts 35, router.test.ts 273, router.ts 135, server.ts +5, qa/manifests/... 66, scripts/qa/join-rules-edit-api.test.ts 122. Nothing else.
- `grep meeting-bot apps/api/src/join-rules` -> comments only; no import. `.dependency-cruiser.cjs` rule `apps-only-ask-ingest-index-ai-db-core` forbids apps/* -> packages/meeting-bot and applies.

## Per-route auth and tenancy (real `createServer`, real store, raw http probes; rate limit lifted for the probe)

| Route | no key | bad key | key w/o `calendar` | B key + A-tenant hints (query, x-tenant-id, x-tenant, tenant-id, x-forwarded-tenant, body tenantId/tenant/state/constructor/__proto__/nested) |
|---|---|---|---|---|
| GET /calendar/join-rules | 401 | 401 | 403 | 200, B's own (empty) data |
| PUT /calendar/join-rules | 401 | 401 | 403 | 400 for every smuggled field; `__proto__` raw 400 |
| POST .../approvals | 401 | 401 | 403 | 400 for tenantId/__proto__/constructor/nested; duplicate keys: last wins (`kind` sender -> 400 invalid email) |
| POST .../opt-outs | 401 | 401 | 403 | duplicate `eventId`: last wins, recorded under B only |

Method/path confusion: 154 requests (GET HEAD OPTIONS PATCH DELETE PUT POST x 11 path variants incl. `/`, case, `//`, `/../`, `%2e%2e`, `%00`, `?tenantId=`) with no key and with a no-scope key. Every response was 401/403 or 404 (no handler matched) except OPTIONS 204 (server-wide CORS preflight before auth; no handler reached). Authenticated: HEAD 200 (Express maps to GET, after auth+scope), PATCH/DELETE 404. Tenant A's file was byte-identical (`aSnap === after`) after all of B's requests. Mount order: `requireAuth` (server.ts:77) and the rate limiter (:78) precede the join-rules router (:89).

## Requests that got through (none unauthenticated, none cross-tenant)
Only OPTIONS preflights (204, no key, any of the variants above). No GET/PUT/POST/PATCH/DELETE/HEAD without a valid key and scope reached a handler.

## State preservation, validation, concurrency, hygiene
- PUT keeps approvals/opt-outs (approvals then PUT: state equal). Corrupt A file: PUT, approval, opt-out, GET all 500 `join_rules_unavailable`, bytes unchanged, 0 tmp files. Wrong-tenant B file: PUT and GET 500, bytes unchanged. Refused PUTs (wildcard domain, allow rule with empty match, unknown rule field, wrong types, 5000 rules -> 413, `{}`): bytes unchanged.
- Approval values accepted (200) vs refused (400): refused `com`, `*`, ``, `a b.example`, `*.example.com`, Cyrillic homoglyph domain/sender, `.example.com`, `..com`, `a@b@c.example`, `a@com`, `<a@c.example>`, kinds `role`/`__proto__`, non-string values. Accepted (engine normalisation): ` example.org `, `example.org.`, `Example.ORG`, `A@B.EXAMPLE`, `a@c.example\n` (stored canonical), `xn--...` punycode, `co.uk`, `gmail.com`, and sender `*@c.example` (stored literal; the engine matches approvedSenders by exact equality, so it is inert). The validator is the engine's `normalizeEmail`/`normalizeDomain`; nothing in this unit adds a public-suffix or free-mail check (engine-level, see EXPLANATION).
- Concurrency (real store behind async wrappers adding 0 or 5 ms latency): 50 approvals + 50 opt-outs + 1 PUT for tenant A and 10 for B in parallel, all 200, A 50/50 and 50/50, rules kept, B 10/10, no cross-leak. 20 interleaved PUT+approval: 10/10 approvals survive. A thrown write -> 500 with generic body (the injected message `C:\secret\path` not echoed); the next writes ran (200,200,400); a burst of 6 with one failure -> 5 saved. B's request finished in 453 ms while A had 8 queued ops (A queue 2291 ms): not blocked. The `tails` map deletes an entry once its tail settles, so it does not grow.
- Hygiene: router errors are generic. Malformed JSON and the 413 are produced by the server-wide `express.json()` (before auth, pre-existing): status 400/413 but the HTML body is Express's default handler with the stack and absolute `node_modules` paths (NODE_ENV not production here). Not this unit's code; noted below.

## Mutation table (router.ts; per-mutation byte backup, 100 s timeout per suite, restore in finally + SIGINT/SIGTERM handler; cmp and hash check after each)

| Mutation | Result |
|---|---|
| M1 tenant taken from x-tenant-id header in guarded() | SURVIVED (13/13, 4/4) |
| M2 opt-outs route without requireScope | KILLED (router.test 1 fail) |
| M3 PUT saves without loading first | KILLED (3 + 3 fail) |
| M4 no per-tenant mutex | KILLED (1 fail, fake store with latency) |
| M5 PUT skips router validation | KILLED (3 + 2 fail) |
| M6 queue poisoned by a failure | KILLED (6 + 2 fail) |
| M7 GET without requireScope | KILLED (1 fail) |
| M8 approvals takes tenant from body field `tenant` | SURVIVED (13/13, 4/4) |

6 of 8 killed; M1 and M8 weaken tenancy and survive. Final HEAD fidelity: git hash-object apps/api/src/join-rules/router.ts = git rev-parse HEAD:apps/api/src/join-rules/router.ts = b6d70720676d6c250a5d80ef45411234de6cabac (identical after every mutation).

ISSUES-WRITTEN: ISS-T037API-001 (high, tenant-source mutations survive), ISS-T037API-002 (high, write power on the read-only calendar scope; Approver decision before wiring), both in qa/issues.t037api.jsonl.

EXPLANATION:
Manifest check (criterion 9): route table, statuses and counts match my reruns (13, 33, 4 passes; tsc 0). The "not delivered" section is accurate: with no store wired the 503 router answers after auth.
Required for PASS (cycle 1): add hostile-hint write tests that kill M1 and M8 (ISS-T037API-001). No production code change is needed.
Write scope: sibling mutating routes each use a dedicated resource scope (gmail, sources, ingest, keys, compete); reusing the read-only calendar scope for writes (ISS-T037API-002) matches the manifest's stated limit but widens every existing calendar key. Do not wire joinRules into production before Umesh decides on a write scope.
Approval values: the engine, not this unit, decides. gmail.com and public suffixes such as co.uk are accepted as approved domains; a caller can already add an equivalent allow rule through PUT, so this is not an escalation over the edit power itself. Low, engine-level, not filed. A sender entry like *@c.example is stored but inert.
Low, not filed: stack and path disclosure in the server-wide JSON-parse and 413 error pages (pre-existing; production NODE_ENV hides the stack); the approvals and opt-outs routes do a redundant load per request; GET is not under the lock (reads whole through the atomic rename); multi-process writers unsupported, as the manifest says. The machine disk hit 100 percent full mid-check from other processes.

