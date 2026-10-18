# veto003 (ISS-T037VETO-003, ruling 2)
Status: checked-PASS
Fix cycle: 1
Base: 9e55b642
Changed: packages/meeting-bot/src/calendar/join-rules/join-rules-select.ts, join-rules-enforce.ts, join-rules-veto003.test.ts
Behaviour: fail-closed and D-166 last-valid (already wired, join-rules-last-valid*.ts) untouched. applyJoinRules context gains optional `log`; on invalid rule set/state it logs the JoinRuleSetValidationError message once per call (per tick). enforce passes log, and now raises onDegraded("evaluation-failed") in fail-closed/fail-open too (last-valid already did). Flag default OFF asserted.
Contract: t037-last-valid clauses 5-6. Corpus ISS-T037VETO-003: 7/7 replayed (5 rule sets, 2 states).
Evidence: node --test veto003 7/7; select 11/11; enforce 18/18; last-valid-enforce 9/9; schedule-tick-rules-integration 4/4; tsc clean.
