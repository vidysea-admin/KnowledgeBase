# Independent Jobs web consumer evidence — 2026-10-09

Cycle checked: 0
Checker: /root/sources_explorer_checker
Manifest frozen ready-for-check cycle 0 by parent before checks.

## Executed checks

Node: C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe
Working directory: C:/Users/product/Desktop/KnowledgeBase/apps/web

Command: `& '<Node>' node_modules/vitest/vitest.mjs run src/api/jobs.test.ts src/pages/jobs/JobsPage.test.tsx --maxWorkers=1 --minWorkers=1 --pool=threads`

Initial sandbox execution exited 1 during esbuild/Vite config startup: spawn EPERM;
no tests ran. Exact bounded command retried via require_escalated, automatically
approved. Terminal exit 0:

```text
RUN v2.1.8 C:/Users/product/Desktop/KnowledgeBase/apps/web
✓ src/pages/jobs/JobsPage.test.tsx (13 tests) 386ms
✓ src/api/jobs.test.ts (37 tests) 24ms
Test Files 2 passed (2)
Tests 50 passed (50)
Start at 13:25:17
Duration 3.49s (transform 157ms, setup 407ms, collect 396ms, tests 410ms, environment 1.59s, prepare 306ms)
```

Command: `& '<Node>' node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`
Terminal exit: 0. Output: empty.

Repository-root command:
`git diff --check -- apps/web/src/api/jobs.ts apps/web/src/api/jobs.test.ts apps/web/src/pages/jobs/JobsPage.tsx apps/web/src/pages/jobs/JobsPage.test.tsx`
Terminal exit: 0. Output: empty. These four paths are untracked; this does not
establish their whitespace/content validity by itself. All were read and loaded by
the focused test/typecheck.

Repository-root command: `& .venv/Scripts/python.exe contracts/verify_contracts.py`
Result: no frozen contracts yet; PASS by vacuity, not product acceptance.

## Frozen identities

Get-FileHash -Algorithm SHA256 before focused tests and rechecked afterwards:

```text
apps/web/src/api/jobs.ts 69ECB0A31124C783C09C8ABCEBF76DA88515999D27BA07006719E54CD9BE3139
apps/web/src/api/jobs.test.ts 7D2AEBC89C82006D0BB6A350AE431D15DB3E137958E387882AB7D057E8D4CBE7
apps/web/src/pages/jobs/JobsPage.tsx ED15EE937652E376FB76A7C2E157E84A49E6EC57EA76AFE2734BCDDE155247E1
apps/web/src/pages/jobs/JobsPage.test.tsx 95530F843CC52F3AA8F074DF083BF8E41703C7225FAAFF55672C142CA9C37123
```

## Independent inspection

Read all four frozen files, common contract and machine spec at
qa/evidence/parallel-jobs-read/contract.json, plus existing apiFetch and AuthProvider.
Client bounds limit before reading; uses existing Bearer wrapper; requires exactly
jobs/limit/truncated and all row fields before accepting the entire payload. Every
row key is whitelisted, status literal, kind nonempty, calendar/time fields checked.
Response limit equals requested limit; over-limit rows and short truncated pages
are refused. Date parsing includes explicit calendar/leap-day checks.

UI tests mock only endpoint fetch responses, retaining actual JobsPage -> listJobs
-> apiFetch and AuthProvider; no listJobs stub. Positive endpoint-shaped rows render,
poisoned final rows refuse the whole response, malicious markup remains literal
text, error strings/key values stay absent. Returned-subset AND filters/counts and
50-row truncation/refresh are exercised. Deferred key A success/rejection/401 after
B-positive keeps B rows and stored key; logout plus deferred success/rejection
renders sign-in and issues no anonymous request. Key-bound/generation-bound render
guard conceals old data/errors before effects; cancellation prevents late updates.
Refresh disables while no current result exists and resets filters; source inspection
confirms recovery permits retry from an error. No client cache was introduced;
backend private/no-store remains the server-side integration requirement.

Counts: api folder 18 files and jobs page folder 2, each below directory cap30.
Nonblank lines: jobs.ts42; jobs.test.ts60; JobsPage.tsx65; JobsPage.test.tsx125.
TS source/test are below configured300/400. Existing LOC tool excludes TSX;
checker does not change or claim enforcement of that extension. Imports remain
inside apps/web, without domain-package/backend dependency or HTML injection sink.

No source, shared auth/API helper, ledger, schema, common contract, App/nav or Settings
edit. No browser/full suite/DB/provider/live mutation. The page remains unmounted;
App/nav and full HTTP/accessor/store composition belong to separate integration.
This evidence establishes the web consumer slice only, not complete common C8,
T-057, full repository health or live operational acceptance.
