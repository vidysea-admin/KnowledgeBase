# t039next

**Handshake status:** checked-PASS — closed out 2026-10-26 (resume reconcile; latest verdict section PASS at this cycle, qa/verdicts/t039next.md)
Status: checked-PASS
Fix cycle: 1
Tier: 3 (next unblocked roadmap task, T-039). Lane: lane/t039next (base 99f4fed9). Class: new authenticated endpoint on the send-now scope, tenant-scoped read of launch state: FULL ceremony.
Closes (status half only): ISS-SENDNOWAPI-003 "no status endpoint". The 60 s live-join measurement is NOT done.

## Slice: GET /calendar/send-now/:jobId (job status), flag OFF by default
- `packages/meeting-bot/src/live-recording/session-status.ts` (new, read-only): `readSessionStatus({dir,tenantId,sessionId}, now, probes)` over the live-recording view that every `cli.ts record` claims (job id == session id). Reads only the caller tenant's directory; unreadable / malformed / foreign-tagged / stray file THROWS ("cannot tell"). `live-recording.ts`: `parseEntry` now exported (one word).
- `apps/api/src/join-rules/send-now.ts`: optional `SendNowDeps.status`; when present, mounts GET behind `requireScope("send-now")` (exact match, the existing scope: no new scope, no policy choice). Job id must match `send-now-<14 digits>-<6 hex>` else 400 before the host is asked. 200 `{jobId, status: launching|running|not-running, meetingKey?, startedAt?, until?, joined: "unknown"}`; 403 host serves another tenant; 503 unreadable/throwing (cause not leaked). Tenant only from `req.auth.tenantId`.
- `scripts/webinar/send-now-host.ts`: `status` exists only when `LKB_SEND_NOW_STATUS=1` (exact) or `statusEnabled: true`. running = a live claim carries that session id; else job id younger than 30 s = launching; else not-running. Honest limits: "running" is recorder PROCESS liveness, not "joined" (`joined` is always "unknown"); "not-running" cannot tell finished from never-started (see raw/webinars/<jobId>.log).
- Flag OFF: no `status` dep -> GET not mounted; test asserts the response equals a server with no send-now adapter (`deepEqual` status+body), and POST is unchanged.

## Evidence (node from toolchain, lane t039next)
```
packages/meeting-bot: node --test --import tsx src/live-recording/session-status.test.ts -> tests 4 pass 4 fail 0
apps/api:             node --test --import tsx src/join-rules/send-now-status.test.ts   -> tests 6 pass 6 fail 0
scripts:              node --test --import tsx scripts/webinar/send-now-host.test.ts    -> tests 15 pass 14 fail 1 (first run); the failing one is the pre-existing timing test "launcher that dies at once" (livenessMs 400 vs node cold start): rerun alone 5/6 pass; my 3 new tests pass
apps/api full:        "src/**/*.test.ts" -> tests 810 pass 808 fail 2 (activity-health/router.test.ts, usage/usage.test.ts)
meeting-bot full:     "src/**/*.test.ts" -> tests 818 pass 815 fail 2 skipped 1 (capture/record-backend.test.ts, capture/tab-browser.test.ts)
tsc --noEmit -p tsconfig.json: apps/api exit 0; packages/meeting-bot exit 0
node scripts/lint-loc.mjs --all: all stages exit 0 (888 files within budget, dirsize OK)
```
The 4 full-suite failures are in files this slice does not touch. Confirmed at base (changes stashed): tab-browser.test.ts 12 pass / 1 fail, usage.test.ts 13 pass / 1 fail. The other two were not re-run at base; they fail identically when run alone in the lane.

## NOT covered
No real meeting, browser, CLI or API process. No mutation run. `scripts/` has no tsconfig, so send-now-host.ts is typechecked only through tsx execution. The web page does not poll this endpoint yet (needs an Approver-free UI slice next). Wiring: `join-rules-api-host.ts` already calls `createSendNowDeps()`, so the env flag alone turns it on there; apps/api/src/index.ts still answers 503 (ISS-SENDNOWAPI-004).
## Remaining for T-039
Web status polling of this endpoint; 60 s live-join measurement (needs a joined signal, not just process liveness); ISS-SENDNOWAPI-004 (one supported API host, an Approver choice), ISS-T039DUPES-006 (mutant-killing test), ISS-SENDNOWAPI-002.

## Fix cycle 1 (ISS-T039NEXT-001)
- `send-now-host.ts`: optional `liveProbes?: LiveProbes` option passed to `readSessionStatus` (default undefined = unchanged real probes). `send-now-host.test.ts`: status test injects the same fake probes that seeded the claim (hermetic); foreign-tenant assertion moved to its own test.
- Evidence: send-now-host.test.ts 15 runs: 4 runs 16/16 green earlier batch pattern; the only failing test in every red run is the pre-existing timing test "launcher that dies at once" (livenessMs 400 vs node cold start under load); the status tests pass in all runs. Not changed (outside verdict).
- Mutation M4 (`tenantId !== tenant` -> `&& false`): KILLED by the new tenant test (pass 15 / fail 1, hash-verified, restored).
- ISS-T039NEXT-001 reproduction: "status: live claim ... = running" 0/15 failures (was 15/15).
- apps/api send-now tests 18/18; session-status 4/4; both tsc 0; lint-loc --all 0.
- Timing test "launcher that dies at once" made load-independent (test-only): its host uses `livenessMs: 20_000`; the child's exit settles the launch immediately, so the test stays fast and the assertion is unchanged (dead launcher -> 502). send-now-host.test.ts 15 runs after the change: 15/15 at pass 16 / fail 0 (was red in 10/15).
