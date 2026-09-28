# Manifest — `u4b-heartbeat-collection`

**Unit slug:** `u4b-heartbeat-collection`
**Fix cycle:** 0
**Branch:** `worktree-agent-a39d65b2d77302c20` (worktree `D:\KnowledgeBase\.claude\worktrees\agent-a39d65b2d77302c20`)
**Authorization:** `docs/DECISIONS.md` **D-048** (six new files + named in-place edits), D-046, D-047.
**Closes:** the R2 half of `docs/features/u4-watch-dashboard/spec.md` that U4b PASSed cycle 0 with
explicitly **unmet at 0/1** (verdict `af6037a`, merged `e74e7dd`); ledger issue **ISS-360**.
**Backlog tier:** tier 3 — the next unblocked roadmap task (R2, the requirement D-046 calls "the one
that carries the feature"), unblocked by D-048 landing.

---

## 0. Worktree hygiene, disclosed as instructed

Both steps were run before anything else, because the four previous U4 builders were bitten by a stale
worktree:

```
$ git merge --ff-only master
 ... 0cf1b17 (clean fast-forward, no conflict, no merge commit)
$ git log --oneline -1
0cf1b17 D-051: two entries are both numbered D-050; append_decision has a TOCTOU race
$ pnpm install --offline
Done in 12.4s using pnpm v10.33.0
```

The fast-forward was clean. `pnpm install --offline` succeeded (one pre-existing warning about ignored
`esbuild` build scripts, unchanged from master).

---

## 1. What changed, file by file

### New files — exactly the six D-048 authorized

| # | File | What it is |
|---|---|---|
| 1 | `schema/watch_heartbeat.schema.json` (16 lines) | Row shape `{_id, tenantId, sourceType, lastHeartbeatAt}`, `_id` = `<tenantId>:<sourceType>`, `sourceType` enum `drive\|gmail\|calendar`, all four required. |
| 2 | `packages/core/src/generated/watch_heartbeat.ts` (24 lines) | **Generated**, not hand-written: `pnpm gen:types` (`scripts/gen-types.mjs`) produced it, and `pnpm gen:types --check` is clean. Interface `WatchHeartbeat`. |
| 3 | `packages/db/src/collections/watch-heartbeat.ts` (58 lines) | `scopedCollection()`-backed accessor: `watchHeartbeat(tenantId)`, `watchHeartbeatId`, `listHeartbeats`, `findHeartbeat`, `markHeartbeat`. |
| 4 | `migrations/20260928120000-watch-heartbeat.cjs` (43 lines) | Creates the collection and applies its `schema/index.json` indexes. Same structure as `migrations/20260925090000-source-watcher.cjs`, same `YYYYMMDDHHMMSS-<slug>.cjs` naming as all four existing migrations. |
| 5 | `scripts/watch/lib/heartbeat.mjs` (72 lines) | The five pure functions moved out of `run-watch.mjs`. |
| 6 | `scripts/watch/lib/heartbeat.test.mjs` (169 lines) | Their **first committed test** — 16 cases. |

**One naming deviation from D-048's literal text, stated up front.** D-048 item 1 writes the path as
`schema/watch-heartbeat.schema.json` (hyphen). The file was created as
`schema/watch_heartbeat.schema.json` (**underscore**) because the hyphen spelling is unbuildable:
`scripts/gen-types.mjs:33-37` derives the collection name from the schema filename and emits
`packages/core/src/generated/<that name>.ts`, so a hyphenated file would have produced a collection named
`watch-heartbeat` — mismatching `schema/index.json`, the migration, the Mongo collection name, and all 26
existing schemas, every one of which uses underscores (`watch_state.schema.json`,
`watch_reports.schema.json`, …). D-048 item 2 requires the type to come from the repo's generator, which
forces the underscore. It is the same single file, spelled the way this repo's own generator requires; it
is **not** a seventh file. The accessor at item 3 *is* hyphenated, matching `packages/db/src/collections/`
convention — D-048 appears to have applied that directory's convention to `schema/` by mistake.

### In-place edits

| File | Change | Authorized by |
|---|---|---|
| `scripts/watch/run-watch.mjs` | Five functions removed (was lines 108-162), replaced by a 7-line pointer comment + `import { buildHeartbeatDoc } from "./lib/heartbeat.mjs"`. New `markHeartbeatFor(sourceType, completedAt)` writer helper next to `markDriveState`. Three call sites: end of phase 1 (drive), 2 (gmail), 3 (calendar), each immediately after that phase's `try/catch`. | D-048 Changes-authorized, by name |
| `apps/api/src/routes/health.ts` | The staleness detector, extended in place: `WatchSilenceDeps`, `HeartbeatRow`, `detectSilentWatchers()`, a local `isStale()`, `HealthReport.watchSilent?`, and one branch in the `/health` handler. 30 → 122 lines. | D-048 Changes-authorized, by name |
| `packages/db/src/index.ts` | `export * from "./collections/watch-heartbeat.js"` + 3 comment lines. | D-048 ("`collections/index.ts` if it carries a registry" — the registry is `src/index.ts`) |
| `packages/core/src/index.ts` | One re-export line, **written by `pnpm gen:types`**, not by hand. | D-048 item 2 (generator output) |
| `schema/index.json` | One line: `watch_heartbeat`'s two declared indexes. | **Not named in D-048** — see §2 |
| `package.json` | `test:lint` now includes `scripts/watch/lib/heartbeat.test.mjs`. | **Not named in D-048** — see §2 |
| `apps/api/src/production.ts` | `createMongoWatchSilenceDeps()` + `health: { ...createMongoHealthDeps(), watchSilence: … }`. | **Not named in D-048** — see §2 |
| `apps/api/src/routes/health.test.ts` | 14 new detector tests. | **Not named in D-048** — see §2 |
| `packages/db/src/collections/tenantScope.typecheck-test.ts` | `watchHeartbeatTenantPin` — R8's compile-time pin. | **Not named in D-048** — see §2 |

**The interval is 1 hour.** `watchHeartbeatIntervalMs`'s fallback is `60 * 60 * 1000`; the
`[ASSUMPTION]` label and the 2-hour placeholder are gone from the code, and `heartbeat.test.mjs` asserts
both that the default *is* 1h and that it is *not* 2h, so a silent revert reddens.

---

## 2. Five in-place edits D-048 does not name, each with its reason

Disclosed rather than buried. None is a new file; none touches an enforcement path
(`.claude/hooks/*`, `scripts/append_decision.ps1`, `.claude/settings.json`).

1. **`schema/index.json`** — item 4 is "a migration entry creating the collection, following
   `20260925090000-source-watcher.cjs`", and that migration reads its indexes *from* `schema/index.json`
   (`loadIndexes()`), whose own `$comment` says it is "the only place index changes are made". Without the
   entry the migration creates the collection with **no `tenantId` index**, breaking ARCHITECTURE §5's
   "every collection leads with tenantId", and `/health`'s collection counts (`createMongoHealthDeps`
   keys off this file) would omit it. It is a one-line addition to a registry — the same category D-048
   authorizes for `collections/index.ts`.
2. **`apps/api/src/production.ts`** — a detector that is never constructed does not detect. This is
   `apps/api`'s "real deps" file. It is **not** in `store.ts`, where `createMongoHealthDeps` lives, for a
   measured reason: `git show HEAD~3:apps/api/src/store.ts` is **299 non-blank lines against a 300
   `loc.max` budget**, so the wiring there produced `lint-loc: FAIL — apps/api/src/store.ts:336`. Measured,
   reverted (`git checkout -- apps/api/src/store.ts`), rebuilt in `production.ts`, re-measured clean.
3. **`apps/api/src/routes/health.test.ts`** — the repo's definition of done requires the affected stage to
   run green with pasted evidence. A detector with no test is the exact debt ISS-360 records.
4. **`package.json` (`test:lint`)** — ISS-360's complaint is literally "not re-runnable by CI". No npm
   script or CI config references **any** `scripts/watch/lib/*.test.mjs` file (grepped: zero hits), so a
   test committed there and left unwired would not close the issue it exists to close. One filename added.
   *The four sibling tests (`digest`, `lock`, `ingest-chain`, `session-skeleton`) remain unwired — a
   pre-existing gap deliberately left in place rather than widening this unit's scope. Worth a low issue.*
5. **`packages/db/src/collections/tenantScope.typecheck-test.ts`** — R8 is security class in this repo and
   never round-capped. This file is the repo's only *mechanical* statement of "a tenant-less accessor call
   must not compile". Two of the mutations below (C11) show why it matters: nothing at runtime catches a
   raw handle. Note the existing list already omits `watch_state`/`watch_reports`, so this raises the bar
   rather than matching it.

---

## 3. How to verify — exact commands, re-runnable, trusting nothing here

Run from the worktree root. Each is followed by the output actually observed.

### 3.1 The move actually happened

```
$ node --input-type=module -e "
const m = await import('./scripts/watch/run-watch.mjs');
const moved = ['watchHeartbeatIntervalMs','isHeartbeatStale','findStaleHeartbeats','watchHeartbeatId','buildHeartbeatDoc'];
console.log('run-watch.mjs exports:', Object.keys(m).sort().join(', '));
console.log('still exported from run-watch (must be empty):', moved.filter(k=>k in m).join(',') || '(none)');
const lib = await import('./scripts/watch/lib/heartbeat.mjs');
console.log('heartbeat.mjs exports all five:', moved.every(k=>typeof lib[k]==='function'));
console.log('interval default:', lib.watchHeartbeatIntervalMs({}));
"
run-watch.mjs exports: isImminentDate, shouldAlertPollFailed
still exported from run-watch (must be empty): (none)
heartbeat.mjs exports all five: true
interval default: 3600000
```

### 3.2 Generated type matches the schema; schemas otherwise intact

```
$ node scripts/gen-types.mjs --check
OK: 27 generated type file(s) + index.ts match schema/
```

### 3.3 The new test

```
$ node --test scripts/watch/lib/heartbeat.test.mjs
ℹ tests 16
ℹ pass 16
ℹ fail 0
ℹ duration_ms 417.5609
```

### 3.4 The detector's tests (and the two pre-existing `/health` tests, still green)

```
$ cd apps/api && node --test --import tsx "src/routes/health.test.ts"
ℹ tests 16
ℹ pass 16
ℹ fail 0
ℹ duration_ms 7071.2009
```

### 3.5 Typechecks

```
$ pnpm -r typecheck
packages/core, packages/ai, packages/db, packages/ask, packages/ingest, packages/index,
packages/meeting-bot, apps/api, apps/web — all "Done", no errors.
```

### 3.6 Full suite, and the determinism check

`pnpm -r test`, summed across all nine packages:

```
tests 1035
pass 1035
fail 0
(exit 0; every package line reads "test: Done")
```

**`packages/meeting-bot` run three times in isolation**, because U4a's checker measured 0, 2 and 3
failures across three runs:

```
run 1: ℹ tests 272 | ℹ pass 272 | ℹ fail 0   (grep -c '^✖' = 0)
run 2: ℹ tests 272 | ℹ pass 272 | ℹ fail 0   (grep -c '^✖' = 0)
run 3: ℹ tests 272 | ℹ pass 272 | ℹ fail 0   (grep -c '^✖' = 0)
```

**But an earlier run of this same suite on this same tree DID fail**, before any of this unit's edits
existed: `packages/meeting-bot/src/capture/obs-windows.test.ts:326`, `actual: 'bot browser did not open
the page (no progress for 0s; last stage: spawned). child produced NO output'`, `expected:
/chromedriver mirror/`. That is the flake recorded at **`qa/issues.jsonl` line 358** (see §7 — that row is
*also* numbered ISS-360). So: 3/3 green after the change, 1 failure observed before it, same test, same
tree. A single green run here is not evidence of determinism and is not offered as such.

`apps/api` three times as well (it is the package this unit changed most):

```
run 1: ℹ tests 213 | ℹ pass 213 | ℹ fail 0
run 2: ℹ tests 213 | ℹ pass 213 | ℹ fail 0
run 3: ℹ tests 213 | ℹ pass 213 | ℹ fail 0
```

213 = the 199 of the pre-change baseline + 14 new detector tests.

### 3.7 Live smoke of the writer's host script (writes nothing)

```
$ timeout 150 node scripts/watch/run-watch.mjs --dry-run
... real digest printed: 4 upcoming sessions, 18 past-recording mails ...
--dry-run: nothing written (no digest file, no Mongo row, no watch_state).
exit=0
```

Real Drive/Gmail/calendar round trip, exit 0 — so the new `lib/heartbeat.mjs` import and the
`markHeartbeatFor` dry-run short-circuit do not break the script. **No production database was written
to.** `--ingest` and plain `watch` mode were not run; see §6.

---

## 4. Baseline comparison — what was already broken before this unit

Measured on the tree at `0cf1b17`, **before** any edit:

| Check | Baseline | After | Verdict |
|---|---|---|---|
| `lint-loc` | FAIL, 4: `speakers-llm.ts:313`, `sb_join.py:437`, `obs-windows.ts:359`, `run-watch.mjs:572` | FAIL, 4: same three + `run-watch.mjs:558` | **unchanged count**; see below |
| `lint-dirsize` | FAIL, 1: `apps/api/src: 32 files (budget 31)` | FAIL, 1: identical | unchanged (pre-existing; the brief did not list this one) |
| `lint-root` | FAIL: 17 loose files (budget 15) | identical | unchanged |
| `lint-dupes` | OK (453 exports, 26 schema `$id`s) | OK (458 exports, 27 schema `$id`s) | still OK |
| `lint-migrations` | OK (1390 files) | OK (1395 files) | still OK |
| `snapshot.mjs --check` | drift (stale `docs/SNAPSHOT.md`) | drift | unchanged |
| `node --test scripts/lint.test.mjs` | 14/14 pass | 14/14 pass | unchanged |
| `tracker-audit --gate g1,g4` | 5 findings (all G4 "ambiguous issue ref", ISS-001/002) | 5 findings, identical | unchanged |
| `depcruise` | ✔ no violations (374 modules) | ✔ no violations (376 modules) | still clean |
| `pnpm run test:lint` | *(not measured at baseline)* | 105/106, 1 fail | see below |
| `python schema/validate.py` | green (inferred: after the change, all 26 old collections print `OK` and only `watch_heartbeat` fails) | **FAIL** | **the one regression — §6** |

**On `run-watch.mjs`'s LOC, since the brief predicted otherwise.** The brief expected the move to drop it
below 300 and remove one of the four violations. **It did not, and could not.** `lint-loc` counts
**non-blank** lines (`scripts/lint-loc.mjs:3`, `countLoc`), the five functions plus their doc comments were
about 55 such lines, and the file was at 572. Measured: **572 → 558**, still **258 over** the 300 budget.
The four `lint-loc` violations are still four; only the number on the fourth changed. The arithmetic was
never going to reach 300 — U4b grew this file 522 → 572, so removing its addition returns it to roughly
its pre-U4b size, not to a third of it.

**On `scripts/` dirsize (ISS-345, 32/32).** The two new files went into `scripts/watch/lib/`, which
`lint-dirsize` counts as its own directory: **8 → 10 files against a 30 budget**. `scripts/` itself is
untouched at 32/32. Confirmed — `lint-dirsize`'s only violation after the change is the pre-existing
`apps/api/src`, and `scripts` appears nowhere in its output.

**On `pnpm run test:lint`'s single failure.** `snapshot.test.mjs`'s "current repo's docs/SNAPSHOT.md is
<= 200 lines" fails on its **first** assertion, `assert.equal(check.status, 0)` — i.e. `snapshot.mjs
--check` exiting 1 because `docs/SNAPSHOT.md` is stale. That is the pre-existing staleness the brief
names, not a length problem and not this unit's doing: `docs/SNAPSHOT.md` is **byte-identical to
`HEAD~3`** (119 lines both) and the baseline `snapshot.mjs --check` run already printed drift. Regenerating
it would sweep unrelated drift into this unit's commit, so it was deliberately left alone.

One further observation, disclosed because it happened after the runs above: something in the toolchain
(a snapshot run, not a hand edit) regenerated `docs/SNAPSHOT.md` in the working tree while this manifest
was being written. The regenerated file added six lines — `watch_heartbeat`'s schema row and
`scripts/watch/` (this unit's), plus `docs/features/`, `qa/briefs/`, `qa/tests/`, `qa/watch/` (other
lanes'). It was reverted with `git checkout --`, so the committed file is still byte-identical to
`HEAD~3` and `git status --porcelain` is clean. The regeneration is left to whoever owns the
pre-existing staleness, since four of its six lines are not this unit's.

---

## 5. Capability-coverage table

Each new claim → the check that isolates it → the falsifying edit → observed green-before / red-after.
Every mutation was armed and restored through `scripts/lib/mutate.mjs` (the repo's own ledgered harness,
preferred over hand-rolled `sed` per the project CLAUDE.md), one arm/restore **per mutation** inside a
`finally` that fires on success, assertion failure, thrown error **and** timeout, with each test command
run under a 300-second kill timeout, each restore verified by comparing the file's bytes to a fresh
`git show HEAD:<path>` extract, and a post-run `assert-clean` + `git status --porcelain`. That is D-020 as
amended by **D-050-SPEAKER ruling 3** (per-mutation backup + post-run HEAD check).

Baseline before every row: `heartbeat.test.mjs` **16/16 GREEN**, `health.test.ts` **16/16 GREEN**,
`packages/db` typecheck **GREEN**.

| id | Claim | Isolating check | Falsifying edit | `heartbeat.test.mjs` | `health.test.ts` | db typecheck | restore |
|---|---|---|---|---|---|---|---|
| C1 | The interval default is 1h (D-048), not U4b's 2h | `heartbeat.test.mjs` "defaults to 1 hour"; `health.test.ts` drift pin | `parsed : 60*60*1000` → `2*60*60*1000` | **RED** | **RED** | n/a | byte-identical to HEAD |
| C2 | A watcher that never ran is **stale**, not healthy | `[ISS-360 repro] null/undefined/malformed` | `if (!lastHeartbeatAt) return true` → `return false` | **RED** | **RED** | n/a | byte-identical to HEAD |
| C3 | The boundary is strict (`>`, not `>=`) | `[ISS-360 repro] exact boundary is FRESH` | `> intervalMs` → `>= intervalMs` | **RED** | **RED** | n/a | byte-identical to HEAD |
| C4 | The row id is tenant-prefixed (two tenants never collide) | `watchHeartbeatId is the TWO-part key` | `` `${tenantId}:${sourceType}` `` → `` `${sourceType}` `` | **RED** | GREEN *(control)* | n/a | byte-identical to HEAD |
| C5 | A 0 / negative env interval falls back, never becomes the threshold | `falls back on junk` | `Number.isFinite(parsed) && parsed > 0` → `Number.isFinite(parsed)` | **RED** | GREEN *(control)* | n/a | byte-identical to HEAD |
| C6 | A **missing** heartbeat row alerts (absence is the failure mode) | `a source type with NO row at all alerts` | missing row synthesised as `new Date().toISOString()` instead of `null` | GREEN *(control)* | **RED** | n/a | byte-identical to HEAD |
| C7 | **R8** — every configured tenant is read through its own scoped call | `R8: each tenant is read through its own scoped call` | `of deps.tenantIds` → `of deps.tenantIds.slice(0, 1)` | GREEN *(control)* | **RED** | n/a | byte-identical to HEAD |
| C8 | The detector is skipped when the db ping failed | `when the db ping fails the detector does not run` | `deps.watchSilence && report.db === "ok"` → `deps.watchSilence` | GREEN *(control)* | **RED** | n/a | byte-identical to HEAD |
| C9 | The **unauthenticated** body carries a count only, never a tenant | `/health … names no tenant or source type` | body gains `tenantIds: deps.watchSilence.tenantIds` | GREEN *(control)* | **RED** | n/a | byte-identical to HEAD |
| C11 | **R8** — the accessor goes through `scopedCollection()` | *(nothing isolates it — see below)* | `scopedCollection<…>(getDb(),"watch_heartbeat")(tenantId)` → raw `getDb().collection(...)` cast | **GREEN (BAD)** | **GREEN (BAD)** | **GREEN (BAD)** | byte-identical to HEAD |

```
POST-RUN mutate.mjs assert-clean: exit 0 (no outstanding mutation)
POST-RUN git status --porcelain:
(clean)
```

**The controls are the point of the GREEN cells.** Every `heartbeat.mjs` mutation reddens
`heartbeat.test.mjs`; C4 and C5 leave `health.test.ts` green, and every `health.ts` mutation leaves
`heartbeat.test.mjs` green. So the reds are attributable to the specific claim, not to a suite that
reddens whenever anything moves. C1, C2 and C3 redden **both** — correctly: they are exactly the three
cases the cross-implementation drift pin compares, which is that test doing its job.

### C11 is a real coverage gap, stated as one

Swapping the tenant-scoped accessor for a raw `db.collection()` handle passes **every** runtime test and
the typecheck. Nothing this unit ships would catch it, because no test in this repo connects to Mongo, so
`watchHeartbeat()` is never actually invoked under test. What does stand between that mutation and
production:

- `packages/db/src/lib/tenantScope.ts` has no `raw` escape hatch to reach for (ISS-065 removed it) and
  none was added — so writing the mutation requires an explicit double cast, visible in review.
- `tenantScope.typecheck-test.ts`'s new `watchHeartbeatTenantPin` fails `tsc` if the accessor stops
  *requiring* a tenantId. It does **not** catch a still-one-argument function that ignores the argument,
  which is what C11 does.
- The detector's own R8 test (C7) proves the *caller* reads per tenant, which is the other half.

I did not invent a way to close it inside this unit's grant. A real closure needs either a Mongo-backed
integration test (a new dependency and new files) or a lint rule asserting every file in
`packages/db/src/collections/` goes through `scopedCollection` (an enforcement path). **Recommend the
checker file this as its own issue rather than treat it as covered.**

### ISS-360's own recorded reproductions, re-run verbatim (D-015)

`qa/issues.jsonl` line 359, `reproductions[0]` names six cases; its `evidence` field names three more the
checker added (negative `intervalMs`, `intervalMs=0`, unparsable date). All nine were re-run against the
**moved** module — the move being the fix — and are each encoded as a tagged case in
`heartbeat.test.mjs`:

```
PASS | null -> stale=true
PASS | undefined -> stale=true
PASS | malformed-string -> stale=true
PASS | exact boundary (now-last===intervalMs) -> false
PASS | one ms past -> true
PASS | 3-row fixture excludes only the fresh row
PASS | negative intervalMs -> safe direction
PASS | intervalMs=0 -> boundary still fresh at 0 age
PASS | unparsable date -> stale=true
ISS-360 reproductions[0]: 9/9 pass
```

**ISS-360: 9/9 reproductions pass. None left deliberately open.** No case from the ledger was replaced
by an easier one; the seven additional cases in `heartbeat.test.mjs` are additions on top.

`reproductions[1]` is a grep whose *passing* result was the defect ("no match outside `run-watch.mjs`
itself"), so it is expected to invert:

```
$ grep -rn --include="*.test.*" -E "isHeartbeatStale|watchHeartbeatId|buildHeartbeatDoc|findStaleHeartbeats|watchHeartbeatIntervalMs" . --exclude-dir=node_modules -l
./apps/api/src/routes/health.test.ts
./scripts/watch/lib/heartbeat.test.mjs
```

Two test files now reference them where zero did. **ISS-360: 1/1, inverted as intended.**

---

## 6. R2's status, stated honestly

**R2 is not fully met. It is closer than it was, and the remaining gap is a specific, named link.**

R2 requires: *a watcher that has stopped actually produces an alert.* That chain has four links.

| Link | State | What proves it, or why nothing does |
|---|---|---|
| 1. A completed polling run records a heartbeat | **Code complete, NOT proven at runtime** | `markHeartbeatFor` is wired at the end of all three phases and goes through the scoped accessor; typecheck is clean and the `--dry-run` smoke exercises the module graph. But **no test executes the write**, because that needs a live Mongo, and running plain `watch` mode would write to the production database — which is read-only by construction and outside this unit's authorization. Verified by reading and by types only. |
| 2. Absence / staleness is computed correctly | **Proven** | 16 `heartbeat.test.mjs` cases + 12 detector cases, with 9 falsifying mutations (C1-C9) each reddening the isolating check. |
| 3. The detector runs in a process that survives the writer's death | **Structurally satisfied, not proven by a test** | The detector is in `apps/api/src/routes/health.ts`, wired into the real `ServerDeps` via `production.ts`, and runs on every `/health` probe — a separate long-running server, exactly as D-048 required. No test starts the *production* server, so what is proven is that the route computes and reports the count (`/health` tests 3.4), not that a deployed API is being probed on a schedule. **Nothing schedules the probe**: it fires only when something calls `/health`. U6's Task Scheduler work is gated separately. |
| 4. A silent watcher reaches a human | **NOT met. This is the honest gap.** | The alert sink is injected and called with the right arguments (proven: C6-C9 assert on the recorded calls), but the sink wired in production is a **`console.error` line, not `TelegramNotifier.notifyWatchSilent`.** |

**Why link 4 is not wired, and why it was not routed around.** `.dependency-cruiser.cjs`'s
`apps-only-ask-ingest-index-ai-db-core` rule (lines 26-32) forbids `apps/* → packages/meeting-bot`:
`apps` may import only `ask|ingest|index|ai|db|core`. `notifyWatchSilent` lives in
`packages/meeting-bot/src/capture/telegram-alerts.ts`. `depcruise` runs inside `pnpm lint:structure`, so
any import of it from `apps/api` — in `health.ts`, `store.ts` or `production.ts` — is a hard lint failure.
Grepped and confirmed: the **only** place in this repo that reaches `createTelegramNotifier` is
`scripts/watch/run-watch.mjs:219`, because `scripts/` is not in depcruise's scanned roots. And
`run-watch.mjs` is precisely the process D-048 ruled out for the detector.

So R2's last link sits between two standing rules: D-048 says the detector lives in `health.ts`;
`.dependency-cruiser.cjs` says `health.ts` cannot reach the notifier. Each of the three ways out needs a
decision that is not mine:

1. A generic notifier interface in an allowed package (`packages/core/src/domain/` or a new
   `packages/notify`) that both `meeting-bot` and `apps/api` depend on — **new files**, unauthorized.
2. Add `meeting-bot` to `apps`' allowed list in `.dependency-cruiser.cjs` — that file is architecture
   enforcement and inverts ARCHITECTURE §5's dependency direction.
3. Move the detector into a separately-running **script** that may import both — contradicts D-048's
   explicit choice of `health.ts`, taken for the right reason.

Rather than pick one silently, the detector was built **fully injectable**: `WatchSilenceDeps.notifyWatchSilent`
is declared structurally in `health.ts` with the identical signature to `TelegramNotifier`'s method, so a
real notifier satisfies it with **zero imports**, and wiring it is a one-line change at whichever
composition root the decision names. Until then a silent watcher surfaces in the API's own ops log and in
`/health`'s `watchSilent` count — a real signal, reachable by any uptime monitor, but not a phone
notification.

**Scored honestly: R2 at 0.5/1, not 1/1.** Detection is built and tested; alerting reaches a log, not the
operator's phone. U4b's verdict recorded R2 at 0/1; overstating this now would be the ISS-353 class.

### HUMAN_GATE items

1. **`schema/validate.py` needs two fixture files** (`schema/fixtures/watch_heartbeat/valid.json` and
   `invalid.json`). These are the **seventh and eighth** new files, so they were **not created** —
   reported instead, per the brief and per the U4b precedent D-048 was written on. Gate:
   `qa/gates/u4b-heartbeat-schema-fixtures.md`. Current output:
   ```
   $ python schema/validate.py
   ... all 26 other collections print OK ...
   FAIL: watch_heartbeat - missing fixture(s)
   FAIL: one or more collections did not behave as expected.
   ```
   This is **the one verification this unit turned red**, and `qa/loop.md:25` requires that command to
   exit 0 for a unit touching `schema/`. The needed content is fully determined by the approved schema
   (about ten lines total); there is no design choice inside it.
2. **How R2's alert reaches a person** — the three options above. Needs an Approver call.
3. **Whether the migration should be applied** anywhere. It is code only; nothing was run against any
   database.

---

## 7. Two findings the checker should know about, not filed as issues

Per this repo's rules only `/checker` maintains the ledger, and per D-019 a worktree lane would need its
own `qa/issues.<lane>.jsonl` shard with `ISS-<LANE>-NNN` ids. This lane's branch name
(`worktree-agent-a39d65b2d77302c20`) makes a poor lane suffix and master has already allocated to
**ISS-363**, so nothing was written to the ledger. These are handed over instead.

1. **`qa/issues.jsonl` contains TWO rows both numbered `ISS-360`** — line 358 (the `obs-windows` launch
   flake) and line 359 (this unit's heartbeat-test gap). Same defect class as D-051's duplicated D-050.
   It bit this build immediately: a naive `find(o => o.id === 'ISS-360')` returned the *wrong* row, with
   no `reproductions` field at all. **This matters more than it looks**, because D-015 requires a fix to
   be measured against its issue's own recorded reproductions, and that rule is only as strong as the id
   resolving to one row. Every reproduction count in §5 is explicitly against **line 359**.
2. **A second, deliberate implementation of the staleness rule** exists in
   `apps/api/src/routes/health.ts`'s `isStale`, duplicating `heartbeat.mjs`'s `isHeartbeatStale`. Its
   shared home is `packages/core/src/domain/`, which would be a seventh file; `apps/api` also cannot
   import a `.mjs` from `scripts/`. The drift risk is closed **by test, not by structure**: the last case
   in `health.test.ts` dynamically imports the real `heartbeat.mjs` and requires both implementations to
   agree over a nine-case table (and that the two default intervals are the same number). Worth a low
   issue so the structural fix is tracked.

Also worth low issues, from §2 and §5: the four sibling `scripts/watch/lib/*.test.mjs` files that no CI
script runs, and C11's uncovered accessor-scoping mutation.

---

## 8. A note for U4d (ISS-361, D-047)

`watch_heartbeat` is now the third collection the shipped `/watch` page does not surface. What this
unit's shape does to U4d's job:

- **Easier:** the accessor already exposes `listHeartbeats(tenantId)`, tenant-scoped, returning the whole
  set — which is exactly the shape a panel wants, with no new db work. And `/health`'s `watchSilent`
  count already exists, though it is aggregate-only.
- **Harder in one specific way:** `/health` is deliberately **unauthenticated**, so it reports a count and
  nothing else. U4d cannot reuse it to render *which* watcher is silent; it needs an **authenticated**
  route (mounted after `requireAuth`, deriving `tenantId` from the session, never from a query
  parameter) to expose per-source rows. The 1-hour interval also has to come from one place, or the page
  and the alert will disagree about what "stale" means — `production.ts`'s `createMongoWatchSilenceDeps`
  is the current single reader of `WATCH_HEARTBEAT_INTERVAL_MS` on the API side.
- **Key shape:** `_id` is two-part (`toc:drive`), unlike `watch_state`'s three-part key. A page joining
  the two collections must not assume one id scheme.

---

## 9. Commits on this branch

```
809eb6e u4b-heartbeat-collection: pin watch_heartbeat's tenant-scoping at compile time
70611ac u4b-heartbeat-collection: the watch_heartbeat collection, its writer and its detector (D-048)
0cf1b17 D-051: two entries are both numbered D-050; append_decision has a TOCTOU race  <- master
```

---

**Status:** checked-PASS (cycle 0)
**Fix cycle:** 0

**Handshake status:** checked-PASS
- Cycle 0 verdict `qa/verdicts/u4b-heartbeat-collection.md` (**PASS**, cycle checked 0, 9/9 D-048
  provisions, 10/10 capability rows, 4/5 `qa/loop.md` gates). Merged to master at `2801ec6`
  (one trivial `package.json` union conflict on `test:lint`, resolved keeping both test files and
  verified by running the suite).
- Carried forward, NOT resolved here: **R2 stays 0.5/1** until the alert-interface unit lands
  (now authorized by **D-053**, option (a)); nothing schedules the `/health` probe (U6); the
  heartbeat write leg has still never written a row (no test connects to Mongo).
- Issues filed by the checker: ISS-U4BHB-001 (security class, never round-capped), -002, -003,
  -004 in lane shard `qa/issues.u4bhb.jsonl` per D-019. Checker closed ISS-360 (line 359).
- The merge surfaced an unrelated high defect, filed **ISS-366** and fixed at `398dfff`: every
  `.codex` hard link was severed, so the mirror had silently regressed the ISS-307 and D-042
  hook fixes. Not charged to this unit.
