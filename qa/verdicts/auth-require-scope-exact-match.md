# Verdict - auth-require-scope-exact-match

VERDICT: PASS
Cycle checked: 0
Commit checked: 5350f68 (lane/authscope, base 8a05ccf). Independent checker, security class, full ceremony.

## Scope
`git show --stat 5350f68`: apps/api/src/auth.ts (+9/-2), apps/api/src/join-rules/require-scope.test.ts (+62), qa/manifests/auth-require-scope-exact-match.md (+38). store.ts and keys.ts unchanged. Full auth.ts diff read: requireScope is now `Array.isArray(held) && held.some(s => typeof s === "string" && s === scope)`; requireAuth replaces scopes that are not an array of strings with `[]`, otherwise passes `verified` through as the same object. Same 403 body and signature.

## D-015: ISS-TESTGAPS-001 recorded reproductions, verbatim (node --import tsx, fixed code)
- requireScope("calendar") with scopes "calendar:read" -> next 0, status 403
- requireScope("keys") with scopes "join-rules calendar keys" -> next 0, status 403
Count: ISS-TESTGAPS-001: 2/2 refused.

## Unfixed-code failure (mutation M0: auth.ts replaced by `git show 8a05ccf:apps/api/src/auth.ts`)
`tests 16 pass 12 fail 4` (fixed code 16/16). Restored; hash equals HEAD blob.

## Value table (real route GET /keys via createServer with a handler call counter; plus direct requireScope on the raw value)
| scopes value | route | handler runs | direct requireScope |
|---|---|---|---|
| string equal "keys" / containing / comma-joined / space-joined | 403 | 0 | 403, next 0 |
| null, undefined, 1, true, {} | 403 | 0 | 403, no throw |
| {includes:()=>true}, array-like {length:1,0:"keys"}, Set | 403 | 0 | 403 |
| [new String("keys")], [["keys"]], [{toString:()=>"keys"}] | 403 | 0 | 403 |
| ["Keys"], [" keys"], ["keys "], [] | 403 | 0 | 403 |
| ["keys"], ["a","keys","b"], ["keys","keys"] | 200 | 1 | next 1 (allowed, correct) |
| Array subclass overriding some()=>true | 200 | 1 | next 1 (THEORETICAL) |
| Proxy array whose get trap returns some=>true | 200 | 1 | next 1 (THEORETICAL) |

Subclass/proxy: the implementation calls the instance's OWN `held.some(...)`, not `Array.prototype.some.call`. A JSON or database value can never be such an instance, so it is unreachable by data; noted, not a defect. `Array.prototype.some.call(held, ...)` would close it at no cost.

Scope argument: `requireScope("")` with a key holding `""` calls next (hardening gap, not filed). `requireScope(undefined/null/5/{})` refuses every key, no throw. `git grep "requireScope("`: all call sites pass string literals or constants (`"calendar"`, `WRITE_SCOPE = "join-rules"`, stubs `route.scope = "webhooks"`); none empty.

## requireAuth and malformed records (probe through the server)
scopes string / number / object / null / [1,"keys"] / missing => authenticated with scopes [], 403 on the scoped route, handler never runs, no throw, no 500. For a well-formed record the very same array instance is passed through (`req.auth.scopes === store array: true`). Reading apps/api: no `.push`, `.splice`, `.split`, `Array.from`, `[scopes]` wrapping or assignment on `req.auth.scopes`; nothing mutates the shared array. No coercion anywhere.

Tenantless records (outside the stated scope, same primitive): `{scopes:["keys"]}` (no tenantId) => 200, handler tenant undefined; tenantId null => 200 (null); "" => 200; 5 => 200 (number). `requireAuth` does not validate tenantId. Nothing treats undefined as a wildcard, but handlers filter Mongo by it and the driver serialises undefined as null. Pre-existing and unreachable by any API path (schema requires tenantId; POST /keys uses the caller's tenant). Filed as ISS-AUTHSCOPE-001 (high); does not fail this unit.

## Routes reachable with auth but NO scope
Every route mounted after `requireAuth` (server.ts:77-94) carries requireScope (git grep of router.get/post/put/delete/use finds no unscoped route outside the pre-auth mounts). The only unscoped routes are the pre-auth ones: /health (aggregate cross-tenant counts, deliberate), /, /sessions-ui, /sessions-ui/:id, /dashboard-ui, /docs-ui, /compete (static HTML). So a scope-less key reaches no tenant-data route; scope-less is as safe as a 401 for the scopes case. 401 is the right answer only for the tenantless case. The rate limiter keys on req.auth.tenantId (also unvalidated).

## Other scope comparisons
`git grep scopes` in apps/api/src and packages/db/src: only requireScope compares; keys.ts:43-48 validates minted scopes (Array.isArray + every string); store.ts:47,214 pass `?? []`; listKeys would echo a corrupted value (display only). apps/web only types and shows scopes (`k.scopes.join(", ")` in SettingsPage); no authorisation decision.

## Commands (each under timeout, node 24.19.0)
- require-scope.test.ts: tests 16 pass 16 fail 0
- join-rules/*, server, keys, calendar, ask-arms: tests 81 pass 81 fail 0
- brain, citations, compete, graph, ingest, meeting-candidates, search, watched-sources, whatsapp, pages: tests 84 pass 84 fail 0
- apps/api `tsc --noEmit -p tsconfig.json`: exit 0
- `node scripts/lint-dirsize.mjs`: OK (111 dir(s) within budget). auth.ts 58 lines; test file 173 non-blank lines (budget 400).

## Mutations on auth.ts (per-mutation byte backup, subshell trap, timeout 120, hash check after each)
| # | Mutation | Result |
|---|---|---|
| M0 | revert to 8a05ccf auth.ts | KILLED (12 pass, 4 fail) |
| M1 | drop Array.isArray in requireScope | KILLED (11 pass, 5 fail) |
| M2 | drop `typeof s === "string"` | SURVIVED (equivalent: `s === scope` with a string scope implies a string) |
| M3 | `===` to `==` | SURVIVED (equivalent while the typeof guard stays) |
| M2+M3 | `s == scope` only | KILLED (14 pass, 2 fail; String wrapper) |
| M4 | restore `.includes` | KILLED (12 pass, 4 fail) |
| M5 | malformed record keeps raw scopes in requireAuth | KILLED (15 pass, 1 fail) |
HEAD-fidelity after every mutation and at the end: `git hash-object apps/api/src/auth.ts` equals `git rev-parse HEAD:apps/api/src/auth.ts` = 005e5571c0f7d8985565b9166f4ca4376f9a566d.

## Manifest follow-ups
1. keys.ts:40-51 validates shape only, so a `keys` holder can mint any scope: accurate, pre-existing, owner decision.
2. The proposed audit query is read-only (`find` with a projection) and uses the right collection (`api_keys`) and field (`scopes`); `$not:{$type:"array"}` matches non-array and missing, `$elemMatch` with `$not $type string` matches non-string elements. Correct; not run. It would not find tenantless records (ISS-AUTHSCOPE-001).

## Recommended on merge
Flip ISS-TESTGAPS-001 (qa/issues.testgaps.jsonl) to fixed/verified citing this verdict and commit 5350f68. Optional low hardening, not filed: `Array.prototype.some.call`, and refuse an empty `scope` argument.

ISSUES-WRITTEN: ISS-AUTHSCOPE-001 (high, pre-existing tenantless authentication; outside this unit, does not fail it)
EXPLANATION: No non-array or non-exact value satisfies a scope check, malformed records are inert and never 500, well-formed keys keep access, and the tests fail 4 ways on the old code. The two surviving mutants are equivalent. The tenantless finding is in the same primitive but predates and lies outside this unit.
