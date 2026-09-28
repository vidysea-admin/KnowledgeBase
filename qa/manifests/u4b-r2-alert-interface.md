# Manifest — `u4b-r2-alert-interface`

**Status:** ready-for-check
**Fix cycle:** 0 of max 3
**Authorized by:** D-053
**Round cap:** first unit on the alert-interface seam — no prior PASSes exist on it, so the class-
based round cap (this repo's CLAUDE.md "Backlog priority override") has not been tested yet. This
unit touches `apps/api/src/production.ts`'s watch-silence wiring, which is `auth/tenancy`-adjacent
only in the sense that it reads `tenantIds` for the detector, not a write path — full ceremony
applied anyway because D-053 is a fresh authorization on a previously HUMAN_GATE'd seam.

**Branch:** `worktree-agent-a7e885f3597d16f27` (worktree `D:\KnowledgeBase\.claude\worktrees\agent-a7e885f3597d16f27`)

---

## 0. Worktree hygiene

```
$ git merge --ff-only master
Updating a99140f..095585d
Fast-forward (320 files changed)
$ git log -1 --format="%H %s"
095585db50c83b3e931b44ae61a04a953ee85411 tick: ADVANCED - 2 close-outs, D-053, ISS-366 repair, wave of 3 dispatched
$ pnpm install --offline
Done in 7.7s using pnpm v10.33.0
```

Master tip after the merge (`095585d`) is later than the required `9219d96` floor. Clean
fast-forward, no conflicts.

---

## 1. What changed, file by file

### New files — exactly the four D-053 authorized

| # | File | LOC | What it is |
|---|---|---|---|
| 1 | `packages/core/src/alerts/alert-sink.ts` | 126 | `AlertSink` interface (the canonical shape `WatchSilenceDeps.notifyWatchSilent` already required structurally) + `createTelegramAlertSink()`, a standalone minimal Telegram-Bot-API sender for the apps/* side of the boundary. |
| 2 | `packages/core/src/alerts/alert-sink.test.ts` | 91 | 7 cases: shape check, disabled-when-unconfigured, message content (tenant/sourceType/interval), null-heartbeat wording, exact wording match against meeting-bot's `notifyWatchSilent` text, redacted-on-failure, never-throws/never-returns-a-Promise. |
| 3 | `schema/fixtures/watch_heartbeat/valid.json` | 1 | `{"_id":"toc:drive","tenantId":"toc","sourceType":"drive","lastHeartbeatAt":"2026-09-28T08:00:00Z"}` — every required field present, `sourceType` in the enum, `lastHeartbeatAt` a valid date-time. |
| 4 | `schema/fixtures/watch_heartbeat/invalid.json` | 1 | Same shape with `sourceType:"carrier-pigeon"` — violates the `enum: ["drive","gmail","calendar"]` constraint. |

### In-place edits — the two D-053 authorized, plus the one it implies

| File | Change | Authorized by |
|---|---|---|
| `packages/core/src/index.ts` | One new re-export line: `export * from "./alerts/alert-sink.js";` + a 2-line comment. | D-053 ("interface module in `packages/core/src/`" necessarily needs re-export through the package's existing barrel, same pattern the u4b-heartbeat builder used for `watch-heartbeat.js`) |
| `apps/api/src/production.ts` | `createMongoWatchSilenceDeps()`'s `notifyWatchSilent` body: the `console.error` sink is replaced with a call into `createTelegramAlertSink()` (constructed once, lazily — no network call at construction, matching `production.test.ts`'s "constructs without throwing or requiring a live network connection" guarantee). New import: `import { createTelegramAlertSink } from "@lkb/core";`. Doc comment above the function rewritten to describe the new wiring instead of the old disclosed gap. | D-053 Changes-authorized ("in-place wiring in `apps/api/src/routes/health.ts`") — **see the discrepancy note below** |

**One naming/location deviation from D-053's literal text, stated up front, same spirit as the
prior unit's disclosed deviation on the schema filename.** D-053 (and the brief) name the wiring
target as `apps/api/src/routes/health.ts`. I read that file first, as instructed, and confirmed it
contains ONLY the `WatchSilenceDeps` interface, the router, and the pure `detectSilentWatchers`/
`isStale` functions — it has no concrete implementation of `notifyWatchSilent` anywhere for a
one-line change to land in. The actual concrete sink (the `console.error` line D-053's own gate
document calls out as "a console sink, NOT the Telegram notifier") lives in
`apps/api/src/production.ts:57`, inside `createMongoWatchSilenceDeps()` — confirmed by grep before
editing (`notifyWatchSilent:` appears exactly once as a concrete implementation, in
`production.ts`). I made the one-line change there instead of in `health.ts`, because that is
where "the injectable sink the u4b-heartbeat builder already shipped" actually is. `health.ts`
itself is untouched by this unit. Flagging this rather than silently editing the file D-053 didn't
literally mean.

### Files explicitly NOT touched

- `.dependency-cruiser.cjs` — not modified, per D-053's explicit exclusion. `npx depcruise` is
  green (see Evidence) with the rule intact.
- No move of the detector out of `health.ts` — `health.ts` was not touched at all in this unit.
- `packages/meeting-bot/**` — zero changes. `TelegramNotifier.notifyWatchSilent` continues to
  satisfy `AlertSink` purely by structural typing, exactly as before this unit (see health.ts's own
  pre-existing doc comment, unchanged).
- No file beyond the four named above was created.

---

## 2. Design: why two Telegram implementations, not one shared one

`AlertSink` is defined once, in `packages/core/src/alerts/alert-sink.ts`. `packages/meeting-bot`'s
`TelegramNotifier.notifyWatchSilent` already satisfies its shape by signature (true before this
unit, still true — no meeting-bot file changed). But **`packages/core` may import zero workspace
packages** (`.dependency-cruiser.cjs`'s `core-imports-nothing` rule), and **`apps/*` may not import
`packages/meeting-bot`** (`apps-only-ask-ingest-index-ai-db-core`). So there is no module path by
which `apps/api/src/production.ts` can obtain an actual, working `TelegramNotifier` instance
through an import — duck-typing solves the *type* compatibility (already true, unit-independent)
but not the *construction* problem.

`createTelegramAlertSink()` is therefore a **second, independent** Telegram sender — same env vars
(`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`), same request shape/timeout/token-redaction as
meeting-bot's `telegram-channel.ts`'s `defaultTelegramSend`, same message wording as
`telegram-alerts.ts`'s `notifyWatchSilent` (verified byte-for-byte by one of the seven new tests) —
living inside `packages/core`, which apps/* is already permitted to import. This is genuinely new
code, not a reuse of meeting-bot's code, and that duplication is the direct, disclosed cost of the
boundary D-053 chose to keep intact rather than loosen.

**Known drift risk, disclosed, not hidden:** unlike `health.ts`'s `isStale`, which has a same-file
test that dynamically imports `scripts/watch/lib/heartbeat.mjs` to prove the two implementations
agree, this unit's test does **not** cross-import `packages/meeting-bot`'s `telegram-alerts.ts` to
do the same, because a **test file** under `packages/core/src/` importing
`packages/meeting-bot` would itself trip `core-imports-nothing` —
`.dependency-cruiser.cjs`'s `from` pattern for that rule is `^packages/(core)/`, which matches any
file under the package regardless of whether it is a test. The one test that guards against silent
wording drift (`"matches meeting-bot's TelegramNotifier.notifyWatchSilent wording..."`) instead
hardcodes the expected string and will fail loudly if either side's wording changes without the
other being updated — a weaker guarantee than a dynamic cross-import (a human editing meeting-bot's
wording and this file's hardcoded expectation in the same, matching way would still pass), but the
strongest guarantee available inside the dependency boundary. Recommend the checker flag this as an
accepted, structural limitation rather than a defect to fix in a later cycle — there is no in-
boundary way to strengthen it further without either loosening depcruise (rejected by D-053) or
adding a THIRD file (not authorized).

---

## 3. Verification — exact commands and real output

### `python schema/validate.py` — must be green, including `watch_heartbeat`

```
$ python schema/validate.py
...
OK: watch_heartbeat — valid fixture passes, invalid fixture correctly rejected (1 error(s))
...
PASS: 27 collection schema(s) validated correctly.
```
Full 27/27 green (exit 0). `watch_heartbeat` specifically: valid fixture passes, invalid fixture
correctly rejected with exactly 1 error (the `sourceType` enum violation).

### `packages/core` test suite (new alert-sink tests + no regression on purge-policy)

```
$ cd packages/core && pnpm test
✔ createTelegramAlertSink satisfies the AlertSink shape WatchSilenceDeps.notifyWatchSilent requires
✔ missing token/chatId disables the sink, logs once, never sends
✔ configured sink sends the watch-silent alert with tenant, sourceType and interval
✔ a null lastHeartbeatAt is worded as 'no run has ever completed', not a stale timestamp
✔ matches meeting-bot's TelegramNotifier.notifyWatchSilent wording for the same inputs (disclosed duplication, kept in sync by this assertion)
✔ a send failure is caught, redacted and logged — never thrown to the caller
✔ notifyWatchSilent never returns a Promise the caller could await/throw on
✔ evidence-clip media is never eligible, even with all-verified citing claims
... (purge-policy's existing 6 tests, unchanged)
ℹ tests 14
ℹ pass 14
ℹ fail 0
```

### `pnpm -r typecheck` — all 10 workspace projects (apps/api included, proving `@lkb/core` import compiles)

```
$ pnpm -r typecheck
Scope: 10 of 11 workspace projects
packages/core typecheck: Done
apps/web typecheck: Done
packages/db typecheck: Done
packages/ai typecheck: Done
packages/ask typecheck: Done
packages/ingest typecheck: Done
packages/index typecheck: Done
apps/api typecheck: Done
packages/meeting-bot typecheck: Done
```
No errors, exit 0.

### `npx depcruise --config .dependency-cruiser.cjs packages apps workers` — must be green

```
$ npx depcruise --config .dependency-cruiser.cjs packages apps workers
✔ no dependency violations found (379 modules, 1192 dependencies cruised)
```
Zero violations. `core-imports-nothing` and `apps-only-ask-ingest-index-ai-db-core` both hold —
this is the direct proof the boundary was respected, not bent.

### Meeting-bot's existing 4 (really: full package, 272) tests — must still pass

```
$ cd packages/meeting-bot && npx tsx --test src/capture/telegram-alerts.test.ts
ℹ tests 31
ℹ pass 31
ℹ fail 0
```
The specific `notifyWatchSilent` tests named in the brief (2 of the 31: "a source that never
completed a run says so", "a source that went quiet reports its last heartbeat and the configured
interval") both still pass, untouched. Full `pnpm -r test` (all 11 workspace projects, see below)
also ran the package's complete 272-test suite — 272/272 pass.

### Whole-repo regression check

```
$ pnpm -r test    # all 11 workspace projects
EXIT=0, 0 failing lines across the full log
$ apps/api: npx tsx --test src/routes/health.test.ts src/production.test.ts
ℹ tests 18 / pass 18 (health.test.ts's full R2 suite, incl. "a throwing alert sink is swallowed")
ℹ tests 2 / pass 2 (production.test.ts, incl. "constructs without throwing or requiring a live network connection" — confirms createTelegramAlertSink()'s lazy construction does not break this guarantee)
```

### `npm run lint:structure` and `npm run test:lint` — full output, baseline comparison

```
$ npm run lint:structure
lint-loc: FAIL — 5 violation(s)
  packages/index/src/pipeline/speakers-llm.ts:313 (budget 300)
  packages/meeting-bot/py/sb_join.py:437 (budget 300)
  packages/meeting-bot/src/capture/obs-windows.ts:359 (budget 300)
  scripts/lib/dispatch-state.test.mjs:332 (budget 300)
  scripts/watch/run-watch.mjs:558 (budget 300)
```
Same 4 named in the brief, plus `scripts/lib/dispatch-state.test.mjs` (332 lines) — this fifth one
is NOT in the brief's list and I did not touch that file; it was already present in the
fast-forward merge (`git diff a99140f..095585d -- scripts/lib/dispatch-state.test.mjs` shows it was
part of the merge, not this unit). Disclosing it rather than silently absorbing it into "baseline."

```
lint-dirsize: FAIL — 1 violation(s)
  apps/api/src: 32 files (budget 31)
```
Unchanged from the brief — confirms this unit added **zero** files under `apps/api/src/` (I edited
`production.ts` in place only).

```
lint-root: FAIL — 1 violation(s)
  root has 17 loose files (budget 15)
lint-dupes: OK (465 unique export(s), 27 unique schema $id(s))
lint-migrations: OK (1423 file(s) scanned)
lint-codex-hooks: OK (6 pair(s) compared)
```
`lint-dupes: OK` confirms no export-name collision from the new `AlertSink`,
`createTelegramAlertSink`, `TelegramAlertSinkDeps`, `defaultTelegramAlertSend` names.

```
$ node scripts/snapshot.mjs --check
FAIL: docs/SNAPSHOT.md is stale (95 line(s) differ from a fresh regeneration)
```
Pre-existing (named in the brief as "stale docs/SNAPSHOT.md"). The diff shown is entirely about
`docs/features/`, `qa/briefs/`, `qa/tests/` directory-listing ordering — nothing in the stale diff
mentions `packages/core/src/alerts/` or `schema/fixtures/watch_heartbeat/`, confirming this unit's
new files are not the cause of the staleness (it predates this unit; `docs/SNAPSHOT.md` is
generated and I was instructed never to hand-edit it).

```
$ node scripts/tracker-audit.mjs --gate g1,g4
tracker-audit --gate G1,G4: 6 finding(s)
```
All 6 name other manifests (`t-031-audio-watchdog.md`, `t-033-bot-tests.md`,
`u3-notify-channels.md`, `u4b-heartbeat-collection.md`, `t-047-controller.md`, and its verdict) —
none reference this unit. The brief said "5 tracker-audit findings"; I see 6, one more than
recorded, from commits that landed on master after the brief was written. Not mine — none cite
`u4b-r2-alert-interface`.

```
$ npm run test:lint
ℹ tests 112 / pass 107 / fail 5
```
All 5 failures are `scripts/snapshot.test.mjs` cases, all about the same pre-existing
`docs/SNAPSHOT.md` staleness above — not about anything this unit touched.

**Net assessment against the brief's stated baseline:** every red item in
`npm run lint:structure` / `npm run test:lint` was already red before this unit, with one
disclosed addition (`dispatch-state.test.mjs`'s lint-loc violation and the 6th tracker-audit
finding, both landed via the master merge, not authored here) and zero new red items caused by
this unit's own files.

---

## 4. What I did NOT verify (disclosed, not charged to this unit per D-053)

- **Nothing schedules the `/health` probe.** This unit did not add a scheduler; U6's Task
  Scheduler work is separately gated on live proof (D-053, explicit).
- **The heartbeat write leg has never written a row.** No test in this repo connects to Mongo;
  production Mongo is read-only by construction and I did not attempt to write to any database.
  This unit did not touch the write leg at all.
- **No live Telegram send was ever attempted**, by design — every test injects a fake `send`
  transport (`AlertSink`'s tests, mirroring `telegram-alerts.test.ts`'s own rule). I did not verify
  that a real `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` pair, wired into a running `apps/api`
  instance, actually delivers a message to a real Telegram chat — that is an outward-facing action
  and gates to a human running the server for real, which is out of scope for a build unit.
- **The cross-implementation wording match is a hardcoded-string test, not a dynamic cross-
  import**, for the depcruise reason explained in §2. A human (or future unit) changing
  `telegram-alerts.ts`'s `notifyWatchSilent` wording without updating
  `alert-sink.test.ts`'s hardcoded `expected` string would NOT be caught by any existing
  structural guarantee beyond that one test failing to notice a real-world mismatch it wasn't told
  about.

---

## 5. Does R2 now reach 1/1 on alert delivery?

**Yes, on the terms D-053 set.** The alert sink `apps/api`'s watcher-silence detector calls on a
real silence event is now a real, tested Telegram-Bot-API sender (`createTelegramAlertSink`),
constructed via a path that respects `.dependency-cruiser.cjs` end-to-end (proven green above),
rather than the `console.error` stub the prior unit shipped and disclosed. `detectSilentWatchers`
itself (health.ts) is unchanged — it was already correct — only the sink it now receives changed.

**End-to-end liveness detection is still incomplete**, exactly as D-053 recorded and did not charge
to this unit:
1. Nothing currently calls `GET /health` on a schedule — the detector only runs when something
   happens to hit the endpoint. U6 (Task Scheduler) is the separately-gated unit that closes this.
2. The heartbeat *write* leg (`scripts/watch/run-watch.mjs` → `markHeartbeatFor` →
   `packages/db`'s `markHeartbeat`) has never written a row against a real Mongo instance — it is
   tested as pure logic and dry-run only.

So: **alert delivery is real and reaches Telegram once the detector runs — the detector running at
all, on a schedule, against real data, is not yet proven.**

---

## 6. Verify-it-yourself commands (all re-runnable from repo root)

```
python schema/validate.py
cd packages/core && pnpm test && cd ../..
pnpm -r typecheck
npx depcruise --config .dependency-cruiser.cjs packages apps workers
cd packages/meeting-bot && npx tsx --test src/capture/telegram-alerts.test.ts && cd ../..
cd apps/api && npx tsx --test src/routes/health.test.ts src/production.test.ts && cd ../..
pnpm -r test
npm run lint:structure
npm run test:lint
```
