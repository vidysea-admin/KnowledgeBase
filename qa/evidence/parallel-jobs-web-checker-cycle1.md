# Independent Jobs web consumer check — cycle 1, 2026-10-09

Checker: /root/sources_explorer_checker
Manifest: qa/manifests/parallel-jobs-web.md, ready-for-check, Fix cycle 1.
Prior cycle 0 evidence remains unchanged in parallel-jobs-web-checker.md.

## Commands and terminal results

Working directory: C:/Users/product/Desktop/KnowledgeBase/apps/web
Node: C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe

Command: `& '<Node>' node_modules/vitest/vitest.mjs run src/api/jobs.test.ts src/pages/jobs/JobsPage.test.tsx --maxWorkers=1 --minWorkers=1 --pool=threads`

Used authorized exact scoped require_escalated after earlier independent checks proved
sandbox esbuild spawn EPERM. Automatic approval review approved this invocation.
Session 69003 completed terminal exit 0:

```text
RUN v2.1.8 C:/Users/product/Desktop/KnowledgeBase/apps/web
✓ src/pages/jobs/JobsPage.test.tsx (16 tests) 1761ms
  ✓ Provider jobs page through real jobs client > composes local kind/status filters and counts only the returned subset 537ms
✓ src/api/jobs.test.ts (40 tests) 363ms
Test Files 2 passed (2)
Tests 56 passed (56)
Start at 13:59:25
Duration 20.26s (transform 2.76s, setup 2.60s, collect 4.83s, tests 2.12s, environment 6.77s, prepare 1.13s)
```

Command: `& '<Node>' node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`
Session 49993 completed terminal exit 0; no diagnostics/output.

Repository-root command:
`git diff --check -- apps/web/src/api/jobs.ts apps/web/src/api/jobs.test.ts apps/web/src/pages/jobs/JobsPage.tsx apps/web/src/pages/jobs/JobsPage.test.tsx`
Terminal exit 0; empty output. Previously recorded untracked-file caveat remains.

## Frozen identities before and after execution

Get-FileHash -Algorithm SHA256 matches cycle 1 manifest and remained unchanged:

```text
apps/web/src/api/jobs.ts 5565E99EC7DA536249509E28053E8FB5C2BDF32A70BE37B0A36EDA707A93AB2B
apps/web/src/api/jobs.test.ts 53CC8680677407C462AEF453F5C6AA3E8549DA3E6201A0FFDA3E36A4D0E9CEF5
apps/web/src/pages/jobs/JobsPage.tsx ED15EE937652E376FB76A7C2E157E84A49E6EC57EA76AFE2734BCDDE155247E1
apps/web/src/pages/jobs/JobsPage.test.tsx F65B6E998D80A3E952732220BCF840D5020339AA33D3C9DEB4C4EBD27AC8D8BF
```

JobsPage application hash is unchanged from cycle 0. Source read confirms the client
datetime regex now has /i; calendar/time/finite parsing, whitelist/status/limit,
whole-response refusal and literal return are retained. Common contract was reread.
New three-case client AND actual apiFetch/client/AuthProvider/page tests cover:
2026-10-09t12:00:00Z, 2026-10-09T12:00:00z, 2026-10-09t12:00:00z.
Both createdAt and updatedAt stay exactly equal to supplied text and display literally.

Existing impossible-date, hour24, date-only, invalid-update, malformed/poisoned
envelope/summary, literal-status, sanitized-error, truncation/filter/refresh assertions
remain. Full focused rerun retains positive B-key rows and stored key after deferred
A success/rejection/401, immediate old data/error hiding and logout no anonymous fetch.

Only checker QA records edited. No application/shared composition, browser, DB,
provider, runtime, full suite or mutation. App/nav and full accessor/store/Express
composition remain a separate integration unit. Prior validator result was vacuous
and is not expanded into product acceptance. This evidence supports C1-C9 only for
the isolated consumer slice; no T-057 or release closure claimed.
