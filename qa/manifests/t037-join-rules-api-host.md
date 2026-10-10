# t037-join-rules-api-host

Status: ready-for-check
Fix cycle: 0
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

`join-rules-host.pid` in the state directory, created with the `wx` flag (contains the pid), removed on clean shutdown (exit/SIGINT/SIGTERM/server close, idempotent). If it exists, startup is refused with a message naming the file; it is never stolen, so a crash leaves a file that a human must check and delete (deliberate: fail closed). It does not touch the store.

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

## Not delivered

- The scheduler does not read the rules yet; T-037 remains in progress.
- docker-compose.yml and apps/api/Dockerfile still start the old entry point (`CMD ["npx","tsx","apps/api/src/index.ts"]`), so containers still answer 503 on /calendar/join-rules. To use the host in a container the owner must: (a) in the Dockerfile add `COPY scripts/webinar ./scripts/webinar` (the final stage copies only packages, apps/api, config; the host also imports dotenv, already installed) and change CMD to `["npx","tsx","scripts/webinar/join-rules-api-host.ts"]`; (b) mount a volume at `/app/raw/webinars` in docker-compose.yml. Note the scheduler runs on the Windows host, so the container's state would have to be a bind mount of the host's `raw/webinars` for both to read the same files. Simpler today: run the host command directly on the machine where the scheduler lives. None of this was changed here.
- Never run against a real deployment or real state directory in this unit.
- Follow-up (not done): `scripts/qa/join-rules-edit-api.test.ts` could import `createJoinRulesDeps` instead of its inline binding (left unedited per instructions).
