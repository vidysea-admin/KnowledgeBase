# Verdict - t039-send-now-command

VERDICT: PASS
Cycle checked: 0
Checked commit: cd61dcf (lane/t039cmd, base 7f352eb). Checker: independent subagent, 2026-10-10.

## KNOWN LIMITATION (read first)
The manual path leaves no trace the duplicate check reads (`runRecord` writes only `.record-state.json`, no URL), and poller recordings carry no URL either. The command's own duplicate check therefore does NOT see back-to-back manual launches or poller-launched recordings. Today a second bot is stopped only by the capture layer's profile lock (tab backend), not by this command. "Manual launches are recorded where the duplicate check reads them" is a precondition for calling T-039 done. This unit is an unfinished slice; it does not complete T-039 and the 60 s clause is not measured.

## Commands (timeouts on all; no browser, network or full suite)
- `timeout 150 node --test --import tsx src/send-now-command.test.ts` -> tests 10, pass 10, fail 0.
- `timeout 170 node --test --import tsx src/send-now.test.ts src/platform.test.ts src/capture/record-commands.test.ts` -> tests 56, pass 55, fail 0, skipped 1 (the 56th: "production probe accepts playable audio/video and refuses audio-only media", marked `# SKIP`, in the record-commands tests; pre-existing).
- `timeout 180 node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> tsc-exit=0.
- `node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (111 dir(s) within budget)`.

## 1. Scope
`git show --stat cd61dcf`: send-now-command.ts, its test, cli.ts (+2: one import, one dispatch line), the manifest and qa/issues.t039cmd.jsonl. Nothing in calendar/, capture/, scripts/. OK.

## 2. The two filed issues, traced
What writes what:
- `runRecord` (capture/record-commands.ts:148-157): only `.record-state.json` in RECORD_DIR: pid, sessionId, title, platform, until, obsOutputDir, startedAt, controllerStartedAt. No URL. Never touches operations.json or scheduled/. ISS-001 is accurate.
- Poller (scripts/webinar/run-pipeline.mjs:216-219): operations row `{status: queued then recording, title, startTime, endTime, attempts}`, then `record <url> --backend tab ...`. No URL, no scheduled file. ISS-002 is accurate.
- Task-scheduler (calendar/schedule-tick.ts:263; schedule-state.ts:254-262,273): `raw/webinars/scheduled/<jobKey>.json` = `{url, until, title, sessionId}`; no status, no operations row.
- Statuses: poller rows move through queued/recording/processing/failed/ready/action_required (schedule-state.ts:63); scheduled-file jobs have no status, the command invents `queued` until `until` passes, then `ready` (send-now-command.ts:99-100).

Existing downstream guard (found): the default `tab` backend refuses a second concurrent capture on this machine. capture/tab-browser.ts:150 is an in-process `active` flag; tab-browser.ts:153-165 is the cross-process lock `.lkb-tab-capture.lock` in the bot profile dir holding the controller pid: a live pid throws "Persistent browser profile already has an active capture controller" (line 163) before any browser is spawned, and the lock is created with `openSync(lock,"wx")` (line 165, atomic). Manual launch and the poller both use the tab backend by default (`recordingBackend` default "tab"; run-pipeline.mjs:216 passes `--backend tab`), and `send-now` cannot pass `--backend` (parseRest rejects extra flags). The failed second run writes only its own new handle's status file and removes the lock only if it owns it, and manual runs install no capture-control listener (reconnect-gaps.ts:100-108), so the first recording is not disturbed. Not covered: `LKB_CAPTURE_BACKEND=obs` (no equivalent lock read), a custom `LKB_BOT_PROFILE_DIR`, and the short window before the lock is taken (the `wx` open still makes the loser fail).

| Sequence | Blocked by the COMMAND? | Blocked downstream? | Evidence |
|---|---|---|---|
| (a) send-now A, then send-now A | ALLOWED (readLiveJobs sees nothing) | Blocked on tab backend, as a late raw error with exit 1, not a friendly refusal | record-commands.ts:148; tab-browser.ts:158-163 |
| (b) poller recording A, then send-now A | ALLOWED (ops row `recording` has no scheduled file, so it is skipped: fail-OPEN, this is ISS-002) | Blocked on tab backend | send-now-command.ts:93-101 (only scheduled files are iterated); run-pipeline.mjs:216 |
| (b') task-scheduler job for A running, then send-now A | BLOCKED (`queued` until `until`, or the ops status) | also lock | send-now-command.ts:97-100 |
| (c) send-now A, then scheduler tick reaches A | n/a to the command; the tick does not know of the manual run and schedules anyway | the scheduled run's runRecord hits the lock and fails; the manual one keeps recording | schedule-tick.ts:233 reads only its own keys |
| (d) scheduled job for A queued, not started, then send-now A | BLOCKED (file + no ops row + `until` ahead gives `queued`) | n/a | send-now-command.ts:97-100 |

Severity: the maker's issues are accurate in fact. Their severity "high" assumed no second guard; with the tab-backend lock the realised harm (a second bot in the meeting) needs the OBS backend or a non-default profile dir. Re-severitied to MEDIUM (field only) and the precondition is kept in the contract.

## 3. Ruling on the unit
PASS as an unfinished slice, gap stated above. Reasons: (i) nothing in the command or cli.ts claims duplicate protection unqualified: there is no help text; the only strings are the usage line and the refusals, and the `duplicate-live-job` message describes what was found ("a bot is already queued, joining or recording for this meeting ... not sending a second one") and is only produced when a job was actually matched; (ii) the unit still blocks look-alike hosts, non-meeting pages, credentials/ports/redirects and duplicates of scheduled jobs; (iii) the dangerous outcome is independently stopped by the capture lock on the default backend; (iv) the gap is filed, not hidden. An operator could reasonably assume "refuses duplicates" covers a second manual run; today that holds only because of the lock, with a worse error message. This is why the contract makes the trace a precondition for T-039 done.

## 4. State reading
- Path resolution: `root` derives from `import.meta.url` (defaultSendNowDeps), not cwd, so running from another directory does not blind the check. Paths `data/webinar-release/operations.json` and `raw/webinars/scheduled` equal the poller's `stateDir/operations.json` and the tick's `DEFAULT_STATE_DIR/scheduled` (schedule-tick.ts:16). Absent operations.json is the normal first-run state (readWebinarOperationState returns an empty state when absent, schedule-state.ts:136); neither directory exists in this fresh worktree, as expected.
- Join on sessionId: `Object.hasOwn(ops, sessionId)` (safe against `__proto__`). Two scheduled files with the same sessionId yield two jobs with the same status: harmless. Scheduled file without a row: queued/ready by `until`; an unparseable `until` fails closed (queued). Operations row without a scheduled file: IGNORED silently (fail-open; this is ISS-002, the whole poller path). Not a new defect.
- Wrong tenant: `validateOperations` throws (`row.tenantId !== tenantId`), so "cannot tell", exit 1. Tenant is `captureTenant([])` = LKB_TENANT_ID or "vidysea"; an unset env on a deployment using another tenant refuses rather than proceeds.
- Statuses pass through unchanged (`row.status`); the planner treats everything except processing/ready/failed/action_required as live.

## 5. Output hygiene
`credentials-in-url` prints the host only via `hostOnly` (strips userinfo; drops anything not `[a-z0-9.-]`). Other `detail` values are protocol, port, hostname or meeting key (platform-extracted ids, echoed only when matched to a live job, or for not-a-meeting/unsupported cases the hostname). The URL itself is never printed. A test pins this with three credentialled URLs. Normalisation: the manifest's note that `request.meetingUrl` is the planner's TRIMMED string is out of date: the planner at this base returns `u.href` (last line of planSendNow) and the command passes `plan.request.meetingUrl`, so the validated and launched URL are identical. The test does not pin normalisation (its inputs already equal their href); a mutation to "trimmed raw string" would survive. Low, no entry.

## 6. --until
Absent: `runRecord([url])` is called and throws its own usage error at its first statement (before any browser or state work). Malformed: `validateUntil` (`todayAt`) throws before readLiveJobs and before launch; shape errors throw in parseRest. All pinned by tests.

## 7. cli.ts
Two added lines (import, dispatch). Dispatch sets `process.exitCode` from the returned code. No help text exists to be inaccurate.

## 8. defaultSendNowDeps, line by line
Dynamic imports of `record-commands.js` (exports `runRecord`, `captureTenant`, `todayAt` confirmed) and `schedule-state.js` (`readWebinarOperationState`). `readLiveJobs` is wrapped in an arrow, so a throw lands inside runSendNow's try (awaited). `runRecord` takes `string[]` and is awaited. `readOperations(file, tenantId, checkedAt)` argument order matches `readWebinarOperationState(file, tenantId, checkedAt)`. `captureTenant([])` matches `(rest, env)`. No swallowed exit code: refusal returns 1, success 0, thrown errors reach cli `main().catch`. No mistakes found. Never executed by a test (typechecked only) and not run here (it would launch a recording).

## Mutations (per-mutation byte backup, restored after each; HEAD-fidelity checked)
Each: temporary edit of send-now-command.ts, `timeout 120` test run, restore, `git hash-object` vs `git rev-parse HEAD:`.
| # | Mutation | Result |
|---|---|---|
| M1 | unreadable state treated as no jobs | KILLED (9 pass / 1 fail) |
| M2 | pass raw `url` instead of `plan.request.meetingUrl` | KILLED (trimmed-input case) |
| M3 | ignore the planner refusal | KILLED (3 fail) |
| M4 | echo the full URL in the credentials refusal | KILLED |
| M5 | ignore the operations status (always `ready` when a row exists) | KILLED |

After each run `git hash-object packages/meeting-bot/src/send-now-command.ts` equalled `git rev-parse HEAD:` of the same file (2bd9706c3573952afca1097d5bde9320e9ff7e1c). Process note: the in-subshell trap used a relative path after `cd` and did not itself restore; the explicit restore after each run did, and the hash check is the proof. `git status --short` was clean after the runs.

ISSUES-WRITTEN: none new. Severity of ISS-T039CMD-001 and ISS-T039CMD-002 corrected high -> medium in qa/issues.t039cmd.jsonl (field only; reason in section 2).

EXPLANATION: The command does what its code says: it refuses on every planner refusal, treats every unreadable or foreign state as "cannot tell" (exit 1, nothing launched), never echoes credentials, passes the normalised URL, and cannot launch before usage or `--until` validation. The maker's central finding is correct: the duplicate check is blind to manual and poller launches. It is not a FAIL because nothing here claims otherwise, scheduled-job duplicates are caught, and the capture layer's lock (tab-browser.ts:158-163) independently stops a second concurrent recording on the default backend. The gap must be closed (a durable URL-bearing record written by the manual path and the poller, read by `readLiveJobs`) before T-039 is marked done. Residual weakness for that unit: the lock's refusal arrives as a raw error from a started-then-failed second process, and the OBS backend has no such lock.
