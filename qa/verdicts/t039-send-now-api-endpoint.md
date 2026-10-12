# Verdict: t039-send-now-api-endpoint

VERDICT: PASS
Cycle checked: 0
Commit checked: 8eeb79f (lane/sendnowapi)
Scope: API half of T-039 only (the unit is not T-039 complete; no status endpoint, no web button, 60 s join unmeasured). Nothing real was launched: the only spawned process was the maker's `argv-dump-fixture.mjs`.

## EXPLANATION

- Spawn (read + probed): `spawn(process.execPath, [ "--import","tsx", cli.ts, "record", url, "--until", until, "--tenant", tenantId, "--session-id", jobId, "--title", ... ], { detached, windowsHide, stdio:["ignore",fd,fd] })`. No `shell`, the executable is node.exe (never a .cmd/.bat), each value is its own argv element, so `&`, `|`, quotes, spaces, newlines cannot be re-parsed. meetingUrl reaches argv only after `planSendNow`; my probe through the real planner: `--help`, `-https://...`, `url --tenant evil`, `url" & calc`, `url\n--tenant` -> malformed-url; `url|calc` -> not-a-meeting-url; so a leading `-` can never become a flag. `until`/tenant/jobId are validated, server-derived or fixed (`todayAt` regex or ISO; `until` with trailing text -> invalid-until). Child fd is closed in `finally`, listeners removed, `unref()` after the liveness window, a late `error` is swallowed by a no-op handler: no leaked handle holding the API open (the test suite exits cleanly).
- Environment (finding, low, in this note only): no `env` option, so the detached child inherits the API process env entirely (MONGODB_URL, provider keys, anything dotenv loaded). The CLI legitimately needs part of it, and the child is this repo's own code; but nothing minimises it. A future unit could pass an allow-list.
- Race: the check `inFlight.has || recent.has` and `inFlight.add` have no `await` between them, so they are atomic in one process; slot released in `finally`; failed launch not remembered; two concurrent requests -> one launch (maker test; my M3 mutation reddens). Cross-process / manual / poller launches remain invisible (ISS-T039CMD-001/-002, ISS-SENDNOWAPI-002 stay open and are honestly disclosed).
- Scope/tenant: `requireScope` is the repo's exact array-element match (auth.ts:63), also on the 503 router; tenant only from `req.auth.tenantId`; unknown body keys (incl. `tenantId`) -> 400; host refuses any tenant other than its own (403). Near-miss scopes (`calendar`, `join-rules`, `send-now-x`) are 403 per the maker's tests plus the exact-match implementation.
- Key grant (ISS-SENDNOWAPI-001): `git show 8eeb79f -- scripts/mint-key.mjs` is a 2-line addition of `"send-now"` to `ALL_SCOPES`; no key fixture, seed key, test default or stored key was touched. But `ALL_SCOPES` is the only list mint-key mints, so every newly minted key (including the live-verify key) now carries the scope. D-126 only says "create a dedicated scope"; it does not forbid this, and the maker disclosed it as medium. I leave it OPEN and recommend the Approver decide before anyone mints a live-verify key (fix_direction in the ledger: `--scopes` flag, read scopes by default).
- New finding ISS-SENDNOWAPI-005 (medium): `until` is syntax-only. 2099-01-01 and 99:99/25:00 are accepted; a past ISO is accepted and costs a spawn + 502. A holder of the scope can ask for an effectively unbounded recording. Not a security bypass (the holder is authorised for the capture), so it does not block this PASS, but it should be fixed in the next unit.
- Re-run: send-now.test 12/12, send-now-host.test 9/9, `tsc --noEmit -p apps/api` exit 0.
- Mutations (own harness, per-mutation byte backup in `finally`, hash == HEAD verified after each): M1 `shell:true` -> KILLED (host test 8/9); M2 skip link validation -> KILLED (host 6/9; API test unaffected as its planner is faked); M3 skip 409 -> KILLED (API test 5/7, run cancelled); M4 accept any scope -> KILLED (API 10/12, host 8/9). 4 of 4 killed.
- After: harness deleted, production files equal HEAD blobs, `git status` clean.

ISSUES-WRITTEN: ISS-SENDNOWAPI-005

---

# Cycle checked: 1

VERDICT: PASS
Cycle checked: 1
Commit checked: 7c1fe0c (lane/sendnowapi)

## EXPLANATION

- Mint (ISS-SENDNOWAPI-001): `DEFAULT_SCOPES` in scripts/lib/mint-scopes.mjs equals the 14-scope `ALL_SCOPES` of the merge base b9e6f80 element for element and in order; `send-now` is added only by `--with-scope send-now`; any other name (typo, `join-rules`, `ask`) or a missing value throws and mint-key exits 1. `join-rules` is NOT in the default list and no script under scripts/ mints it; its WRITE_SCOPE is only checked in apps/api. So the precedent is "no default key holds a dedicated write scope"; no separate finding. scripts/ top level unchanged (lib/ is a subdir; only mint-key.mjs edited).
- Until (ISS-SENDNOWAPI-005): HH:MM is interpreted in the process's local zone via `setHours`, exactly as the existing `todayAt`/`runRecord`; hour>23 / minute>59 rejected (stricter than todayAt, which would roll over). ISO needs a UTC offset (Z or +hh:mm), real calendar date (Feb 29 non-leap rejected), seconds <=59 (no leap second 60). Boundary: `at <= now` refused (exactly now = rejected), `> +24 h` refused (exactly +24 h accepted). Everything the API accepts is also accepted by `todayAt` and passes runRecord's future check (the API's check is the same or stricter), so no 202-then-fail for until. Residual: HH:MM already passed today is "not in the future" (no next-day wrap), same as runRecord.
- 24 h cap: ASSUMPTION for the Approver, not a FAIL. grep of record-commands, send-now-command, the planner and docs finds no meeting-length bound (runRecord only requires future). The cap is the maker's; a multi-day webinar series is not a single recording, but the Approver should confirm 24 h.
- Tests: send-now.test 12/12, send-now-host.test 12/12. `tsc --noEmit -p apps/api`: exactly the 2 known base errors (src/indexing/session.ts:161, src/routes/brain.test.ts:139), none in touched files.
- Mutations (own harness inside the worktree, per-mutation backup in `finally`, hash == HEAD verified): M1 send-now added to the default list -> KILLED (send-now.test 1 fail); M2 past-time check disabled -> KILLED (send-now-host.test 2 fails). 2 of 2 killed. Harness deleted, trees clean.
- ISS-SENDNOWAPI-001 and -005 set to verified in qa/issues.sendnowapi.jsonl.

ISSUES-WRITTEN: none
