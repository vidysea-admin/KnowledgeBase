# Checker — t036-alias-label-intake
Date: 2026-10-05
Bound root: D:\KnowledgeBase
Cycle checked: 1
Scope: Amendment 2 additive acquisition slice only; full product criteria remain required.

VERDICT: PASS
SCOREBOARD: 4/4 scoped criteria met, 2/2 scoped invariants hold
FAILURES (if any): none
LIVE-BROWSER: not-applicable (apps/api/src/gws-gmail.ts acquisition selectors, injected tests and runbook; no UI change)
ISSUES-WRITTEN: none
EXPLANATION: Literal aliases extend broad discovery and independent label scopes union before fetching; incomplete acquisition rejects the entire scan. Existing work-database/owner/tenant and registration-only/rejected/non-webinar controls remain intact. This is code-slice verification only: full original C1–C9, live configured Gmail/Mongo/browser evidence, Workspace alias/forwarding, organizer discovery and registration, T-036 and R1 are not certified complete.

## Independently reproduced evidence
- `node --test --import tsx apps/api/src/gws-gmail.test.ts`: exit 0, 25 tests / 25 pass / 0 fail.
- `node node_modules/typescript/bin/tsc --noEmit -p apps/api/tsconfig.json`: exit 0, no diagnostics.
- `node scripts/lint-loc.mjs`: exit 1, four existing violations (speakers-llm.ts 313, sb_join.py 701, obs-windows.ts 359, run-watch.mjs 558); no gws-gmail.ts violation. Global clean lint is not claimed.
- `node --test --import tsx apps/api/src/routes/meeting-candidates.test.ts packages/meeting-bot/src/calendar/auto-join.test.ts`: exit 0, 40 tests / 40 pass / 0 fail, including factory owner/work DB guards, foreign/production DB rejection, registration-only and explicitly rejected scheduling rejection.
- Checker-authored inline `node --import tsx --input-type=module` probe (no source file added): PASS. Three scopes independently advance the same page token; four union IDs fetched once. Each of broad/Label_A/Label_B repeating-token failure aborts before message fetch. Six extra invalid configurations invoke no provider (pipe, environment expansion, trailing separator, 21 entries, tab, 129-character label).
- Read existing `createMeetingCandidatesDeps` in store.ts and meeting-candidates route work binding; source owner checked before scan and actual work DB must match named non-production DB. Read auto-join registration/non-webinar barriers and verify tests above.
- Source diff leaves extraction/parser helpers and downstream stores/routes unchanged. Environment default values read at call time from named variables; explicit injection used for provider isolation.

No real provider request or external/data write performed. No code or maker manifest edited by checker.
Persistence limitation: verdict/contract saved to disk; narrow Git commit unavailable under this session's known sandbox Git write denial. No repeated escalation attempted.
