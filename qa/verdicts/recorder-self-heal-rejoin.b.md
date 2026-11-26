# Verdict (coordinator B, blind): recorder-self-heal-rejoin (H1), fix cycle 1
Cycle checked: 1
Policy-Version: proportional-verification/2026-11-22.19
Head: c42c9559ca7c92fbb1378b41cd90e85404e7ec4b (on e327d86b, branch wave/h1-recorder-self-heal); manifest 7c5166a5
Contract commit: 7e683dff
Dual check: required (dual-trigger: tenancy scripts/webinar/scheduler/dispatch.mjs:51). Coordinator B; no issue rows written. Blind to coordinator A.
Worktree: D:/KnowledgeBase/.worktrees/h1-check-b (detached at c42c9559, left in place). Cycle-0 verdict kept as qa/verdicts/recorder-self-heal-rejoin.b.r0-1.md.

## Diff identity
`git diff --stat e327d86b c42c9559` = 2 files: packages/meeting-bot/src/autojoin/bot-events.ts (cleanBotText only) and scripts/webinar/scheduler/self-heal-rejoin.test.mjs. dispatch.mjs, lifecycle-alerts.mjs, alerts.ts are unchanged, so my cycle-0 evidence for C1-C9 and I1-I6 (and the 9 killed mutants A, C-J on those files) stands by evidence identity.

## Re-judged: C10 (D-015, own recorded reproductions verbatim)
My cycle-0 recorded cases: probe-c10 titles (url + "passcode is" sentence; scheme-less link + pwd=; url only) and finding 1 ("Webinar https://x.zoom.us/j/1?pwd=abc Passcode: 123456"). Run through the real canonicalOperationAlert + raiseAlert + decoded mail (probe-c10.test.mjs, verbatim): 3/3 mails clean (subject "Career webinar [link removed] [passcode removed]"; no FAKEPWD99, FAKEPASSCODE5521, meet.google.com). Finding-1 title via cleanBotText: "Webinar [link removed] [passcode removed]". D-015 count: 4/4 recorded reproductions refused.
Extra probe (probe-clean.test.mjs, 15 adversarial titles): 14/15 redacted (Passcode: digits, "Pass code:", password:, pwd=/token=, zoom.us/j/ with and without pwd, quoted passcode, teams link, key=). One residual leak: "Passcode - 445566" (dash separator) is kept verbatim, see finding 2. No ReDoS (7 pathological 20-50k char inputs, 0-1 ms each).
C10: PASS (the contract's literal scenario, a title with a ?pwd= join URL plus a fake passcode sentence, yields a mail with none of those strings and the title still names the meeting).

## Downstream (cleanBotText is shared: alerts.ts, gws-channels.ts, lifecycle-alerts.mjs, feed rows, subjects)
Reran on c42c9559, one process at a time: packages/meeting-bot/src/autojoin/*.test.ts 54/54 (matches builder); scripts/webinar/scheduler/*.test.mjs 92/92 (superset of the builder's 49, includes self-heal-rejoin 26/26); tsc --noEmit meeting-bot exit 0. Benign titles kept: "Career Guidance Q&A with Dr. Rao", "Intro to AI/ML webinar", "Admissions 2026 in Canada/USA", "Passcode reset workshop", "University of Leeds webinar", "Password security for students" (test). I1-I6: no code they depend on changed; PASS.

## Falsification (C10 floor + 3; 4 mutants on bot-events.ts, per-mutation byte backup, 60 s test timeout, restored, hash-object == HEAD blob c47b198d)
K passcode-sentence redaction removed: red (2 tests). L scheme-less link redaction removed: red (1). M key=value redaction removed: red (1). N undelimited-passcode alternative removed: red (1). 4/4 killed; green before (26/26), red after, restored.

## Over-redaction
"Node.js/React" becomes "[link removed]" (any `word.tld/` pattern). The contract requires the title rendered as today with credentials removed; it requires no criterion of a title being preserved verbatim. Wording/display loss only, fails safe. Low, not a FAIL.

## Findings
1. PROPOSED-ISSUE: {"severity":"low","class":"over-redaction","criterion":"H1-C10","title":"cleanBotText BARE_LINK redacts any host-like token followed by '/' (Node.js/React -> [link removed]) in every alert, feed row and subject","repro":"cleanBotText('Node.js/React',200) -> '[link removed]'","fix_direction":"accept; or limit scheme-less matches to conferencing hosts or tokens with a path segment that looks like an id"}
2. PROPOSED-ISSUE: {"severity":"medium","class":"security-hardening","criterion":"H1-C10","title":"Passcode with a dash separator is not redacted","repro":"cleanBotText('Passcode - 445566',200) -> 'Passcode - 445566'","fix_direction":"allow `\\s*[-:=]\\s*` (and en/em dash) as the separator in CRED_SENTENCE; add the case to C10_TITLES. Not a FAIL: outside the contract's literal scenario, which passes"}
3. Cycle-0 lows still open (not re-judged, files unchanged): alertKey #n suffix unasserted (mutant B survives); no same-session-id file-collision test.

## NOT-MEASURED
Live stop of a rejoined capture, real Meet, real mail, a dispatch.mjs:51 mutant, builder's own mutant list, full suite (not run by policy).

VERDICT: PASS
SCOREBOARD: C 10/10, I 6/6 (I5 unfalsified; cycle-0 evidence reused by identity)
TIER: L
FAILURES: none
CAPABILITY-COVERAGE: no live capture, no network, no mail sent, no .env or sessions read
LIVE-BROWSER: not applicable
ISSUES-WRITTEN: none (dual check; findings are PROPOSED-ISSUE lines)
EXECUTOR: checker coordinator B (Sonnet 5.5)
EXPLANATION: The cycle-0 FAIL on C10 is closed: my own recorded reproductions are 4/4 redacted end to end, the shared cleanBotText change leaves 54/54 autojoin and 92/92 scheduler tests green, and four mutants of the new redaction are each caught. Low notes: Node.js/React over-redaction; the dash-separator passcode residual (medium hardening, outside the contract's literal scenario); cycle-0 lows B and C8 remain.
Metrics: start=2026-11-26T05:22:27Z end=2026-11-26T05:25:48Z wall_min=4 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=4 cycle=1 resumes=0 tokens=unavailable policy=proportional-verification/2026-11-22.19 check_s=0 mutants=4 defects=0
