# Contract - t039-send-now-command

KNOWN LIMITATION (first, deliberately): this contract covers an UNFINISHED slice. A manual `runRecord` (and a poller recording) leaves no meeting URL where `readLiveJobs` looks (ISS-T039CMD-001/002), so the command's duplicate check does not see a second `send-now` for a meeting launched by `send-now`, `lkb record`, or the poller. On the default tab backend a second concurrent recording is refused only by the capture layer's profile lock (packages/meeting-bot/src/capture/tab-browser.ts:158-163), as a raw error.

PRECONDITION FOR CALLING T-039 DONE: manual launches (and poller launches) are recorded, with the normalised meeting URL or meetingKey, where the duplicate check reads them, and a test runs send-now twice for one meeting and sees the second refused by the command itself.

Unit: `lkb send-now <url> [--until HH:MM]` (packages/meeting-bot/src/send-now-command.ts, cli.ts dispatch). The T-039 exit criterion (docs/meeting-bot-roadmap.md:62, "bot joins a running meeting within 60 s") is NOT claimed.

## Criteria (pass = all hold)
1. Every `planSendNow` refusal prints `send-now refused: <message>`, returns exit 1, and `runRecord` is not called.
2. If live-job state cannot be read (corrupt, oversized, wrong-shape or wrong-tenant operations.json; any unreadable or malformed scheduled/*.json) the command refuses with exit 1 and launches nothing. Only an absent operations.json or an absent scheduled dir means "no jobs".
3. State is located from the module's own path, not the working directory.
4. Job status passes through unchanged; anything outside processing/ready/failed/action_required blocks. A scheduled job file with no operations row blocks until its `until` passes.
5. No refusal message contains URL userinfo, `pwd=` or token values; credentials refusals print the host only.
6. `runRecord` receives the planner's normalised URL (`request.meetingUrl`), never the raw argument; `--until` is forwarded only if given; usage and `--until` errors throw before the state is read or anything is launched; with no `--until`, runRecord's own usage error is the outcome (no default invented).
7. No message or help text may claim duplicate protection the command does not provide (currently none does; keep it so until the precondition above is met).
8. cli.ts changes are limited to the import and the dispatch line.

## Evidence at checker cycle 0
send-now-command.test.ts 10/10; send-now, platform and record-commands tests 55 pass, 1 skipped (pre-existing), 0 fail; tsc exit 0; dirsize OK; five mutations (unreadable-as-no-jobs, raw URL, ignored refusal, echoed URL, ignored status) all killed.
