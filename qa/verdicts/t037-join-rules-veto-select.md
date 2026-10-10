# Verdict — t037-join-rules-veto-select

VERDICT: PASS
Cycle checked: 0
Scope: maker commit 60b57d2 (lane/t037veto, based on 7f352eb). Security class, uncapped. Contract `qa/contracts/t037-join-rules-veto-select.md`. PASS is for the UNWIRED library; three findings are recorded as blocking preconditions for the wiring unit (W1-W3 in the contract).

## Commands and results
- `git show --stat 60b57d2`: 3 files, all new (`join-rules-select.ts` 67, `join-rules-select.test.ts` 141, manifest 59); no existing file edited. PASS.
- `node --test --import tsx src/calendar/join-rules-select.test.ts src/calendar/auto-join.test.ts src/calendar/join-rules.test.ts` (timeout 150) -> `tests 68 / pass 68 / fail 0`.
- `tsc --noEmit -p tsconfig.json` in packages/meeting-bot (timeout 180) -> exit 0, no output.
- `node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (111 dir(s) within budget)`.
- `node scripts/lint-loc.mjs` -> FAIL on 3 PRE-EXISTING files (speakers-llm.ts 313, sb_join.py 1142, run-watch.mjs 556); neither new file is listed (67 and 141 lines).

## Safety property (own generator, seeded LCG; probe in scratchpad, deleted)
Inputs: 0-9 scheduled items from a small id pool (same object twice, distinct copies of the same event, bad/empty senders, whitespace/empty URLs), 0-4 skipped items, rules in {undefined, null, {}, [], "str", version 2, malformed rule (dup id, bad effect, bad domain/platform, empty matcher), valid, valid EMPTY}, state in {undefined, null, malformed, valid with random opt-outs/approvals}, context undefined or present, evaluator in {real, throws, undefined, null, string, Promise, unknown action, {}, partial}; inputs deep-frozen and JSON-snapshotted.
Checked per case: no throw; no mutation; identity for undefined rules; scheduled is a subsequence by object identity; skipped prefix is the same objects; skipped suffix = removed items (multiset by sessionKey/source/sourceId/title), each with a string reason.
Result: seed 1: 25,000 cases, 0 violations, 66,682 removals; seed 7: 25,000 / 0 / 65,969; seed 424242: 25,000 / 0 / 66,307. Total 75,000 cases, 0 violations, 0 throws. (A first run reported "violations" that were my own attribution bug for same-object duplicates; fixed to a multiset comparison and rerun clean.)

## Complete (decision, reason) table from `evaluateJoinRules` (read exhaustively, lines 123-164)
| Engine result | Produced when | applyJoinRules |
|---|---|---|
| skip / meeting-opt-out | opt-out list contains event.id (also on invalid data) | REMOVE |
| skip / deny-rule | matching deny rule | REMOVE |
| skip / cancelled | event.cancelled === true | REMOVE in code, UNREACHABLE: `toEvent` never passes `cancelled`, selector already skips cancelled |
| skip / no-meeting-url | url missing/blank | REMOVE; reachable only for a whitespace-only URL (selector tests `!item.meetingUrl`; probe `"   "` -> removed, detail "no-meeting-url") |
| needs-approval / invalid-rule-set | validate throws | REMOVE (see ruling) |
| needs-approval / sender-unverifiable | no parseable sender | KEEP |
| join / allow-rule, approved-sender, approved-domain | | KEEP (never adds) |
| needs-approval / no-matching-rule | default-deny | KEEP |

Unhandled pairs: none. Default for any other result (non-"skip" action, unknown string, `{}`, Promise) is KEEP; evaluator throw or `undefined` -> REMOVE (fail closed). Every `skip` removes whatever its reason.
(a) sender-unverifiable KEEP: confirmed a no-change relative to today (the every-webinar selector never ran the trust check; an item without sender stays scheduled). Deny rules still apply first.

## Rulings
- **Invalid rule set (contract owner):** keep fail-closed in the library. A corrupt deny list failing open would join meetings the tenant meant to refuse, and the outage is loud (visible detail "rules could not be evaluated (failing closed)") while fail-open is silent. It is not an "explicit refusal", so it departs from the strict charter; it is acceptable for an unwired, opt-in layer only on condition W3 (Approver confirmation, validation message logged, default-off flag). Rules and state already pass the persisting validators, so an invalid set means corruption or a hand edit. Probe: undefined rules, valid-empty rules, undefined state, valid state -> same reference; null, {}, [], "str", version 2, null state, {} state -> all items removed.
- **Skip-reason label:** `untrusted-sender` is untrue for an opt-out or deny. Consumers grepped: `schedule-tick.ts:216 describeSkip` (prints reason + detail), `auto-record-policy.ts:300 projectWebinarSelection` (passes skipped through to CLI output), `apps/api/src/routes/brain.ts:100` (separate operation-reason list, which does not contain untrusted-sender). No consumer branches on it today (no alert, metric, watch page or approve-sender action reads it), so the library PASSES; fix = new SkipReason values before wiring (ISS-T037VETO-001, W1).
- **Opt-out matching:** `applyJoinRules` does no matching of its own: it calls `evaluateJoinRules` with `sourceId`, then `sessionKey`, as the event id; the engine does exact, case-sensitive `optedOutEventIds.includes(event.id)`. The API route stores `eventId` verbatim (non-empty string <= 1024); the store validates and appends it. Id spaces: sourceId is the raw calendar/gmail id; sessionKey is `cal:<id>`, `gmail:<id>` or `webinar-<hash>`; collisions are unrealistic (no ':' in provider ids) and could only narrow. MISS found: in every-webinar mode calendar and gmail items of one meeting collapse to one sessionKey and one surviving `sourceId`; an opt-out recorded for the other id does not match (probe: opt-out `calX`, `g1` still scheduled) -> ISS-T037VETO-002 (high, W2). Recurring series id vs instance id and casing: exact match only (W6).
- **Tenancy:** items have no tenant field (`sessionKey, source, sourceId, title, startTime, endTime, meetingUrl, sender`); another tenant's item would be evaluated against the passed rules (can only remove). Wiring must pass single-tenant selections (W4).

## Mutations (per-mutation byte backup, 90 s timeout, restore + `git hash-object` check)
| # | Mutation | Result |
|---|---|---|
| M1 | needs-approval (no-matching-rule) treated as remove | KILLED (5 failures) |
| M2 | undefined rules returns a fresh copy | KILLED (2) |
| M3 | invalid-rule-set swallowed as keep | KILLED (2) |
| M4 | sessionKey candidate dropped | KILLED (1) |
| M5 | evaluator exception propagates | KILLED (1) |
| M6 | opt-out removal dropped | KILLED (3) |

Final: `git hash-object join-rules-select.ts` = `bffebeb92411d194d27b1b0749bcdfeb51da9f80` = `git rev-parse HEAD:<file>`. Harness note: the in-subshell trap used a relative path after `cd` and could not restore; the unconditional restore after each subshell did, and the hash check confirmed it after every mutation.

ISSUES-WRITTEN: ISS-T037VETO-001 (medium), ISS-T037VETO-002 (high), ISS-T037VETO-003 (medium) in qa/issues.t037veto.jsonl; all are wiring-unit preconditions, none makes the unwired library violate the subset property.

EXPLANATION: The library does what it claims: rules can only remove, anything that is not an explicit `skip` is kept, and 75,000 hostile cases found no addition, duplication, mutation or throw. The real gaps are outside what it can know: the id of the surviving webinar item (W2, high because a missed opt-out is an unwanted unattended join) and the label and policy choices (W1, W3). Low notes, not filed: a Promise or non-object from the evaluator is kept silently (seam is test-only); the unevaluable detail lacks the validation message; the `cancelled` row is dead code; `lint-loc` already fails on three untouched files.
