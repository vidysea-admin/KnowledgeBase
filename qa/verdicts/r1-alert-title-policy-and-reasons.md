# Verdict — r1-alert-title-policy-and-reasons

VERDICT: FAIL
Cycle checked: 0
Commit checked: ece4219 (lane/alertfix; unit commits af15398 + ece4219; base 9dae5d3). node v24.19.0 per toolchain note. Checker working tree was clean apart from the files committed with this verdict; temporary harness files were deleted.

Scope: an UNWIRED, pure alert formatter with a typed `titlePolicy`, default `omit`. Nothing is wired (grep of `buildAttentionAlerts` outside `calendar/alerts/` empty). One defect in the default-safety claim blocks the PASS; everything else held.

## Why FAIL (one finding, one-line fix)
The manifest and code say any value other than the string `"masked"` yields `omit`. `readPolicy` reads `input.titlePolicy` with no own-property check, so an inherited value wins:
- `Object.create({titlePolicy:"masked"})` as the options object: the alert carries `Weekly tiger` (title and body).
- `Object.prototype.titlePolicy = "masked"` with an options object that states no policy: same.
Every other read in the module uses `own()`, and its tests assert inherited fields are ignored; this field alone is not. No test covers it, so the mutation "honour inherited" survives. Filed as ISS-ALERTFIX-002 (medium, security class; fix direction in the row). All other wrong values yield `omit` (item 2 below).

## 1. omit leaks nothing title-derived (my own run)
1,298 distinct titles (245 strings extracted from the quoted reproductions of ISS-R1ALERTS-001..011 and the three corpus tests; 600 seeded combinations of passcode/keyword/URL/Devanagari/CJK/Cyrillic/Arabic/emoji/control-character/200-char words; empty, 100,000-char, NUL), each with and without a start time, both routes (skipped, job), three ways: policy `omit`, policy absent, and title field removed. Serialised alerts (alert, key, id, ignored) are byte-identical in all 2,596 cases. Nothing, not even length, depends on the title.
**Id preimage:** `alertIdFor(sessionKey)` = first 20 hex of SHA-256 over the UTF-16LE session key. The title is not in it (proved by the byte identity above). Session keys are `cal:<event id>`, `gmail:<id>`, `webinar-<24 hex sha256 of URL identity>`, job ids. No salt. Webinar identity strips only `tk|token|access_token|pwd|password|utm_*`; a URL carrying a passcode under another parameter name is hashed twice, so recovering it needs the full rest of the URL plus a guess: a theoretical low-risk observation, not filed (low, and the alert never shows the URL). Not a title leak.

## 2. Default safety
`undefined, null, "", "MASKED", " masked ", "mask", "masked\0", 1, {toString}→"masked", {valueOf}→"masked", ["masked"], new String("masked"), a throwing getter` all give the omit output on both routes. FAIL: inherited and prototype-polluted (above).
**Other title entry points.** In `attention-alerts.ts` the title is only read by `own(...,"title")` and passed to `neutralizeText` when `masked`. `selectNewAlerts` and the dedupe key never touch it; no toString or debug form. Exported helpers `neutralizeText` (re-exported) and `sanitize`/`maskText`/`normalise`/`keywordIndex` in `alert-text.ts` format a title outside the policy but are not alert constructors and nothing wires them. Notes (low, not filed): under omit the title property IS read (a hostile own throwing getter makes the row `unreadable-*` and the alert is dropped and counted; not reachable from JSON data); manifest says "never read".

## 3. How 009 / 010 / 011 are recorded (ruling)
No status is flipped now (the unit FAILs). On a later PASS: keep ISS-R1ALERTS-009 and -010 OPEN with a note "closed for the default policy omit; NOT closed for masked (0/15, 0/12; no keyword, misspelt keyword)"; they are the standing reason masked is gated by W8. ISS-R1ALERTS-011 may be marked verified for `masked` only (my own inputs: `ZEBRA9 and Quokka then password`, `Pass: quokkaX then more`, `Team sync quokka PIN is mauve` all give a single `(hidden)`; `Weekly quokka` is kept). Contract amended: W8 now reads "masked may not be enabled for any sender without the Approver's written acceptance; nothing may be wired by this unit"; not weakened.

## 4. Edited existing tests
The three files' helpers pass `titlePolicy:"masked"`: every pre-existing assertion still runs against the masked path with the same expectation, EXCEPT one: the "echo audit" in `alert-text.corpus.test.ts` (line ~153) calls `buildAttentionAlerts` with no policy, so its title canary (`Talk passcode ZMARKt`) is now checked under omit only (trivially clean); its non-title fields still run. Weaker for masked on that one canary; note, low, fix with the ISS-ALERTFIX-002 test pass (pass `titlePolicy:"masked"`). Three ISS-006 expectations changed to `(hidden)`: STRICTER (a topic before the keyword is no longer printed). ISS-R1ALERTS-001..008 under BOTH policies by my run: 21/21, 1/1, 4/4, 2/2, 4/4, 37/37, 3/3, 2/2, extras 5/5, each under masked and omit. -009/-010/-011: omit 15/15, 12/12, 5/5; masked 0/15, 0/12, 5/5.

## 5. (B) SKIP_REASONS
`@lkb/core` in this lane resolves via junction to the main tree (`C:\Users\product\Desktop\KnowledgeBase\packages\core`), which exports `SKIP_REASONS` with 14 values; `git diff 9dae5d3 -- packages/core` is empty. The import resolves (tests and tsc). My run: all 14 values pass through as `no-alert-for-reason:<value>` (or alert for the five mapped ones); `weird-pwd=abc`, `""`, `__proto__` give `other`; a non-string gives `none`; nothing raw echoed.

## 6. (C) Relocation
`git diff -M --stat`: six renames, content changes only the expected ones. No importer of the old paths outside the six files (grep over packages, apps, scripts, root json, configs); tsconfig/test glob `src/**/*.test.ts`. My test counts: policy 8, attention 10, alert-text 15, corpus 9, all pass. `lint-dirsize: OK (113 dir(s))`. (`lint-loc` fails only on `speakers-llm.ts` and `sb_join.py`, untouched, pre-existing.) Contract paths updated by me; older manifests/verdicts/ledger rows cite `calendar/` and are historical and unchanged. `tracker-audit --gate g1`: OK; `g5`: OK; `g4`: 7 gating findings, all "ambiguous bare issue ref"; the one NEW one is this unit's manifest (`ISS-009`, `ISS-001..008` bare): qualify them as `ISS-R1ALERTS-NNN` (merge condition). The other six are on manifests this unit does not touch (medium-fix-batch-2, r1-attention-alerts, t-031, t-033, u3, u4b); I did not diff against main, so which of them are the known five is unverified.

## 7. W9 / ISS-ALERTFIX-001 (ruling)
Medium, kept. Not a blocker for this PASS (unit unwired), but a wiring PRECONDITION: no sender may be attached until an id-to-meeting lookup ships in the same unit and the wiring checker shows an alert resolved end to end. Written into the contract (W9).

## 8. Mutations (my own, 13; timeout 170 s; per-mutation byte backup; restore in `finally`; `git hash-object` equals `git rev-parse HEAD:` after each: all true)
All 13 killed: default flipped; job route ignores policy; skipped route ignores policy; omit adds title length; omit adds title hash; omit adds first word; masked hides only from the keyword on (killed by the 011 tests); reasons revert to a hand list (W10 test); unknown reason echoed (echo audit, W10 test); case/space-tolerant policy; throwing getter falls to masked; object toString honoured; id derived from title length (a different-id mutation). NOT a mutation but a live gap: "honour an inherited policy" is the current code and no test fails (ISS-ALERTFIX-002).

## 9. Commands
Targeted tests, tsc (`meeting-bot` exit 0, `core` exit 0), line budgets (non-blank: attention-alerts.ts 210, alert-text.ts 142, tests 221/205/160/129, all within 300/400). No network, browser, DB or full suite.

ISSUES-WRITTEN: ISS-ALERTFIX-002 (medium, open).

EXPLANATION: The formatter's design is right and the omit output is provably free of any title-derived byte, on both routes, across 1,298 titles. The unit asserts that anything but an own `"masked"` is `omit`, and an inherited `"masked"` breaks that, which is the exact failure the default exists to prevent (a one-line fix plus a test; security class, so it is not waived). The relocation, core reasons, masked whole-title hiding and the edited tests are sound.

Merge conditions (for the cycle-1 check): (1) fix ISS-ALERTFIX-002 with own-property read and a both-routes test (Object.create and polluted Object.prototype); (2) pass `titlePolicy:"masked"` in the corpus echo-audit call; (3) qualify bare ISS refs in the unit manifest (G4); (4) do not wire anything (W8, W9 now in the contract); (5) on PASS keep -009 and -010 open as above. Unverified: real Gmail/Calendar titles, the wired path (none exists), the default test glob discovery (I ran each file by path).
