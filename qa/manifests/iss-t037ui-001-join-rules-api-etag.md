# iss-t037ui-001-join-rules-api-etag

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 3/3 (step 2 of 3: ISS-UNOPTLOCK-002, medium, and the API half of ISS-T037UI-001, medium). Class: data write deciding whether the bot joins a meeting: full ceremony. Verdict by the checker only.
Lane: lane/rulesapi. Lane ledger `qa/issues.rulesapi.jsonl`: ISS-RULESAPI-001 (low, filed, not a unit). Existing ledger rows untouched.

**MERGE CONDITION: this lane must not be merged alone. The current web editor sends no precondition header, so every save would get 428. It lands together with lane/rulesweb.**

## Scope
- apps/api: `src/join-rules/router.ts` (GET ETag, PUT precondition, 412/428), `deps.ts` (seam gains `loadWithValidator`, `saveIf`; `precondition-failed` code), `src/cors.ts` (CORS), tests.
- `scripts/webinar/join-rules-host.ts` (adapter wires `loadWithValidator` -> `loadJoinRulesWithValidator`, `saveIf` -> `saveJoinRulesIf`).
- Not touched: apps/web, packages/meeting-bot, qa/contracts, docs/DECISIONS.md, ARCHITECTURE.md, CLAUDE.md. No join-rules contract criterion mentions ETag/If-Match; criteria 3 and 8 of `t037-join-rules-edit-api.md` (PUT loads first, preserves state, writes nothing on a corrupt file) still hold and are tested (see "Contract check").

## HTTP contract as implemented (path `/calendar/join-rules`; tenant only from `req.auth.tenantId`)
- GET (scope `calendar`): 200 `{ ruleSet, state }` (body unchanged). Rule set stored -> header `ETag: "<sha256 hex>"` (strong, quoted, no `W/`). Nothing stored -> same body/status, NO ETag header.
- PUT (scope `join-rules`) needs exactly one of:
  - `If-Match: "<validator>"` (replace) or `If-None-Match: *` (create the first).
  - neither -> `428` `{ "error": "precondition-required" }`, nothing written.
  - If-Match differs from the stored validator, nothing stored, or `If-None-Match: *` while stored -> `412` `{ "error": "precondition-failed", "currentEtag": "\"<validator>\"" | null }`, plus `ETag` header = current when stored; nothing written.
  - success -> `200` `{ ruleSet, state }` (as before; `state` is the one read under the store lock) + `ETag` of the newly stored rule set.
- Compare and write is the store's atomic `saveJoinRulesIf` through `deps.saveIf`; the route does no load-compare-save. The PUT route no longer calls `deps.save` / `saveJoinRules`.
- Choices where the contract was silent (flagged): single entity-tag only. `If-Match: *`, a list, a weak `W/"..."`, an unquoted or non-64-hex tag, and `If-None-Match` with anything other than `*` -> 412 (current ETag named, nothing written). BOTH headers in one request -> 400 `bad_request` (ambiguous). Order: precondition missing (428) -> body not an object (400) -> read-only `loadWithValidator` (a corrupt/wrong-tenant file is a 5xx before any 400, as before) -> engine validation (400) -> unsupported form (412) -> `saveIf` (412 / 413 / 5xx / 200). A body that is both invalid and stale gets 400, not 412.
- Responses are written with `res.end(JSON.stringify(..))` (`sendJson`), because Express's `res.json` adds its own WEAK `ETag` to any response lacking one (and answers 304 to a matching If-None-Match). Without this, "no rule set stored -> no ETag" was false (found by the first test run). Filed low as ISS-RULESAPI-001 for the other routers.
- Status table (`STORE_FAILURE`) gains `precondition-failed` -> 412 (PUT turns it into the contract body, using `error.currentValidator`; "absent" -> `currentEtag: null`). `locked` -> 503 and every other code unchanged.
- ETag semantics inherited from the store: validator = sha256 of the canonical rule set only; opt-outs and approvals do not change it. Two tenants holding byte-identical rule sets share a validator by design (the compare is always against the requested tenant's own file, so A's tag never touches B's data).

## CORS (apps/api/src/cors.ts), allowed origins unchanged
For an allowed `Origin` only (a disallowed or missing origin still receives no CORS headers): `Access-Control-Allow-Headers: Content-Type, Authorization, If-Match, If-None-Match`; new `Access-Control-Expose-Headers: ETag`. Deviation to flag: `Access-Control-Allow-Methods` listed `GET, POST, DELETE, OPTIONS` (no PUT), so a cross-origin PUT could not pass preflight at all; `PUT` is added, which is required for the contract to be usable from the other origin and widens no origin.

## Callers of the legacy `saveJoinRules` remaining (none is the PUT route)
- `scripts/webinar/join-rules-host.ts`: `createJoinRulesDeps().save` is still wired (the seam keeps `save`), unused by any route.
- Tests that seed state: packages/meeting-bot join-rules-{cas,enforce,enforce-preconditions,optout-identity,store,store-lock,unopt-lock}.test.ts, join-rules-wiring/key-tenant.test.ts (not touched); scripts/qa/join-rules-edit-api.test.ts (hand-built deps forward `save`; seeds one concurrency test); scripts/webinar/join-rules-etag.test.ts (seeds, plus the deliberate legacy control).
- `packages/meeting-bot/src/calendar/join-rules-store.ts` itself (definition, unchanged).

## Existing tests changed, and why (each is a consequence of the new contract)
- Fakes/spies (`router.test.ts` fakeStore, `test-store.ts` spyStore, `busy-status.test.ts` thrower, `scripts/qa/join-rules-edit-api.test.ts` deps) gained `loadWithValidator` and `saveIf` (required by the seam). The fakes' `saveIf` compares and writes with no await in between, preserving state as read at that moment, like the real store. Their write log records `saveIf` only when it writes, and the "nothing written" assertions now count `save` OR `saveIf`, so they stay as strong as before (counting only `save` would pass vacuously).
- Every PUT that used to succeed with no header now sends a precondition: `If-None-Match: *` when nothing is stored, otherwise `If-Match` with the stored rule set's validator. PUTs expected to return 400/413/500 also send a valid precondition, otherwise they would hit 428 first and stop testing what they test. (router.test.ts, scope-write.test.ts, tenant-source.test.ts, busy-status.test.ts, join-rules-host.test.ts, scripts/qa/join-rules-edit-api.test.ts.)
- `router.test.ts` "concurrent approvals and PUT": seeds a stored empty rule set and the PUT uses If-Match of it. Reason: whichever write ran first created the file, and `If-None-Match: *` would then 412 depending on order. Same seed in the scripts/qa concurrency test.
- `busy-status.test.ts`: the "every other store code -> 500" list excludes `precondition-failed` (now 412), totality list includes it, new test for the 412 body. `scope-write.test.ts`: the failed-write test adds a failed `saveIf` PUT then a successful retry (nothing poisoned).
- No assertion was removed or loosened. New: `apps/api/src/cors.test.ts` (3 tests), `scripts/webinar/join-rules-etag.test.ts` (10 tests).

## Evidence (node off PATH; each run under `timeout`; temp dirs; localhost only; no browser, OBS, MongoDB, network)
- `scripts/webinar/join-rules-etag.test.ts` -> `tests 10, pass 10, fail 0`; includes real second processes (the ISS-UNOPTLOCK-002 replay, the HTTP-vs-process CAS race, opt-out between GET and PUT). Repeated 15 times: `15/15` runs `pass 10, fail 0`.
- `apps/api/src/cors.test.ts` -> `tests 3, pass 3`.
- apps/api join-rules: router.test.ts `14/14`, busy-status `20/20` (includes the new 412 test), scope-write `7/7`, tenant-source `6/6`, un-opt `9/9`, require-scope `21/21`.
- `scripts/webinar/join-rules-host.test.ts` -> `tests 14, pass 14` (spawns plain node processes only); `scripts/qa/join-rules-edit-api.test.ts` -> `tests 4, pass 4`.
- Typecheck `tsc --noEmit -p tsconfig.json` in apps/api -> exit 0 (run once, at the end). `scripts/webinar/join-rules-host.ts` checked ad hoc with `--strict --module nodenext` -> no errors (scripts have no tsconfig).
- Not run: packages/meeting-bot tests (not touched), apps/web (not touched, parallel lane). Nothing refused.

### Count against the ledger's recorded reproductions
- `ISS-UNOPTLOCK-002: 4/4` over HTTP. The test reads the row from `qa/issues.unoptlock.jsonl`, asserts its evidence text, seeds "rules allow x.com, state empty", and a REAL second node process calls `recordTenantOptOut(cal1)` between the PUT route's load and its write. Control through the same route with the legacy unconditional replace: opt-out erased and decision `join` (bug reproduces, so the harness is not vacuous). With `saveIf`: (1) PUT 200 despite the opt-out, (2) file still lists `["cal1"]`, (3) decision is not `join`, (4) new rule set stored, body state includes cal1, ETag is the new one. Closed.
- `ISS-T037UI-001: 2/2` for its recorded measurement: (1) two clients load, A saves, B saves with the old ETag -> B gets 412 with the winner's ETag and nothing is written; (2) B re-loads then saves -> 200. Deviation: the ledger text says 409; the ordered contract says 412, implemented as ordered. The row's "web page replaces its compare-before-PUT" half is NOT done here (lane/rulesweb), so the issue stays open until that merges.
- Plus: two concurrent PUTs with the same If-Match -> exactly one 200, one 412 with the winner's ETag, loser's rules not stored; stale If-Match -> 412, bytes identical; no header -> 428 (also for an invalid body); `If-None-Match: *` creates only when absent; opt-out/approval (real process and HTTP) between GET and PUT -> no 412, preserved, ETag unchanged; tenant A's ETag against B -> 412, B and A bytes untouched; GET ETag strong 64-hex, absent when nothing stored, a matching If-None-Match on GET still 200; unsupported forms -> 412; both headers -> 400.
- Preflight: allows content-type, authorization, if-match, if-none-match and PUT, exposes ETag, 204, no credentials header; disallowed/missing origins get no CORS headers.

## Mutations (10 tried; harness `.mut-harness-rulesapi.mjs`, untracked, deleted; per-mutation byte backup restored in `finally`; hash verified changed before counting; SIGKILL timeout 150 s per file)
Baseline fails per file [0,0,0]. KILLED 10/10: PUT compares with the freshly read validator instead of the client's (5 failures); 428 check removed (1); GET drops ETag (5); 412 drops the current ETag header (5); success drops the new ETag (4); `sendJson` back to `res.json` (4); CORS without If-Match (1); CORS without exposed ETag (2); CORS without PUT (1); store `precondition-failed` not recognised (5+1). Afterwards `git hash-object` of router.ts = a140659f2b6d5e6e469ed6a0855e8ff4f153f98d, cors.ts = affa00bdf9d6bc1aef9141629b50119542c84108, equal to the committed blobs.

## NOT covered
- The web editor (lane/rulesweb) and any other API client: until they send If-Match / If-None-Match every PUT is 428.
- Same machine/local filesystem only (store limits, ISS-LOCKTAKE-005 and ISS-UNOPTLOCK-001 unchanged).
- Identical rule sets in two tenants share a validator by design.
- Other routers still get Express's weak ETag (ISS-RULESAPI-001, low).
