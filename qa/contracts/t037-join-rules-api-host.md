# Contract — t037-join-rules-api-host (T-037, unit 4: production host)

> Ground truth for `scripts/webinar/join-rules-host.ts` and `join-rules-api-host.ts`. Written by the checker; the maker never edits it.
> Not in scope (T-037 stays open): scheduler consulting the rules, Dockerfile/compose changes, sender authentication.

## Security property
Starting the API through this host makes `/calendar/join-rules` live without weakening anything: auth, scopes, rate limiting, CORS and tenant derivation are exactly the production server's, and the real store is reached only with the authenticated tenant, failing closed on any store error.

## Criteria
1. Scope: only new files in scripts/webinar/ plus the manifest; no existing file or package.json edited.
2. Binder faithful: load/save/recordApproval/recordOptOut/validateRuleSet map to the real store/engine with (stateDir, tenant, value) order; tenant only from the argument; no default tenant; store errors propagate unchanged (corrupt file -> router 5xx, bytes unchanged, never overwritten).
3. Through the real server factory: GET not 503; PUT/GET round trip; approvals/opt-outs survive a fresh binder; two tenants isolated on disk; calendar-only key cannot write (403, nothing written); no/unknown key 401.
4. Entry point = index.ts's main() plus only: state-dir check, pid lock, state-dir log line, lock release on exit/SIGINT/SIGTERM. Same `startServer`, `buildProductionDeps()` spread FIRST, no option disabling auth/rate-limit/CORS, no bypass/debug/default tenant, no secrets in args or logs.
5. `connect` imported by relative path is the same module instance the API code uses (no second, unconnected db module).
6. Signals release the lock AND terminate; release idempotent; a startup failure after locking releases the lock.
7. Recovery: an unclean stop (kill, crash, reboot) must not require a human to delete a file before the service can start (stale-pid detection by liveness).
8. State directory equals the scheduler's (`<repo root>/raw/webinars`, no override) and rule/pid files are git-ignored.
9. Single writer: no other code writes the rule files.
10. Tests (run under timeout) assert 2, 3, state dir and lock behaviour; mutations (swallow load error, fixed tenant, no `wx`, tenant swap) fail the suite; budgets within structure.config.json.
11. Manifest accurate, including what is not delivered and that the host was never launched.

## Pid lock rules (added by checker, cycle 1)
Lock file: one JSON line `{pid, token, startedAt, boot}`. Existing file: boot differs by over 120 s from the current boot -> take over without consulting the pid; same boot + pid ESRCH -> take over; same boot + alive/EPERM/other -> refuse naming file and pid; unparseable and 60 s old or less -> refuse; older -> take over. Take-over is serialized by a `.takeover` mutex (over 30 s old: removed once), re-reads the exact stale bytes, renames a temp file over, verifies our token. Release deletes only a file holding our token; idempotent.
Stated residual risks (accepted ONLY because the store-level cross-process lock, unit t037-join-rules-store-lock, protects writes; this unit must merge after it): (a) a wall-clock step over 120 s lets a second start displace a live host; (b) pid reuse within one boot keeps a dead host lock alive; (c) a crash inside take-over blocks starts up to 30 s and leaves a tmp file; (d) stale-mutex removal is unlink-then-create (not reproduced); (e) a host that lost its lock never notices; (f) the entry exits on refusal, so unattended recovery requires a restarting service manager.
