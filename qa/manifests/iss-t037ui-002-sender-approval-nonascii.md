# iss-t037ui-002-sender-approval-nonascii

**Handshake status:** checked-PASS
Status: checked-PASS
Fix cycle: 0
Tier: 4 (open medium ledger issue ISS-T037UI-002). Lane: lane/webhigh (base 613028be). Class: data write (approval POST value). No lane ledger file needed (no new issues filed).

## Why this issue
Survey of the ledger union (qa/issues.jsonl + qa/issues.*.jsonl): no open high/critical row is confined to apps/web. Rejected: ISS-274 (Approver decision, goal-vs-contract conflict), ISS-373/374/REGSAFE-001 (sb_join.py / Python, real Chrome), ISS-281 (skipped per brief), the rest are enforcement-hook, speaker, scheduler or API rows. Most severe qualifying medium: ISS-T037UI-002 (security-flavoured: look-alike approval). Not fixed at HEAD (checked joinRulesModel.ts: `checkPendingValue('sender')` only calls normalizeEmail), no PASS verdict closes it, needs no Approver decision (row fix_direction says "refuse, or warn"; refuse chosen), no live service.

## Scope
apps/web only: `src/pages/join-rules/joinRulesModel.ts` (checkPendingValue), tests `joinRulesModel.test.ts`, `JoinRulesPage.test.tsx`. No api/contract/DECISIONS change. Server (normalizeEmail in api) is untouched: still accepts non-ASCII; this is a client-side guard only.

## Fix
`checkPendingValue("sender", raw)` now refuses any character outside printable ASCII (`/[^\x21-\x7e]/`) before the email check, with a message naming the reason. Invisible (U+200B, U+2060), bidi (U+202E), NBSP/BOM inside the value, control chars, and look-alikes (Cyrillic, accented) can no longer reach the confirmation dialog or the POST. Plain ASCII (incl. `.+_-`) confirms and posts unchanged. Domain and opt-out checks unchanged. Choice note: refusal rather than an escaped U+XXXX display (the row allowed either).

## Reproductions (ISS-T037UI-002, recorded in qa/issues.t037ui.jsonl)
- Probe `'  Foo​@Example.COM '` through the real ApprovalsPanel: before = dialog + POST {kind:sender,value:'Foo​@Example.COM'}; now refused, no dialog, no POST (JoinRulesPage.test.tsx). 1/1.
- fix_direction measures U+200B, U+202E, Cyrillic a (U+0430) in local part: 3/3 refused (model test + panel test); plain ASCII still confirms and posts unchanged: 2/2.
- Extra authored cases (not substituting): NBSP, BOM, U+2060, e-acute, BEL: 5/5 refused.
Total model-level: 10/10 attacks refused.

## Evidence (apps/web, node off PATH)
- `node node_modules/vitest/vitest.mjs run src/pages/join-rules` -> Test Files 7 passed, Tests 86 passed (before the mutation work).
- Mutations (harness mut-webhigh.tmp.mjs inside the worktree, deleted before commit; per-mutation byte backup restored in `finally`; 240 s timeout), on joinRulesModel.ts against joinRulesModel.test.ts + JoinRulesPage.test.tsx:
  M1 check removed: KILLED (2 failed); M2 allow control chars [^\x00-\x7e]: KILLED (1 failed); M3 only U+200B: KILLED (2 failed); M4 check domain part only: KILLED (2 failed); M5 only U+2000-206F: KILLED (2 failed). 5/5 killed, 0 survived.
  After: `git hash-object joinRulesModel.ts` = cdd528a81f5d995b8e7ac5e9fbf3692184324052 == the working fix blob; file status shows only the intended diff.
- Full apps/web `vitest run`: Test Files 66 passed | 1 failed (67); Tests 711 passed | 1 failed (712), 190 s. The one failure was enforcedVariant.test.tsx "Calendar opt-out under the enforced flag" with `Test timed out in 5000ms` (CPU contention from the shared machine); rerun alone: 1 file, 2/2 passed (it took 1.6 s in the earlier join-rules run). Unrelated to the change (opt-out path, no sender check). Not repeated 15x. `tsc --noEmit -p tsconfig.json` (apps/web): exit 0, no output.

## NOT done
- No browser, no live API. Server-side normalizeEmail still accepts non-ASCII local parts (ISS-T037UI-002 mentions "client and server"; the fix_direction is client-only). Left for an api unit if the Approver wants server enforcement.
- Rule-editor sender matcher (`validateRuleSetClient` email) is not changed (not in the row's fix_direction).
- Ledger row status left `open` for the checker to verify.
