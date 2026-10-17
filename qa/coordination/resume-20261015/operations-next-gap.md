# Next operations/counsellor gap — 2026-10-15

## Selected unit

Tier 3, T-013: complete the explicitly enabled voice-conversation turn loop. This is a proposed implementation unit, not parent acceptance or an independent checker verdict.

Requirement: `qa/contracts/goal-t013.md` F2 requires an explicitly enabled conversational mode supporting real-time spoken question → answer/readback without manual typing/submission each turn. F7 requires stop/unmount/auth changes to retire callbacks and prevent voice restarting. T-013 depends only on T-009, which `.goal/goal.json` records done. D-170/D-173/D-174 authorize source implementation independently of actual microphone/provider/live acceptance. T-014 requires T-013; T-060/T-061 retain broader prerequisites. T-028 is not selected.

## Current source evidence

- `apps/web/src/pages/counsellor/CounsellorPage.tsx:54` starts synthesis after an answer, but supplies no completion/rearm action.
- `apps/web/src/pages/counsellor/voice.ts:46` explicitly selects single-shot recognition. Line 84 completes synthesis by notifying idle only. Nothing calls recognition again after readback.
- The immediate mounted consumer, `CounsellorPage.tsx:93`, expressly instructs pressing Ask by voice for each new turn. `apps/web/src/App.tsx:60` mounts this page.
- The test at `CounsellorPage.test.tsx:29` injects one transcript and observes one readback; it never exercises a second spoken turn after readback.

Thus the current source implements push-to-talk question/readback cycles, rather than a continuing enabled conversation. This is a current implementation delta against the strict F2 wording, not a missing-browser-evidence claim. The prior goal-t013 verdict is HOLD and reported no proven defect; it does not certify a continuing turn loop. Avatar context-loss PASS is a different seam. Located T-013 verdicts show zero PASSes on this turn-loop seam; no round-cap conflict found.

Current SHA256: CounsellorPage.tsx `8522876933DC1098C8C030F0DE94C9D5C7694D2010C92E108FC8E2CBECDEE3F0`; voice.ts `29A3F92B465F51D48F855A547B3C04451FD6981AB4545CE8800C2CD767955844`.

## Bounded implementation and verification proposal

Add an explicit completion callback/event distinct from generic idle, and a page-owned generation-bound conversation session. Start from the existing user gesture; after successful actual synthesis completion, rearm listening for the next question only if the same enabled session/auth/language remains current. Do not listen while speaking and capture the assistant's own answer. Stop, mode-off, auth replacement, navigation, recognition/synthesis/API error or missing capability must terminate the loop. Avoid generic-idle rearm: `stop()` also emits idle.

Scoped fixture checks: two complete recognition→API→synthesis→recognition turns after one explicit start; no rearm before genuine completion; stop/mode-off/language-change/auth/unmount between response and completion; delayed old completion cannot restart; provider/recognition/synthesis failure and unavailable voice terminate honestly; dictation remains editable and never auto-submits. Reuse focused CounsellorPage/voice suites and relevant web typecheck under root's CPU lease, then independent managed checker packet. Real browser microphone, audible output, provider/API and citation acceptance remain separate full-parent gates.

## Survey boundary

Read AGENTS, architecture, current D-170/D-173/D-174 authority, scoped task/goal rows, goal-t013/t014/t028/t060/t061 and webinar-portable-release contracts, current counsellor source/tests and relevant verdicts. No tests/build/provider/browser/DB/host-service commands or source edits were executed. Existing release readiness auth/WSL failures were not rerun. This report is the only write.
