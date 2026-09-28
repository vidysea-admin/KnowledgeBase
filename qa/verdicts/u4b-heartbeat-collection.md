# Verdict — `u4b-heartbeat-collection`

**Cycle checked:** 0
**Date:** 2026-09-28
**Checker:** fresh `/checker` subagent, bound to `D:\KnowledgeBase`, independent context.
**Artifact judged:** worktree `D:\KnowledgeBase\.claude\worktrees\agent-a39d65b2d77302c20` at
**`90897a3`** (base master `0cf1b17`). `git status --porcelain` clean at check time and again after
every falsification row.
**Compared against:** the worktree's own `0cf1b17` base for the diff, and — because master has
advanced past it — the live master tip at check time, `7cbfebe` (*close-out: codex-hooks-links
checked-PASS cycle 0*), for the ledger (`qa/issues.jsonl`, 363 rows, allocated to **ISS-364**) and
for `docs/DECISIONS.md`. No trial merge was needed: the diff touches no file that master's
`handshake-field-reader` / `codex-hooks-links` merges touched, and the ledger reads were taken from
master directly.
**Authority read in full:** D-048 (scope + limit), D-046, D-047, D-051 (the `D-050-SPEAKER` /
`D-050-CODEX` disambiguation; D-020's per-mutation amendment is **D-050-SPEAKER ruling 3**),
`docs/features/u4-watch-dashboard/spec.md` R2/R8, `qa/loop.md`, project `CLAUDE.md`.

---

## VERDICT: PASS

**SCOREBOARD:** 9/9 D-048 provisions met · 4/5 `qa/loop.md` verify gates met (one red, disclosed and
gated) · R2 at **0.5/1**, carried forward explicitly · R8 holds in the shipped code but its
runtime assertion has a proven hole, filed as **ISS-U4BHB-001** (security class, never round-capped).

**CAPABILITY-COVERAGE:** 10/10 rows reproduced (C1–C9 falsify as claimed, including every control
cell; C11 reproduced as the coverage gap the manifest declares it to be).
**LIVE-BROWSER:** not-applicable — changed paths are `schema/`, `packages/core/src/generated/`,
`packages/db/src/`, `migrations/`, `scripts/watch/`, `apps/api/src/{production.ts,routes/health.ts}`.
No file under `apps/web/`, no page, no component, and `/health` is a JSON ops route with no rendered
surface. No retrieval or ranking change either.
**Persona walk:** the manifest carries no `Persona walk:` line → low-severity observation only (see
EXPLANATION); the unit is API/infrastructure with no user-facing screen, so a walk would have been
`skip (api-only)` regardless.
**ISSUES-WRITTEN:** ISS-U4BHB-001, ISS-U4BHB-002, ISS-U4BHB-003, ISS-U4BHB-004
(lane shard `qa/issues.u4bhb.jsonl`, per D-019 — the branch name
`worktree-agent-a39d65b2d77302c20` is a poor lane suffix, so the lane is `u4bhb`).
**ISSUES CLOSED:** **ISS-360 at `qa/issues.jsonl` line 359** → `fixed`
(`regression_check: node --test scripts/watch/lib/heartbeat.test.mjs`). The row at **line 358** is a
different issue and stays `open` — see the disambiguation below.
**EXECUTOR:** claude-subagent (manifest names no external `Executor:`; no `ANTHROPIC_BASE_URL`
override in this run — `self != executor` asserted: this checker did not write the code).

---

## 1. The four things the maker stopped at

### 1.1 `python schema/validate.py` is RED — and PASSing anyway is correct in this repo

**Re-derived, and the red is exactly what is claimed and nothing more.**

```
$ python schema/validate.py ; echo exit=$?
... 26 collections print "OK: <name> — valid fixture passes, invalid fixture correctly rejected" ...
FAIL: watch_heartbeat — missing fixture(s)
FAIL: one or more collections did not behave as expected.
exit=1
```

One `FAIL` line, one collection, one cause. `ls schema/fixtures/` returns **26** directories against
**27** schemas; the only missing pair is `watch_heartbeat/{valid,invalid}.json`. No other collection
regressed, no schema was weakened, and `node scripts/gen-types.mjs --check` is
**`OK: 27 generated type file(s) + index.ts match schema/`**, exit 0 — so the schema itself is well
formed and consistent with its generated type. `qa/gates/u4b-heartbeat-schema-fixtures.md` exists on
disk (2,943 bytes, opened 2026-09-28, owner Umesh). I did **not** create the fixtures.

**Position, stated for the record: a unit with one red verification, blocked at an authorization
boundary and disclosed with a gate file, is PASSable in this repo.** The reasoning, not an appeal to
precedent alone:

1. `qa/loop.md:25` sets the *instrument*. It does not adjudicate who is at fault when the instrument
   demands a file the unit is forbidden to create. D-048 authorizes six new files and enumerates them;
   `schema/fixtures/watch_heartbeat/valid.json` and `invalid.json` are a seventh and eighth. The
   maker had exactly two options: exceed its grant, or stop and raise a gate. It stopped and raised
   the gate. Charging the unit for choosing correctly would make the authorization boundary
   unenforceable — the next builder learns that the way past a scope limit is to walk through it.
2. This is the *same* boundary D-048 was written to resolve, one turn later. D-048's own text records
   that U4b's builder "stopped at that boundary and raised a gate rather than routing around it, and
   its checker ruled the blocker real, not a rationalization." That ruling is being applied
   consistently, not stretched: same repo, same gate mechanism, same class of missing file.
3. The precedent is real and matched: `u4b-watch-heartbeat-alert` PASSed cycle 0 with R2 recorded at
   **0/1** for exactly this reason (verdict `af6037a`, merged `e74e7dd`).
4. The limit of this ruling, so it is not mined later: **PASS here is not a finding that the red is
   acceptable.** It is a finding that the red is not this unit's defect. The red stands in the record
   above, `ISS-U4BHB-003`'s sibling gate stays open, and the next unit that touches `schema/` inherits
   a red validator it cannot blame on anyone. If the gate is answered and the fixtures are not written
   in the unit that follows, that *is* a FAIL-worthy bypass.

I also confirmed the fixture content is genuinely determined and carries no design choice: the schema
declares four `required` fields and a three-value `sourceType` enum, so `valid.json` and an
`invalid.json` that trips one constraint are mechanical. Nothing about this gate needs product input
beyond "yes, write them".

### 1.2 The depcruise contradiction is REAL — ruled, with the mechanism shown

I did not take the manifest's word, and I did not settle for reading prose. Three independent
derivations, all in agreement:

**(a) The rule, resolved by hand from the config.** `.dependency-cruiser.cjs`'s
`apps-only-ask-ingest-index-ai-db-core`, `severity: "error"`,
`from: "^apps/([^/]+)/"`, `to: "^packages/(?!(?:ask|ingest|index|ai|db|core)/)|^apps/(?!$1/)|^workers/"`.
Resolved for `from = apps/api/src/routes/health.ts` (`$1 = "api"`) and tested against the real target:

```
resolved to-regex: ^packages/(?!(?:ask|ingest|index|ai|db|core)/)|^apps/(?!api/)|^workers/
packages/meeting-bot/src/capture/telegram-alerts.ts  ->  FORBIDDEN: true
  control packages/db/src/index.ts                   ->  false   (allowed)
  control packages/core/src/index.ts                 ->  false   (allowed)
  control packages/index/src/x.ts                    ->  false   (allowed)
```

The controls matter: the rule is not a blanket ban that would trip on anything, it bans precisely the
package the notifier lives in.

**(b) The notifier is genuinely there and nowhere else reachable.**
`packages/meeting-bot/src/capture/telegram-alerts.ts:95` declares
`notifyWatchSilent(tenantId: string, sourceType: string, lastHeartbeatAt: string | null, intervalMs: number): void`
and `:183` implements it. Every non-comment reference to `createTelegramNotifier` in the repo is
inside `packages/meeting-bot/` itself or in `scripts/watch/run-watch.mjs` — and `scripts/` is outside
depcruise's scanned roots (`depcruise ... packages apps workers`), which is exactly why the script can
reach it and `apps/api` cannot.

**(c) The gate is live, not theoretical.** `depcruise` runs inside `pnpm lint:structure`
(`package.json`), so the violation would be a hard lint failure, not an advisory. I attempted the
decisive empirical run — adding the import in the throwaway copy and cruising it — and record honestly
that **it did not produce a usable result**: the copy's `node_modules` are junctions into the real
worktree, so pnpm's workspace symlinks resolve to absolute worktree paths and depcruise aborts with
`ENOENT` before reaching the rule. That is an instrument failure in my sandbox, disclosed as one, not
a result; (a) and (b) are what the ruling rests on, and (a) is a mechanical evaluation of the shipped
config rather than an inference from it.

**Ruling: the contradiction is real, not merely awkward.** D-048 requires the detector in
`apps/api/src/routes/health.ts`; the repo's own architecture enforcement forbids that file from
reaching the only notifier that exists. Both rules are in force and neither yields to the other
without a decision. The maker was right to refuse to pick, and right not to route around it — option 2
(loosening `.dependency-cruiser.cjs`) is an **enforcement path** under this project's CLAUDE.md and
would need `Approved-by: Umesh`; option 1 needs new files; option 3 contradicts D-048's reasoned
choice of process separation.

**Is the injectable seam the right holding position, or does it flatter R2?** It is the right holding
position, and it does **not** flatter R2 — but the honest scoring is thinner than 0.5 suggests, and
that deserves saying plainly.

Why the seam is right: `WatchSilenceDeps.notifyWatchSilent` is declared in `health.ts` with a
signature I verified to be **character-for-character the shape of `TelegramNotifier`'s method** at
`telegram-alerts.ts:95`, so a real notifier satisfies it structurally with zero imports and the
boundary is never crossed. Wiring it later is one line at whichever composition root the Approver
names. Injection is the textbook resolution of exactly this tension, not a dodge, and the same file
already injects `checkHealth` the same way. Crucially, the maker did not quietly ship a sink and call
it alerting: the gap is stated in the manifest, in `production.ts`'s JSDoc, **and** in `health.ts`'s
`WatchSilenceDeps` doc comment. Three in-code disclosures is the opposite of overstating.

Where 0.5 is generous, and the part I want on the record: **as shipped today this unit adds no signal
an operator actually receives.** Link 4 (a human is reached) is unmet, and link 3 is weaker than
"structurally satisfied" implies — I confirmed **nothing schedules the `/health` probe**; it fires only
when something calls it, and no scheduler, cron, uptime monitor or Task Scheduler entry in this repo
calls it. So the detector is a function that is correct, tested, wired into the real `ServerDeps`, and
**never invoked in production until someone probes the route**. Two unproven links, not one. A reader
who sees "R2: 0.5/1" should read it as *the detection half is genuinely done and genuinely tested; the
delivery half is zero, and so is the triggering half*. I am not lowering the score — the detection work
is real, substantial and independently falsified below — but I am filing **ISS-U4BHB-003** so R2's
remaining half is on the ledger with a gate, instead of living only in a manifest prose section that
merges and is forgotten. That is the D-006 failure mode this repo has already paid for once: the
manifest's HUMAN_GATE item 2 has **no `qa/gates/` file**, unlike item 1 which does.

The write leg is likewise **unproven at runtime**, confirmed: no test in this repo connects to Mongo,
so `markHeartbeat` has never executed. I did not attempt one — production Mongo is read-only by
construction. What I *could* verify by reading is worth recording, because it is not nothing: the
upsert's filter is `withTenant`-merged before it reaches the driver
(`packages/db/src/lib/tenantScope.ts:updateOne`), so an inserted document is built from a filter that
already carries `tenantId` — which is why `markHeartbeat` can `$set` only `sourceType` and
`lastHeartbeatAt` and still satisfy the schema's four `required` fields. That is a correct piece of
reasoning about a code path nobody has run, and it is recorded as reasoning, not as evidence.

### 1.3 The coverage gap the maker volunteered — REPRODUCED, and it is the ISS-078 class

I reproduced it, and it is worse than "passes the runtime tests": it passes **both** typechecks too.

In the throwaway copy, `packages/db/src/collections/watch-heartbeat.ts`'s
`return scopedCollection<WatchHeartbeat>(getDb(), "watch_heartbeat")(tenantId);` was replaced with a
raw handle that keeps the one-argument signature and ignores the argument:

```
void tenantId; void scopedCollection;
return getDb().collection("watch_heartbeat") as unknown as ReturnType<ReturnType<typeof scopedCollection<WatchHeartbeat>>>;
```

Result:

| check | result |
|---|---|
| `node --test scripts/watch/lib/heartbeat.test.mjs` | **16/16 pass** (GREEN) |
| `node --test --import tsx src/routes/health.test.ts` | **16/16 pass** (GREEN) |
| `packages/db` `tsc --noEmit` | exit **0** (GREEN) |
| `apps/api` `tsc --noEmit` | exit **0** (GREEN) |

Restored; byte-identical to the worktree file (`cmp`).

**Stated plainly, as asked: R8's only mechanical protection against this specific break is a
compile-time pin that catches a tenant-*less* call, and nothing else.** I proved the pin does bite —
removing `tenantId` from the accessor's signature reddens `packages/db`'s typecheck with
`tenantScope.typecheck-test.ts(73,31): error TS2554: Expected 0 arguments, but got 1` plus
`TS2578: Unused '@ts-expect-error' directive`, exit 2 — so `watchHeartbeatTenantPin` is a live gate and
a real improvement over the pre-existing list, which omits `watch_state` and `watch_reports` entirely.
But the pin's shape is "a tenant-less call must not compile", and C11's mutant is a one-argument
function that *accepts and discards* the tenant. The pin cannot see it. Nothing else can either,
because no test connects to Mongo, so `watchHeartbeat()` is never actually invoked under test.

Two things keep this off the FAIL list, and both are load-bearing:

- **The shipped code is correct.** I read the accessor end to end. Every one of its four operations
  (`watchHeartbeat`, `listHeartbeats`, `findHeartbeat`, `markHeartbeat`) goes through
  `scopedCollection()`, and `markHeartbeat` deliberately recomputes `_id` from the scoped `tenantId`
  rather than trusting `doc._id`, so a document built with another tenant's prefix lands on this
  tenant's row or nowhere. That is a stronger posture than R8 asks for.
- **There is no escape hatch to reach for.** Confirmed at `packages/db/src/lib/tenantScope.ts`: the
  returned object exposes `find`, `findOne`, `insertOne`, `insertMany`, `deleteMany`, `countDocuments`,
  `updateOne` — and **no `raw`**. ISS-065's removal holds and nothing added it back. Writing C11's
  mutant requires an explicit double cast, visible in review.

So this is **coverage debt, not a disclosure** — the distinction from ISS-078 matters and I want it
recorded accurately: ISS-078 was a live cross-tenant read; this is correct code with a hole in the
net that would catch it breaking. It is nonetheless filed at **high** severity as
**ISS-U4BHB-001**, because **security class is never round-capped in this repo** and because the
failure mode this net misses is precisely the one that cost this repo ISS-078 after four consecutive
PASSes. R8 is therefore recorded as *holding, with its assertion incomplete* — not as "fully covered".
The maker's recommendation that I file rather than credit it was correct, and volunteering it was the
right call.

Worth crediting on the other side: C9 proves a test *does* catch tenant identifiers leaking into the
**unauthenticated** `/health` body — adding `tenantIds: deps.watchSilence.tenantIds` to the response
reddens `health.test.ts`. That is a genuine R8-adjacent protection on the surface that is actually
exposed to the internet, and it works.

### 1.4 The duplicate ISS-360 — disposition

**Confirmed, and scoped.** `qa/issues.jsonl` line 358 (`feature: meeting-bot-capture`, the
`obs-windows` launch flake) and line 359 (`feature: u4b-watch-heartbeat-alert`, the heartbeat test
gap) are both `"id": "ISS-360"`. I also swept the **whole union** — `qa/issues.jsonl` plus all 15
`qa/issues.*.jsonl` shards, 418 rows — and **ISS-360 is the only duplicate id in the entire ledger**.
Every row parsed. So this is one collision to name, not a systemic renumber.

**What cites each row, checked before deciding** (D-019 forbids renumbering an id other artifacts
already cite, and both rows are cited):

| cites | resolves to |
|---|---|
| `docs/DECISIONS.md:901`, `:915` (D-048 Links, "medium, uncommitted test") | line 359 |
| `qa/manifests/u4b-watch-heartbeat-alert.md:453`; `qa/verdicts/u4b-watch-heartbeat-alert.md:85,96,98` | line 359 |
| `scripts/watch/lib/heartbeat.mjs:14`, `heartbeat.test.mjs:4,8,10,42,53,57,64,69,92`, `run-watch.mjs:110` | line 359 |
| `docs/DECISIONS.md:1027` (D-050-CODEX Links, alongside ISS-104/307/355) | line 358 |

**Disposition: a recorded disambiguation. Neither row is renumbered, neither is withdrawn.** This is
the same remedy D-051 chose for the duplicated D-050, applied to the ledger, and for the same reason
D-019 gives: renumbering would silently repoint citations that already exist in a committed decision
entry, two manifests, two verdicts and three source files, and "a reader who follows a citation to the
wrong entry with no warning is worse off than one who is told to disambiguate." Master has allocated to
ISS-364, so a suffix on the newer row would also collide with nothing but would still break the ten
source-file references above. From this verdict onward:

- **`ISS-360-OBSFLAKE`** — `qa/issues.jsonl` **line 358**, `feature: meeting-bot-capture`: the
  `obs-windows` bring-up-diagnostics test is load-flaky under `pnpm -r test`. Status **open**.
- **`ISS-360-HEARTBEAT`** — `qa/issues.jsonl` **line 359**, `feature: u4b-watch-heartbeat-alert`: the
  five pure heartbeat functions have no committed test. Status **fixed** by this unit.

The canonical mapping is recorded on the ledger itself as **ISS-U4BHB-002**, so a reader who finds the
collision does not have to find this verdict to resolve it. I am accepting the maker's framing that
this "matters more than it looks": **D-015 requires a fix to be measured against its issue's own
recorded reproductions, and that rule is only as strong as the id resolving to one row.** It already
bit this build — a naive `find(o => o.id === 'ISS-360')` returns line 358, which has no
`reproductions` field at all, so the measurement rule would have silently had nothing to measure
against. `ISS-U4BHB-002` therefore also carries the prevention D-051 filed for `DECISIONS`: a
`lint`-level check that fails on any duplicate id in the ledger union. Filed **medium**, because the
ambiguity itself is now resolved and what remains is the mechanical guard.

---

## 2. Re-derived claims

### 2.1 The six new files, and the naming reconciliation

The diff `0cf1b17..HEAD` adds exactly six source files plus two `qa/` artifacts (manifest + gate):
`schema/watch_heartbeat.schema.json`, `packages/core/src/generated/watch_heartbeat.ts`,
`packages/db/src/collections/watch-heartbeat.ts`,
`migrations/20260928120000-watch-heartbeat.cjs`, `scripts/watch/lib/heartbeat.mjs`,
`scripts/watch/lib/heartbeat.test.mjs`. That is D-048 items 1–6 with nothing added.

**The generated type is generated, not hand-written:** `node scripts/gen-types.mjs --check` →
`OK: 27 generated type file(s) + index.ts match schema/`, exit 0. A hand-written file would have to
match the generator byte for byte to survive that, and the file carries the generator's own
`DO NOT EDIT` banner.

**The hyphen/underscore reconciliation — verified, not assumed, and it is correct.**
`scripts/gen-types.mjs:32-36` derives the collection name from the filename:
`readdirSync(SCHEMA_DIR).filter(f => f.endsWith(".schema.json")).map(f => f.replace(/\.schema\.json$/, ""))`,
and `generate()` then emits `packages/core/src/generated/<collection>.ts` and registers `<collection>`
in `schema/index.json`'s key space. So D-048's literal `schema/watch-heartbeat.schema.json` would have
produced a collection named `watch-heartbeat`, mismatching the migration, the Mongo collection name and
the index registry. I also checked the population: **0 of 27** schema filenames contain a hyphen. D-048
item 2 requires the type to come from the repo's generator, and the generator forces the underscore.

**Ruling: this is a correct reconciliation of a decision-level typo, and the same single file — not a
seventh.** D-048 evidently carried `packages/db/src/collections/`'s hyphen convention (where the
accessor correctly *is* `watch-heartbeat.ts`) across to `schema/`, which uses the opposite convention
without exception. Building the hyphen spelling would have been the actual violation: it would have
satisfied D-048's letter while breaking the collection contract D-048 exists to uphold. The maker
flagged it up front rather than silently normalising, which is the behaviour this repo wants.

### 2.2 The five in-place edits D-048 does not name — judged one by one

**None is an enforcement path.** Confirmed against this project's CLAUDE.md, which defines them as
`.claude/hooks/*`, `scripts/append_decision.ps1`, `.claude/settings.json` (plus `ARCHITECTURE.md`
Frozen §2 and `contracts/`). No file in the diff is any of those; `ARCHITECTURE.md` and `contracts/`
are untouched.

1. **`schema/index.json`** (+1 line) — **incidental-and-necessary.** D-048 item 4 requires a migration
   "following `migrations/20260925090000-source-watcher.cjs`", and that migration reads its indexes
   *from* this file via `loadIndexes()`. Without the entry the migration creates the collection with
   **no `tenantId` index**, which breaks ARCHITECTURE §5's "every collection leads with tenantId" — so
   omitting it would have violated a frozen invariant in order to respect a file list. It is a
   one-line registry addition, the same category D-048 explicitly authorizes for
   `collections/index.ts`. The two declared indexes I read are the right ones
   (`{tenantId: 1}` and a unique `{tenantId: 1, sourceType: 1}`, matching the two-part key).
2. **`apps/api/src/production.ts`** (+42) — **necessary, and the relocation reason is real.** A
   detector that is never constructed does not detect, so *some* composition root had to change; D-048
   naming only `health.ts` cannot have meant "build it and leave it unwired". The measured claim checks
   out exactly: `grep -c '[^[:space:]]' apps/api/src/store.ts` = **299**, against `loc.max` 300 in
   `structure.config.json`. Wiring in `store.ts` could not have fit — any addition there fails
   `lint-loc`. The maker measured it, reverted, relocated, re-measured. That is the right order of
   operations and it is disclosed. `production.ts` is `apps/api`'s other real-deps home and already
   does env-driven wiring.
3. **`apps/api/src/routes/health.test.ts`** (+227, 14 new cases) — **necessary.** The repo's definition
   of done requires the affected stage to run green with pasted evidence, and D-048's second stated
   reason for authorizing files 5–6 is that a new-file cap had been blocking *tests*, which "inverts
   its purpose". Refusing to test the detector would have re-created the very defect D-048 was written
   to end. Additive to an existing file; the two pre-existing `/health` tests still pass (16 = 2 + 14).
4. **`package.json` `test:lint`** (+1 filename) — **necessary, and narrowly done.** ISS-360's own
   complaint is literally "not re-runnable by CI"; I confirmed independently that **no npm script
   referenced any `scripts/watch/lib/*.test.mjs`** before this change, so a test committed there and
   left unwired would not have closed the issue it exists to close. The edit is strictly additive — it
   adds a test file to a runner and cannot weaken any gate. Not an enforcement path. I note approvingly
   that the maker left the four unwired sibling tests alone rather than widening scope, and said so.
5. **`packages/db/src/collections/tenantScope.typecheck-test.ts`** (+18) — **necessary and
   commendable.** R8 is security class; this file is the repo's only mechanical statement of
   "a tenant-less accessor call must not compile", and I proved above that the new pin bites. It raises
   the bar rather than matching it, since the existing list omits `watch_state` and `watch_reports`.
   The lazy `await import()` keeps the addition from perturbing anything above it.

**Verdict on scope: no creep.** Every one of the five is either required for a D-048-named item to
function at all, or required by a standing repo rule (tests, tenancy, index registry). Each is
disclosed in manifest §2 with its reason. The pattern I would have flagged — an unnamed edit that adds
*capability* rather than making a named item work — does not appear.

### 2.3 Diff scope — nothing removed or touched beyond the claim

`git diff 0cf1b17..HEAD --stat`: **17 files, +1365 / −59**. Every path is listed in the manifest's
"What changed" (the two extras being `qa/manifests/u4b-heartbeat-collection.md` and
`qa/gates/u4b-heartbeat-schema-fixtures.md`, both this unit's own required artifacts).

The only deletions are the five pure functions removed from `scripts/watch/run-watch.mjs` — **removal
D-048 authorizes by name** ("`scripts/watch/run-watch.mjs` (removing the five moved functions)"). I
verified they were *moved, not lost*: `run-watch.mjs` now exports only `isImminentDate` and
`shouldAlertPollFailed`, and all five live in `lib/heartbeat.mjs` as functions. No other function,
class, export, route, test or config key was deleted or renamed anywhere in the diff.

### 2.4 The interval is 1 hour

`scripts/watch/lib/heartbeat.mjs:26` → `... ? parsed : 60 * 60 * 1000`. The `[ASSUMPTION]` label and
the 2-hour placeholder are gone from the code (the removed block in the diff is where they lived).
`apps/api/src/production.ts` reads the **same** env var with the **same** rule and the **same** 1-hour
default, and `health.test.ts`'s drift pin asserts the two defaults are the same number — so writer and
detector cannot disagree about what "stale" means. Confirmed live by falsification: **C1** (flipping
the default to 2h) reddens both suites, so a silent revert cannot ship.

### 2.5 Test results — re-run, not accepted

| claim | my re-run |
|---|---|
| `heartbeat.test.mjs` 16/16 | **16 tests / 16 pass / 0 fail** ✓ |
| `health.test.ts` 16/16 | **16 / 16 / 0** ✓ |
| `apps/api` 213/213 ×3 | **213 / 213 / 0** — three consecutive runs ✓ (= 199 baseline + 14) |
| `packages/meeting-bot` 272/272 ×3 | **272 / 272 / 0** — three consecutive runs ✓ |
| `pnpm -r test` 1035/1035 | **exit 0**; summed per-package: **tests 1035, pass 1035, fail 0**, 9 packages all `test: Done` ✓ (summed from the log, not read off a total) |
| `pnpm -r typecheck` green | all 9 packages `Done`, **exit 0** ✓ |
| `depcruise` clean, 376 modules | **`✔ no dependency violations found (376 modules, 1185 dependencies cruised)`** ✓ |
| `lint-dupes` / `lint-migrations` OK | `OK (459 unique export(s), 27 unique schema $id(s))` · `OK (1398 file(s) scanned)` ✓ |
| live `run-watch.mjs --dry-run` exit 0, writes nothing | **exit 0**, real Drive/Gmail/calendar round trip (real digest printed), closing line `--dry-run: nothing written (no digest file, no Mongo row, no watch_state)`, and `git status --porcelain` **clean** after ✓ |
| `mutate.mjs assert-clean` | `MUTATIONS CLEAN: none outstanding`, exit 0 ✓ |

**On the known flake, which I ran more than once in both directions as instructed.** I ran
`packages/meeting-bot` three times standalone: 272/272 every time. I also ran the full `pnpm -r test`
once: green, with no meeting-bot failure. So I cannot reproduce the flake, and I say so rather than
reporting three greens as determinism — `ISS-360-OBSFLAKE`'s own row records it as a *load* flake that
appears under `pnpm -r` concurrency and passes standalone, which is consistent with both the maker's
observation and mine. The maker's disclosure that an earlier run of the same suite on the same tree
failed **before** this unit's edits is the honest framing and I credit it. Neither of us has evidence
the flake is fixed; both of us have evidence it is not this unit's.

**One discrepancy in the manifest's evidence, and its cause.** Manifest §4 reports
`pnpm run test:lint` at **105/106, 1 fail**. I measured **106 tests, 104 pass, 2 fail**. The extra
failure is `scripts/webinar/start-record-detached.test.mjs` → *"review finding: a title ending in a
backslash (and one holding a quote) must not swallow the arguments after it"* (12.9 s). Run down:
that file is **byte-identical to master** (`git diff 0cf1b17..HEAD -- scripts/webinar/` is empty), and
run standalone it passes **4/4, twice**. So it is a second instance of the same load-flake class as
`ISS-360-OBSFLAKE`, in a different runner, on a file this unit never touched. **Not attributed to this
unit, and not a FAIL line** — but recorded here because it means `pnpm run test:lint` now joins
`pnpm -r test` as a gate whose red cannot be distinguished from a real regression without a
per-file re-run. Filed low as **ISS-U4BHB-004**; both the maker's count and mine are explained by it.

### 2.6 Baseline attribution — the maker's two corrections to the brief are both CONFIRMED

**Correction 1 — the move did not drop `run-watch.mjs` below 300, and could not.** Confirmed.
`scripts/lint-loc.mjs` counts **non-blank** lines, and my own run gives:

```
lint-loc: FAIL — 4 violation(s)
  packages/index/src/pipeline/speakers-llm.ts:313 (budget 300)
  packages/meeting-bot/py/sb_join.py:437 (budget 300)
  packages/meeting-bot/src/capture/obs-windows.ts:359 (budget 300)
  scripts/watch/run-watch.mjs:558 (budget 300)
```

**572 → 558**, still 258 over budget; four violations before, four after, only the fourth's number
changed. The brief that predicted otherwise was wrong and the maker was right to say so with the
mechanism (`countLoc` on non-blank lines) rather than just the number.

**Correction 2 — `lint-dirsize` has a fifth pre-existing failure.** Confirmed:

```
lint-dirsize: FAIL — 1 violation(s)
  apps/api/src: 32 files (budget 31)
```

That is the **only** violation after the change, and `scripts` appears nowhere in the output — so
`scripts/` is untouched at 32/32 (ISS-345) and `scripts/watch/lib/` (8 → 10 against a 30 budget) does
not trip. Both corrections stand.

**Attributed to the pre-existing baseline, not to this unit:** the 4 `lint-loc` violations, the
`apps/api/src` dirsize failure, the root-file-count failure, the stale `docs/SNAPSHOT.md` (and the
`snapshot.test.mjs` failure that is downstream of it), and the 5 tracker-audit findings. I also credit
the maker's disclosure that a toolchain run regenerated `docs/SNAPSHOT.md` in the working tree and it
was reverted with `git checkout --` — I verified `git status --porcelain` is clean and the committed
file is unchanged, and I agree with leaving a regeneration alone whose six lines include four other
lanes' drift.

### 2.7 Falsification matrix — all 10 rows reproduced independently

Reproduced in a **throwaway copy outside the bound root**
(`…\scratchpad\u4bhb-row1`, the working tree copied excluding `.git`, with `node_modules` junctioned).
**The copy was proven real before any edit:** `heartbeat.test.mjs` **16/16** and `health.test.ts`
**16/16** green *in the copy*, not borrowed from §2.5's runs in the bound tree. Each mutation was a
**single-hunk edit to a single file named in "What changed"**, applied with an assertion that the
target string occurs exactly once (so no mutation could silently hit the wrong site), run under a
`timeout` (180 s / 300 s), restored in a trap firing on error, interrupt and timeout **and** on the
success path, then **byte-compared with `cmp` against the bound tree's own file** after every single
row. That is D-020 as amended by **D-050-SPEAKER ruling 3**. **I never edited a file in the bound
working tree**, and `git status --porcelain` there is clean.

| id | falsifying edit | `heartbeat.test.mjs` | `health.test.ts` | restore |
|---|---|---|---|---|
| C1 | `: 60*60*1000` → `: 2*60*60*1000` | **RED** 14/2 | **RED** 15/1 | byte-identical |
| C2 | `if (!lastHeartbeatAt) return true` → `return false` | **RED** 14/2 | **RED** 15/1 | byte-identical |
| C3 | `- last > intervalMs` → `>=` | **RED** 15/1 | **RED** 15/1 | byte-identical |
| C4 | `` `${tenantId}:${sourceType}` `` → `` `${sourceType}` `` | **RED** 12/4 | GREEN *(control)* | byte-identical |
| C5 | `Number.isFinite(parsed) && parsed > 0` → `Number.isFinite(parsed)` | **RED** 15/1 | GREEN *(control)* | byte-identical |
| C6 | missing row synthesised `lastHeartbeatAt: new Date().toISOString()` | GREEN *(control)* | **RED** 15/1 | byte-identical |
| C7 | `of deps.tenantIds` → `.slice(0, 1)` | GREEN *(control)* | **RED** 15/1 | byte-identical |
| C8 | `deps.watchSilence && report.db === "ok"` → `deps.watchSilence` | GREEN *(control)* | **RED** 15/1 | byte-identical |
| C9 | body gains `tenantIds: deps.watchSilence.tenantIds` | GREEN *(control)* | **RED** 15/1 | byte-identical |
| C11 | `scopedCollection(...)(tenantId)` → raw `getDb().collection(...)` cast | **GREEN (gap)** | **GREEN (gap)** | byte-identical |

Every cell matches the manifest, including all seven control cells. **The controls are what make the
reds admissible**, and they hold in both directions: every `heartbeat.mjs` mutation leaves
`health.test.ts` green except C1–C3, which redden both — correctly, because those three are exactly
the cases the cross-implementation drift pin compares; and every `health.ts` mutation leaves
`heartbeat.test.mjs` green. So no red came from a suite that reddens whenever anything moves, and no
red came from a broken import or a failed load.

**Assertion identity, checked on the row that matters most.** For **C7** — the R8 row — I captured the
failing test name rather than a count: `✖ R8: each tenant is read through its own scoped call, and one
tenant's staleness never alerts as another's`. The assertion that fired is the one the check is named
for. The reds are 1–4 failing cases out of 16, never a whole-suite collapse, which is itself evidence
no mutation broke parsing or loading.

**No mutant left on disk** (the ISS-083 hazard): `cmp` byte-identical after every row,
`node scripts/lib/mutate.mjs assert-clean` → `MUTATIONS CLEAN: none outstanding` exit 0, and
`git status --porcelain` clean in the bound tree. The throwaway copy remains outside the repo and was
the only thing ever edited.

### 2.8 D-015 — measured against the ledger's own recorded reproductions

`ISS-360-HEARTBEAT` (line 359) records **6** cases in `reproductions[0]` and **3** more in its
`evidence` field. I checked each against `scripts/watch/lib/heartbeat.test.mjs` line by line rather
than trusting the summary:

| recorded case | where it lives now |
|---|---|
| `null` → stale | `[ISS-360 repro]` :54 `assert.equal(isHeartbeatStale(null, NOW, HOUR), true)` |
| `undefined` → stale | :55 |
| malformed string → stale | :56 `"not-a-date"` |
| exact boundary (`now-last === intervalMs`) → false | `[ISS-360 repro]` :64-67 |
| one ms past → true | `[ISS-360 repro]` :69-71 |
| 3-row fixture excludes only the fresh row | `[ISS-360 repro]` :92-100, `deepEqual(["gmail","calendar"])` |
| negative `intervalMs` (evidence) | `[ISS-360 evidence]` :44 `"-1"` → falls back to HOUR |
| `intervalMs = 0` (evidence) | :43 `"0"` → falls back to HOUR |
| unparsable date (evidence) | `[ISS-360 evidence]` :58 `"2026-13-45T99:99:99Z"` → true |

**9/9 present as assertions, 9/9 passing (the suite is 16/16), none substituted, none left open.** The
seven further cases (`""`, future clock skew, `Infinity`, the injected-interval proof, etc.) are
**additions on top**, not replacements — which is the distinction D-015 exists to enforce, and the
failure mode it was written against (a corpus the author chose standing in for the ledger's) does not
occur here. `reproductions[1]`, the grep whose *passing* result was the defect, inverts as it should:

```
$ grep -rn --include="*.test.*" -E "isHeartbeatStale|watchHeartbeatId|buildHeartbeatDoc|findStaleHeartbeats|watchHeartbeatIntervalMs" . --exclude-dir=node_modules -l
./apps/api/src/routes/health.test.ts
./scripts/watch/lib/heartbeat.test.mjs
```

Two test files where the row recorded zero. **ISS-360-HEARTBEAT → `fixed`**, with
`regression_check: node --test scripts/watch/lib/heartbeat.test.mjs` — a command that appears verbatim
in the project's own verify surface (and is now in `package.json`'s `test:lint`, so CI runs it). It
moves to `verified` only on a later check that confirms it fails with the fix reverted; C1–C5 already
demonstrate that class of sensitivity.

---

## 3. FAILURES

**None.** No finding reaches the >80 %-confidence bar for a FAIL line. The unit built every item D-048
authorized, disclosed every deviation with a verifiable reason, stopped at two authorization
boundaries instead of crossing either, measured its own fix against the ledger's recorded cases rather
than a friendlier corpus, and volunteered the one coverage gap in its own work. The two things it
declined to do — create files 7 and 8, and pick among three architecture options — are the two things
it was right to decline.

---

## 4. Notes for U4d — sanity-checked as asked

All four of the maker's notes check out against the code:

- **`listHeartbeats(tenantId)` is the shape a panel wants** — confirmed: it returns
  `Promise<WatchHeartbeat[]>` for the whole tenant, tenant-scoped by construction, no new db work
  needed.
- **`/health` cannot be reused for per-source rows** — confirmed, and it is deliberate, not an
  oversight: the route is mounted before `requireAuth`, `HealthReport.watchSilent` is a **count**, and
  C9 proves a standing test *reddens* if a tenant identifier is added to that body. U4d needs its own
  authenticated route deriving `tenantId` from the session, never from a query parameter. Do not
  "fix" `/health` to carry rows — that would be deleting a working R8 guard.
- **The interval must come from one place** — confirmed and slightly sharper than stated: there are
  already **two** readers of `WATCH_HEARTBEAT_INTERVAL_MS` with independently written fallbacks
  (`heartbeat.mjs:25-26` and `production.ts`'s `createMongoWatchSilenceDeps`), held in agreement only
  by `health.test.ts`'s drift pin. A third reader in U4d would make the page and the alert able to
  disagree about "stale". The clean resolution is the shared module in `packages/core/src/domain/`
  that D-048's file cap pushed out (**ISS-U4BHB-003** carries it).
- **`_id` is two-part (`toc:drive`)**, unlike `watch_state`'s three-part key — confirmed in the
  schema, the accessor, and `heartbeat.test.mjs`'s explicit "TWO-part key" case (which C4 falsifies).
  A page joining the two collections must not assume one id scheme.

---

## 5. EXPLANATION

Every claim in the manifest was re-derived independently and all of the substantive ones hold: the six
new files are exactly D-048's six (the underscore spelling is a correct, verified reconciliation of a
decision-level typo in D-048 itself, forced by `gen-types.mjs` deriving the collection name from the
filename — 0 of 27 schema files use a hyphen); the generated type really is generated (`--check` clean,
27 schemas); the five unnamed in-place edits are each incidental-and-necessary rather than scope creep,
none touches an enforcement path, and the `store.ts` → `production.ts` relocation reason is exactly
true (`store.ts` is at 299 non-blank lines against a 300 budget); the interval is 1 h with a
falsifiable pin against a 2 h revert; and the counts are real — 1035/1035 summed, 213/213 ×3,
272/272 ×3, typecheck green, depcruise clean at 376 modules, a live gws dry-run at exit 0 writing
nothing. All ten capability rows reproduced in a throwaway copy that I proved green first, with every
control cell holding and every mutation byte-restored and `cmp`-verified per row; no mutant survives on
disk. The one red — `schema/validate.py` on `watch_heartbeat` only — is exactly what it claims, is
caused entirely by two files the unit is forbidden to create, and has an open gate: that is a PASS in
this repo, on the same reasoning D-048 itself records for U4b, and the verdict says plainly that
PASSing does not bless the red.

Three substantive things are filed rather than credited, because silence on them would have been its
own finding. **ISS-U4BHB-001** (high, security class): I reproduced the accessor-scoping gap and it is
worse than reported — the raw-handle mutant passes 16/16, 16/16 **and both typechecks**. The shipped
code is genuinely correct and `tenantScope.ts` still has no `raw` escape hatch (ISS-065 holds, verified
by reading its full surface), and I proved the new typecheck pin does bite a tenant-*less* call — but
it cannot see a one-argument function that discards its argument, and nothing else can either, because
no test connects to Mongo. R8 is therefore recorded as holding with its assertion incomplete, not as
covered, and it is never round-capped. **ISS-U4BHB-003** (high): R2's last link needs an Approver
decision that has no gate file on disk at all, unlike the fixtures gate — and R2's *triggering* link is
weaker than the manifest's "structurally satisfied" implies, since I confirmed nothing in this repo
schedules the `/health` probe, so as shipped an operator receives no new signal whatsoever. I am
holding R2 at 0.5/1 rather than lowering it, because the detection half is real and independently
falsified, but the ledger now carries the other half instead of a manifest prose section that merges
and is forgotten. **ISS-U4BHB-002** (medium): the duplicate ISS-360 is the only duplicate id in the
whole 418-row ledger union, both rows are cited by committed artifacts, so per D-019 neither is
renumbered — the canonical names `ISS-360-OBSFLAKE` (line 358, open) and `ISS-360-HEARTBEAT`
(line 359, now fixed) are recorded on the ledger itself, with D-051's prevention (a duplicate-id lint
over the union) as the fix direction.

Low-severity observations, kept out of the backlog per this repo's severity gate: the manifest carries
no `Persona walk:` line (a post-2026-09-26 manifest should, though the correct value here would have
been `skip (api-only)` — no UI surface in the diff, so Mode D is genuinely not-applicable rather than
skipped); `health.ts`'s `isStale` is a second, deliberate implementation of `heartbeat.mjs`'s
`isHeartbeatStale`, pinned by a nine-case cross-implementation test rather than by structure, and the
structural fix is folded into ISS-U4BHB-003 rather than filed twice; and four sibling
`scripts/watch/lib/*.test.mjs` files remain unwired from any npm script — a pre-existing gap the maker
deliberately did not widen its scope to fix, which was the right call and is recorded in its manifest
§2. I did not hunt for a further bypass: that prompt defect produced 83 of this repo's 84
self-generated issues, and every finding above came from a claim the unit itself put in front of me.
