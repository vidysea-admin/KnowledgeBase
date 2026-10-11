# Verdict: t037-optout-meeting-identity-store

VERDICT: PASS (at stated scope: library, store and API; NOT end to end, see W7)
Cycle checked: 0
Commit checked: 821f5f6 (lane/t037opt, from 1414d79)
Checker: independent, node 24, targeted tests only, probes run from the session scratchpad (not committed).

## D-015: ISS-T037W1-001 against its own recorded reproduction
- The verbatim recorded state (`optedOutEventIds:["calX"]` alone, g1 alone in the selection) STILL lets g1 through. Confirmed by run. The maker's 7/7 counts that outcome as a pass (item 7, "by design"), so 7/7 overstates: the recorded reproduction is closed only for opt-outs recorded WITH a hint.
- My own run, hinted variants (url hint, key hint, other meeting kept, regional-host variant, reason `opted-out`, id-only still misses): `ISS-T037W1-001: 6/6 hinted; verbatim id-only 0/1 (open by design)`.
- Ruling: ISS-T037W1-001 is NOT verified; its status stays open ("partially fixed in the library"). W7 is rewritten: wiring requires (a) the production adapter to forward hints (it does not: scripts/webinar/join-rules-host.ts:26, new ISS-T037OPT-004), (b) a client that sends them (ISS-T037OPT-002), (c) the pin tests of ISS-T037OPT-005, (d) un-opt or written acceptance.

## 2. Hints on POST /opt-outs (real HTTP + real store, two tenants)
- Over-blocking: any meetingUrl is accepted regardless of the record id (`ev1` with a Meet URL stored). Bounds that make it acceptable: exact string match only; an identity must come from a platform extractor (bare host `https://zoom.us/`, Meet/Teams roots, `javascript:`, `data:`, `file:`, punycode look-alike, `zoom.us.evil.com`, `evil.com/?u=zoom.us/j/..`, `//zoom.us/j/..`, schemeless, empty all give no identity: ignored with 200, the id still stored); 500 entries; own tenant only; `join-rules` write scope; the same tenant can already deny any URL via PUT rules. Normalised to one identity: case, trailing slash, query, fragment, userinfo, http vs https, regional subdomain.
- Weakest accepted shapes: `zoom.us/my/<name>` and Meet `lookup/<x>` rooms (recurring, ISS-T037OPT-003), 5-digit zoom ids.
- Cross-tenant: tenant-a opted out with `https://zoom.us/j/123456789`; the same meeting scheduled for tenant-b stays scheduled; tenant-b's own opt-out of 777777777 never appears in tenant-a's file; tenant-b's file is untouched by tenant-a. Tenant comes only from the key; `tenantId` in the body is 400.
- Tag injection: `sessionKey:"url:zoom:999999999"` stores `key:url:zoom:999999999` and does not veto a zoom:999999999 URL event; stored `key:zoom:123456789` does not veto the URL event. Newline, NUL, space: not stored; 257 chars: 400; 201-256 chars: 200 but not stored; zero-width characters are kept as themselves (exact match only); duplicates collapse; 501 entries rejected on validation; 600 distinct hinted opt-outs give 500 entries and 600 ids (the cap is silent).
- Size: worst case 500 x 200-char entries of lone surrogates (6 bytes each JSON-escaped) = 585,264 bytes on disk, under the 1,048,576 cap; CJK worst case 297,265. The store `too-large` guard is on the write path, unchanged.
- Lock and atomicity: held lock gives `locked`, file bytes identical, no tmp files; injected rename failure gives `write-failed`, bytes identical, no tmp.
- Auth unchanged (the diff has no scope or tenant edit). Hint fields on approvals: 400; PUT with `optedOutMeetings` or `state`: 400; read-only scope: 403; `__proto__` or extra fields: 400. Responses echo only the derived entries.
- An unusable hint returns 200 with no signal other than the absent entry in `state` (contract O3).

## 3. Compatibility
- Old documents: no key invented on load; bytes unchanged after load (run).
- Pre-unit code (`git show 1414d79:` join-rules, normalize, store, lock) on a new-format document: `loadJoinRules` throws `invalid ... unknown field "optedOutMeetings"`; its approval, opt-out and default save are all refused; file bytes unchanged; its `evaluateJoinRules` returns `needs-approval / invalid-rule-set`, which the veto maps to `rules-unevaluable` (nothing joins). Fail closed, no silent loss. The field is lost only through `saveJoinRules(..., {overwriteInvalid:true})` (verified it drops the field), which has no production caller (grep). Rated low: a rollback is a whole-tenant auto-join outage, not a leak. Documented as contract O1.

## 4. Veto-only (own seeded LCG, 2000 cases, hostile fields: null/number/blank urls and keys, empty ids, deep-frozen input)
0 violations: never adds, order preserved, pre-existing skipped rows untouched, counts balance, input never mutated, never throws. Degenerate hand-written entries (`url:`, `key:`, `url:zoom:`, `key:null`, `KEY:calX`, leading/trailing space, "", and non-array / object / null values) are all rejected by `validateJoinRuleState`, never matched, and fail closed in the evaluator. Accepted but inert (cannot be derived, so never match): `url:null:x`, `url:zoom:0:`.

## 5. Empty-sessionKey grouping fix
Before: two records with key "" and different URLs, opt-out of A removed both; after: only A. Same for a skipped opted-out row with key "" plus a scheduled B. Over the 2000 cases the new kept-set is a superset of the old in every case, the new code removed something the old kept in 0 cases, and all 28 differences are chains through an empty or whitespace-only key. It only removes over-removal; it cannot let through an item with a real shared key, URL identity or id.

## 6. Un-opt
No operation exists for ids or identities (routes: GET, PUT, approvals, opt-outs), so this unit does not worsen the id case. ISS-T037OPT-001 stays medium. ISS-T037OPT-003 re-rated low to medium: with no undo, a stored room identity permanently blocks the room and the only remedy is hand-editing the tenant file. Not high: tenant-scoped, veto-only, fail-closed, client-chosen.

## 7. Mutations (15 of mine; per-mutation byte backup, restore in `finally`, 150 s timeout, `git hash-object` == `HEAD:` blob checked for every one: all true)
Killed 10/15: M1 skip validation, M3 router ignores auth tenant, M4 raw URL stored, M5 cap dropped, M7 old doc gains `[]` on read, M8 degenerate accepted, M11 hint length bound removed, M12 no dedupe, M14 grouping fix reverted, M15 matcher ignores key side.
SURVIVED: M2 prefix match, M6 key:/url: interchangeable, M9 url degenerate-id check, M10 approvals route accepts hint fields, M13 key trim. M2 and M6 are the two properties that bound over-blocking: ISS-T037OPT-005 (medium). The behaviour is correct (probes above); the pins are missing.

## 8. Budgets and scope
- `lint-dirsize`: OK in the lane (calendar = 26). The branch it merges into (codex/machine-migration-2026-10-09, c08a431) already holds 29 files there (5 alert files, not 4). Post-merge 29 + 2 new (join-rules-optout.ts, join-rules-optout-meeting.test.ts) = 31 > 30 with no override: lint-dirsize FAILS after merge.
- `lint-loc`: only the two pre-existing violations (speakers-llm.ts:313, sb_join.py:1142). join-rules.ts is 295/300 (the next field forces a split).
- tsc --noEmit: packages/meeting-bot exit 0; apps/api exit 0.
- Tests: meeting-bot join-rules*, auto-join, schedule-tick, send-now* 162/162; apps/api join-rules 48/48; scripts/qa + scripts/webinar join-rules 13/13.
- No schedule-tick, contracts/, enforcement path or apps/web edit. Edited pre-existing test assertions: router.test fake `recordOptOut` gains a third parameter (benign); the `CURRENT LIMITATION` test is retitled, its id-only assertion `["g1"]` is kept and a fixed-behaviour assertion added (benign, correct).

## EXPLANATION
The stored-identity design is sound and well bounded: exact matching, per-tenant files, tagged namespaces that cannot collide, strict fail-closed validation, veto-only, lock and atomic write intact, old documents untouched, old builds fail closed. The unit is not the end of ISS-T037W1-001: the recorded id-only state still reproduces, and the only production adapter discards the hints (new, ISS-T037OPT-004), so nothing in production stores an identity yet. PASS is for the stated library/store/API scope.

ISSUES-WRITTEN: ISS-T037OPT-004 (medium, production adapter drops hints), ISS-T037OPT-005 (medium, missing exact-match and tag-separation pins); ISS-T037OPT-003 re-rated low to medium.

## Merge conditions
1. The calendar directory must be at most 30 files after merge: fold or relocate at least one file (31 otherwise); verify with `node scripts/lint-dirsize.mjs` on the merged tree.
2. Do not wire schedule-tick or the editor page until W7 (a)-(d) hold.
3. Add the ISS-T037OPT-005 pin tests (prefix, tag separation) before or with the wiring unit.
4. Keep ISS-T037W1-001 open; the manifest close-out must not claim the issue fixed.
