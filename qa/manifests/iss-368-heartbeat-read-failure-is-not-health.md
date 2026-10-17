# Manifest — ISS-368 heartbeat read failure is not health

Contract: qa/contracts/health-route.md (historical C1/C7 reconciliation disclosed below); docs/features/u4-watch-dashboard/spec.md R2/R8; D-102
Goal task: T-051, scoped priority-tier-1 ISS-368; no T-052 completion claim
Policy-Version: proportional-verification/2026-10-05.3
Protocol hashes: maker=67DB6B6B125DA3AF317503482164F86D7026D02BA77A39E06AAE1A8A1152542E; checker=126F87DE7882EECEB45ADE773C1D47B8BE5EB93B691CD4F90F5ADADE96231949
Fix cycle: 0 · Resumes: 0 · Retry: 0
Phase: BLOCKED
Status: BLOCKED
Tier: L — protected standing false-health expectation corrected under explicit D-102; unauthenticated aggregate response privacy remains load-bearing.
Base / checked state: HEAD 614d78b8966428296f394b8bf3e6c547d41beca5 plus existing dirty tree. This feature changes only apps/api/src/routes/health.ts and health.test.ts; unrelated work preserved. QA manifest creation explicitly authorized by parent. No commit, deployment, production read/write or alert send.

## Authorization, criteria and invariants

D-102: “return silent and unreadable counts; expose only aggregate watchUnreadable, return HTTP503 for unreadable probes, retain successful tenant evaluation and existing known-stale behavior.”

Acceptance criteria for independent checking:

1. A failed tenant-scoped heartbeat read increments unreadable once, does not fabricate silence alerts, and does not prevent other configured tenants being evaluated. Broken + readable missing-row tenant produces `{silent:3, unreadable:1}`, both reads, and exactly three alerts for the readable tenant only.
2. HTTP all-unreadable differs from all-fresh: unreadable returns 503 with `watchSilent:0, watchUnreadable:1`; readable fresh returns 200 with both counts zero. Mixed unreadable/readable stale returns 503 with accurate known-silent and failed-read aggregate counts. Readable known-stale retains existing 200 behavior.
3. A recovered read yields fresh counts and 200; health reports are copied, not mutated, even when checkHealth returns the same frozen/cached report. Database error remains 503 and never calls the watcher detector. With no detector wired, both watcher fields remain absent.
4. Unauthenticated bodies contain only the existing aggregate report and aggregate watcher counts: no tenant/source names, error details, credentials, stack traces or per-tenant breakdown. Existing tenancy inputs/read scope, boundary staleness, missing-row behavior and notifier failure handling remain intact.

Governing R2 verbatim: “If no watch run has completed within a configured interval, alert. This cannot be driven by watch_state rows, because the failure mode is the absence of rows; it needs a heartbeat written on every completed run and a separate check that reads it.”
Governing R8 verbatim: “Every read is tenant-scoped, asserted by test.”
Historical health contract invariant I1 verbatim: “The response body must never contain tenant-scoped content, only aggregate counts.”

Answered gate (qa/gates/plan-approved-u4-watch-dashboard.md):

> **Answered: intent —** 2026-09-27 — `1=umesh-operator + a Vidysea colleague` · `2=(b) push alert first, page second` · `3=visible only` — Umesh in chat (AskUserQuestion, this session).
>
> **Answered: spec —** 2026-09-28 — APPROVED AS WRITTEN, all of R1-R8. Umesh in chat (AskUserQuestion, this session).
>
> **Answered: plan —** 2026-09-28 — APPROVED, all three units (U4a, U4b, U4c) and all three new files. Umesh in chat (AskUserQuestion, this session).

D-102 supplies the exact existing-file authorization for this feature; historical gate new-file permissions are not reused for application files.

## Protected test correction and original ledger corpus

ISS-368 recorded the old standing case at health.test.ts:137 asserting zero and no alerts even when one read throws. D-102 explicitly authorizes correcting this false-health expectation. The case now asserts the full `{silent:3, unreadable:1}` result, both tenant reads and exact readable-tenant alerts. Existing success/boundary/count assertions now compare the full detector object including unreadable zero. Existing assertions are retained or strengthened; no skip/xfail or lowered threshold. This is classified L, not hidden as a cosmetic test change.

ISS-368 reproduction floor: 3/3 recorded conditions addressed and inspected, not a fabricated three-attack refusal count:

- Bare catch/continue: current detector increments unreadable before continuing, verified by original mixed-tenant regression and isolated counter falsifier.
- Standing test pinning zero/empty alerts: existing test strengthened as above and actual red-before-source run proves it catches the old implementation.
- D-048 missing-row rule: actual packages/db/src/collections/watch-heartbeat.ts restatement inspected; current missing-row tests continue to produce maximal staleness/three known alerts. An unreadable read is reported unknown, not fabricated as missing rows.

## Actual maker evidence

Red before source edit: `node --test --import tsx --test-name-pattern "ISS-368|unreadable heartbeat collection" apps/api/src/routes/health.test.ts` exited 1, 4 tests/0 pass/4 fail, 4170.2066ms. Intended assertions reached: detector returned numeric 3 rather than `{silent:3, unreadable:1}`; three HTTP cases returned 200 rather than 503.

Affected green: `node --test --import tsx apps/api/src/routes/health.test.ts apps/api/src/health-probe.test.ts` exited 0, 22 tests/22 pass/0 fail/0 skipped, 1339.6326ms.

API types: `node node_modules/typescript/bin/tsc --noEmit -p apps/api/tsconfig.json` exited 0.

Mandatory full API suite, once on this identity: from apps/api, a Node spawnSync wrapper runs `node --test --import tsx "src/**/*.test.ts"` with timeout 120000ms and inherited output. Exit 0, 248 tests/248 pass/0 fail/0 skipped, 8057.0812ms. No production DB/mail or live notifier called.

Falsification floor: four isolated capability mutants completed green0 → red1 with intended AssertionError → restored0. Each copied health source into its own temporary directory, resolved Express explicitly, used 20-second child timeout, restored in parent finally/SIGINT handler and compared bytes; bound health source remained unchanged. Mutants: unreadable increment removed; unknown HTTP status branch removed; cached report copied by reference; private detail inserted into response. Counter/status batch exit 1 later due a Windows Node/libuv abort on the cache child after its intended assertion; this is recorded as an instrument failure, not product verdict. Node:test caught assertions in the repaired remaining cache/privacy instrument, whose batch exited 0. Completed counter/status proofs were not rerun. No mutation touched the bound tree or standing tests.

`git diff --check -- apps/api/src/routes/health.ts apps/api/src/routes/health.test.ts` exited 0. Current .3 `tick.mjs --policy-check` exited 0: targets=2 drift=0. No independent checker result yet.

## Frozen evidence identity

- health.ts SHA256 9B1B4E0C658826DA92FDA97C6945E319A2CF9661E279298DBFB88C7EB870AC03
- health.test.ts SHA256 0CABF50ECFA7C23D0AD930ED4470C2779A0A4E3B5B0FDC32EDE4A8AA024650DA
- health-probe.test.ts SHA256 EDD496C7224BEB5182A4B9382E10D3FE30F49BED46A194A18ACC73F64C5199AC
- testUtils.ts SHA256 A7930BC1837B86E834C0421D3AFFFF1BFFDFC468187E66100996B84AF58F36D4
- fixtures.ts SHA256 ED27B9E9E25F5E1FE4D3CF9F707399DF2CBC80D78CFBECB9F045374425E524E5
- API tsconfig SHA256 24E2338CF4EC1AFB138844F72A77921B443A08BCC926B10E490B6E1E3448C3A3
- pnpm-lock SHA256 0D1B68F769D4E60CE4E20C1C761D28B904C276394DEE896AA0D7626AEAAE7D87
- Environment: Node v24.13.1, win32 x64; injected in-memory HTTP fixtures, ephemeral loopback ports.

Audience: API-only ops monitoring; unknown vs healthy HTTP status/counts and aggregate privacy are relevant. No external UI changes/persona walk claimed. Default coding adapter; qa/adapter.json absent. No live test handles remain.

## Historical contract reconciliation and limits

qa/contracts/health-route.md C1 still says exact `{db, collections}` although D-048 already introduced watchSilent. This feature adds watchUnreadable under D-102; maker did not edit the contract or claim the historical exact shape passes. Fresh checker must reconcile the governing approved amendments before acceptance. C7 also historically lists pnpm -r typecheck; this feature ran API typecheck and full API suite, not repo-wide typechecks. Full structure/dependency gate remains independently red from existing ISS-367 and other seams; those failures are not repaired or excused here. Independent checker owns final criteria/contract interpretation and verdict.

No T-051/T-052/full webinar readiness, live workflow, production deployment or final PASS asserted. This dedicated feature alone is ready for independent checking.

Metrics: start=2026-10-05T13:59:25Z end=2026-10-05T14:04:45Z wall_min=5.33 agent_min=unavailable blocked_min=0 suite_runs=3 repeat_runs=1 mutations=5 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-05.3
Metrics window begins at the first recorded test-edit filesystem timestamp; earlier read/planning time is unavailable. Five mutations attempted, four completed; one cache instrument attempt aborted after its assertion. Repeat count records that instrument repair, not a repeated full suite.

## Cycle-0 reconciliation
Independent verdict qa/verdicts/iss-368-heartbeat-read-failure-is-not-health.md: CONTRACT_MISMATCH, cycle0. Scoped criteria4/4, falsification4/4, ledger3/3; nine workspace direct typechecks green. Historical C1/C8 unreconciled and C9 structure gate red; exact C7 pnpm launcher infrastructure unavailable. No checked-PASS or release claim; code retained pending lawful contract/gate reconciliation. No live checker handles.
