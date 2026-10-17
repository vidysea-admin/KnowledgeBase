# Checker packet — t037-last-valid, cycle 0

Repository: C:\Users\product\Desktop\KnowledgeBase
Maker skill: skills/maker/SKILL.md. Checker skill: skills/checker/SKILL.md.
Manifest: qa/manifests/t037-last-valid.md. Verdict: qa/verdicts/t037-last-valid.md.
Contract: checker-owned qa/contracts/t037-last-valid.md; relevant existing qa/contracts/t037-join-rules-veto-select.md W3/W4 and tenant verification. User's approved one-hour fallback supersedes legacy-only policy for this new explicit mode; default remains OFF.

## Behavior and boundaries

`parseJoinRulesEnforce` adds only exact `last-valid`. `enforceJoinRules` dispatches to boundedRules, requiring valid own tenant and explicitly verified equal key tenant before reads. `readRules` uses new non-permissive primary loader; bad tenant/tenant mismatch cannot fall back. On successful full primary validation, save timestamped entire rules/state snapshot unless readOnly. On failure, load previously valid snapshot only while 0 <= age < 3600000 ms. Use applyJoinRules unchanged; new mode never restores unevaluable items.

Snapshot helper normalizes both ruleSet and state with existing validators; SHA256 covers tenantId, validatedAt and normalized content. It refuses nonregular/oversized files, malformed envelopes, wrong tenant, future/expired clocks, invalid content and hash mismatch. Primary loads parse a single descriptor-captured byte buffer; deletion/recreation cannot synthesize empty rules. Snapshot writes hold the existing authoritative tenant lock, reread the current primary under it and refuse stale content before exclusive 0600 temp/fsync/rename; primary rules file is never written. Fallback reads never refresh snapshot time.

Freshness uses persisted wall-clock milliseconds across restarts. A clock earlier than validation refuses; a smaller backwards clock jump still above validation can extend elapsed real lifetime. Reliable synchronized system time is an operational prerequisite; this unit does not claim monotonic elapsed-hour enforcement through arbitrary clock manipulation.

`onDegraded` receives only fixed event reason/validated tenant/timestamps, never rule contents/paths/URLs. Sink exceptions log a fixed message and cannot widen selection. readOnly suppresses writes and callbacks. `onHealthy` resets an outage only after successful current-primary evaluation and snapshot persistence. Evaluator refusals alert `evaluation-failed`; observed primary changes during snapshot lock refuse stale selections and alert `primary-changed`. Callback exists but real email/dashboard wiring is excluded; separately owned by alert/integrator lanes.

## Consumers and additive glue

Existing immediate consumer: packages/meeting-bot/src/calendar/schedule-tick.ts calls enforceJoinRules with tenant/key/state/io/log and consumes result.toSchedule. It already treats any parsed non-off mode as requiring a fresh key-tenant load. Integrator must forward `{now:()=>Date.parse(now),readOnly:dryRun,onDegraded:<sink>}`; no maker-owned edit to that file.

Public additive types: JoinRulesEnforceConfig now/readOnly/onDegraded/onHealthy; JoinRulesDegradation `{tenantId?:string,reason:string,usingSnapshot:boolean,snapshotValidatedAt?:number,snapshotExpiresAt?:number}`. No wire/schema/dependency changes. `onHealthy?:()=>Promise<unknown>|unknown` is paired with alert lane's clearRulesDegraded; `onDegraded` is paired with raiseRulesDegraded.

## Required focused commands

Direct Node 24 and TypeScript available; pnpm absent from PATH. Allocator runtime_inventory confirmed tsx/esbuild subprocess fails EPERM. Use `--import ./.cache/coordination/safe-test-runtime/register.mjs` from root (actual TypeScript transpilation without subprocess), `--test-isolation=none --test-concurrency=1 --test-timeout=30000`; bounded outer command120s. No browser/provider/database needed. Required suites: new last-valid helper/enforcer tests, existing join-rules-enforce/preconditions and key-tenant tests, plus schedule-tick consumer regressions. Run contracts/verify_contracts.py. Typecheck meeting-bot only under shared one-build slot.

Issue floors: qa/issues.t037wire.jsonl ISS-T037WIRE-001/-002, existing preconditions/key-tenant tests; ISS-T037W1-001 recorded id-only scenario remains open (unchanged intentional disclosure), hinted scenario remains refused in new test. Do not claim ISS-376 fixed.

## Final source SHA256 pins

- join-rules-enforce.ts: DE752442003B219C088E082978AD1561CCAA679A8324D8E4CCF28545634E8FD7
- join-rules-last-valid.ts: 980F31D77263DAC2F9397BCCB4161D54C6F0234D6453671E500EF099CC42463C
- join-rules-last-valid.test.ts: 93DADC65C7CC629D1F0F88173E13A41AD4611E3B0374CB191E1A45543DD020F6
- join-rules-last-valid-enforce.test.ts: 639B677DA24A7D1185B56349C23B735F8BB272A2BEBEDF22159694AD2981DF23

## Exact maker evidence

From root:

`node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register.mjs packages/meeting-bot/src/calendar/join-rules/join-rules-last-valid.test.ts packages/meeting-bot/src/calendar/join-rules/join-rules-last-valid-enforce.test.ts`

Final result: tests14/pass14/fail0, exit0, duration_ms1560.2721, wall1.98s.

`node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register.mjs packages/meeting-bot/src/calendar/join-rules/join-rules-enforce.test.ts packages/meeting-bot/src/calendar/join-rules/join-rules-enforce-preconditions.test.ts packages/meeting-bot/src/calendar/join-rules-wiring/key-tenant.test.ts`

Result: tests38/pass38/fail0, exit0, duration_ms22407.5088. Attributed earlier same-session run before final last-valid-only stale-primary guard; legacy branches unchanged. Output: `D-015 ISS-T037W1-001 via real tick: id-only (verbatim) 0/2 refused; with url hint 2/2; with sessionKey hint 2/2`.

`node node_modules/typescript/bin/tsc --noEmit -p packages/meeting-bot/tsconfig.json`: final exit0/no output, wall6.40s. Initial type errors were corrected before final fixture/typecheck runs; no checker cycle reset needed because candidate was building.

`python contracts/verify_contracts.py`: exit0, wall0.43s; `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`. This is not pipeline acceptance.

Ready-for-check cycle0. Actual changed files include all four source/test pins above, new maker manifest/packet; no untracked source omitted. Independent checker owns separate contract/probe/verdict. No mutations beyond test temp files, no provider/browser/DB activity, no commits.
