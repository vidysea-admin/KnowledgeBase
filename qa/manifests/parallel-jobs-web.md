# Provider audit jobs Web consumer — T-057 slice

Status: checked-PASS
Fix cycle: 1

## Authorization and scope

Tier 3 T-057 roadmap, new provider-audit read seam with zero prior PASSes at assignment. NORMAL mode with independent checkers explicitly approved by Umesh; /maker was not invoked. Canonical machine interface: qa/evidence/parallel-jobs-read/contract.json. Independently authored acceptance: qa/contracts/parallel-jobs-read.md. Existing project AGENTS, structure.config.json, qa/loop.md and approved PLAN govern this work.

Owned source only: apps/web/src/api/jobs.ts and jobs.test.ts; apps/web/src/pages/jobs/JobsPage.tsx and JobsPage.test.tsx. This manifest is the sole owned QA write. No App, navigation, Settings, CSS, shared types, schema, helper, index, ledger, task or contract edits. Coordinated canonical wire interface with API builder /root/registration_security.

## Implemented behavior

- Typed real GET /jobs client through existing apiFetch/Bearer wrapper; explicit default50 request limit, integer bounds1..100 before fetching. Complete runtime envelope {jobs,limit,truncated} and exact summary whitelist validation. Reject extras, missing/inherited required properties, unknown statuses, invalid optional values, impossible/calendar-invalid date-time values, wrong returned limit, excess rows and inconsistent short truncated pages; reject the entire payload rather than partially displaying it.
- Page explains application provider-call audit meaning and that status does not establish end-to-end pipeline completion. Shows actual ID/kind/status/creation/provider/update metadata as React text, local kind/status filters, actual returned/displayed count, bounded truncation notice, refresh, missing-provider fallback, distinct empty/no-match/loading/error states.
- Fixed sanitized errors never display backend message/key values.403 explains dedicated jobs permission;401/sign-out requires sign-in. No key minting or scope broadening.
- State bound to API key and refresh generation conceals old rows/error immediately on replacement/logout/refresh. Effect cancellation ignores deferred success/error from stale requests. Local filters reset with each load; logout makes no anonymous request. Existing shared AuthProvider/apiFetch retained unchanged.

## Historical cycle 0 evidence

Runtime: C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe. Commands run from apps/web.

`& '<Node>' node_modules/vitest/vitest.mjs run src/api/jobs.test.ts src/pages/jobs/JobsPage.test.tsx --maxWorkers=1 --minWorkers=1 --pool=threads`

Executed with require_escalated after automatic approval because prior focused frontend evidence establishes sandbox esbuild spawn EPERM. No config workaround, full suite or browser.

```text
RUN v2.1.8 C:/Users/product/Desktop/KnowledgeBase/apps/web
✓ src/pages/jobs/JobsPage.test.tsx (13 tests) 384ms
✓ src/api/jobs.test.ts (37 tests) 26ms
Test Files 2 passed (2)
Tests 50 passed (50)
Start at 13:21:23
Duration 3.57s (transform 156ms, setup 408ms, collect 385ms, tests 410ms, environment 1.68s, prepare 313ms)
Terminal exit0.
```

Earlier focused run49/49 also passed; final additive inherited-property refusal case makes final count50. No test assertions were removed or weakened.

`& '<Node>' node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`: terminal exit0, no diagnostics, independently rerun after final source change.

`git diff --check -- src/api/jobs.ts src/api/jobs.test.ts src/pages/jobs/JobsPage.tsx src/pages/jobs/JobsPage.test.tsx`: terminal exit0, no output. New untracked files are not covered by Git diff alone; TypeScript/test execution covers their loaded contents.

Get-ChildItem direct-file counts: apps/web/src/api18/30, pages/jobs2/30. Source files far below300 lines, tests far below400. Existing LOC enforcement excludes .tsx; this work does not alter that rule or claim it enforced page sizes.

Cycle 0 SHA256 identities (retained history; not cycle 1):

```text
apps/web/src/api/jobs.ts 69ECB0A31124C783C09C8ABCEBF76DA88515999D27BA07006719E54CD9BE3139
apps/web/src/api/jobs.test.ts 7D2AEBC89C82006D0BB6A350AE431D15DB3E137958E387882AB7D057E8D4CBE7
apps/web/src/pages/jobs/JobsPage.tsx ED15EE937652E376FB76A7C2E157E84A49E6EC57EA76AFE2734BCDDE155247E1
apps/web/src/pages/jobs/JobsPage.test.tsx 95530F843CC52F3AA8F074DF083BF8E41703C7225FAAFF55672C142CA9C37123
```

UI tests use the real JobsPage, real jobs client, real apiFetch and real AuthProvider with endpoint-shaped fake fetch responses. They cover positive loading/populated/empty/filter/no-match/refresh/truncation, literal malicious markup, poisoned partial data refusal, sanitized403/503, immediate old-row/error hiding, B-key positive rendering, deferred A success/rejection/401 after B, and deferred success/rejection after logout with no anonymous request. Client tests cover real endpoint/header wiring, bounds1/100, default50, invalid limits, no key, malformed envelope/rows/optional dates/poison extras and HTTP status retention.

## Integration and remaining gates

Page is currently UNMOUNTED: shared App/nav and API/production composition belong to single integrator. No endpoint HTTP/database-adapter composition was exercised by this builder; those contract criteria remain integration/checker work. No DB, provider, browser, full suite, contract validator, live tenant/read proof, runtime activation, deployment, commit or push. The new jobs scope may require an appropriately authorized key; no key was created. This scoped evidence does not close T-057 or claim whole-contract/release acceptance. Independent checker owns verdict and any contract changes.

## Cycle 1 — root-authorized RFC3339 compatibility correction

Root authorized the minimal correction after API checker found DB-valid RFC3339 lowercase t/z was rejected by the Web uppercase-only regex. Cycle 0 scoped PASS and its evidence are retained as history; this reopened manifest requests cycle1 independent recheck. No broad seam polish or contract weakening.

Only application change is the date-time regex case-insensitive flag. All strict calendar/time/zone parsing, limits/envelope/whitelist, poisoned-data and key-race refusals remain intact. Values are returned and displayed literally, without normalization. New parameterized client and real-client-to-page regressions cover lowercase t alone, lowercase z alone, and both in createdAt/updatedAt. Source JobsPage.tsx remains byte-identical to cycle0.

Final cycle1 command from apps/web:

`& '<Node>' node_modules/vitest/vitest.mjs run src/api/jobs.test.ts src/pages/jobs/JobsPage.test.tsx --maxWorkers=1 --minWorkers=1 --pool=threads`

```text
RUN v2.1.8 C:/Users/product/Desktop/KnowledgeBase/apps/web
✓ src/pages/jobs/JobsPage.test.tsx (16 tests) 416ms
✓ src/api/jobs.test.ts (40 tests) 25ms
Test Files 2 passed (2)
Tests 56 passed (56)
Start at 13:31:05
Duration 3.84s (transform 175ms, setup 523ms, collect 491ms, tests 440ms, environment 1.70s, prepare 313ms)
Terminal exit0.
```

Earlier cycle1 both-lowercase-only run52/52 passed; final additive case-variant coverage expands to56. Approved require_escalated invokes the same bounded frontend runner; no sandbox workaround.

After final regression edits, `& '<Node>' node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`: no diagnostics, terminal exit0. `git diff --check -- src/api/jobs.ts src/api/jobs.test.ts src/pages/jobs/JobsPage.tsx src/pages/jobs/JobsPage.test.tsx`: no output, terminal exit0 (new untracked files caveat from cycle0 retained).

Final frozen cycle1 SHA256:

```text
apps/web/src/api/jobs.ts 5565E99EC7DA536249509E28053E8FB5C2BDF32A70BE37B0A36EDA707A93AB2B
apps/web/src/api/jobs.test.ts 53CC8680677407C462AEF453F5C6AA3E8549DA3E6201A0FFDA3E36A4D0E9CEF5
apps/web/src/pages/jobs/JobsPage.tsx ED15EE937652E376FB76A7C2E157E84A49E6EC57EA76AFE2734BCDDE155247E1
apps/web/src/pages/jobs/JobsPage.test.tsx F65B6E998D80A3E952732220BCF840D5020339AA33D3C9DEB4C4EBD27AC8D8BF
```

API builder/checker and Web checker notified. Sources explorer and all shared/integration files untouched. Integration/live acceptance limitations above remain.
