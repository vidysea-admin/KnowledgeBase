# t039-send-now-command

Status: ready-for-check
Fix cycle: 0
Priority tier: 3 - next unblocked roadmap task (T-039)
Security class: operator-supplied URL drives a browser join; a failed duplicate check puts a second bot in a live meeting - FULL ceremony
Lane: lane/t039cmd (ledger shard qa/issues.t039cmd.jsonl, ISS-T039CMD-001..002)
Round cap: 1 PASSed verdict names the send-now seam (qa/verdicts/t039-send-bot-now-planner.md, cycle 2); cap is 2, not reached.

## Scope

Gives `planSendNow` its first caller. **Does NOT complete T-039.** T-039 exit criterion, docs/meeting-bot-roadmap.md:62:
`| T-039 | **"Send bot now"**: CLI/API/web button to add the bot to a live meeting | bot joins a running meeting within 60 s |`

Files: `packages/meeting-bot/src/send-now-command.ts` (116 non-blank lines), `send-now-command.test.ts` (130), `cli.ts` (+1 import, +1 dispatch line: 181 -> 183 non-blank, budget 300), `qa/issues.t039cmd.jsonl`, this manifest.

## Command

`lkb send-now <meeting-url> [--until HH:MM]` (`--until` also accepts an ISO datetime, as `runRecord` does). Anything else (no URL, URL starting `--`, unknown flag, repeated or valueless `--until`) is a usage error and throws `usage: lkb send-now <meeting-url> [--until HH:MM]`.
Flow: parse -> early `--until` check with `todayAt` (exported by record-commands) -> read live jobs -> `planSendNow` -> `runRecord([request.meetingUrl, "--until", v])`. No `--until`: `runRecord` is called without it and throws its own usage error (it requires `--until`); no default duration invented. Note `request.meetingUrl` is the planner's trimmed string, not `u.href` (planner low note, unchanged here).
Exit codes (cli.ts has only 0, and 1 via `main().catch` for any thrown Error): 0 = runRecord returned; 1 = refused (message on stderr, nothing launched); usage / `--until` / runRecord errors throw -> 1.

## Refusal messages (all print `send-now refused: <message>`)

| reason | message |
|---|---|
| invalid-input | the meeting link is not text |
| invalid-clock | the system clock gave no valid time |
| empty-url | no meeting link was given |
| url-too-long | the meeting link is too long (limit 2048 characters) |
| malformed-url | the meeting link is not a valid URL (detail) |
| not-https | the meeting link must use https, not <protocol> |
| credentials-in-url | the meeting link contains a username or password (host <host>); remove it ... (HOST ONLY, via `hostOnly`, which drops userinfo) |
| unexpected-port | the meeting link names a port (<port>) ... |
| embedded-redirect | the meeting link carries a redirect to another address ... |
| unsupported-host | <host> is not a supported meeting platform |
| not-a-meeting-url | <host> is supported but the link does not name a single meeting |
| duplicate-live-job | a bot is already queued, joining or recording for this meeting (<meetingKey>) ... |
| (live-job state unreadable) | cannot tell whether a bot is already in this meeting (<reason>); nothing was launched |

A test pins that the table covers every `SendNowRefusal`.

## State-read analysis (point 1)

`readScheduleState` (schedule-state.ts:230) is NOT usable: its entries are `{sessionKey,title,scheduledAt}` (no URL, no status) and it turns a corrupt/wrong-shape file into `{}`. Likewise `readScheduledJob` turns corrupt into `null`. Both would convert "cannot tell" into "no jobs". So `readLiveJobs` joins two stores strictly:
- `data/webinar-release/operations.json` via `readWebinarOperationState` (status vocabulary schedule-state.ts:63; validates shape, tenant, 5 MB cap, THROWS on invalid): rows have status, no URL.
- `raw/webinars/scheduled/<jobKey>.json` (task-scheduler jobs: url, until, sessionId): URL, no status. Joined on sessionId; no operations row: `queued` while `until` is ahead or unparseable, `ready` once past (ended).

"No jobs" (proceed): operations.json absent; scheduled dir absent or empty. "Cannot tell" (refuse, exit 1, nothing launched): operations.json unreadable/oversize/invalid JSON/wrong shape/wrong tenant (tenant = `captureTenant([])`, env LKB_TENANT_ID else "vidysea", and an invalid tenant also throws); any scheduled file that is unreadable, not JSON, or lacks string `url`/`sessionId`. Unknown statuses count live (planner's fail-closed rule). A stale `queued` row blocks that meeting until cleaned: deliberate, no override flag.

## Duplicate after a manual record (point 4): FINDING, defect

`runRecord` leaves NO trace this check can read. Its only state write is `.record-state.json` (record-commands.ts:148: pid, sessionId, title, platform, until, ...; no URL; single slot). It does not touch operations.json, schedule-state.json or scheduled/*.json. So `send-now <url>` issued a minute after another `send-now <url>` (or `lkb record <url>`) finds no live job and launches a SECOND bot into the same meeting. The duplicate guard only works against task-scheduler jobs. Filed **ISS-T039CMD-001 (high)**. Also **ISS-T039CMD-002 (high)**: poller-launched recordings (run-pipeline.mjs:216) store status but no URL in operations rows and no scheduled file, so they are not URL-matchable either. NOT fixed here (state writes need their own checked unit; schedule-state.ts / record-commands.ts off limits). Until fixed, the duplicate protection is incomplete for the main case it exists for.

## Evidence

Node from the toolchain note; junctions to main tree node_modules (root and packages/meeting-bot).
```
$ cd packages/meeting-bot && timeout 150 node --test --import tsx src/send-now-command.test.ts
ℹ tests 10  ℹ pass 10  ℹ fail 0
$ timeout 170 node --test --import tsx src/send-now.test.ts src/platform.test.ts src/capture/record-commands.test.ts
ℹ tests 56  ℹ pass 55  ℹ fail 0   (one test not counted as pass; 0 failures)
$ timeout 180 node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json
tsc-exit=0
$ node scripts/lint-dirsize.mjs
lint-dirsize: OK (111 dir(s) within budget)
$ node scripts/lint-loc.mjs
lint-loc: FAIL - 3 violation(s): packages/index/src/pipeline/speakers-llm.ts:313, packages/meeting-bot/py/sb_join.py:1142, scripts/watch/run-watch.mjs:556  (all pre-existing, none in this unit's files)
```
Non-blank counts: cli.ts 181 -> 183, send-now-command.ts 116, send-now-command.test.ts 130 (limits 300 / 300 / 400).

## Not delivered

Never run against a real meeting, browser, OBS or network; `runRecord` is faked in every test, and `defaultSendNowDeps` / the cli.ts dispatch were typechecked but not executed. The 60-second clause is NOT claimed. T-039 stays in progress (API route, web button, state-write for duplicate detection remain).
