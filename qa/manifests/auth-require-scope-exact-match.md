# Manifest — auth-require-scope-exact-match
**Lane:** lane/authscope (base 8a05ccf) · **Ledger shard:** qa/issues.authscope.jsonl (ISS-AUTHSCOPE-NNN; no new issue filed)
**Issue addressed:** ISS-TESTGAPS-001 (medium; security class: central authorisation check, full ceremony) · **Fix cycle:** 0

## What changed
- `apps/api/src/auth.ts` (58 lines, limit 300): `requireScope` and `requireAuth`.
- `apps/api/src/join-rules/require-scope.test.ts` (173 non-blank lines, budget 400): 6 new tests. No new file in apps/api/src (dirsize OK, 111 dirs).

## Before / after of the check
- Before: `if (!req.auth || !req.auth.scopes.includes(scope))` — `.includes` on an unvalidated value; a string substring-matches.
- After: `const held: unknown = req.auth?.scopes; if (!Array.isArray(held) || !held.some((s) => typeof s === "string" && s === scope))` -> same 403, same body. Signature and `req.auth` shape unchanged.

## Point 2 choice: malformed stored scopes => authenticate with NO scopes
`requireAuth` (the one place every store's result becomes `req.auth`) replaces a scopes value that is not an array of strings with `[]`; well-formed records pass through as the same object. Consistent with `store.ts:47` / `:214`, which already treat a missing scopes field as `[]` (`doc.scopes ?? []`) rather than rejecting the key; a 401 would be a new behaviour class and would hide the key's tenant-level validity. Never split or coerced. Fails closed on every scoped route (403), no throw, no 500. `store.ts` left unchanged (requireAuth covers it for any store).

## Point 3: other scope comparisons (git grep scopes in apps/api/src, packages/db/src)
Only comparison of scopes anywhere: `auth.ts` requireScope (fixed). `routes/keys.ts:43-48` validates minted scopes with `Array.isArray` + `every typeof string` (already exact); `store.ts:47,214,227` only pass values through (`?? []`); `routes/stubs.ts:35` uses requireScope. No `indexOf`, `in`, regex or `startsWith` on scopes. Note `store.ts:214` (listKeys) would echo a corrupted string scopes in the key listing; display only, not authorisation.

## D-015
ISS-TESTGAPS-001: 2/2 recorded reproductions refused ("calendar:read" vs requireScope("calendar"); "join-rules calendar keys" vs requireScope("keys")). Plus 4 extra string cases.

## Proof the new tests fail on the unfixed code
Runner replaced apps/api/src/auth.ts with `git show HEAD:` content, ran require-scope.test.ts, restored in `finally` from a per-mutation byte backup (timeout 120 s): `tests 16 pass 12 fail 4`, failing: the ISS-TESTGAPS-001 reproductions test, the non-array-shapes test, the byte-identical-403 test, the requireAuth malformed-scopes test. `restored equal: true`. Fixed code: 16/16.

## Evidence (node 24.19.0 via codex runtime PATH; junctions to main node_modules, root + apps/api + packages/* + apps/web)
- `cd apps/api && timeout 120 node --test --import tsx src/join-rules/require-scope.test.ts` -> `tests 16 / pass 16 / fail 0`
- `timeout 170 node --test --import tsx src/join-rules/*.test.ts src/server.test.ts src/routes/keys.test.ts src/routes/calendar.test.ts src/ask-arms.test.ts` -> `tests 81 / pass 81 / fail 0`
- `timeout 170 node --test --import tsx src/routes/{brain,citations,compete,graph,ingest,meeting-candidates,search,watched-sources,whatsapp,pages}.test.ts` -> `tests 84 / pass 84 / fail 0` (an earlier run showed 2 fails only because packages/* junctions did not exist yet)
- `timeout 180 node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` (apps/api) -> exit 0
- `node scripts/lint-dirsize.mjs` before and after -> `lint-dirsize: OK (111 dir(s) within budget)`
- HEAD-fidelity: auth.ts working blob equals the committed blob after the mutation run (hash recorded in commit).

## Follow-ups (not done here)
1. A `keys` holder can mint any scope, including ones it lacks (`routes/keys.ts:40-51`, `POST /keys` only validates shape). Pre-existing; needs the owner's decision.
2. Audit stored keys for non-array scopes (read-only, not run): `db.api_keys.find({ $or: [ { scopes: { $not: { $type: "array" } } }, { scopes: { $elemMatch: { $not: { $type: "string" } } } } ] }, { _id: 1, tenantId: 1, label: 1, scopes: 1 })`. Any hit is now a scopeless (inert) key.

Status: ready-for-check
Fix cycle: 0
