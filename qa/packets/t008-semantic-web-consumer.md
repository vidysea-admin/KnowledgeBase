# Checker packet — t008-semantic-web-consumer

Fix cycle: 0. Repository: C:/Users/product/Desktop/KnowledgeBase.
Maker skill: skills/maker/SKILL.md. Checker skill: skills/checker/SKILL.md.
Manifest: qa/manifests/t008-semantic-web-consumer.md.
Verdict owned by checker: qa/verdicts/t008-semantic-web-consumer.md.

## Owned source identities

All five files are new/untracked; no base file existed. Existing/shared source files are untouched by this maker.

| Path | Final SHA256 |
|---|---|
| apps/web/src/api/search/semanticClient.ts | BDCC85685F01CE7CCD2FD6642EECB458AE2365ABA712413CF0779CF26ED873BE |
| apps/web/src/api/search/semanticClient.test.ts | 645F3FBD693DAC6F72BFD32BB7346C128455BC491B02F9CF62151CAC29B5E991 |
| apps/web/src/pages/search/semantic/SemanticResults.tsx | 21DC97E5C1D2840FB8BB19C9DD10D445270A514CE6D63DBBB616509BCFCEB5CE |
| apps/web/src/pages/search/semantic/SemanticResults.test.tsx | 4B32865B5CA4A88EC24E29F9C77C4942F7037BA153C229AED888A104B6E54176 |
| apps/web/src/pages/search/semantic/SemanticSearchIntegration.test.tsx | 82CB0CC57B4D063502694667D37202549F4665C666933F4075FADB3230AD64E8 |

## Acceptance basis and complete change map

The existing qa/contracts/vector-retrieval.md covers pure ranking, explicitly not the UI; it is not claimed as full UI acceptance. qa/contracts/search-route.md covers lexical backend and is unchanged. Applicable product requirement is .goal/catalogue.json C9 structured/vector side by side, with T-008 missing web UI explicitly listed by qa/manifests/t008search.md. Independent checker must assess the new consumer behavior and its security boundaries rather than force this UI into pure-vector criteria. No maker contract edits.

- semanticClient.searchSemantic uses existing apiFetch and GET /search/semantic only. Query trimmed, max512 code points; k integer1..50; no tenant field. URLSearchParams encodes once, including isolated query surrogate replacement. Auth is existing bearer wrapper. It validates response query, bounded rows, URI-encodable nonblank IDs, finite cosine score in [-1-1e-9,1+1e-9] (unclamped existing cosine roundoff), nullable join or exact session ID/title/date, unique winning sessions/chunks. Raw score retained.
- SemanticResults wraps a keyed child by current key/query so previous private state disappears synchronously on identity/query replacement. No effect dispatches requests. Only explicit button action invokes embedding route; pending ref refuses repeat action before render, disabled button during request. Active ref refuses late success/error after unmount. Retry clears prior result state.
- Results are literal React text, session links only (encoded path), nullable join unavailable. No invented source quote, time, turn anchor or confidence. Provider charges and retrieval-score limitations disclosed. 404 disabled,401 sign-in,403 scope,400 query bound, other safe unavailable; backend body never rendered.
- Tests use real client/component with fake fetch responses, including negative/roundoff score, malformed UTF16 IDs, duplicates/joins, stale owner/query, repeated action, sign-out/invalid inputs, errors and retry.

Dependencies: apps/web/src/api/client.ts (apiFetch, ApiError; auth invalidation); apps/api/src/semantic-search/route.ts (wire shape/scope/errors); apps/api/src/semantic-search/semantic-search-store.ts (session-deduped hits, flag default off); packages/index/src/vector/cosine.ts (unclamped cosine); react-router-dom Link.

Immediate consumer: root integrator added SearchPage import from ./semantic/SemanticResults.js and <SemanticResults apiKey={apiKey} query={urlQuery}/> below lexical output. Shared SearchPage remains unedited by maker; dependency hash C452002EB5B8BE483754CDAC05458B43E6EBE6C462042FB0B1FE65184C1B5D32. Integration test renders actual AuthProvider/SearchPage and verifies independent lexical/semantic request discipline, dual evidence links, stale-query refusal and owner/query clearing. Component tests also inspect actual generated source links under MemoryRouter.

Security: authenticated tenant-scoped read, credentials carried only by existing bearer wrapper; no client tenant selector. No writes/provider routing/activation. Client does not assert tenant membership from untrusted payload alone; server's scoped reads remain authoritative. Key/query replacement and unmounted completions are explicitly covered.

## Commands/results

Executed core command (cwd apps/web):
`node node_modules/vitest/vitest.mjs run src/api/search/semanticClient.test.ts src/pages/search/semantic/SemanticResults.test.tsx --maxWorkers=1 --minWorkers=1 --pool=threads --testTimeout=10000`

First sandbox execution exit1, failed config startup with esbuild spawnEPERM before tests (1.999s, tool76a600). Required escalated rerun with approved prefix: session54172, finaltool770bbc exit0, started09:11:21, Vitest duration10.38s. Exact output:
```
SemanticResults.test.tsx (10 tests) 475ms
semanticClient.test.ts (6 tests) 31ms
Test Files 2 passed (2)
Tests 16 passed (16)
Duration 10.38s
```

Downstream executed (cwd apps/web), command:
`node node_modules/vitest/vitest.mjs run src/pages/search/semantic/SemanticSearchIntegration.test.tsx --pool=threads --maxWorkers=1 --minWorkers=1 --testTimeout=10000`
Toolafa2e8 exit0/wall3.858153s; Vitest started09:15:29/duration2.51s; exact output: `SemanticSearchIntegration.test.tsx (3 tests) 265ms; Test Files 1 passed (1); Tests 3 passed (3)`. Root-controlled slot released. No failed test was omitted or relabelled: earlier failure was framework startup.

Attributed shared whole-web TypeScript: `node node_modules/typescript/lib/tsc.js --noEmit -p apps/web/tsconfig.json` (repo root), exit0/8.6013715s, emptystdout/stderr. Receipt qa/evidence/t039-send-now-status-polling-web-typecheck.json. Precise UTC command intervals were not recorded. Ordering evidence: sender confirms command ran after checker message09:14UTC; integrationtest created09:13:27/lastedited09:13:45UTC; receipt created09:14:34UTC. All five owned files and root SearchPage glue remained unchanged during that interval and were freshly rehashed after test completion. This is type coverage, not behavioral/browser proof.

Attributed required validator: `./.venv/Scripts/python.exe contracts/verify_contracts.py --repo-root C:/Users/product/Desktop/KnowledgeBase`, exit0/0.133968s, receipt qa/evidence/execution-wave1-integration-validator.receipt.json/stdout.txt. Exact stdout: `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`. Frozen registry remains unchanged; do not interpret as feature acceptance.

Installed web Vitest entry and root TypeScript entry confirmed by Test-Path. pnpm absent from PATH per runtime inventory; direct local Node entry avoids installation/network. Initial esbuildEPERM required approval; approved node/Vitest prefix resolved startup. No additional install/provider/network operation. Root-controlled single-worker slots were used.

No filed issue is being fixed; no D-015 reproduction corpus is substituted. Independent review already identified floating-point score parity and malformed surrogate ID rendering; candidate contains both fixes and regressions before READY.

## Explicit limits

Source/runtime consumer scope, including the verified root-owned two-line SearchPage glue. No real provider/DB/browser, activation, server flag change, broader shared integration, lexical completeness, retrieval quality metric, whole T008/U3.2, production or release completion claim. No Git commit. Reviewer wrote independent Cycle0 PASS at qa/verdicts/t008-semantic-web-consumer.md; maker closed the matching unchanged source candidate.
