# Manifest — watched-sources-run

**Contract:** `qa/contracts/watched-sources-entrypoint.md` + `qa/contracts/guarded-fetcher.md`.
Checker: please author `qa/contracts/watched-sources-run.md` for the composition.
**Goal task:** T-027 / catalogue **A13**.
**Date:** 2026-09-08
**Fix cycle:** 3 of max 3
**Dual check:** no
**Issues addressed:** none new. **Closes the orphan:** the guarded fetcher had no caller.
**Status:** checked-PASS (cycle 3)
**Branch:** `lane/c-unrun-writers`

## Why — and a course correction

T-027 built every piece of Watched Sources and wired none of them. `listActive` →
`isDueForCheck` → `checkWatchedSource` → `recordFetch` has **never existed as a single call**, so no
watched source has ever actually been fetched.

I then spent three fix cycles and six checker rounds perfecting a **guarded fetcher that nothing
called** — the same pattern I criticised in the search-store seam this morning. The honest order
was to build the composition first and discover the guard was needed. This unit is that correction:
it makes the chain real end-to-end.

## What changed

| File | Change |
|---|---|
| `packages/ingest/src/watched/run.ts` | **new** — `runWatchedSources`, the missing composition. |
| `packages/ingest/src/watched/run.test.ts` | **new** — 7 tests, written first. |
| `packages/ingest/src/sources/node-transport.ts` | **new** — the real transport. |
| `packages/ingest/src/sources/node-transport.test.ts` | **new** — 2 tests. |
| `apps/api/src/routes/watched-sources.ts` | `POST /watched-sources/run`. |
| `apps/api/src/store.ts` | composes the guarded fetcher with the real transport. |

## The three properties that make this safe rather than merely working

1. **One bad source never abandons the run.** These are unattended periodic fetches of
   user-supplied URLs, so a blocked or dead target is the **normal** case — the guard is *expected*
   to refuse some by design. Failures are collected per source and returned; the run continues, and
   the route reports them in a 200 summary rather than a 500.
2. **The transport does not follow redirects** (`redirect: "manual"`). Following them there would
   step straight past the guard, which re-resolves and re-checks every hop. That is the whole
   control.
3. **`resolveAll` returns every address** (`all: true`). Returning one would reinstate the coin-flip
   bypass ISS-C-UNRUN-WRITERS-007 closed — a host publishing one public and one private A record.

It also closes **ISS-C-UNRUN-WRITERS-015** at the layer that owns the socket: `AbortSignal.timeout` genuinely
cancels the in-flight request, which `Promise.race` in the guard could not do. The body is read in
chunks and abandoned mid-stream past `maxBytes`, rather than allocated and then measured.

`store.ts` is the feature's **SSRF boundary** — swap that one line for a bare `fetch` and every
control in `guarded-fetch.ts` is bypassed while every test still passes. Called out in the code.

## Evidence

```
$ pnpm --filter '@lkb/ingest' test   tests 88   pass 88   fail 0   cancelled 0
$ pnpm --filter '@lkb/api'    test   tests 134  pass 134  fail 0   cancelled 0
$ pnpm -r typecheck                  exit 0
$ pnpm lint:structure                green; depcruise 286 modules / 0 violations
```

`cancelled` is now reported alongside `fail`: the cycle-3 checker showed Node counts a timed-out
test under `cancelled`, so a `fail 0` summary can hide a killed mutant — my own harness did exactly
that.

Also renamed `TransportResponse` → `HttpTransportResponse` and `request` → `httpRequest` after
`lint-dupes` caught a collision with `packages/ai/src/provider.ts`.

## Known gaps

1. **A13 still does not flip on this unit** — the chain is reachable but no row has been written or
   run against live data. It flips when a real `POST /watched-sources` then `POST
   /watched-sources/run` happens and appears in a live-verify artifact. I am **not** writing a
   placeholder row to move a probe.
2. **No changed-content reaction.** A changed hash is recorded and counted; nothing re-ingests. The
   pipeline back into `sources`/`sessions` is T-023's `createUrlSource` and is a separate unit.
3. **No scheduling trigger.** The run is invoked by a route, not a timer — deliberately: a real
   scheduler is an ops concern and the route makes the whole chain testable first.
4. **The transport is untested against real HTTP.** Its two tests cover `resolveAll` only; `fetch`
   itself is not exercised, so redirect/size/timeout behaviour is proven in the guard's fakes, not
   against a live server.

## Note to the checker

Gap 4 is the one I would push on: the transport is the only code here that touches the network and
it has the least coverage. Judge whether that is acceptable, or whether this unit needs a local
HTTP server fixture proving `redirect: "manual"`, the size abort and the `AbortSignal` actually
behave against real sockets. If you think so, FAIL it — I would rather find out now than after
something is scheduled against it.

---

# Fix cycle 2 — responding to the cycle-1 FAIL

FAILed 7/11. The serious finding is the one I flagged against myself and the checker confirmed was
worse than I described.

## ISS-C-UNRUN-WRITERS-011 (high) — the guard's decision was advisory, not binding

`httpRequest` called `fetch(url)`, so **the OS resolved the hostname again**, independently of the
addresses the guard had just vetted. The guard could approve `93.184.216.34` and the connection
still land on `169.254.169.254`, because nothing carried the decision across. Reachable in
production via `store.ts` → `production.ts`.

**A control the next layer is free to ignore is advice.**

**Fix:** the approved address now travels with the request (`opts.address`), and the transport uses
`node:http`/`node:https` instead of `fetch` — for one reason: they accept a custom `lookup`, which
is the supported way to say *connect to this address*. The hostname still travels in the `Host`
header and in `servername`, so the server sees a normal request and **TLS still verifies against
the name** — only the address is pinned.

## ISS-C-UNRUN-WRITERS-016 (high) — the only network-touching code had no behavioural test

Deleting `redirect: "manual"`, the size abort or the `AbortSignal` each left the suite green.
Now tested against a **real socket** via `http.createServer`. The pin test is the interesting one:
the URL names a host that does not resolve to the server, so the request can *only* arrive via the
injected address — if pinning regresses, it cannot connect at all.

## Evidence

```
$ pnpm --filter '@lkb/ingest' test   tests 93   pass 93   fail 0   cancelled 0
$ pnpm -r test                       apps/api 134/0, meeting-bot 40/0 — all green
$ pnpm -r typecheck                  exit 0
$ pnpm lint:structure >/dev/null 2>&1; echo $?   → 0
```

**Mutation table** (baseline 93/0), pure-Python harness under D-020, restores asserted
byte-identical:

| mutation | result |
|---|---|
| **unpin — resolve the hostname instead** | **88 / 5** |
| remove the size abort | 92 / 1 |
| neuter the timeout | 92 / 1 |
| **do not destroy the redirect body stream** | **93 / 0 — UNPINNED, see below** |
| **no-op control** | **93 / 0** |

### One line is not pinned, and I am not claiming it is

`res.destroy()` on the redirect path survives mutation. My test asserts the returned body is empty,
which holds either way because the body is never read into the response. So the `destroy()` is
**resource hygiene, not a control** — without it the socket keeps draining a body nobody uses.

I could have written a test that appears to cover it. Given ISS-137 two units ago — a fix declared
with nothing enforcing it — stating it plainly is the honest option. Low severity; worth a line in
whichever unit next touches this file.

## Known gaps

1. **`addresses[0]` is pinned, not all of them.** Every returned address is *checked*; the first is
   *used*. That is correct and closes the window, but if the first is unreachable there is no
   failover to the second — an availability limit, not a security one.
2. **No TLS test.** The pin is exercised over plain HTTP; `servername`/certificate behaviour under
   a pinned address is reasoned, not proven. A real HTTPS fixture needs a self-signed cert.
3. **A13 still does not flip.** Nothing has run against live data, and no placeholder row will be
   written to move a probe.

## Note to the checker

Gap 2 is where I would push: the whole point of `servername` is that TLS still validates the
hostname while the address is pinned, and that is exactly the part not proven. If you think this
unit needs a self-signed HTTPS fixture before anything is scheduled against it, FAIL it.


---

# Fix cycle 3 — the four mediums from the cycle-2 verdict, landed together

Cycle 2 PASSed with four mediums carried forward. The checker's own framing: *"this is cycle 2 of
3, so all four must land together in cycle 3; none needs new machinery."* They did.

## ISS-C-UNRUN-WRITERS-017 — the SSRF boundary was unreachable by any test

`store.ts` built the guarded fetcher **inline inside `run`**, so replacing it with a bare
`fetch` left 134/134 green. The boundary the manifest itself called "the feature's SSRF boundary"
was the one line no test could see.

**Fix, two halves.** The fetcher is now **branded** —
`Object.defineProperty(guardedFetch, GUARDED, …)` with `GUARDED = Symbol.for("lkb.guarded-fetcher")`
and an `isGuardedFetcher()` predicate — and the production deps are a **named exported value**,
`createWatchedRunDeps()`, instead of an object literal buried in a handler. A value that cannot be
named cannot be asserted on. `apps/api/src/watched-run-deps.test.ts` asserts the brand, and asserts
a plain async function and `globalThis.fetch` are *not* branded, so the predicate is not vacuous.

## ISS-C-UNRUN-WRITERS-018 — the fixture's `run` took no argument

`fakeWatchedSourceDeps().run` was `async () => …`. A handler calling `deps.run("other-tenant")`, or
passing nothing at all, passed the entire suite — on the route that decides whose URLs get fetched.
The fake now records the tenant it was handed (`ranFor`), and the new route test asserts
`["tenant-1"]`, the authed tenant.

## ISS-C-UNRUN-WRITERS-019 / ISS-C-UNRUN-WRITERS-020 — the code was there, the tests were not

Both fixes shipped in cycle 2's code, and both mutants survived when I actually measured. Now:
`recordFetch → false` is asserted to be a **failure**, not a silent success; the cap is asserted to
stop the **network calls** (not just the counter) and to report `remaining: 3`; a spent deadline
fetches nothing and reports `remaining: 4`; an uncapped run reports `remaining: 0`.
`WatchedRunSummary` gained `remaining`, so a truncated run is visible to the HTTP caller too — an
unreported truncation reads exactly like a complete run.

## Evidence

```
$ pnpm --filter '@lkb/ingest' test   tests 97   pass 97   fail 0   cancelled 0
$ pnpm --filter '@lkb/api'    test   tests 138  pass 138  fail 0   cancelled 0
$ pnpm -r typecheck                  exit 0
$ pnpm lint:structure                see ISS-C-UNRUN-WRITERS-021 below
```

**Correction (ISS-C-UNRUN-WRITERS-022, filed by the cycle-3 checker):** the ingest count above
first read **98**; **97** is what reproduces at `534af4e`. ISS-136 class — a number quoted from a
run I did not re-derive at the submitted commit.

**Correction (ISS-C-UNRUN-WRITERS-021):** cycle 3 as submitted turned `lint:structure` RED —
`apps/api/src` hit 31 files against a budget of 30, crossed by the ISS-C-UNRUN-WRITERS-017 fix's own new test
file, and my Evidence block was the first of the three cycles to omit that gate. The three
composition tests now live in `apps/api/src/routes/watched-sources.test.ts`; the directory is
back to 30.

**Mutation table**, pure-Python harness under D-020 (`timeout=900`, restore in a `finally`, each
restore asserted SHA256-identical to the pre-mutation file):

| mutation | before cycle 3 | after |
|---|---|---|
| `store.ts`: guarded fetcher → bare `fetch` | survived (134/134) | **killed** |
| route: `deps.run(tenantId)` → `deps.run("other-tenant")` | survived | **killed** |
| `run.ts`: `if (!persisted)` → `if (false)` | survived | **killed** |
| `run.ts`: drop the cap/deadline guard | survived | **killed** |
| **no-op control** | clean | **clean (exit 0)** |

## Known gaps — unchanged from cycle 2, and I am not claiming otherwise

1. **A13 still does not flip.** No row has been written and no run has happened against live data.
   It flips on a real `POST /watched-sources` + `POST /watched-sources/run` in a live-verify
   artifact. Still not writing a placeholder row to move a probe.
2. **No TLS test** (cycle-2 gap 2) — `servername` under a pinned address remains reasoned, not
   proven. Needs a self-signed HTTPS fixture.
3. **`res.destroy()` on the redirect path is still unpinned** — hygiene, not a control, as stated
   in cycle 2.
4. **The brand is advisory against a determined caller.** `isGuardedFetcher` proves the production
   composition uses the real fetcher; it cannot stop someone branding a bare function. It closes
   the accident, not an attack.

## Note to the checker

Gap 1 is the one that matters for the goal, and it is deliberately out of scope for this unit —
please judge whether A13's flip belongs in a separate live unit or should have blocked this PASS.


---

# Close-out — PASS at cycle 3

Checker verdict `qa/verdicts/watched-sources-run.md` (`Cycle checked: 3`, commit `e274eee`):
**PASS, 11/11 criteria, 5/5 invariants.** It re-derived the mutation table with its own harness and
added two mutants I had not run — removing the brand's `defineProperty` (137/1) and forcing
`remaining = 0` (95/2) — both dead, so the new tests are load-bearing beyond the four they were
written for. ISS-C-UNRUN-WRITERS-017/018/019/020 are closed.

**Three corrections it made against me, all recorded rather than argued:**

1. **Cycle 2 was a FAIL (9/11), not a PASS with mediums carried forward.** My dispatch said
   otherwise. The four mediums are identical either way, but a summary that upgrades a FAIL is how
   a unit's history starts being read from prose instead of from the verdict file.
2. **ISS-C-UNRUN-WRITERS-021 (high) — the ISS-C-UNRUN-WRITERS-017 fix broke `lint:structure`.** Fixed above; `lint-dirsize` is
   back to OK across 75 directories.
3. **ISS-C-UNRUN-WRITERS-022 (low) — 98 ingest tests claimed, 97 reproduce.** Corrected above.

**On the question I asked it to rule on:** A13's flip must NOT have blocked this PASS — both
contracts already forbid the only act that could have flipped it (a placeholder row is a falsified
measurement), so refusing to write one is compliance. A13 stays MISSING until a real live run.

**One residual it credited but recorded:** invariant I5's second clause — two concurrent runs must
not double-fetch — has no per-tenant in-flight lock. It belongs to whichever unit adds the
scheduler.

**Next unit recommended by the checker:** a Mode C live validation of A13, not another round on
this seam.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
