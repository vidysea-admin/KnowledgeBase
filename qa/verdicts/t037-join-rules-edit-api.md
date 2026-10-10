# Verdict — t037-join-rules-edit-api

## Cycle 1 (latest)

VERDICT: PASS
Cycle checked: 1
Scope: maker fix commits f608a7f + bc41a7a (HEAD bc41a7a), unit security class (auth, tenancy, data writes), full ceremony. Contract `qa/contracts/t037-join-rules-edit-api.md` (criterion 10 amended to the approved scope design only). Remaining whole-task gates: T-037 stays open (production wiring, web UI, scheduler switch-over not delivered; routes answer 503 in deployment).
Timing: wall-clock timestamps and per-command durations not measured (unknown); mutation runs each capped at 100 s, other commands at 150-180 s.
Checked final hashes (HEAD blobs, equal to worktree after all mutation runs): router.ts 0051bd0ffc3d959aa6c87e6b61bcc4f4265e882f; auth.ts 2f9ce54f8a7b38954a45fa24529058b787c94b5a.

### Commands (portable node, each under `timeout`)
- `apps/api: node --test --import tsx src/join-rules/{router,tenant-source,scope-write}.test.ts` -> tests 26, pass 26, fail 0
- `... src/server.test.ts src/routes/calendar.test.ts` -> tests 20, pass 20; `... src/routes/keys.test.ts` -> tests 7, pass 7
- `node --test --import tsx scripts/qa/join-rules-edit-api.test.ts` -> tests 4, pass 4
- `apps/api: node <main>/node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0
- `node scripts/lint-dirsize.mjs` -> OK (110 dir(s) within budget). `lint-loc`: 8 pre-existing violations (e.g. packages/meeting-bot join-rules.ts:309), none in this unit (join-rules files 35/139/273/95/138/53 lines).

### D-015 counts against the ledger rows' own reproductions
- ISS-T037API-001: 2/2 recorded survivors now killed. M1 (header `x-tenant-id` in guarded()) and M8 (approvals take body `tenant`) re-applied by me to router.ts: both fail the new tenant-source tests (table below).
- ISS-T037API-002: 4/4 recorded requests refused for a `calendar`-only key (PUT match-every-Meet rule, approvals gmail.com, approvals co.uk, plus an opt-out): 403 each, zero store calls (spy), no stored bytes.
Nothing left open from either row.

### Route x key-shape table (real createServer, spy store; `*` = a store call happened)

| Key shape | GET | PUT | approvals | opt-outs |
|---|---|---|---|---|
| no key / invalid key | 401 | 401 | 401 | 401 |
| unrelated scopes (sources, gmail, ingest) | 403 | 403 | 403 | 403 |
| `calendar` only | 200* | 403 | 403 | 403 |
| `join-rules` only | 403 | 200* | 200* | 200* |
| both | 200* | 200* | 200* | 200* |
| `join-rules ` (trailing space), `JOIN-RULES`, `join-rules:read`, `join_rules`, `calendar:write`, `*`, `admin`/`all`/`superuser`, `calendar,join-rules` as one string, `keys` only, empty list | 403 | 403 | 403 | 403 |

Only the starred cells touched the store; every 401/403 cell touched nothing. `requireScope` (auth.ts) is exact `Array.includes`; `requireAuth` only attaches `{tenantId, scopes}` from the key store. `rg "scopes?" apps/api/src` shows no wildcard, prefix, admin or superuser path that grants a scope implicitly. The unwired 503 router is guarded by `calendar` (a `join-rules`-only key gets 403 there; immaterial, nothing is stored).

### Tenant-source tests are real
tenant-source.test.ts uses a byte-level spy store (test-store.ts), a tenant-a key, tenant-b seeded with distinct data, and hostile hints: 7 header names, 5 query variants, path variants, body fields tenantId/tenant/tenant_id/__proto__/constructor/prototype (string, object, array; raw JSON so `__proto__` stays an own key) plus nested. It asserts the tenant argument of EVERY dep call is tenant-a, tenant-b stored bytes are unchanged, tenant-a's change landed and GET returns tenant-a's value. Not status-only.

### Mutation table (per-mutation byte backup in memory, 100 s timeout per run, restore in `finally`, `git hash-object` = `git rev-parse HEAD:` after each)

| Mutation | Suite | Result |
|---|---|---|
| M1 header x-tenant-id in guarded() (D-015 replay) | 3 join-rules files | KILLED (header test) |
| M8 approvals tenant from body field (D-015 replay) | 3 join-rules files | KILLED (body tests) |
| N1 tenant from a `tenant=` cookie | 3 join-rules files | SURVIVED (no test sends a cookie) |
| N2 tenant from `Origin` header | 3 join-rules files | SURVIVED |
| N3 GET tenant from `x-tenant-slug` header (name not in the 7 listed) | 3 join-rules files | SURVIVED |
| N4 tenant from `?tenantId=` in guarded() | 3 join-rules files | KILLED (query test) |
| S1 PUT reverted to scope `calendar` | 3 join-rules files | KILLED (calendar-only 403 test, join-rules-only test) |
| S2 requireScope passes when scope list empty | 53 tests: join-rules x3, server, calendar, keys | SURVIVED (filed ISS-T037API-003) |

Judgement: N1-N3 are conditional tenant sources keyed on a request attribute no test supplies; header-name enumeration can never be exhaustive, the invariant is "only req.auth", and every unconditional wrong source is killed by the spy. Low, EXPLANATION only. S2 is a real gap on the empty-scope shape, filed medium.

### Keys route: who can mint which scopes
`POST /keys` requires scope `keys` (so do GET and DELETE `/keys`). Probe: a `calendar`-only key POSTing /keys with scopes ["join-rules"] -> 403; a `join-rules`-only key -> 403; a `keys` key -> 201. `createKey` stores any caller-supplied string array: no allowlist and no subset check (a `keys` holder can mint scopes it does not itself hold, for its own tenant). So a `calendar`-only key CANNOT self-escalate. A `keys` holder can mint `join-rules`; that is a pre-existing property of the keys route that applies to every scope, neither introduced nor relied on by this unit. The write scope therefore separates writes from read-only keys, but not from `keys` holders (treat `keys` as admin). Not filed (by design, unchanged). `scripts/mint-key.mjs` `ALL_SCOPES` was left unchanged: keys minted before AND after this change do not hold `join-rules`, so nobody can write join rules until a key is deliberately issued (via a `keys` key, or by editing that list). Leaving the list unchanged is the safer default; adding it is the owner's decision.

### GET on `calendar`
GET /calendar/join-rules returns rules, ownDomains, approved senders/domains and opted-out event ids to any `calendar` key. GET /calendar/upcoming (same scope) already returns organizer, meeting URLs and event data. Sender emails and domains are comparable in sensitivity to organizer addresses: consistent, not a clear leak (different shape: tenant-wide approval lists rather than per-meeting).

### Regression spot-checks (cycle 0 properties)
router.test.ts (13) and the real-store round trip (4) green: tenancy with hints, PUT preserves state, corrupt stored file not overwritten, engine refusals 400, 20 parallel approvals survive. The new "failed save does not poison the tenant queue" test injects a save failure, then asserts later writes succeed and a burst of 6 with one failure saves 5. Cycle 0 route-level probes on unchanged paths were not repeated beyond these suites.

ISSUES-WRITTEN: ISS-T037API-003 (medium; empty-scope-list requireScope mutation survives; pre-existing gap in a shared primitive; not a blocker). ISS-T037API-001 and -002 set to verified in qa/issues.t037api.jsonl.

EXPLANATION:
PASS: tenancy, auth and the write-scope separation hold in the production code (matrix above) and the new tests catch the cycle-0 regressions (M1, M8) and a revert of a write route to `calendar`. The manifest's Fix cycle 1 section matches observed counts (26, 20, 7, 4, tsc 0, dirsize 110) and the route table matches the matrix; "Still not delivered" states production wiring is absent (joinRules is not supplied by buildProductionDeps; deployed routes answer 503).
Low, not filed: N1-N3 conditional tenant sources survive (cookie, Origin, unlisted header names); the write scope does not separate from `keys` holders (pre-existing keys-route design); `join-rules` appears in no key-minting script so an owner decision is needed before the write routes can be used; cycle 0 low notes (server-wide JSON-parse error page, redundant loads) unchanged.
Contract edit: criterion 10 reworded from an Approver-decision note to the approved scope design only; no acceptance lowered.

---

## Cycle 0 (superseded by cycle 1)

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

