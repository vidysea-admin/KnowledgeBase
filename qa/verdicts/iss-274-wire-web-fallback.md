# Verdict — iss-274-wire-web-fallback

**Cycle checked:** 0
**Date:** 2026-09-28
**Checker:** independent subagent, Mode A + Mode D (attempted), bound to
`D:/KnowledgeBase-lanes/iss-274-web-fallback-wire` (branch `wave/iss-274-web-fallback-wire`).
**Commit under check:** `d23d4643bd4e98a280ff69cbad3481f5221e1a7f`.
**Contract:** `qa/contracts/ask-web-fallback-tavily.md` — amended by this checker this cycle (see
"Contract conflict" below).
**Base commit for diff-scope:** `2bda2f4`.

```
VERDICT: FAIL
SCOREBOARD: 5/5 criteria met (post-amendment), 4/4 invariants hold (typecheck, tests, router.ts
  untouched, lint pre-existing-only) — held to FAIL solely by the missing mandatory Mode D evidence
  below, not by any code defect
FAILURES (if any):
- [Mode D] sev: high · UI-touching unit (apps/web/src/pages/AskPage.tsx) has no checker-driven
  live-browser evidence for the claimed "no web fallback is configured" vs "reached but currently
  unavailable" message-text distinction · NOT a code defect: the shared Playwright browser profile
  (mcp-chrome-dde8b72) was held by a separate, genuinely live concurrent session for the entire
  check window (confirmed by process-level evidence, not assumed) · fix direction: re-dispatch Mode
  D alone once the browser is free; no source change expected · issue: none filed (environmental,
  not a code ledger entry)
CAPABILITY-COVERAGE: 4/5 rows independently reproduced by checker in isolated throwaway copies
  (rows 1, 2, 3, 5: GREEN-before -> single-file falsifying edit -> RED-after -> restored, matching
  the manifest's pasted evidence exactly); row 4's own falsifying-edit cell is CONTRACT_MISMATCH
  (a two-file mutation, inadmissible) and is UNVERIFIED-by-checker as pasted — see below for the
  checker's own compliant single-file re-verification of that row's underlying capability
LIVE-BROWSER: SKIP (shared Playwright profile `mcp-chrome-dde8b72` held by another live concurrent
  session throughout this check; 4 navigate attempts across the session, the last immediately
  before this verdict, all identical "Browser is already in use ... use --isolated" errors;
  independently confirmed as a genuine concurrent lock, not stale, via `tasklist` showing dozens of
  live `chrome.exe` processes)
ISSUES-WRITTEN: ISS-274WIRE-1, ISS-274WIRE-2, ISS-274WIRE-3
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: Every non-Mode-D check is clean and independently reproduced (1093/1093 tests,
  typecheck exit 0 x2, lint:structure's 4 violations proven pre-existing via merge-base + empty
  diff, router.ts/router.test.ts untouched, diff-scope pure-additive with no undisclosed
  deletions, 4/5 capability rows reproduced exactly and the 5th independently reconfirmed by a
  compliant single-file mutation); the contract's self-disclosed conflict with its own criteria is
  resolved by amendment citing D-041 ruling 2 (Approved-by: Umesh), which the maker correctly did
  not touch itself. The sole reason this is not PASS is the mandatory Mode D live-browser check for
  a UI-touching unit, which could not run this session due to a genuine external browser-profile
  lock — re-dispatch that one check alone once unblocked.
```

## 1. Diff-scope check (step 4c) — clean, no violation

Base `2bda2f4` is confirmed an ancestor of HEAD (`git merge-base --is-ancestor 2bda2f4 HEAD`).
`git diff 2bda2f4...HEAD --stat` shows the two files the manifest disclosed as an out-of-brief
scope extension — `apps/web/src/pages/AskPage.tsx` and `apps/web/src/pages/AskPage.test.tsx` —
alongside the originally assigned files. Read the full diff for both:

- `AskPage.tsx` — pure-additive. The pre-existing single-line ternary
  (`result.web_used ? "... and fell back to the web." : "; no web fallback is configured."`) is
  replaced by a 5-line three-way branch that ALSO covers a `webFallbackUnavailable` state, but the
  two original outcomes (`web_used` / plain "no web fallback is configured") are preserved
  verbatim as two of the three branches. Nothing is deleted that the manifest's stated criteria
  did not require changing.
- `AskPage.test.tsx` — only additions (one new `describe`/`it` block); the pre-existing "no web
  fallback is configured" test is untouched and still present and green.

No function, export, route, test, or config key was deleted or renamed. The manifest's disclosed
"Why I touched files outside the original list" reasoning (surfacing the new
`ask.web_fallback_unavailable` state honestly on the one UI surface that reads it) matches what the
diff actually does. **No diff-scope violation.**

## 2. Mode D (mandatory, UI-touching unit) — BLOCKED by environment, not by code

`AskPage.tsx` is a real UI surface change, so Mode D is mandatory regardless of the manifest's own
disclosed gap. I attempted to drive my own browser via `browser_navigate` four times across this
session, most recently immediately before writing this verdict:

```
Error: Browser is already in use for C:\Users\Lenovo\AppData\Local\ms-playwright-mcp\mcp-chrome-dde8b72,
use --isolated to run multiple instances of the same browser
```

This is not a stale lock: `tasklist //FI "IMAGENAME eq chrome.exe"` showed dozens of live
`chrome.exe` processes during this session, consistent with a genuinely active concurrent session
holding the shared profile. No tool parameter available to me exposes an `--isolated` flag to work
around it. Per protocol this is `LIVE-BROWSER: SKIP (<instrument failure>)`, and per the explicit
rule "a UI-touching unit cannot PASS without it," this alone holds the verdict to FAIL — not
because any evidence found so far suggests a defect, but because the required evidence was never
produced. **The specific claim that still needs live confirmation:** that the no-key state renders
"no web fallback is configured" (unchanged path) while a distinguishable message would render for
"reached but currently unavailable" — the code path for this was read and looks correct (see §5),
but was not clicked through live.

## 3. Contract conflict — adjudicated, contract amended citing D-041

The manifest's own stated purpose contradicts the contract's original criterion 1 and "Disclosed
limitation" wording (both originally described an omitted `tavilySearchFn` as the shipped
default). The maker correctly did not edit the contract and filed the conflict verbatim to
`qa/feedback-inbox.md`. I read `docs/DECISIONS.md` D-041 (lines 507-563) myself. Ruling 2, verbatim:
"WEB FALLBACK: build it, do not amend the north star. ISS-274 is resolved as wire-it, not
sign-the-honest-limit. The Phase-1 exit clause stands as written and off-corpus questions must
reach a web search path." `Approved-by: Umesh`, predating this unit.

This directly and specifically settles the exact question in conflict. Per this repo's own
precedent (sweep check 4: once a `D-entry` with `Approved-by` exists, the question is not re-asked)
this is a case where a normally-CRITICAL contract amendment (a goal-direction reversal) does not
need a fresh human gate — the gate already happened, in D-041, before this unit was built. As
contract maintainer, I amended `qa/contracts/ask-web-fallback-tavily.md` criteria 1, 2, 3, 5 and the
"Disclosed limitation" section to describe "always-wired, honest-unavailable on no key" instead of
"omitted when no key," and appended a dated "## Amendment log" entry citing D-041 ruling 2 as
authority, with full links back to this manifest and this verdict. The unit's own code matches the
amended criteria, not the original ones — confirmed by direct source read (§5).

## 4. Dual-check field — mis-set, filed low, does not change process

The manifest's `Dual check: required` line is derived from the ledger's `severity: high` field.
Per `maker/SKILL.md` 7b (read verbatim this session), the actual keying rule is a bound `.goal`
task carrying `criticality: critical`. `.goal/goal.json` has zero tasks matching this unit's slug
or ISS-274. Per the rule's own fallback ("No `.goal`, no matching task, or any other criticality ->
single checker, exactly as before"), this is correctly a single-checker unit; I proceeded as the
sole checker. Filed `ISS-274WIRE-1` (low) for the mis-set field — cosmetic, does not affect this
verdict.

## 5. Capability-coverage (step 4b) — 4/5 reproduced by checker, row 4 partially rejected

All five falsifications were run in isolated throwaway copies outside the bound worktree (never
`git archive`, never touching the bound tree), each row its own copy, GREEN baseline confirmed
in the copy before any edit, D-020-safe (byte backup, `trap ... EXIT INT TERM ERR` restore, `cmp`
verified after every mutation).

| row | capability | checker's own result |
|---|---|---|
| 1 | `ask-v2.ts` fires the async fallback on `insufficient_coverage && tavilySearchFn`, mutually exclusive with the sync path | Reproduced exactly: GREEN before, RED after single-hunk edit, matching manifest's pasted before/after text, restored clean |
| 2 | `createTavilySearchFn()` always returns a function; with no key, throws `TavilyUnavailableError` with no network call | Reproduced exactly, restored clean |
| 3 | `ask-v2.ts` catches a throwing `tavilySearchFn`, logs `ask.web_fallback_unavailable`, does not falsely resolve or crash | Reproduced exactly (BEFORE 2/2, AFTER: target test throws uncaught with the exact stack trace the manifest pasted; control stayed green), restored clean |
| 4 | `production.ts` wires `tavilySearchFn` into `askDeps` unconditionally | Manifest's own falsifying-edit cell mutates **two files** (`production.ts` reverted to a truthy-gated conditional spread, AND `ask-web-fallback.ts`'s `createTavilySearchFn` reverted to return `undefined`). Per protocol, a falsifying edit is admissible ONLY as a single-hunk edit to one file named in "What changed" — a two-file edit is `CONTRACT_MISMATCH` and was **not executed as pasted**. Instead, in `iss274-row4`, I ran the manifest's own claimed GREEN baseline (`node --test --import tsx src/production.test.ts` → 2/2 pass, matching exactly), then applied my **own single-file mutation** (`production.ts` only: the wired `tavilySearchFn,` field changed to `tavilySearchFn: undefined,`). AFTER: 1 fail/1 pass — `AssertionError: tavilySearchFn must be present in production's askDeps regardless of TAVILY_API_KEY / +actual 'undefined' -expected 'function'` — control test unaffected. Restored clean (`cmp` verified). **The underlying capability is real and independently confirmed**; only the manifest's own two-file falsification methodology for this row is rejected. Filed `ISS-274WIRE-2` (low). |
| 5 | `AskPage.tsx` distinguishes "reached but unavailable" from "no web fallback is configured" in the rendered message | Reproduced exactly: GREEN 8/8 before; single-hunk revert of the 5-line ternary back to the pre-unit one-liner; AFTER 1 fail/7 pass — the new ISS-274 assertion fails with testing-library's "unable to find an element with the text" error exactly as the manifest describes; the pre-existing "no web fallback is configured" test and all others stayed green. Restored clean. |

## 6. No-regression checks — all independently re-run, all clean

- **Typecheck.** `pnpm --filter @lkb/ask typecheck` and `pnpm --filter @lkb/api typecheck` — both
  exit 0, no output.
- **Full workspace test suite.** `pnpm -r test`, fresh run, full untruncated log captured this
  session: **1093/1093 pass, 0 fail** — matches the manifest's claimed total exactly.
- **`pnpm lint:structure`.** Same 4 violations as the manifest reports
  (`speakers-llm.ts:313`, `sb_join.py:437`, `obs-windows.ts:359`, `run-watch.mjs:447`). Proven
  pre-existing at base, not a regression: `git merge-base --is-ancestor 2bda2f4 HEAD` is true, and
  `git diff 2bda2f4...HEAD --stat -- <those 4 files>` is empty — the unit's diff never touches any
  of them. (A first attempt to prove this via `git stash` + re-run was invalid, since the working
  tree was already committed and there was nothing to stash against the same HEAD; the
  merge-base + empty-diff method above is a valid, independent substitute.)
- **`packages/ask/src/router.ts` / `router.test.ts` untouched.**
  `git diff --stat 2bda2f4...HEAD -- packages/ask/src/router.ts packages/ask/src/router.test.ts` —
  empty. Frozen interface respected, as the contract's design-constraint section requires.
- **Secrets discipline.** No real API key or secret anywhere in the diff or the manifest; `.env`
  unchanged and gitignored; `TAVILY_API_KEY` remains unset in this environment (the disclosed
  limitation both the contract and manifest describe honestly).

## 7. Source review — matches the amended contract's criteria

Read `packages/ask/src/ask-v2.ts`, `apps/api/src/ask-web-fallback.ts`, `apps/api/src/production.ts`
in full:

- `ask-v2.ts` (~lines 181-194): the `tavilySearchFn(query)` call is wrapped in try/catch exactly as
  claimed — success path merges `web_used: true, insufficient_coverage: false, sources.web`;
  failure path is caught, logged as `ask.web_fallback_unavailable` via `recordJob` (`status:
  "failed"`) and `auditLog`, with `insufficient_coverage`/`web_used` left exactly as `ask()`
  computed — never crashes, never falsely resolves.
- `ask-web-fallback.ts`: `TavilyUnavailableError` class present; `createTavilySearchFn()` always
  returns a real function — with no key, the returned function throws
  `TavilyUnavailableError("TAVILY_API_KEY not configured")` on every call, never `undefined`.
- `production.ts` (line ~161): `tavilySearchFn,` is spread into the `askDeps` object
  **unconditionally** — no truthy-gated conditional spread remains.

This matches the amended contract's criteria 1-3, not the original (pre-amendment) wording.

## 8. Separately noted, out of this unit's scope

`apps/web/src/App.tsx` declares a `/ask` route twice (once to `AskPage`, once later to
`DashboardPage`) — confirmed pre-existing via `git diff 2bda2f4...HEAD -- apps/web/src/App.tsx`
(empty). Whether this actually blocks real navigation to `AskPage` could not be settled this
session because Mode D was blocked. Filed `ISS-274WIRE-3` (low, pending live confirmation) rather
than silently dropped.

## Why FAIL, not PASS

Every criterion, every invariant, every capability-coverage row, and the contract's own
self-disclosed conflict are independently and cleanly resolved. The single reason this is not PASS
is procedural, not substantive: a UI-touching unit's mandatory Mode D live-browser check could not
be produced this session because a shared browser instrument was genuinely held by another
concurrent session throughout the check window, confirmed by process-level evidence rather than
assumed. This is recorded honestly as `LIVE-BROWSER: SKIP`, not fabricated, and not silently
substituted with a read of the maker's own (also-absent) browser evidence. Re-dispatching Mode D
alone, once the shared profile is free, is expected to close this out with no source change
required.
