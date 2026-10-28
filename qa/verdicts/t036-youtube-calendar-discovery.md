# t036-youtube-calendar-discovery

VERDICT: PASS
Cycle checked: 0
Scope: opt-in Calendar YouTube watch evidence only; not whole T-036, capture, deployment, live provider or R1 acceptance.

## Timing and provenance

- Checker launch / scope review start: 2026-10-14 09:11:04 UTC. Review/hash validation complete by 09:12:38; exact review-end instant unknown.
- CPU slot requested between 09:11:04 and 09:11:49; exact dispatch timestamp unknown. Slot GO received before command checkpoint 09:13:55. This slot wait required exceeding the 120–180-second target; necessary checks were retained.
- Commands checkpoint start 09:13:55; all independent checks complete by 09:14:07. Slot released 09:14:07.
- Draft began after 09:14:07; exact draft-start timestamp unknown. Final four hashes reconfirmed 09:14:44. Persistence-start checkpoint 09:15:00. Completion and elapsed measured below.
- No permission escalation requested or required. No mutation, browser, provider, real messages, subprocess test workers or database operation.

## Acceptance and independent findings

Read maker manifest ready-for-check cycle 0, full changed logic/untracked new test, actual route, owner-bound deps and both immediate scheduler selectors. Relevant floors: calendar-free-text-links clauses 1–2, 6, 10–12; calendar-auto-join clauses 1–3; literal acquisition evidence from gmail-meeting-candidates-approval; prior t036next scope and ISS-T036NEXT-001.

Independent actual-mapper checks prove omitted/default/false/1/TRUE/`true ` settings preserve disabled output; exact environment `true` enables distinct canonical watch evidence. Existing conference URL/provenance survives both watch evidence and watch ambiguity. Added positive/cancelled watch-only rows do not alter trusted scheduling; watch-only input produces zero joins in both richer-selector modes and the simple selector. Native acquisition and authenticated HTTP discovery retain watch evidence; normal projection hides watch-only rows. No watch URL becomes meetingUrl, approval or capture.

ISS-T036NEXT-001: exact recorded cases `https://evilyoutube.com/live/abcDEF12345`, `https://evilyoutu.be/abcDEF12345`, `https://notyoutu.be/abcDEF12345` replayed through actual mapping: **3/3 refused**. New standing hostile-host assertions exercise both previously surviving suffix-host classes. No recorded case omitted. Ledger closure belongs to coordinator, not this verdict-only checker.

## Commands and evidence

From repository root, approved synchronous local TS loader; exact output retained in tool receipts:

1. `node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register.mjs apps/api/src/gws/youtube-calendar.test.ts apps/api/src/join-rules/youtube-live-extract.test.ts apps/api/src/routes/calendar.test.ts` — exit 0; 26/26 passed, 0 failed/skipped; wall 3.762754s, Node 3347.813ms; receipt 670736.
2. `node --import ./.cache/coordination/safe-test-runtime/register.mjs .cache/coordination/discovery-checker.mjs` — exit 0; independent boundary checks 13/13; ISS-T036NEXT-001 3/3 refused; wall 1.285774s; receipt 4af370. Checker artifact retained.
3. `python contracts/verify_contracts.py` — exit 0, wall .382810s; `no frozen contracts yet (research phase) -- PASS by vacuity`; receipt 3da542.

Attributed reuse: notes-maker packet `qa/packets/t040-grounded-content-consumer.md`, raw receipt c62566: `node node_modules/typescript/bin/tsc --noEmit -p apps/api/tsconfig.json`, exit 0/no output, wall 6.7967113s after unrelated reader-test type correction; exact UTC unknown. This supersedes maker's earlier unrelated API typecheck failure. Maker's unrelated lint-loc/dirsize failures remain broader coordinator gates, not claimed green. No broad suite rerun.

## Checked final SHA256

- apps/api/src/gws/gws-calendar.ts: B5866AB4779F1CBE6E88AFA78C5FF6B027275E66932BAE678C052395DD507537
- apps/api/src/routes/calendar.ts: 944C49E42590A1E27E624F8F497EF46BB44ACB66E2614E5A62F33AB65DD6DC16
- apps/api/src/join-rules/youtube-live-extract.test.ts: 6FFCDC1CE1A5EB0296F37CD5B3B91C99C0C2AD8E1CCB81A05D1D62F09ED7E514
- apps/api/src/gws/youtube-calendar.test.ts: 51961D7B17B49A2FA34BA10DD22F82CCF9EE7749F9560C6E5FDAEF9CFD6C4D83

ISSUES-WRITTEN: none

EXPLANATION: Complete scoped check. Synthetic provider fixtures establish source behavior only. Real invite shapes, complete configured Gmail acquisition, scheduler deployment, YouTube intake/capture and whole release acceptance remain unverified. No contract lowered/amended or product file changed by checker.

Persistence completion checkpoint: 2026-10-14 09:15:53.061 UTC; launch-to-verdict 289.062 seconds. File readback follows immediately; subsecond confirmation interval not separately measured.
