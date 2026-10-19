# w27-alerts

Status: ready-for-check
Fix cycle: 0
Base: 4264418c
Lane: lane/w27-alerts

## Changed paths
- packages/meeting-bot/src/alert-who-command.ts
- packages/meeting-bot/src/calendar/alerts/alert-text.ts
- packages/meeting-bot/src/calendar/schedule-tick.ts
- packages/meeting-bot/src/calendar/state/state-tenant-tag.ts
- packages/meeting-bot/src/calendar/alerts/alert-text-typos.test.ts (new)
- packages/meeting-bot/src/calendar/alerts/alert-who-printed-fields.test.ts (new)
- packages/meeting-bot/src/calendar/state/state-key-tenant-binding.test.ts (new)

## D-015 counts (recorded reproductions, verbatim)
- ISS-R1ALERTS-010: 12/12 (typo-tolerant secret stems)
- ISS-ALERTID-008: all recorded probes pass (printed-field allowlist)
- ISS-ALERTTENANT-002: 20/20 refused with the opt-in flag ON. The flag is OFF by default, so the row stays OPEN.

## Mutation results (D-020, per-mutation backup, runner w27-alerts-tools/run-muts.cjs)
15 mutants, 15 killed, 0 survived: T1 T2 T3, A1 A1b A2 A3 A4 A5, R1-R6.
Working tree checked after the run: no mutant left (diff shows only intended edits).

## Evidence
- tsc --noEmit -p tsconfig.json (packages/meeting-bot): exit 0
- 3 new test files: tests 38, pass 37, fail 0, skipped 1
- alert-text, corpus, state-tenant-tag, schedule-tick, schedule-tick-rules-integration: tests 57, pass 57
- join-rules-wiring key-tenant and key-tenant-hints: tests 13, pass 13
- join-rules/*.test.ts: tests 188, pass 188
- node scripts/lint-loc.mjs --all: OK (10 stages, 0 failed); lint-dirsize OK (printed-fields test placed in calendar/alerts to keep src at 30 files)

## Checker should run
tsc, the three new tests, the suites above, lint-loc --all, and re-run mutants via the runner.