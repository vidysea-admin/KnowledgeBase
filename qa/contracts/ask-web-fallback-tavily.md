# Contract — ask-web-fallback-tavily (closes ISS-010's third sub-gap)

> ISS-010 (medium, filed by an earlier checker sweep) named three Phase-1 exit gaps: (1) `POST
> /ask` route owned by no task, (2) web-search provider absent from T-019, (3) `D-002` retention
> field absent from T-018. Verified this tick: (1) and (3) were already real — `POST /ask` exists
> and is tested, `media.schema.json` already requires `retention`. Only (2) was genuinely still
> open: `/ask`'s CRAG router promises "internal-first, web-fallback-only-when-needed" but no real
> web-search provider was ever wired into production, so an ambiguous/incorrect verdict always
> came back `insufficient_coverage: true` — the fallback path existed in name only. This unit
> closes that gap. Drafted by the maker; /checker adopts or amends on first check.

## Design constraint (why this isn't a router.ts change)

`packages/ask/src/router.ts`'s `WebFallbackFn` is synchronous (`(query) => WebSource[]`), part of
T-005/T-016 — already shipped, checker-PASSed, and (per this repo's Lab Protocol update-
authorization rules) not something to touch without a DECISIONS-authorized amendment. A real
Tavily HTTP call is inherently async, so it cannot be a `WebFallbackFn`. This unit layers a
**second, optional, async fallback** on top of `router.ts` — entirely inside `ask-v2.ts`, which
was already async and already branches on verdict — rather than touching the frozen sync
interface. `router.ts` and `router.test.ts` are untouched by this unit (verify via `git diff
packages/ask/src/router.ts` — empty).

## Criteria (each machine-checkable)

1. **`packages/ask/src/ask-v2.ts`** — `AskV2Deps` gains an optional `tavilySearchFn?: (query:
   string) => Promise<WebSource[]>`. After `ask()` returns, if `askResult.insufficient_coverage
   && tavilySearchFn`, call it. This is reachable ONLY when the sync `webFallbackFn` path did NOT
   already run (mutually exclusive by construction: `insufficient_coverage` is true exactly when
   verdict != correct AND no `webFallbackFn` fired). The call is wrapped in try/catch (amended
   2026-09-28, D-041 ruling 2 — see amendment log): on success, merge the results into a new
   `askResult` (`web_used: true, insufficient_coverage: false, sources.web: <fetched>`) and log via
   `recordJob` + `auditLog` (`kind: "ask.web_fallback"`, `step: "web_fallback"`); on a thrown error
   (no key configured, or a real Tavily HTTP/network failure), catch it, log a distinct
   `ask.web_fallback_unavailable` audit entry (`recordJob` `status: "failed"`, the real error
   message attached) and leave `insufficient_coverage`/`web_used` exactly as `ask()` computed them
   — never flipped to a false "resolved", never left to crash `askV2`/`/ask` with an unhandled
   rejection.
2. **`apps/api/src/ask-web-fallback.ts`** (new) — `createTavilySearchFn()` (amended 2026-09-28,
   D-041 ruling 2): ALWAYS returns a real function, never `undefined`. When `TAVILY_API_KEY` is
   unset, the returned function throws the exported `TavilyUnavailableError` on every call — the
   seam must be reachable even with no key configured, not silently absent. When a key is set, the
   function calls `POST https://api.tavily.com/search` for real. On a non-OK HTTP response, it
   throws a real error (never silently returns `[]` — a caller must be able to tell "no results"
   from "the call failed"). Same composition-root pattern as `ingest-store.ts`'s
   `jinaReaderFetch` (plain `fetch`, no vendor SDK).
3. **`apps/api/src/production.ts`** — wires `createTavilySearchFn()`'s result into `askDeps`
   UNCONDITIONALLY (amended 2026-09-28, D-041 ruling 2 — the earlier `truthy`-gated
   spread-conditional is gone; `createTavilySearchFn()` is never falsy now, so a conditional spread
   would be dead code masking criterion 2's own always-reachable guarantee one layer up).
4. **No regression.** `pnpm --filter @lkb/ask typecheck`, `pnpm --filter @lkb/api typecheck`,
   `pnpm -r test`, `pnpm lint:structure` all exit 0. `packages/ask/src/router.ts` and
   `router.test.ts` show zero diff.
5. **Real unit-test coverage** (fixtures/fakes, no real network — see disclosed limitation
   below): `ask-v2.test.ts` covers both branches of criterion 1's try/catch (the async fallback
   fires and clears `insufficient_coverage` on success; a throwing `tavilySearchFn` still reaches
   the fallback path, is caught, logs `ask.web_fallback_unavailable`, and does not crash `askV2` or
   falsely resolve `insufficient_coverage`/`web_used`) plus the pre-existing "`tavilySearchFn`
   omitted, behavior unchanged" case. `ask-web-fallback.test.ts` covers: the seam always returns a
   function even with no key (criterion 2); that function rejects with `TavilyUnavailableError`
   specifically, without a network call; calls the real endpoint shape + maps results with a key
   (fetch mocked); throws a real error on a non-OK response.

## Disclosed limitation (real, not hidden)

`TAVILY_API_KEY` is empty in `.env` — no real Tavily account exists yet, so the actual live HTTP
call to `api.tavily.com` has never been exercised end-to-end. Amended 2026-09-28 (D-041 ruling 2 —
see amendment log): `production.ts` no longer omits `tavilySearchFn` in this state — the seam is
always wired, and every off-corpus question REACHES it. With no key, the call throws
`TavilyUnavailableError`, which `ask-v2.ts` catches and logs as an honest
`ask.web_fallback_unavailable` audit entry; `insufficient_coverage` can still end up `true` (there
genuinely was no web result), but that is no longer indistinguishable from "the fallback was never
attempted" — the audit log now tells the two apart, and `apps/web`'s AskPage surfaces the
"reached but currently unavailable" state distinctly from "no web fallback is configured". This
remains disclosed, not silently assumed to work: nobody has watched a real Tavily response come
back yet, only the honest-failure path, and separately, live end-to-end verification of `/ask`
itself is still blocked by the real, transient Mongo host outage recorded below.

## Amendment log

- **2026-09-28 · CRITICAL (pre-authorized) · Umesh (Approver) via D-041 ruling 2, applied by
  /checker on unit `iss-274-wire-web-fallback`'s first check.** Criteria 1–3 and 5, and the
  "Disclosed limitation" section, are rewritten to describe "always-wired, honest-unavailable
  on no key" instead of "omitted when no key, byte-identical default" — the direction this
  contract originally shipped (the ISS-010 "sign-the-honest-limit" default) is superseded by
  D-041 ruling 2, verbatim: "WEB FALLBACK: build it, do not amend the north star. ISS-274 is
  resolved as wire-it, not sign-the-honest-limit. The Phase-1 exit clause stands as written and
  off-corpus questions must reach a web search path." This is a goal-direction reversal
  (normally a CRITICAL amendment requiring a fresh human gate), but the Approver already ruled on
  this exact question in D-041 before this check — per this repo's own precedent (sweep check 4,
  "once a D-entry with `Approved-by` exists the question is never asked again"), the amendment is
  applied now, not re-asked. The maker (`iss-274-wire-web-fallback` manifest, cycle 0) built to
  this ruling, correctly did not edit this file itself, and filed the conflict verbatim to
  `qa/feedback-inbox.md` for reconciliation, exactly as this repo's contract-ownership rule
  requires. Links: ISS-274, D-041, `qa/manifests/iss-274-wire-web-fallback.md`,
  `qa/verdicts/iss-274-wire-web-fallback.md`.

**Separately, also disclosed:** live end-to-end verification of `/ask` itself (even the
unchanged-behavior path) was attempted and blocked this session by a real, transient
infrastructure issue — the project's remote Mongo host (`13.202.206.101:27017`) was unreachable
(`ETIMEDOUT`, 100% ping loss) at verification time, unrelated to any code in this unit (confirmed
via `ping` — a network-level outage, not a Mongo auth/config problem). The full test suite (which
does not require live Mongo) is green; live-server verification is deferred to whenever
connectivity is restored, not skipped silently.

## Real evidence

### Typecheck
```
$ cd packages/ask && npx tsc --noEmit -p tsconfig.json    # exit 0
$ cd apps/api && npx tsc --noEmit -p tsconfig.json         # exit 0
```

### Full workspace test suite (fresh run, this session)
```
$ pnpm -r test
packages/core:        7/7   pass
packages/index:       25/25 pass
packages/ai:          56/56 pass
packages/ingest:      34/34 pass
packages/ask:         32/32 pass   (was 30, +2 tavilySearchFn tests)
packages/meeting-bot: 40/40 pass
apps/api:             59/59 pass   (was 56, +3 ask-web-fallback tests)
apps/web:             34/34 pass
Total: 287 tests, 287 pass, 0 fail.
```

### Structure lint (fresh run)
```
$ pnpm lint:structure
lint-loc: OK (195 file(s) within budget)
lint-dirsize: OK (73 dir(s) within budget)
lint-root: OK (15 loose root file(s), 1 gitignored excluded)
lint-dupes: OK (227 unique export(s), 24 unique schema $id(s))
lint-migrations: OK (968 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (115 lines, budget 200)
✔ no dependency violations found (226 modules, 648 dependencies cruised)
```

### `router.ts` / `router.test.ts` untouched (frozen interface respected)
```
$ git diff --stat packages/ask/src/router.ts packages/ask/src/router.test.ts
(empty output)
```

### Real Mongo connectivity check (why live /ask verification is deferred)
```
$ ping -n 2 13.202.206.101
Packets: Sent = 2, Received = 0, Lost = 2 (100% loss)
$ npx tsx apps/api/src/index.ts   # MongoServerSelectionError: connect ETIMEDOUT 13.202.206.101:27017
```

## How to verify (for the checker)
1. `pnpm --filter @lkb/ask typecheck` and `pnpm --filter @lkb/api typecheck` — expect exit 0.
2. `pnpm -r test` — expect exit 0, 287/287.
3. `pnpm lint:structure` — expect exit 0.
4. `git diff --stat packages/ask/src/router.ts packages/ask/src/router.test.ts` — expect empty.
5. Read `ask-v2.ts`, `ask-web-fallback.ts`, `production.ts` — confirm the merge logic is correct
   (mutually exclusive with the sync path), confirm `createTavilySearchFn` never silently
   swallows a failed HTTP call, confirm `production.ts` only wires it when truthy.
6. If Mongo connectivity has been restored by check time, a live `curl -X POST
   http://localhost:3300/ask` with a real key + query is a bonus confirmation that `/ask` still
   works unchanged — not required, since the disclosed limitation above already explains why it
   couldn't be done at manifest time.
