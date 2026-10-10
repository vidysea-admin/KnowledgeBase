# Manifest — test-gaps-t046-004-t037api-003
**Lane:** lane/testgaps (base 6c5d800) · **Ledger shard:** qa/issues.testgaps.jsonl (ISS-TESTGAPS-NNN)
**Issues addressed:** ISS-T046-004 (medium), ISS-T037API-003 (medium) — both TEST gaps; no production change
**Tier:** 3 (roadmap/test-gap pull) · **Fix cycle:** 0

## What changed (test files only)
- `packages/ingest/src/retention-sweep.strict.test.ts` (275 -> 301 non-blank lines, under 400): 3 tests + a shared surround table (19 leading/trailing shapes x 3 valid instants) — commit 4882391.
- `apps/api/src/join-rules/require-scope.test.ts` (new, 117 non-blank lines): 10 direct tests of `requireScope`/`requireAuth` — commit 0b929aa. Placed in `join-rules/` (6 files, lawful; apps/api/src is AT its 31-file limit and the existing scope tests live here). No `auth.test.ts` exists.
- `qa/issues.testgaps.jsonl`: ISS-TESTGAPS-001 (see Findings).

## Item 1 — ISS-T046-004
- Recorded mutation: in `strict-record.ts`, `Z$/;` -> `Z/;` (drop trailing anchor). Mirror: `= /^(\d{4}` -> `= /(\d{4}`.
- Tests added: `parseIsoInstant` / `processedAt` / `purgedAt` each refuse a valid instant (`...Z`, `.123Z`, OLD) with: trailing NUL, space, newline, CRLF, tab, duplicate Z, letters, digit, second instant, offset, extra fraction; leading space, NUL, newline, letters, digit, `+`, `+00` (extended-year form Date.parse accepts), both ends, NUL both ends. processedAt -> KEEP "malformed processedAt"; purgedAt -> KEEP /malformed record/; never purge-eligible.
- Before (old test file from HEAD, mutation `$` dropped): tests 28 pass 28 fail 0 — SURVIVES. Mirror (`^` dropped) before: killed by the pre-existing "numeric, date-only, offset..." test (its `+002020-...` case), 1 fail.
- After: drop `$`: 3 fail of 31 — "ISS-T046-004: a valid instant with leading or trailing content is refused by parseIsoInstant", "...processedAt with leading or trailing content is KEEP 'malformed processedAt'", "...purgedAt with leading or trailing content is KEEP (malformed), never purge-eligible". Drop `^`: 4 fail of 31 (those 3 + the pre-existing one). Unmutated: 31/31 pass.
- D-015 (ISS-T046-004 recorded reproduction: trailing NUL accepted with `$` dropped): 1/1 now killed. Unrecorded variants covered: 57 surround strings per field.

## Item 2 — ISS-T037API-003
- Recorded mutation: `auth.ts` `!req.auth.scopes.includes(scope)` -> `!(req.auth.scopes.length === 0 || req.auth.scopes.includes(scope))`.
- Tests added (require-scope.test.ts): scope present alone/among others/duplicated/5000-entry list passes with next once; EMPTY list refused (403, next not called, vs 4 required scopes); no req.auth / undefined auth / missing scopes field never pass; non-array scopes (null, object, number, boolean) never reach next; string scopes not containing the scope refused; 18 near-miss sets (case, trailing/leading space, newline, NUL, prefix `calendar:read`, `calendars`, comma-joined string, `*`, 5000-entry long list) refused with 403, body keys exactly {error,message}, held scopes not leaked; requireAuth: 8 bad headers 401 with store never asked, null verify 401, store throw never authenticates, valid key sets req.auth + next once, scheme case-insensitive.
- Before (recorded 6 files, mutation applied): tests 53 pass 53 fail 0 — SURVIVES.
- After (6 files + new): tests 63 pass 61 fail 2 — KILLED by "ISS-T037API-003: an EMPTY scope list is refused with 403 and next is never called" and "requireScope: a string (not array) scope value that does not contain the scope is refused" (`"".includes` on a string: the mutation's length===0 passes the empty string). Unmutated: 63/63 pass.
- D-015 (ISS-T037API-003 recorded reproduction: scopes [] => pass under mutation): 1/1 killed (the 6-file corpus was run verbatim first).

## Findings (production NOT changed)
- ISS-TESTGAPS-001 (medium, open): `requireScope` with `scopes` stored as a STRING does substring matching (`"calendar:read"` passes `requireScope("calendar")`; probe: next called once). Needs a corrupted/legacy key doc since `store.ts:47` passes `doc.scopes ?? []` unvalidated. Not asserted as wrong behaviour in any test; fix direction in the row.

## Evidence (commands run from the worktree, node 24.19.0 via codex runtime PATH)
- `cd packages/ingest && timeout 120 node --test --import tsx src/retention-sweep.test.ts src/retention-sweep.strict.test.ts` -> `ℹ tests 31 / pass 31 / fail 0`
- `cd apps/api && timeout 170 node --test --import tsx src/join-rules/*.test.ts src/server.test.ts src/routes/keys.test.ts src/routes/calendar.test.ts` -> `ℹ tests 63 / pass 63 / fail 0`
- `node node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` in packages/ingest -> exit 0; in apps/api -> exit 0 (after junctioning packages/*/node_modules)
- `node scripts/lint-dirsize.mjs` before and after -> `lint-dirsize: OK (111 dir(s) within budget)`
- Mutations via a per-mutation runner (backup per mutation, restore in `finally`, 150-170 s timeout per run): every run printed `restored equal: true`.
- HEAD-fidelity after all mutation runs: `packages/ingest/src/strict-record.ts` hash-object == HEAD blob `015d105e5af2e09257592c71bf5ff2e5473932f6`; `apps/api/src/auth.ts` hash-object == HEAD blob `2f9ce54f8a7b38954a45fa24529058b787c94b5a`.
- `git diff 6c5d800 --stat`: only the two test files, qa/issues.testgaps.jsonl and this manifest.

Status: ready-for-check
Fix cycle: 0
