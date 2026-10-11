# Verdict — t037-join-rules-api-host

VERDICT: FAIL
Cycle checked: 0
Scope: maker commit 4a64ae7 (base 7f352eb). Contract `qa/contracts/t037-join-rules-api-host.md`. Security class, full ceremony, uncapped. Single blocking finding: ISS-T037HOST-001 (medium, availability; criterion 7). Everything security-relevant passes.

## Independent results (portable node, every run under `timeout`; no DB, no server on a fixed port, host entry never launched)

- `git show --stat 4a64ae7`: join-rules-host.ts (61), join-rules-api-host.ts (44), join-rules-host.test.ts (121), manifest. 4 files, 295 insertions, no existing file, no package.json. PASS.
- `node --test --import tsx scripts/webinar/join-rules-host.test.ts`: tests 5, pass 5, fail 0.
- `node --check scripts/webinar/join-rules-api-host.ts`: rc 0.
- Type check: scratch tsconfig (extends tsconfig.base.json, noEmit, types node, `files` = the three new files; imports pull in apps/api and meeting-bot sources): tsc rc 0, no output.
- Budgets (non-blank lines): 56 / 41 / 114 (limits 300 / 300 / 400); scripts/webinar holds 23 files (scripts override 32; manifest says cap 30). `node scripts/lint-dirsize.mjs` (300 s timeout) completed: `lint-dirsize: OK (111 dir(s) within budget)`.

## Binder (criteria 2, 3): PASS
Identical to the binding in scripts/qa/join-rules-edit-api.test.ts and the `JoinRulesDeps` shape: load(t)->loadJoinRules(dir,t); save(t,v)->saveJoinRules(dir,t,v); recordApproval(t,a); recordOptOut(t,id); validateRuleSet = validateJoinRuleSet. Arrow functions with no try/catch, no default tenant, tenant read only from the argument.
Own probe (real createServer, temp dir): no key GET 401, bad key 401, calendar-only POST approvals 403, calendar-only PUT 403, nothing created on disk after denials; with a corrupt `t1.json`: GET 500, PUT 500, POST approval 500, bytes unchanged. The unit's tests cover round trip, restart persistence, two-tenant isolation, corrupt file.

## Entry point vs apps/api/src/index.ts: every difference
1. `connect` imported from `../../packages/db/src/index.js` instead of `@lkb/db`.
2. `startServer` and `buildProductionDeps` imported from `../../apps/api/src/...` (relative) instead of `./server.js`, `./composition/production.js`.
3. `HERE` computed from `scripts/webinar`, `.env` path `../../.env` (same repo-root file as index.ts's `../../../.env`).
4. No `export { createServer, ... }` re-export (irrelevant for a runnable script).
5. ADDED: `prepareStateDir(resolveStateDir())`, `acquireHostLock`, `process.on("exit", release)`, SIGINT/SIGTERM handlers, log `join-rules state directory: <path>` (a path only), `server.on("close", release)`, try/catch that releases on failure then rethrows.
6. Deps are `{ ...buildProductionDeps(), joinRules: createJoinRulesDeps({ stateDir }) }`: spread FIRST, so joinRules cannot be shadowed; the only added key is `joinRules`.
Same: dotenv load, connect args and defaults, listening log, failure log + `exitCode = 1`, direct-execution guard. No auth/rate-limit/CORS option, no debug route, no bypass, no default tenant, no secrets on the command line or in logs. PASS.

## db module identity (criterion 5): PROVEN for the link layout; real entry not run
Real checkout: apps/api imports `@lkb/db` through `apps/api/node_modules/@lkb/db` (a link to packages/db, main ./src/index.ts); the host imports packages/db/src/index.ts by relative path. Node resolves links to real paths by default; `--preserve-symlinks`/NODE_OPTIONS appear nowhere in the repo. Probe: scratch package `@lkb/db` exporting an object, a junction (mklink /J) to it under `app/node_modules/@lkb/db`, one module importing it by bare specifier, a script importing the real path relatively, run with `node --import tsx`: `same instance via junction: true`. So host and API share one module (one pool, connected). Caveat, not a defect: inside THIS lane node_modules links point at the MAIN tree, so a host run here would load two copies; a lane artefact. Only a real Mongo start is UNVERIFIED-AT-RUNTIME.

## Signals and exit (criterion 6): PASS
SIGINT/SIGTERM handlers call `release()` then `process.exit(130/143)`: the process terminates. The `exit` handler also calls release; it is idempotent (`released` flag). A throw after locking (connect failure, startServer throw) hits `catch { release(); throw e }`; uncaught exceptions run the `exit` event, so no stale file. Probe: acquire creates the pid file, release removes it.

## Stale pid (criterion 7): FAIL, ISS-T037HOST-001 (medium)
`kill -9`, `taskkill /F`, Windows service stop (SIGTERM is not delivered to handlers on Windows), crash, power loss or reboot all leave `raw/webinars/join-rules-host.pid`, and `raw/webinars` is on disk. Probe: a file containing `999999` makes `acquireHostLock` throw: `join-rules host: <dir>\join-rules-host.pid exists, so another host owns this state directory (or it crashed). Not starting. If no host is running, delete that file and retry.` The message is clear and names the file, but the pid is written and never read. Ruling: "never steal" is wrong for a production service that must come back after a reboot without a human; a liveness check (`process.kill(pid,0)`, ESRCH means stale) is the standard answer, imperfect only under pid reuse, whose failure mode (refuse to start) is the safe direction. Medium, but it blocks PASS because R1 (recover after interruption) is a stated requirement and the lock is this unit's own addition.

## State directory, git, writers (criteria 8, 9): PASS
- Scheduler: schedule-tick.ts:16 `DEFAULT_STATE_DIR = <REPO_ROOT>/raw/webinars`, no env var. Host: `<repo root of the script>/raw/webinars`, no override. Same place for a checkout. (record-commands.ts honours `LKB_RECORD_DIR`; that is the recorder, not the scheduler: note only.)
- `git check-ignore -v raw/webinars/join-rules/x.json` and `raw/webinars/join-rules-host.pid`: both `.gitignore:72:raw/webinars/`. Tenant rule files and the pid file cannot be added by a careless `git add`. Not a finding.
- Container: manifest "Not delivered" states COPY scripts/webinar, new CMD, and a bind mount of the host's raw/webinars at /app/raw/webinars, with the scheduler-on-Windows caveat; adequate (low: it is in the last section, not the top).
- `git grep` for saveJoinRules|recordTenantApproval|recordTenantOptOut: definitions, their tests, the scripts/qa test, and this binder only. The host is the sole writer; the pid lock guards host-versus-host only (the store lock in another lane is the real fix).

## Mutation table (join-rules-host.ts; per-mutation byte backup, 150 s timeout, restore via subshell trap plus explicit cp; `git hash-object` equals `git rev-parse HEAD:` = ea8b639b874d9c553042deba95c0a40c718680ba after each)
| Mutation | Result |
|---|---|
| M1 `load` swallows store error, returns empty | KILLED (1 fail) |
| M2 `load` uses fixed tenant "tenant-a" | KILLED (1) |
| M3 remove `accessSync(W_OK)` writability check | SURVIVED (mkdir failure still tested; read-only existing dir untested) |
| M4 pid file opened with "w" instead of "wx" | KILLED (1) |
| M5 `save` writes to fixed tenant "shared" | KILLED (2) |
The entry file has no tests; its ordering (spread first, release in catch, handlers) was verified by reading only.

## Manifest (criterion 11): accurate
Start command, files, differences, "not delivered" (scheduler does not read rules; Dockerfile/compose still start the old entry; exact owner changes) match the code; the host was never launched by the maker nor by this checker.

ISSUES-WRITTEN: ISS-T037HOST-001 (medium, qa/issues.t037host.jsonl)
EXPLANATION: Fix cycle 1 needs only a stale-pid check in `acquireHostLock` plus two tests (stale replaced, live refused). Notes, not backlog: M3 survived (writability check untested); the entry point has no automated test; the container note could be more prominent; a lane-local run would double-load the db module only because node_modules link to the main tree.

---

# Cycle 1

VERDICT: PASS
Cycle checked: 1
Scope: maker commit 467202d (diff against 7b830fb: join-rules-host.ts 156 lines, its test 248 lines / 9 tests, manifest). Nothing outside those three files changed in source. Ruling is conditional on MERGE ORDER: merge after unit t037-join-rules-store-lock (see point 1).

## Commands and results (portable node, every run under `timeout`; no DB, no fixed-port server, host entry never launched)
- `node --test --import tsx scripts/webinar/join-rules-host.test.ts` x4: each `ISS-T037HOST-001: 3/3`, `race rounds: 4, winners per round: 1,1,1,1`; last run `tests 9 / pass 9 / fail 0`.
- `node --check scripts/webinar/join-rules-api-host.ts`: rc 0. Scratch-tsconfig tsc over the three files: rc 0.
- Budgets (non-blank): 156 / 41 / 248 (limits 300 / 300 / 400); scripts/webinar 23 files (unchanged).
- Binder/auth/tenancy spot-check: the unit tests 1-3 (GET not 503, calendar-only key 403, corrupt file 500 with bytes unchanged) pass; the non-lock host code is unchanged from cycle 0.

## Decision table
| Rule | Finding |
|---|---|
| (1) boot differs by >120 s: take over without pid | DEMONSTRATED UNSAFE (below); accepted as residual risk, conditional on the store lock |
| (2) same boot, ESRCH: take over | OK (probe + test) |
| (3) same boot, alive / EPERM / other error: refuse | OK, message names file and pid |
| (4) unparseable, mtime <=60 s: refuse | OK |
| (5) unparseable, >60 s: take over | OK for crashes. Normal path is `openSync(file,"wx")` then `writeSync` then close: two steps, so a starter stalled 60 s between them could be taken over while alive; negligible (adjacent syscalls). A legacy bare-pid file left by a LIVE old-version host older than 60 s would be taken over by the new version: only if old and new hosts overlap during an upgrade; operational note |

## Point 1 probe (boot rule vs a live holder)
Host A = this process acquires normally (real boot). B = `acquireHostLock(dir, pid+1, { bootTimeMs: () => currentBootTimeMs() + 121_000 })` while A is alive. Output: `took over stale lock ... (reboot detected since the lock was written; old pid 29820)` then `B ALSO ACQUIRED while A alive`. The unit test itself asserts this behaviour (live pid, boot 10 min off). So a wall-clock step over 120 s (or VM resume/migration, bad first NTP sync) plus a second start while the first is alive gives two live hosts holding the lock. Whether os.uptime() includes sleep on Windows was not measured (unverified, not relied on).
Realism: rare (needs a step over 2 min AND a second start while the first runs). Severity as a defect of the pid lock's own property: medium-low. Mitigations that make it acceptable: (a) the store-level cross-process lock (t037-join-rules-store-lock) has PASSED and been merged to main, so two concurrent hosts can no longer lose an update including opt-outs; the pid lock becomes a convenience guard; (b) both hosts would bind the same PORT, so the second normally fails with EADDRINUSE (stated, not run). Recommended refinement (not required): on a boot mismatch take over only if the pid is also not alive. Merge order: this unit MUST merge after t037-join-rules-store-lock; without it rule (1) is a lost-opt-out path and I would FAIL.

## Race and failure windows (real processes)
- 20 rounds against one stale lock (10 x 2 starters, 10 x 4 starters, synchronized start): exactly 1 winner every round, pid file held the winner pid every round, nothing left on disk. Plus the unit 4 rounds x 3 runs.
- 25 rounds x 4 starters against a stale lock plus a 60 s-old stale `.takeover` mutex: 1 winner every round, no leftovers.
- On-disk failure windows (states constructed; real kill points are not injectable): killed after creating the mutex: next start refused ("another host is taking over") until the mutex is 31 s old, then acquired, nothing left. Killed after writing temp: mutex + tmp left; after 31 s acquired; the `join-rules-host.pid.<token>.tmp` file stays as litter (harmless). Killed after rename before mutex removal: pid file holds a dead host record, mutex left; refused until 31 s, then acquired. No window produced two holders. Recovery is unattended only if something restarts the process: the entry exits with code 1 and has no retry; docker-compose services use `restart: unless-stopped`, a Windows service manager must be configured likewise. Operational note.
- Theoretical flaw, NOT reproduced: stale-mutex removal is unlink-then-create; two starters that both see an aged mutex can each unlink the other fresh one and both proceed, and could each rename and read back their own token inside a few-ms window. Needs a crashed take-over AND simultaneous starters; 25 rounds never hit it. Residual.

## Release
Removes the file only when it holds our token (M6 killed), idempotent, runs on exit/SIGINT/SIGTERM/startup failure. A host whose lock was taken over while alive never notices (no periodic re-check): the two-host condition persists silently; covered by the store lock. Note only.

## D-015
ISS-T037HOST-001 recorded repro `999999\n`: taken over when aged (over 60 s) and logged; refused when fresh, by design. Unit replay 3/3 (`999999\n`, bare dead pid, full record of dead pid). A fresh legacy file after crash-plus-restart is refused up to 60 s; recovery on a later start needs a restarting service manager.

## Mutations (join-rules-host.ts; per-mutation byte backup, trap restore, 200 s timeout; hash after every run = HEAD blob 01d33ca703879234408698614dea74778b19587e)
| Mutation | Result |
|---|---|
| M1 take over even when the pid is alive | KILLED (3 fail) |
| M2 skip re-read-and-compare before rename | SURVIVED |
| M3 skip post-rename token check | SURVIVED |
| M4 EPERM treated as dead | KILLED (1) |
| M5 mutex created with "w" instead of "wx" | KILLED (1) |
| M6 release deletes without token check | KILLED (1) |
M2/M3 survive because the tests cannot interleave inside the take-over; the guards are untested. Note, not backlog.

ISSUES-WRITTEN: none
EXPLANATION: The cycle-0 defect is fixed: crash, kill, service stop and reboot recover without a human, take-over is serialized, and every constructed failure state recovers. The boot-time rule can displace a live host after a clock step over 120 s (demonstrated); accepted only because the store-level lock now protects data and a second host would also collide on the port, so merge strictly after t037-join-rules-store-lock. Residuals recorded in the contract.
