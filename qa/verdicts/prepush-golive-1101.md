# Verdict — prepush-golive-1101 (6c pre-push integration check, Mode A)

**VERDICT: GO (with an environment caveat on 9 web reds that are not in the baseline table; see Reds)**
**Policy-Version:** proportional-verification/2026-10-19.17 (rules .13-1, .13-2: a2c2b4c0 is an auth-trigger unit and bc89648d is config, so the FULL suite ran)
**Checked head:** e15668f44e990b91f0338adcaafd6f3085c56ee5 (branch docs/devops-golive-2026-10-26; tree adef68b84b1023d41aa993b799d7f54da5d01194)
**Previous 6c-checked head:** 4e4d0767 (prepush-wa-wave4.md, GO, stamp 96de17c7)
**Range under check (unpushed):** 7388d5f0 (qa), a2c2b4c0 fix(web) unverified sign-in message ISS-442 (user-accounts.ts, LoginPage.tsx, AccountPages.test.tsx; dual PASS), bc89648d docker-compose value-less env forwards (D-212, checker PASS), plus qa/docs commits.
**Stamp:** STAMPED. `qa/.6c-green` = `adef68b84b1023d41aa993b799d7f54da5d01194`.

## Step table

Steps 1 to 4 ran in a clean detached worktree of HEAD at `D:/kb-scratch/6c5/wt` (`git worktree add --detach`, `pnpm install --frozen-lockfile`, exit 0, 17 s). TMP, TEMP, TMPDIR and npm cache were on `D:/kb-scratch/6c5/` for every command; no ENOSPC, heap or worker-crash line in any log. API and web suites ran concurrently, no bail, under `timeout 3000`, NODE_OPTIONS=--max-old-space-size=4096, `--test-concurrency=6` / vitest `--minWorkers=1 --maxWorkers=4` (wave4 settings). No Mongo env var set, no mongod started (the user's 27018/27019/27020 listeners were not touched).

| # | Step | Command | Exit | Result |
|---|---|---|---|---|
| 1 | Typecheck | `pnpm -r typecheck` | 0 | all 9 packages Done, no error lines |
| 2 | Structure lint | `pnpm lint:structure` | 0 | 10 stages, 0 failed; dependency-cruiser 1923 modules, 8988 dependencies, no violations |
| 3a | API tests, full | `node --test --test-concurrency=6 --import tsx "src/**/*.test.ts"` (apps/api) | 1 | 2718 tests: 2671 pass, 1 fail (baseline R1), 46 skipped (Mongo-gated), 0 cancelled |
| 3b | Web tests, full | `vitest run --minWorkers=1 --maxWorkers=4` (apps/web) | 1 | 154 files (150 pass, 4 fail), 1470 tests: 1458 pass, 10 fail, 2 skipped. 1 baseline (R2), 1 load flake (R3, passes alone), 8 host-environment reds (R4, R5; see below) |
| 4a | API production build | `pnpm --filter @lkb/api build` | 0 | `apps/api/dist/server.js` 1,859,834 bytes (identical to wave4) |
| 4b | Web production build | `pnpm --filter @lkb/web build` (`tsc -b && vite build`) | 0 | built in 2.33 s (chunk-size warning only) |
| 5 | Compose config, empty env | `docker compose --env-file <empty file> config -q` | 1 | `required variable MONGODB_URL is missing a value`. Pre-existing: docker-compose.yml lines 30/32/51/53/60 use `${VAR:?...}` and are unchanged by bc89648d (the diff vs 4e4d0767 is 14 pure insertions, no `:?` line touched). An empty env file therefore can never exit 0 on this repo. |
| 5b | Compose config, placeholder env | `docker compose --env-file <file with MONGODB_URL, MONGODB_DB, OLLAMA_API_KEY placeholders> config -q` | 0 | parses. `config --format json` shows the api service carrying AUTH_CSRF_SECRET, USER_SIGNUP_TENANT, USER_SIGNUP_DAILY_CAP, APP_PUBLIC_ORIGIN, APP_BASE_PATH, TRUST_PROXY_HOPS, WHATSAPP_ARCHIVER_API_URL, _TOKEN, _ALLOW_PRIVATE_HTTP (value-less, undefined when absent) and web APP_USER_ACCOUNTS. Placeholders are inert dummy strings, not secrets. |
| 6 | Stamp | `tick.mjs --stamp-6c-green` in a second clean detached worktree of HEAD | 0 | `6c-green: adef68b84b1023d41aa993b799d7f54da5d01194`; copied to the shared checkout `qa/.6c-green`; `tick.mjs --push-gate` there prints `push-gate: green adef68b84b1023d41aa993b799d7f54da5d01194` |

## Reds

| # | File | First error line | Status |
|---|---|---|---|
| R1 | apps/api/src/activity-health/router.test.ts:150, "actual producer -> Python first/reclaim/fences -> real production Mongo binding -> authenticated current server -> consumer output" | `AssertionError [ERR_ASSERTION]` then `null !== 0` (`.venv/Scripts/python.exe` absent in a worktree) | **baseline** (hash 3e3bc1aa4251 row; identical to wave3/wave4 R1) |
| R2 | apps/web/src/pages/knowledge/speakers/KnowledgeSpeakerProfilePage.test.tsx, "immediate speaker UI replays actual scripted U24 producer output ..." | `expected 'c85a312586515f4b...' to be '98948cae1b8f3d81...'` | **baseline** (hash d63667bfa471 row) |
| R3 | apps/web/src/pages/calibration-review/CalibrationReviewPage.test.tsx, "saves one fractional judgment, shows persisted progress and resumes after reload" | `Unable to find an element with the text: /review-001 saved with its audit receipt/` | **load flake, not baseline**: fails in the 4-worker full run, passes in a single-worker rerun of its file (with 2 other files) |
| R4 | apps/web/src/pages/CalendarPage.test.tsx, 6 tests: "[C4]/[C7] ... a failed sessions load surfaces the error, not a filter message"; "connected worker coverage > cancelled source events retain their status in the details panel"; "complete calendar inventory ... all-day meetings retain the source date in the list"; "... cancelled meetings remain listed without an active Join link"; "cycle1 operator inventory boundary > a source outage cannot claim the tenant has no Calendar data"; "cycle1 Gmail evidence and coverage > unresolved candidate evidence is visible and cannot be approved" | `Error: expect(element).toBeInTheDocument()` / `element could not be found in the document` at CalendarPage.test.tsx:270, 341, 347 (and `Unable to find an element by: [data-testid="event-detail"]`) | **NEW to the baseline table, NOT introduced by this range** (see Classification) |
| R5 | apps/web/src/pages/sessions/SessionDetailPage.test.tsx, 2 tests: "citation selected before loading preserves initial target through Blob metadata"; "initial WebM citation and subsequent note seek route through stream controller" | `AssertionError: expected +0 to be 45` / `expected "spy" to be called with arguments: [ 80 ]` (single-file run: `expected null to be 'blob:initial'`) | **NEW to the baseline table, NOT introduced by this range**; reproduces at the baseline sha b3eabbee |

### Classification of R4 and R5 (compared against 4e4d0767 and b3eabbee, same host, same day)

- Scratch detached worktree of **4e4d0767** (the previous GO head, `pnpm install --frozen-lockfile`): `vitest run CalendarPage.test.tsx SessionDetailPage.test.tsx` with one worker gives exactly the same 8 failures (6 Calendar, 2 SessionDetail). Wave4 recorded these files green on 2026-10-28 at the same tree, so the host changed, not the code.
- Scratch detached worktree of **b3eabbee** (the recorded baseline sha): the same 2 SessionDetailPage tests fail; the Calendar tests at that sha are a different, smaller file and pass. So R5 meets this file's own baseline rule (fails at the baseline sha); R4 only meets the "fails at the previous GO head" rule.
- The shared checkout `D:/KnowledgeBase/apps/web` gives the same 6 Calendar failures.
- No file in this range's diff (user-accounts.ts, LoginPage.tsx, AccountPages.test.tsx, docker-compose.yml, qa/docs) is imported by CalendarPage or SessionDetailPage tests, and all AccountPages tests pass.
- Behaviour is stateful and selection-dependent, not a stable per-test fault: each failing Calendar test passes when run alone with `-t`, and which test in a describe fails changes with the selection (a "passes alone, fails in file" order effect, found live as `toBeInTheDocument` failing on an element `findByText` just returned, i.e. detached after render). It is not a wall-clock effect: faking `Date` to 2026-09-25, 2026-10-28 and 2026-10-31 (scratch vitest config in the throwaway worktree only) changed nothing. Not isolated further; root cause is unknown, only the host-drift evidence above.
- Host facts at check time (for whoever picks this up): Node v24.13.1, IST, local listeners on 3001, 5173, 8787, 27018-27020 (the E2E stack; not touched).

Decision: the push gate asks whether this range regresses anything. It does not: the reds are identical at the previously stamped head and (R5) at the baseline sha. They are stamped over as pre-existing. Owner action for baseline-reds.md (not edited here; outside this unit's write scope): add R4 and R5 rows, and open an issue to find the Calendar and SessionDetail order dependence that appeared between 2026-10-28 and 2026-11-01. If the Approver prefers a hard rule of "only table rows may be stamped over", revoke by deleting the untracked `qa/.6c-green` and treat this as NO-GO until the rows exist.

## Coverage of the range under check

- a2c2b4c0 (ISS-442): `AccountPages.test.tsx` and the whole web suite for user accounts, LoginPage and AuthContext are in the 150 passing files; typecheck and web build green.
- bc89648d (D-212): `scripts/operations/compose-t028-env.test.mjs` (in `pnpm test:lint`, not in the api/web runners) was not part of this run; its subject was covered here by step 5b (compose parses, 9 api env names and web APP_USER_ACCOUNTS present) and `apps/api/src/composition/vectorless-routing.test.ts` (inside the full api run, passing).
- Skipped, not run: apps/api 46 Mongo-gated tests (count unchanged from wave4); apps/web 2 file-level skips.

## Environment and cleanup

- C: had about 108 MB free throughout; all scratch was on D:. No ENOSPC or crash occurred.
- Three scratch worktrees (HEAD, 4e4d0767, b3eabbee) and the stamp worktree were removed with `git worktree remove --force` after unlinking every node_modules junction with `cmd /c rmdir` (1068, 1068, 1042 reparse points, 0 pointing outside `D:/kb-scratch/6c5`; 0 remaining before removal). No `rm -rf`. Main-tree `node_modules` and package sources verified present afterwards. `git worktree list` shows no 6c5 entry; `.worktrees/*` untouched.
- Nothing pushed or merged; no product code edited; `.env` not read; no consent code touched (D-210); no mongod started or stopped. Only this verdict is committed. Logs remain under `D:/kb-scratch/6c5/logs/`.

## Metrics

prepush_wall_min=13 tests=4188 mode=full shards=2
(tests = 2718 api + 1470 web; shards = api and web ran as 2 concurrent runners; wall = install, typecheck, lint, both suites, reruns and baseline comparisons, builds, stamp and cleanup, measured from the first command)
