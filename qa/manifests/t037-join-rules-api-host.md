# t037-join-rules-api-host

Status: ready-for-check
Fix cycle: 1
Priority tier: 3 - next unblocked roadmap task (T-037)
Security class: auth + tenancy + data writes (makes the API a writer of the files that decide a no-click join) - FULL checker ceremony
Exit criterion advanced (docs/meeting-bot-roadmap.md:60): "rules are editable, and a trusted sender's next webinar is scheduled with no click" - the production WIRING for "rules are editable" only. **T-037 stays in progress** (the scheduler does not consult the rules yet).

## Files (all ADDED; nothing existing edited)

- `scripts/webinar/join-rules-host.ts` - `createJoinRulesDeps({ stateDir })`, `resolveStateDir()`, `prepareStateDir(dir)`, `acquireHostLock(dir)`.
- `scripts/webinar/join-rules-api-host.ts` - entry point.
- `scripts/webinar/join-rules-host.test.ts` - 5 tests.
- Location: `scripts/webinar/` (23 files after this unit, cap 30; the scripts/ root is at its limit). A script may import both `apps/api` and `packages/meeting-bot` because `.dependency-cruiser.cjs` cruises only packages/apps/workers.
- package.json: NO line added (no sibling API start script exists in its scripts section). Command documented here only.

## Start command (from the repo root)

`node --import tsx scripts/webinar/join-rules-api-host.ts`

Configuration is the API's own: repo-root `.env`, `MONGODB_URL`, `MONGODB_DB`, `PORT` (default 3300), `GEMINI_API_KEY`, `CORS_ORIGINS` etc. No flags, no secrets on the command line.

## How the start mirrors apps/api/src/index.ts

index.ts's `main()` is inline and not exported, so the same building blocks are imported (no index.ts edit needed): `dotenv` loading the repo-root `.env`, `connect(MONGODB_URL ?? "mongodb://localhost:27017", MONGODB_DB ?? "lkb")`, `startServer(deps)` (PORT handling lives in it), the same "@lkb/api listening on :PORT" log and "@lkb/api failed to start:" error log with `process.exitCode = 1`, the same run-only-when-executed-directly guard. Deps are `{ ...buildProductionDeps(), joinRules: createJoinRulesDeps({ stateDir }) }`. Deliberate differences: (1) state-dir check + pid lock before connecting; (2) lock release on `exit`, SIGINT (exit 130) and SIGTERM (exit 143) - index.ts has no shutdown handling, so these handlers are new, for the lock only; (3) one line printing the resolved state directory. `connect` is imported by relative path (`packages/db/src/index.js`) because `@lkb/db` does not resolve from scripts/; in a main-tree run this is the same module file index.ts gets via `@lkb/db`.

## State directory rule

The scheduler (`packages/meeting-bot/src/calendar/schedule-tick.ts:16`) uses a constant, `<repo root>/raw/webinars`, and reads NO environment variable. The host resolves the same: `<repo root of this script>/raw/webinars` (store files at `raw/webinars/join-rules/<tenant>.json`). Refuses to start with a clear message if the repo root cannot be derived, the path is not absolute, or it cannot be created (recursive mkdir, as the store does) / is not writable. Prints the resolved directory once, never its contents. There is deliberately no override flag or variable (an override would let the host and the scheduler read different files).

## Writers analysis

Search for `saveJoinRules|recordTenantApproval|recordTenantOptOut` across *.ts/*.mjs/*.js: callers are only `packages/meeting-bot/src/calendar/join-rules-store.ts` (definitions), its own test, `scripts/qa/join-rules-edit-api.test.ts` (temp dir), and now this host's binder. No CLI, scheduler or script writes these files today (the scheduler writes `schedule-state.json` / `scheduled/`, different files; the scheduler does not read join rules yet). **The API host is therefore the single writer after this unit**, provided one host runs per state directory - which the pid guard enforces. Within the one process the router's per-tenant lock serialises writers. Caveats: the guard covers only hosts using this entry point (a different process calling the store directly, or another lane's future CLI, is not covered - the store lock being built in another lane is the real fix; none added here); a different machine/container sharing the directory over a network share is not covered.

## Second-host guard: built

`join-rules-host.pid` in the state directory, created with the `wx` flag, removed on clean shutdown (exit/SIGINT/SIGTERM/server close, idempotent, only if it still holds our token). SUPERSEDED in part by Fix cycle 1: a lock whose owner is provably gone is now taken over (see below); a live owner still refuses startup. It does not touch the store.

## Security posture

Unchanged: the tenant still comes only from the authenticated key inside the router; the binder passes tenant and values straight through; no default tenant, bypass flag, debug route or CORS change; store errors propagate unchanged so the router's status mapping applies; writes still need the `join-rules` scope (reads need `calendar`, as before).

## Evidence

Node: `C:\Users\product\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin` on PATH. Node_modules are junctions to the main tree (toolchain note).

`node --test --import tsx scripts/webinar/join-rules-host.test.ts` (under `timeout 150`):
```
✔ GET is no longer 503; PUT/GET round trip; approvals and opt-outs persist and survive a restart
✔ two tenants are isolated on disk; without the join-rules scope writes are 403 (reads stay calendar-scoped) and nothing is written
✔ a corrupt stored file answers 500 (store error passes through) and the bytes are unchanged
✔ state directory: resolves like the scheduler, is created, and refusals are clear
✔ single-host guard: second host refused, leftover file never stolen, released on shutdown
ℹ tests 5   ℹ pass 5   ℹ fail 0
```
(The first run had 1 failure - my own test wrongly expected GET without `join-rules` scope to be 403; the router has always allowed reads with `calendar`. Test corrected, router untouched.)

`node --check scripts/webinar/join-rules-api-host.ts` -> exit 0.

Type check: scratch `tsconfig.json` in the session scratchpad (extends `tsconfig.base.json`, `noEmit`, `files` = the three new files, typeRoots from `apps/api/node_modules/@types`), `node node_modules/typescript/lib/tsc.js -p <scratch>/tsconfig.json` -> no output (clean). This also proves `createJoinRulesDeps` returns a valid `JoinRulesDeps`.

Not run: `node scripts/lint-dirsize.mjs` / `lint-loc` (the walk through the junctioned node_modules exceeded the 120s timeout in this lane; file count of `scripts/webinar` checked by hand: 23 < 30). The entry script was NOT launched (it needs Mongo and a live deployment).

## Fix cycle 1 (ISS-T037HOST-001)

**What failed (cycle 0):** the pid was written but never read, so after kill / crash / reboot / Windows service stop the leftover file refused every later start until a human deleted it (R1: recover after interruption). Plus a low note: removing the state-dir writability check survived mutation.

**Changed (only `scripts/webinar/join-rules-host.ts`, its test, and this manifest):** `acquireHostLock(stateDir, pid?, deps?)` (deps = test seam: `kill`, `bootTimeMs`, `log`); `prepareStateDir(dir, fs?)` gained an optional fs seam. Entry point untouched (it still calls `acquireHostLock(stateDir)` and releases on exit/SIGINT/SIGTERM/failure). host.ts 156 non-blank lines, test 248; scripts/webinar still 23 files; no dependency added.

**Lock file content** (one JSON line): `{"pid":N,"token":"<32 hex, random>","startedAt":<ms>,"boot":<ms, rounded to 1 s>}` where `boot = Date.now() - os.uptime()*1000`.

**Decision table** (pid file exists):

| File state | Action |
|---|---|
| Parseable, abs(boot - our boot) > 120 s | stale (reboot detected): take over, pid not consulted |
| Parseable, same boot, `kill(pid,0)` -> ESRCH | stale (pid not running): take over |
| Parseable, same boot, kill OK / EPERM / any other error | held: refuse, message names file and pid |
| Unparseable/empty/truncated/bad fields, mtime <= 60 s | held (a host may be mid-write); pid check not consulted |
| Unparseable, mtime > 60 s | abandoned partial write: take over |
| Absent | normal `wx` create |

Parse is strict: JSON object with integer pid > 0, 32-hex token, finite startedAt and boot. The legacy bare-pid form (`999999\n`) counts as unparseable.

**Take-over sequence** (file judged stale from exact bytes R): (1) create `join-rules-host.pid.takeover` with `wx`, the take-over mutex; EEXIST means another starter is taking over -> "held by another host" (a mutex older than 30 s, left by a crashed taker, is removed once and retried); (2) under the mutex re-read the pid file: not byte-identical to R -> release mutex, "held by another host"; (3) write our record to `join-rules-host.pid.<token>.tmp`; (4) `renameSync(tmp, pid file)`, retrying EPERM/EBUSY/EACCES every 25 ms up to a 2 s deadline, then fail closed with a clear message; (5) re-read and require our token, else "held by another host"; (6) finally remove tmp and mutex; (7) log one line: `took over stale lock <file> (<reason>; old pid <n|unknown>)`. A starter arriving after a winner finished sees a live owner on its first read, or a changed file in step 2, and is refused. The pid file exists at every instant of the replace (rename-over), so a plain-`wx` newcomer cannot slip in. (Plain re-read-then-rename without the mutex was rejected: two starters can both pass the check and both rename.)

**Thresholds:** boot jitter allowance 120 s (`BOOT_JITTER_MS`): wall-clock steps/NTP corrections and `os.uptime()` rounding shift the computed boot time by seconds, so under two minutes is "same boot"; a reboot within 120 s of the previous boot falls back to the pid check. Partial-write abandonment 60 s (`PARTIAL_WRITE_ABANDONED_MS`). Take-over mutex staleness 30 s. Rename deadline 2 s.

**Kept:** `wx` on the normal path; release on exit/SIGINT/SIGTERM/startup failure, idempotent, and now deletes the file only if it still holds our token; clear refusal naming the file and holder pid; binder, store, router, apps/api untouched.

**Evidence** (Node on PATH as in cycle 0; `timeout 280 node --test --import tsx scripts/webinar/join-rules-host.test.ts`):
```
ISS-T037HOST-001: 3/3
race rounds: 4, winners per round: 1,1,1,1
ℹ tests 9   ℹ pass 9   ℹ fail 0
```
9 tests = the 4 unchanged-in-intent cycle-0 tests (the state-directory test gained the writability assertions via the fs seam: access denied -> "not writable (EACCES)", mkdir denied -> "cannot be created") + 5 lock tests that replace the old "leftover never stolen" test (that behaviour is superseded): replay of the issue; lock content / refusal / release-only-own-token; decision table (previous boot with a live pid taken over; inside the allowance with a live pid refused; dead pid taken over; EPERM and an unknown error both refused; empty, newline, truncated JSON, garbage, invalid fields: fresh refused with the pid check never consulted, mtime +61 s taken over; no temp or mutex file left); a real live child refusing the second start with its lock byte-identical afterwards, and a killed child's lock taken over; the race: two real processes against one stale file, 4 rounds, exactly one WON per round, the other HELD, the file belongs to the winner, no `.takeover` left.

**D-015:** the ledger's recorded repro is a pid file `999999\n` with nothing running. `ISS-T037HOST-001: 3/3` = that exact content (mtime aged past 60 s, since it is now a legacy unparseable form), a bare dead pid (aged likewise), and a full record of a dead pid; all taken over with a logged reason. Open and named: the repro's literal file with a fresh mtime is refused by design (unparseable and recent = possibly mid-write); a lock left by cycle-0 code therefore needs 60 s of age or one manual delete.

`node --check scripts/webinar/join-rules-api-host.ts` -> exit 0. Type check: scratch tsconfig outside the repo (extends `tsconfig.base.json`, `noEmit`, `files` = join-rules-host.ts, join-rules-api-host.ts, join-rules-host.test.ts, node types from `apps/api/node_modules/@types`), `node node_modules/typescript/lib/tsc.js -p <scratch>` -> exit 0, no output. No mutation run this cycle; no full suite, database, real server or entry-point launch.

**Residual risks:** (1) pid reuse within the same boot: a dead host's pid taken by an unrelated process makes the stale lock look alive until the next reboot or manual deletion (fail closed). (2) The boot-time heuristic depends on the system clock: a clock jump over 120 s between lock write and next start reads as a reboot and can take over from a LIVE host. (3) A crash inside the few-millisecond take-over leaves a `.takeover` mutex that blocks takers up to 30 s, then is removed; two cleaners hitting that edge at once could both remove it (double fault). (4) Rename-over relies on Windows allowing rename of a file nobody holds open; otherwise it fails closed after 2 s.

## Not delivered

- The scheduler does not read the rules yet; T-037 remains in progress.
- docker-compose.yml and apps/api/Dockerfile still start the old entry point (`CMD ["npx","tsx","apps/api/src/index.ts"]`), so containers still answer 503 on /calendar/join-rules. To use the host in a container the owner must: (a) in the Dockerfile add `COPY scripts/webinar ./scripts/webinar` (the final stage copies only packages, apps/api, config; the host also imports dotenv, already installed) and change CMD to `["npx","tsx","scripts/webinar/join-rules-api-host.ts"]`; (b) mount a volume at `/app/raw/webinars` in docker-compose.yml. Note the scheduler runs on the Windows host, so the container's state would have to be a bind mount of the host's `raw/webinars` for both to read the same files. Simpler today: run the host command directly on the machine where the scheduler lives. None of this was changed here.
- Never run against a real deployment or real state directory in this unit.
- Follow-up (not done): `scripts/qa/join-rules-edit-api.test.ts` could import `createJoinRulesDeps` instead of its inline binding (left unedited per instructions).
