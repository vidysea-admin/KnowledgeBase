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
