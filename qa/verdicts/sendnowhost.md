# Verdict: sendnowhost (ruling 6, ISS-SENDNOWAPI-004)

VERDICT: PASS
Cycle checked: 1
Reviewed SHA: b975c915e2822c7116edf0288ea1fbe526564caf
Base: 9e55b642

## Evidence (independently produced)
- Diff base..candidate: production change is one line, send-now.ts:188, message text only. Status 503 and error code `send_now_unavailable` unchanged. requireScope(SEND_NOW_SCOPE) still precedes the handler, so the 403 path is untouched (existing test "no launcher injected" asserts 403 for an unscoped key).
- Consumers: grep for "not configured on this server" across apps, packages, scripts, docs and qa/contracts found no hit left (no web or api test depended on the old text). Only caller of unavailableSendNowRouter is apps/api/src/routes/calendar.ts:74.
- Leak check: new message has no path, secret or stack; the new test asserts exact key set [error, message] and no /scripts|\.ts|MONGODB|stack|ENOENT/. Docs mention only repo-relative script paths and env var names, no values.
- Docs accuracy: scripts/webinar/join-rules-api-host.ts exists and injects `calendar.sendNow: createManagedSendNowDeps()` (line 36), takes a single-host lock (acquireHostLock), and has the documented run command. apps/api/src/index.ts has no sendNow wiring. Dockerfile:136 CMD is `node apps/api/dist/server.js`.
- send-now.test.ts (timeout 600, from apps/api): tests 13, pass 13, fail 0, exit 0.
- tsc --noEmit -p apps/api/tsconfig.json: exit 0.
- D-020 mutation: send-now.ts unavailableSendNowRouter 503 -> 500, per-mutation byte backup, timeout 600, trap INT/TERM/ERR. Suite exit 1, pass 11 fail 2; killed by the new ruling-6 test and by "no launcher injected". Restored; final HEAD-fidelity: git hash-object == 539f0502fbff183602c4a3841bcb7331b7c4c14e == HEAD blob (see note 1).
- D-015 replay of ISS-SENDNOWAPI-004 (qa/issues.sendnowapi.jsonl:4): "plain start, POST /calendar/send-now with send-now key -> 503 send_now_unavailable" reproduces 1/1 (serve(null) is the plain composition: index.ts passes no sendNow dep, calendar.ts mounts unavailableSendNowRouter). It is the intended behavior under ruling 6; the issue's fix_direction ("Decide the one supported API host") is satisfied by ruling 6 plus the docs.

## Ledger
ISS-SENDNOWAPI-004 may be flipped to resolved (resolution: ruling 6, join-rules-api-host.ts is the single supported host; plain start 503 is by design, message and docs now say so).

ISSUES-WRITTEN: none

## EXPLANATION (notes, not issues)
1. My mutation run left the working copy of send-now.ts with CRLF bytes after restore (a Git Bash cp/sed interaction). I rewrote it with `git show b975c915:<file>`; content is byte-identical to HEAD (hash-object equal, `git diff` empty) but `git status` may still list it as M because of stat info only. Run `git update-index --refresh` or `git checkout -- <file>` in the lane.
2. Docs say GET /calendar/send-now/jobs* is also served only by the host; on a plain start those GET routes are not mounted (unavailableSendNowRouter registers POST only), so they will not return the documented 503. The 503 sentence reads as applying to POST; low severity, doc wording only.

## Not verified
Real host boot, Mongo, network, full suites, accounting ratios (no maker usage supplied).
