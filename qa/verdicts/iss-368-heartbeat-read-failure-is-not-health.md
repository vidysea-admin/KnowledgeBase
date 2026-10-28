# ISS-368 acceptance — independent coordinator

Cycle checked: 0
Policy-Version: proportional-verification/2026-10-05.3
VERDICT: CONTRACT_MISMATCH

CHECK-PLAN: Tier L independently derived from changing a protected standing expectation, with unauthenticated aggregate privacy requiring security review. Scope is health.ts and health.test.ts, their affected health-probe tests, API full suite and explicit historical health-contract gates. C1 detector mixed-tenants -> standing regression + independent counter falsification; C2 HTTP unknown/fresh/mixed/known-stale -> actual loopback HTTP + status falsification; C3 recovery/report immutability/db-error/no-detector -> actual loopback HTTP + cached-reference falsification; C4 privacy/tenancy/boundaries/notifier -> exact aggregate body checks, scoped read/alert assertions, static review + privacy falsification. API-only ops flow; browser/persona walks not applicable. Budget L45 wall/135 agent minutes. Historical contract C1/C7/C8/C9 assessed without editing or weakening it.

SERIAL: Shared workspace tests and gate runs were executed serially. Fresh senior-software-engineer instrument /root/iss368_acceptance/senior_iss368 completed static read-only review; no scoped correctness or privacy findings. Two earlier spawn attempts returned agent thread limit reached; after capacity changed the named instrument ran. Its optional multiple-unreadable-tenant test suggestion demonstrates no defect and is not a mandatory criterion.

SCOREBOARD: Dedicated D-102 feature criteria 4/4 independently evidenced; criterion falsification floor 4/4 green/red/restored. ISS-368 ledger reproduction conditions inspected and addressed 3/3. Health contract I1/I2/I3/I4 remain preserved in this diff. Historical C1 and C8 have unreconciled wording against explicitly approved D-048/D-102; C7 execution equivalence green (nine workspace typecheck scripts), exact pnpm launcher not runnable without attempted dependency reinstall; C9 FAIL. Therefore no feature PASS or release certification.

CHECKED-STATE: HEAD 614d78b8966428296f394b8bf3e6c547d41beca5 plus existing dirty tree; source SHA256 9B1B4E0C658826DA92FDA97C6945E319A2CF9661E279298DBFB88C7EB870AC03; test SHA256 0CABF50ECFA7C23D0AD930ED4470C2779A0A4E3B5B0FDC32EDE4A8AA024650DA. Both were rehashed after all checks and unchanged. Current checker hash126F87DE7882EECEB45ADE773C1D47B8BE5EB93B691CD4F90F5ADADE96231949 and maker hash67DB6B6B125DA3AF317503482164F86D7026D02BA77A39E06AAE1A8A1152542E match readiness; node tick.mjs --policy-check: targets=2 drift=0. No judged source, standing test, manifest, contract or production state changed.

## Independent commands and results

- Bounded spawnSync(120000ms): node --test --import tsx apps/api/src/routes/health.test.ts apps/api/src/health-probe.test.ts: exit0; 22 tests,22pass,0fail,0skip,1401.1803ms.
- node node_modules/typescript/bin/tsc --noEmit -p apps/api/tsconfig.json: exit0.
- Bounded spawnSync(120000ms), cwd apps/api: node --test --import tsx "src/**/*.test.ts": exit0;248tests,248pass,0fail,0skip,5028.1156ms. Full API suite ran once.
- Direct offline equivalent to the declared workspace typecheck scripts: node node_modules/typescript/bin/tsc --noEmit -p <workspace>/tsconfig.json, one 30000ms subprocess per package. All nine declared scripts exit0: packages/ai,ask,core,db,index,ingest,meeting-bot; apps/api,web. workers/transcribe has no typecheck script. No source submodule was included, consistent with pnpm-workspace.yaml.
- pnpm -r typecheck and pnpm lint:structure launcher attempts: infrastructure exit1 ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY from pnpm automatic dependency-install check. No successful install, no lockfile change; further pnpm retry stopped. The same typecheck launcher failure occurred with runtime config arguments; an attempted local pnpm.cjs path did not exist. Neither failure is counted as a product falsification.
- node scripts/lint-loc.mjs --all, 120000ms timeout: exit1. All10stages executed; 5failed: loc,dirsize,root,tracker,dependencies. 8dependency violations: three calendar cycles and five existing apps->meeting-bot imports. LOC5violations, API directory32files/budget31, root17loosefiles/budget15, trackerG4six ambiguous refs. Those are current red gates, not excused by being outside the two-file diff. lint-tests18/18pass.
- python contracts/verify_contracts.py: exit0, no frozen contracts yet, PASS by vacuity.
- git diff --check -- apps/api/src/routes/health.ts apps/api/src/routes/health.test.ts: exit0.

## Criteria and isolated falsification

Each falsification was its own isolated source copy; transpiled with local TypeScript for ESM loading, Express resolved to its installed file URL, child timeout20000ms. The parent uses finally and SIGINT/SIGTERM restore handlers; restores original bytes and verifies Buffer.compare===0 before restored execution. Bound source rehashed unchanged. One initial Express-resolution setup error was repaired before any mutant and is not evidence of red. Independent test harness is retained in Windows TEMP for reproducibility, not shipped application code.

| Criterion | Green evidence | Named red control | Restored |
|---|---|---|---|
|1 failed-read count/continue/no fabricated alert|mixed broken+readable missing-row detector: silent3,unreadable1; both reads;3alerts only readable|unreadable+=0 instead of1: intended AssertionError unreadable0!=1|exit0;bytesidentical|
|2 unknown/fresh HTTP distinction|standing actual HTTP unknown503/fresh200/mixed503;known stale200 plus independent mixed503|remove unreadable HTTP503 branch: intended AssertionError200!=503|exit0;bytesidentical|
|3 recovery/copy/db-error/no detector|standing frozen cached report recovery503->200,zero counts;db-error no watcher reads;no-detector fields absent;independent frozen report HTTP|replace spread copy with cached reference: actual route attempted mutation, HTTP500; intended assertion500!=503 (not import/setupfailure)|exit0;bytesidentical|
|4 aggregate privacy/unchanged tenant boundaries|exact body keys;no tenant/source/error details; scoped reads/alerts;staleness/boundary/notifier standing tests|inject tenantId in body: intended exactkeys AssertionError additional tenantId|exit0;bytesidentical|

## Ledger floor and contract reconciliation

ISS-368 original three reproductions were reread from qa/issues.jsonl and rerun using Windows equivalents:
1. Get-Content health.ts | Select-Object -Skip99 -First9 is literal sed100,108 equivalent; historical line numbers moved, so full file and current catch at144-147 were additionally read. Bare catch now increments unreadable before continue, demonstrated by C1.
2. Get-Content health.test.ts | Select-Object -Skip133 -First27 is literal sed134,160 equivalent; current standing case expects silent3,unreadable1 and readable-only3alerts; own affected suite executed it.
3. Read watch-heartbeat.ts header and missing-row restatement at34-37: null is not healthy. Missing-row/empty-collection standing cases pass with2/3silence counts respectively. Unknown reads never fabricate absent rows. 3/3conditions inspected; this is not a made-up three-attack corpus.

D-048 explicitly authorized the health-route heartbeat detector and approved its placement. D-102 explicitly authorizes watchUnreadable and503unknown, retaining known-stale200. These make the dedicated four criteria unambiguous. However qa/contracts/health-route.md C1 still states exact {db,collections}, nothing else, even though D-048 already added watchSilent; C8 demands hardcoded200 redden exactly the historic db-unhealthy test and no other, whereas D-102 now correctly requires unreadable503tests too. No amendment is recorded there reconciling those statements. A checker cannot silently rewrite or weaken them during pending acceptance. C9 explicitly requires the whole structure gate exit0; current output is red. C7 exact pnpm command additionally has an environment launcher failure, although every actual declared workspace typecheck script independently passes. These disagreements hold acceptance; they do not identify an ISS-368 code defect or grant unrelated repair scope.

FAILURES: No demonstrated defect in the four D-102 criteria. Binding historical contract reconciliation incomplete (C1/C8), current C9 structure gate fails; exact C7 pnpm launcher cannot complete offline. No historical gate is waived.
REMAINING: Authoritative contract reconciliation away from this pending verdict, and restoration of C9 green or explicit authorized scope resolution. C7 exact launcher environment resolution if its wording remains literal. No further unchanged feature tests/mutants needed on this evidence identity. No contract was created or softened.
LIVE-BROWSER: not-applicable, API-only monitoring; actual HTTP used isolated local Express servers. No production DB, notifier transport or outbound alert used.
LIVE-HANDLES: none; sessions79858,77216,99681,48180 completed; all owned loopback servers closed; senior instrument completed.
ISSUES-WRITTEN: none; current broad gate failures already disclosed; no invented new code finding. Maker/goal/ledger remain unchanged.
Metrics: start=2026-10-05T14:09:26Z end=2026-10-05T14:13:10Z wall_min=3.74 agent_min=unavailable blocked_min=0 suite_runs=3 repeat_runs=0 mutations=4 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-05.3
Metrics window begins at earliest persisted own scratch timestamp; prior reads and initial test runs predate this timestamp and exact earlier wall duration is unavailable. It is not a claim that the complete check consumed only the measured window. suite_runs counts affected,API-full,structure-internal test batches; initial setup failure excluded from mutation count.