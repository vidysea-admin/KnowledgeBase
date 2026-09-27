# Manifest — web-ask-page

**Contract:** none yet — this is the first unit for U3.1. `qa/contracts/` is checker-owned; the
checker is asked to author `qa/contracts/web-ask-page.md` from the criteria proposed below, or to
judge against `ask-router-v2.md`'s response shape plus the web-page conventions already fixed by
`web-app-shell-brain-calendar.md`.
**Goal task:** U3.1 — Ask page (roadmap tier, per `.claude/CLAUDE.md` "Backlog priority override",
authorized by D-013). **This is the first unit in this repo pulled from the roadmap tier rather
than from the loop's own ledger.**
**Date:** 2026-09-08
**Fix cycle:** 2 of max 3
**Dual check:** no
**Issues addressed:** ISS-246 — retroactive checker handshake for commit `725f94c`.
**Status:** checked-PASS (cycle 2 — verdict appended in `qa/verdicts/web-ask-page.md`, commit `b53f23a`)

## Why

`POST /ask` has been live and checker-PASSed since T-009 (`apps/api/src/routes/ask.ts`) and is the
product's flagship capability — the CRAG-style router that ARCHITECTURE §1 describes. It had **no
UI**: there was no `AskPage.tsx`, no `/ask` route in `App.tsx`, and no nav entry. The one endpoint
that expresses what this product is could not be reached by a user.

No backend work was required or done. Nothing in `apps/api/` or `packages/` was modified.

## What changed

| File | Change |
|---|---|
| `apps/web/src/api/types.ts` | **appended** `AskResponse` + `AskInternalSource` / `AskWebSource` / `AskScored`, mirroring `AskV2Result` (`packages/ask/src/ask-v2.ts:47`) and `AskResult` (`router.ts:23`). Declared structurally so apps/web keeps no build-time dep on `@lkb/ask`. |
| `apps/web/src/api/ask.ts` | **new** — 1-function client over the shared `apiFetch` wrapper. No bespoke fetch logic. |
| `apps/web/src/pages/AskPage.tsx` | **new** — the page. |
| `apps/web/src/pages/AskPage.test.tsx` | **new** — 5 tests. |
| `apps/web/src/App.tsx` | +2 lines: import + `<Route path="/ask" …>`. |
| `apps/web/src/layout/NavSidebar.tsx` | +2 lines: `AskIcon` import + nav item after Sessions. |
| `apps/web/src/components/icons.tsx` | **appended** `AskIcon`, same `<Svg>` wrapper as every sibling. |

Reuse, not reinvention: `apiFetch`/`ApiError` (`api/client.ts`), `useAuth` (`auth/AuthContext`),
the `card` / `page-header` / `section-title` / `empty-note` / `error-note` class vocabulary, and
`BrainPage.test.tsx`'s convention of spying on the API module rather than `fetch`.

## Proposed criteria

- **C1** `POST /ask` is reachable from the running app: a `/ask` route exists and a nav entry links to it.
- **C2** The page calls the real route through `apiFetch` with the **trimmed** query; an empty or whitespace-only query never issues a request.
- **C3** The answer text from the response is rendered.
- **C4** Internal and web citations are rendered in **separate, separately-labelled and separately-counted** lists — never merged. (This is ARCHITECTURE §1's "always citing sources separately", and is the criterion that matters most here.)
- **C5** An internal source carrying `evidence.sessionRef` links through to `/sessions/:id`; one without it renders as plain text and does not produce a broken link.
- **C6** `insufficient_coverage` is surfaced to the user, so a weakly-covered answer does not read as a confident one; the message distinguishes web-fallback-used from no-fallback-configured.
- **C7** An `ApiError` renders its real message, not a generic failure string.
- **C8** A web source's `url` becomes an `href` **only** when its scheme is http or https. A
  `javascript:`/`data:`/relative value must not produce a link, and must still be shown as inert
  text rather than silently dropped.
- **I1** No file outside `apps/web/src/` is modified.
- **I2** The pre-existing web suite still passes unchanged.

## Evidence

**Targeted tests — 5/5 pass:**
```
$ pnpm --filter '*web*' exec vitest run src/pages/AskPage.test.tsx
 ✓ src/pages/AskPage.test.tsx (5 tests) 2062ms
   ✓ submits the trimmed query and renders the answer
   ✓ cites internal and web sources in separate lists, and links an internal source to its session
   ✓ surfaces insufficient coverage instead of presenting the answer as confident
   ✓ renders the API error message rather than a generic failure
   ✓ does not call the route for an empty query
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

**Full web suite — no regression (I2):**
```
$ pnpm --filter '*web*' exec vitest run
 Test Files  11 passed (11)
      Tests  45 passed (45)
```

**Typecheck — clean (no output = no errors):**
```
$ pnpm --filter '*web*' exec tsc --noEmit
$
```

## Known gaps — stated, not hidden

1. **Not verified in a real browser against a real tenant.** Every assertion above is a component
   test with the `ask` module spied. `POST /ask` returns 404 when no tree index exists for the
   tenant; the page renders that message (C7 path) but the happy path has not been exercised
   end-to-end against live Mongo. A checker wanting that should run the app and say so.
2. **`auditLog` and `scored` are fetched and typed but not rendered.** Deliberate — the per-query
   cost/provider trail is an operator view, not a counsellor's. Out of scope for U3.1; flag it as
   a follow-up row, not a defect of this unit.
3. **No streaming.** The request is a single await; a slow LLM shows "Asking…" with no partial
   output.
4. **Web source titles are read defensively** (`typeof === "string"`) because `WebSource` is an
   open index-signature type (`packages/ask/src/router.ts`), so the real Tavily shape is not
   statically guaranteed. Untitled sources fall back to the URL.

## Note to the checker

Per `.claude/CLAUDE.md` "Backlog priority override" (D-013): `ISSUES-WRITTEN: none` is a complete
and creditable verdict here. Low-severity observations belong in EXPLANATION, not the ledger.
Please do judge C4 and C5 hard — those are the ones that carry the product claim.


## Amendment — security fix applied before dispatch (2026-09-08)

An automated security review flagged `apps/web/src/pages/AskPage.tsx`: **[MEDIUM] XSS via
`javascript:` URI in href**. The finding was valid and is now fixed; it is recorded here rather
than quietly patched, because the manifest is the maker's honest account of the unit.

**Why it was real.** Web citations come from an external search provider, and `WebSource` is an
open index-signature type (`packages/ask/src/router.ts`) — so `source.url` is
externally-influenced text, not a validated URL. The original code rendered any string straight
into `href`, so a hostile or poisoned search result carrying `javascript:...` would execute on
click. This is the same class of trust error as ISS-5A: the data path was fine, the guard was
absent.

**Fix.** New `safeHttpUrl()` helper in `AskPage.tsx` parses via `new URL()` in a try/catch and
returns the value only for `http:`/`https:`; everything else returns `null` and renders as inert
text. Unsafe URLs are deliberately still **displayed** — a silently vanished citation is worse
than a plainly unlinkable one. New criterion **C8** covers this, with a regression test asserting
`javascript:` and `data:` sources produce no anchor but remain visible.

**Verification after the fix:**
```
$ pnpm --filter '*web*' exec vitest run src/pages/AskPage.test.tsx
      Tests  6 passed (6)
$ pnpm --filter '*web*' exec vitest run
 Test Files  11 passed (11)
      Tests  46 passed (46)
$ pnpm --filter '*web*' exec tsc --noEmit
$
```

## Disclosed flake — one intermittent failure observed

On the first run immediately after `AskPage.test.tsx` was rewritten, the test **"cites internal
and web sources in separate lists"** FAILED once; it then passed on the next four consecutive runs
(3 targeted re-runs plus the full suite) with no code change between. Most likely a cold-transform
timing effect against `waitFor`'s default 1s window, but **it is unproven and I am not claiming it
is benign.** Recording it rather than re-running until green and reporting only the green.

Checker: if you can reproduce it, treat it as a real medium-severity test-reliability defect
(C4's assertion is exactly the one that flaked, which is the criterion carrying the product
claim). If you cannot, note it as an open observation — do not close it on my say-so.


## Close-out (2026-09-08)

**PASS, cycle 1** — 8/8 criteria, 3/3 invariants. The checker authored
`qa/contracts/web-ask-page.md`, tightening rather than softening the proposed set: it added **C8**
(converging independently on the same untrusted-URL defect the automated review found mid-check)
and **I3** (no new `packages/*` build-time coupling). All three mutations were caught: merging the
citation lists fails C4, downgrading the internal `<Link>` to a `<span>` fails C4, and reverting
`safeHttpUrl()` to the raw string fails C8.

**Two things carried forward, neither a defect of this unit:**

1. **C5 half-unprotected (coverage gap, low).** Making `sessionRefOf` return `""` instead of
   `null` — which would emit a broken `/sessions/` link for a source with no `sessionRef`, exactly
   what C5 forbids — leaves all 6 tests green. The shipped code is correct, so C5 is met; the
   regression protection is not. **Not fixed here on purpose:** the artifact is PASSed and editing
   it now would repeat the live-edit race described below. One-line test for whichever unit next
   touches this file.
2. **The disclosed flake did not reproduce** — 13/13 green, 10 of them after clearing
   `apps/web/node_modules/.vite`. The checker measured the test at 1277 ms against `waitFor`'s
   1000 ms default, which is a credible mechanism. Left open as an observation, not filed. If it
   recurs, fix with an explicit timeout — **never a retry**, which would hide the very regression
   C4 exists to catch.

**Process failure to own.** `AskPage.tsx` and its test were edited *while* the check was running,
after the manifest read `ready-for-check` — my security fix. The checker verified the final
artifact byte-identically (md5 `1b41f5a8…`) so this verdict is sound, but during its mutation
cleanup it briefly restored a stale backup over the newer file and had to reconstruct it. Editing
an artifact that is under check is a race that can produce a verdict against code nobody shipped.
The correct move was to let the check finish and re-submit at `Fix cycle: 2`. Recorded here rather
than left implicit; it belongs with `qa/gates/concurrent-maker-sessions.md`.

## Cycle 2 resubmission — ISS-246 (2026-09-10)

This cycle is deliberately narrow. Commit `725f94c` changed only
`apps/web/src/pages/AskPage.test.tsx`: it gave the C4 source-list wait an explicit three-second
timeout (no retry) and added the C5 regression test promised at lines 160–165 above. The new test
submits an internal source with no `sessionRef`, waits for its text, and asserts that no link with
that accessible name exists. No runtime module changed.

Fresh maker checks from the root-bound dependency tree:

```text
D:\KnowledgeBase\apps\web> .\node_modules\.bin\vitest.CMD run src/pages/AskPage.test.tsx --cache=false
Test Files  1 passed (1)
Tests       7 passed (7)

D:\KnowledgeBase> corepack pnpm --filter @lkb/web test -- --cache=false
Test Files  11 passed (11)
Tests       47 passed (47)

D:\KnowledgeBase> corepack pnpm --filter @lkb/web typecheck
tsc --noEmit -p tsconfig.json
exit 0
```

Checker instructions: independently read `qa/contracts/web-ask-page.md`, inspect commit
`725f94c`, re-run the focused and full web checks, and mutation-probe C5 rather than trusting this
description. Mode D is not applicable to this resubmission because the changed path is test-only;
no runtime UI surface changed in this cycle. A PASS fixes ISS-246 but **must not close U3.1**:
the real provider-backed answer-and-citation browser exit criterion remains outstanding.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
