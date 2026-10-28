# Manifest — watched-sources-entrypoint

**Contract:** none yet — checker, please author `qa/contracts/watched-sources-entrypoint.md`.
**Goal task:** T-027 / catalogue **A13**.
**Date:** 2026-09-08
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** none — new feature work.
**Status:** checked-PASS (cycle 1 — `qa/verdicts/watched-sources-entrypoint.md`, commit `ff4c550`)
**Branch:** `lane/c-unrun-writers`
**Ledger:** per D-019 this lane files to `qa/issues.c-unrun-writers.jsonl` with `ISS-C-UNRUN-WRITERS-NNN` ids.

## Why

T-027 shipped Watched Sources' schema, its tenant-scoped accessors (`createWatchedSource`,
`recordFetch`, `listActive`) and its pure due-check — **all checker-PASSed** — and then nothing
called them. `packages/ingest/src/watched/schedule.ts` still says *"a future scheduler runs
`listActive`"*. The collection has been empty ever since, which is exactly why A13 scores MISSING:
the probe is `collection watched_sources (empty)`.

**The gap was never the logic. It was that no user action could reach it.** This is that action.

## What changed

| File | Change |
|---|---|
| `apps/api/src/routes/watched-sources.ts` | **new** — `POST /watched-sources`, `GET /watched-sources`. |
| `apps/api/src/routes/watched-sources.test.ts` | **new** — 7 tests, written first. |
| `apps/api/src/fixtures.ts` | `fakeWatchedSourceDeps`, tenant-partitioned. |
| `apps/api/src/server.ts` | mount + `ServerDeps.watchedSources`. |
| `apps/api/src/store.ts` | `createMongoWatchedSourceDeps` — delegates to T-027's accessors. |
| `apps/api/src/production.ts` | wire it. |
| `TASKS.md`, `.goal/goal.json` | tracker fixes, see below. |

No accessor, schema or pure-logic file was touched. This unit is **wiring plus validation**; the
feature underneath is T-027's and keeps its verdict.

## Validation is strict on purpose

A watched source is a URL the system will later **fetch on a timer**, so an unvalidated `url` here
is a stored server-side request target, not just a string. The route refuses anything that is not
an absolute `http(s)` URL — `javascript:`, `file://`, relative and empty all 400 and store nothing.
Same reasoning that made the Ask page refuse a `javascript:` citation.

`reputationTier` is checked against the schema's exact three values, and `checkIntervalHours` must
be positive — `isDueForCheck` compares `elapsed >= interval`, so 0 would make a source permanently
due.

The fake is **partitioned by tenant**, not one shared array: a fake that ignores `tenantId` cannot
fail the isolation test, and isolation is the property most worth testing on a route that stores
outbound fetch targets.

## Evidence

```
$ pnpm --filter '@lkb/api' test    tests 131   pass 131   fail 0    (124 + 7 new)
$ pnpm -r test                     all packages green
$ pnpm -r typecheck                exit 0
$ pnpm lint:structure              green; tracker-audit OK (G1); depcruise 279 modules / 0 violations
```

## Two tracker corrections, both disclosed

1. **My own:** I had recorded U2.4 as `partial` in `TASKS.md`. That is not a known status — G1
   enumerates open / pending / in_progress / blocked / done — so my attempt at an honest label
   broke the gate. Now `in_progress`, and `.goal/goal.json` aligned to match. The detailed note
   still says exactly what is and is not done.
2. **Not mine:** G1 also failed on `U1.0` being in `goal.json` but absent from `TASKS.md` — the
   **other maker loop's** chunk-backfill unit. I reconciled the row *from goal.json* and labelled
   it as reconciled-not-authored, because the gate blocks `lint:structure` and therefore this
   unit's own acceptance evidence. I did not invent any content for it.

## Known gaps — stated, not hidden

1. **A13 will NOT flip on this unit alone.** The collection is still empty: this makes a real write
   *reachable*, it does not perform one. A row requires a real `POST`, and the probe additionally
   needs it to appear in a live-verify artifact.
2. **No scheduler.** `listActive` → `isDueForCheck` → `checkWatchedSource` → `recordFetch` is still
   unwired, so nothing is ever actually re-fetched, hashed or diffed. That is A13's substance and
   it is a separate unit — expect A13 to need a human downgrade to PARTIAL even once rows exist,
   for the same reason B3 did.
3. **No de-duplication.** Registering the same URL twice creates two rows.
4. **`recordFetch` remains uncalled**, as does the whole `gaps` accessor set (A5/D8) — the other
   half of this lane, untouched here.
5. **No UI.** Reachable via the API only; no `apps/web` page.

## Note to the checker

Judge the validation hardest — it is the only part that is genuinely new logic rather than wiring,
and a stored URL is a future outbound request. Try to get a non-http(s) target past it. Please also
rule on gap 2: I claim A13 deserves PARTIAL not REAL even once rows exist, because nothing re-fetches
anything. If you think shipping the entrypoint without the scheduler is the wrong unit boundary, say
so. `ISSUES-WRITTEN: none` is creditable.


---

## Close-out (2026-09-08)

**PASS, cycle 1** — 8/8 criteria, 5/5 invariants. Four issues filed, none a defect of this unit.
The D-019 lane ledger worked as intended: ids came from `qa/issues.c-unrun-writers.jsonl` starting
at 001, with no collision against the other loop's sequence.

All four gates reproduced exactly, and the mutation table has a real control: disabling the URL
check, hardcoding the tenant argument, removing the interval check and removing the scope guard each
cost **exactly one test**, while the no-op control held at 131/131. The seven new tests are
load-bearing rather than decorative.

### The one defect I own — ISS-C-UNRUN-WRITERS-001 (medium)

The route validates a **parsed** URL and stores the **raw** string, so the value approved and the
value stored can differ under a different parser. One line closes it (`new URL(body.url).href`).
Fixed in the follow-up unit rather than here, since this manifest already carries a PASS.

### The ruling worth keeping — ISS-C-UNRUN-WRITERS-002 (high)

I asked whether an internal-address block (cloud metadata, localhost) belonged in this route. The
checker said no, and the reasoning is better than my question: **a store-time hostname check cannot
survive DNS rebinding between registration and fetch**, so blocking a literal `169.254.169.254`
here buys nothing against anyone who can spell a domain name — while making the real control feel
optional later. The sound place is the fetcher, on the **resolved IP after DNS**, with redirects
re-checked per hop. It is now contract invariant `[I3]` and a filed high-severity issue, queued
*before* the fetcher unit is built rather than discovered after.

No scheme bypass was found. Uppercase `HTTPS://` passes correctly (WHATWG lowercases the scheme) and
`http:/\/\evil.com` normalises to `http://evil.com` — neither is a bypass.

### Rulings on my two tracker corrections — both upheld

`partial` → `in_progress` was required. The cross-lane `U1.0` reconciliation was verified rather
than assumed: **deleting the row makes `tracker-audit --gate G1` exit 1**, which would block this
unit's own acceptance evidence. Judged legitimate because it touched a tracker row (not another
lane's code, manifest or verdict) and derived only from committed artifacts.

Two notes I accept: it is a near-certain `TASKS.md` merge conflict when the lanes converge — **take
the other lane's authored row** — and a one-line ledger note would have been the cleaner form of
"reconcile *and* report".

### A13 status

Still **MISSING**, not PARTIAL — no write has occurred yet. When rows exist it becomes PARTIAL, not
REAL: rows prove intent to watch, not that anything was ever watched. Same error caught on B3/B10.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
