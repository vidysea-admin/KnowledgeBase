# Manifest — parallel-jobs-api

**Goal task:** T-057
**Tier:** 3 — unblocked roadmap feature; new jobs read seam, no prior PASS
**Mode:** NORMAL explicitly approved; dedicated new jobs scope approved by root
**Contract:** qa/contracts/parallel-jobs-api.md; qa/contracts/parallel-jobs-read.md
**Fix cycle:** 1
**Status:** checked-PASS
**Handshake status:** checked-PASS
**Date:** 2026-10-09

## Scope and owned files

Only apps/api/src/jobs/router.ts, router.test.ts, store.ts, store.test.ts and this manifest.
Actual router requires jobs scope, derives tenant from verified auth, rejects unknown/duplicate/
structured query selectors and nonempty GET bodies, returns fixed 400/503 errors and private,
no-store cache policy. Adapter calls the standard application's actual jobs accessor with
explicit metadata projection, descending createdAt/_id ordering and limit+1. Both adapter and
HTTP boundary validate/project summaries; no raw provider payloads or writes.

## Actual verification

Bundled Node executable: C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe

Command: bundled-node --test --test-concurrency=1 --test-timeout=20000 --experimental-test-isolation=none --import tsx apps/api/src/jobs/router.test.ts apps/api/src/jobs/store.test.ts

Cycle0 output: tests9, pass9, fail0, cancelled0, skipped0, todo0, duration1143.2639ms; exit0.
Cycle1 final output: tests9, pass9, fail0, cancelled0, skipped0, todo0, duration1345.9714ms; exit0.
Includes real auth+scope-before-read, verified A/B tenant source despite foreign headers, strict
limit/selectors/body refusals, poisoned fields, malformed optional/date/envelope refusals,
fixed errors, limit100/extra-row truthfulness and actual DB accessor→adapter→HTTP composition
with an injected database-shaped cursor. Collection/filter assertions occur at raw DB boundary.

Command: bundled-node node_modules/typescript/bin/tsc --noEmit -p apps/api/tsconfig.json

Final current-source output: no diagnostics; exit0.

Initial plain node command unavailable on PATH. Sandboxed Node worker and then in-process tsx
transform attempts returned spawn EPERM before assertions; neither is test evidence. Approved
escalated bounded offline command permitted required local transform worker and final9/9 above.

Scoped nonblank LOC: router65, router.test96, store24, store.test63; jobs folder4files.

## Exact tested SHA256

- router.ts: 6c337958b7700638403e77d7006d4fd24d0b3393d9b81276cd58049d7d638131
- router.test.ts: 7caa17695e232d7ee34d47fba8ed9cfae441439b1516c6f07ee18e4176115874
- store.ts: d28f40b17eddf581af62e7c973d91417571dc5b28ceb429dfc1e5658021fe03a
- store.test.ts: a1a4856c176ac672b21df925506c7806875cc7a34bc682e06ac8edf801f57b14

## Integration and acceptance pending

Single integrator must mount actual router in createServer after auth/rate limiter, supply jobs
dependencies in fixtures/production, export DB barrel and mount web page/navigation. Current
test mounts real middleware/router in isolated Express app; shared createServer/production/web
composition is not certified by this maker result. Direct DB source accessor import is active.
No DB/provider/browser/full suite/live write, auth/schema/enforcement edit, ledger/task/goal
update, commit or push. Frozen-contract verifier/global structure/full release checks not run
by this builder. Independent checker cycle1 scoped PASS is recorded; this is no T-057 closure.

## Cycle1 correction authorized by root

Independent checker reproduced valid RFC3339 lowercase t/z accepted by actual DB reader but
refused by API's uppercase-only date pattern. Minimal API pattern now accepts [Tt]/[Zz].
Actual accessor→adapter→HTTP regression uses lowercase createdAt and updatedAt and requires
their unchanged literal response values. Existing malformed Gregorian date refusals remain.
Cycle1 focused tests9/9 and current API typecheck0 above received independent checker review;
no normalization, shared source/runtime/service or global contract change.

## Matching checker close-out

Verified maximum verdict cycle1 PASS in qa/verdicts/parallel-jobs-api.md, preserving historical
cycle0 FAIL. Independent cycle1 tests9/9, API typecheck0 and actual DB/accessor/adapter/HTTP
lowercase timestamp boundary probe0 are in qa/evidence/parallel-jobs-read/api-check-cycle1.json.
Rehashed all four owned source/test files immediately before close-out; all match manifest and
checker cycle1 identities above. Only this manifest changed to checked-PASS; application source
remains frozen. Shared server/production/web integration and full parent acceptance remain open.
