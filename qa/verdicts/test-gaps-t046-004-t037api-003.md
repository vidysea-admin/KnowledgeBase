# Verdict: test-gaps-t046-004-t037api-003

VERDICT: PASS
Cycle checked: 0
Checked HEAD: 0472efa (base 6c5d800)

## Commands and results
- `git diff 6c5d800 0472efa --stat`: 4 files (+213): the two test files, qa/issues.testgaps.jsonl, the manifest. No production source.
- Related tests, clean: packages/ingest retention-sweep.strict.test.ts 15/15 pass; apps/api require-scope + join-rules + server.test.ts + keys.test.ts 51/51 pass.
- `tsc --noEmit`: packages/ingest exit 0; apps/api exit 0.
- `node scripts/lint-dirsize.mjs`: OK (111 dirs within budget). Non-blank lines: require-scope.test.ts 117, retention-sweep.strict.test.ts 301 (budget 400). join-rules/ holds 7 files.

## Mutation table (per-mutation byte backup, subshell trap on EXIT/INT/TERM, timeout on every run)
| Issue | Mutation | Base tests vs mutant | New tests vs mutant |
|---|---|---|---|
| ISS-T046-004 | strict-record.ts line 83: drop `$` from ISO pattern | 12 tests, 12 pass, 0 fail (SURVIVED) | 15 tests, 12 pass, 3 fail (KILLED) |
| ISS-T037API-003 | auth.ts: `!(scopes.length === 0 \|\| scopes.includes(scope))` | 41 tests (join-rules, server, keys), 41 pass (SURVIVED) | 10 tests, 8 pass, 2 fail (KILLED) |

Base tests were the base's strict test file extracted by `git show` into a temp sibling file (deleted after) and the base-era API test files. HEAD fidelity after each mutation: strict-record.ts 015d105e5af2e09257592c71bf5ff2e5473932f6 == HEAD blob; auth.ts 2f9ce54f8a7b38954a45fa24529058b787c94b5a == HEAD blob.
(An earlier harness attempt of mine used a run-scoped trap and produced no useful output; the tree was verified clean and hashes equal HEAD, then redone per-mutation.)

## Assertion quality
Timestamp tests assert on the planner OUTPUT: purgeEligibleIds empty, decision "keep", reason "malformed processedAt" / /malformed record/, across 3 instants x 20 surroundings (NUL, space, LF, CRLF, tab, extra Z, letters, digit, second instant, offset, fraction, leading junk, +00 extended year, both ends), plus a direct parseIsoInstant check with a positive control. Scope tests: empty list vs several required scopes, missing/undefined auth, missing field, null/object/number/boolean, near-miss strings, 403 with exact body keys {error,message}, next never called, held scopes not echoed. Minor softness, not blocking: the non-array and missing-field cases accept a throw as a refusal, and the string-scopes case only pins non-containing strings (the containing case is ISS-TESTGAPS-001).

## Placement
join-rules/ is lawful by the dir budget (OK, 7 files) but misleading: requireScope/requireAuth are shared primitives in src/auth.ts. A note only; relocate when apps/api/src has room.

## ISS-TESTGAPS-001 (verified)
`requireScope` is `req.auth.scopes.includes(scope)`: substring match for a string, element match for an array. Probe: scopes "calendar:read" vs requireScope("calendar") and "join-rules calendar keys" vs "keys" both call next (2 calls). store.verify returns `doc.scopes ?? []` unvalidated.
Reach: every producing path writes an array. POST /keys (routes/keys.ts) requires Array.isArray, non-empty, every element a string, else 400. scripts/mint-key.mjs, scripts/demo/seed-demo-server.mjs and apps/api fixtures use array literals; schema/api_keys.schema.json declares array of string; git grep finds no string-valued scopes in json/jsonl/mjs/ts. Only a direct DB write or hand-edited document could yield a string, and anyone able to do that can already mint any scope. No lower-privileged input path exists. Ruling: severity stays medium (latent defence-in-depth gap in the central primitive; not high). Field unchanged.

## Recommended on merge (orchestrator)
Flip ISS-T046-004 (qa/issues.t046.jsonl) and ISS-T037API-003 (qa/issues.t037api.jsonl) to closed/fixed, citing this verdict. ISS-TESTGAPS-001 stays open.

ISSUES-WRITTEN: none
EXPLANATION: No production file changed. Both recorded mutations survived the base tests and are killed by the new ones, with assertions on planner output and on the 403/next behaviour. ISS-TESTGAPS-001 was already filed by the maker and is confirmed, not new.
