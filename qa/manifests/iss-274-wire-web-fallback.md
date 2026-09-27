# Manifest — iss-274-wire-web-fallback
**Contract:** qa/contracts/ask-web-fallback-tavily.md — SEE "Contract conflict" NOTE BELOW. This
unit deliberately does not preserve that contract's criterion 1 / disclosed-limitation wording; the
conflict is filed verbatim in `qa/feedback-inbox.md` (2026-09-28 entry) per the maker brief ("the
checker owns contracts, not you"). I have not edited the contract file.
**Goal task:** none in `.goal/goal.json` `tasks[]` — this closes the Phase-1 exit clause in
`north_star` ("...with web-fallback for off-corpus questions"), which carries no discrete task id.
**Date:** 2026-09-28
**Fix cycle:** 0 of max 3
**Dual check:** required (bound to ISS-274, severity `high`, per this repo's D-013 severity gate —
full ceremony for high/critical)
**Persona walk:** skip — reason: with no real `TAVILY_API_KEY` configured (still true today), the
actual answer text an end user sees for an off-corpus question is UNCHANGED by this unit: `/ask`
still returns `insufficient_coverage: true`, `sources.web: []`, and the same `generateAnswer()`
call over empty context as before. The only change visible without a real key is the AskPage
message text (covered by an isolating falsification below, not a persona walk) and internal audit
observability. A persona walk becomes meaningful once a real Tavily key exists and the SUCCESS path
(sources.web populated with real content) is exercised end-to-end — that is the pre-existing
ISS-010 code path, unchanged by this unit.
**Issues addressed:** ISS-274 (claiming only what's below — I did not touch ISS-010, which already
shipped and PASSed; this unit changes behavior ISS-010 shipped, on the Approver's explicit
instruction, D-041 ruling 2)
**Executor:** claude-sonnet-subagent
**Executor rationale:** in-place wiring across 4 already-small, already-understood files plus one
new UI-honesty fix found during the audit; no external tool was warranted.

## The Approver ruling this unit implements
D-041 (docs/DECISIONS.md), ruling 2, verbatim: "WEB FALLBACK: build it, do not amend the north
star. ISS-274 is resolved as wire-it, not sign-the-honest-limit. The Phase-1 exit clause stands as
written and off-corpus questions must reach a web search path."

## What changed
- `apps/api/src/ask-web-fallback.ts:38-64` — `createTavilySearchFn()` no longer returns `undefined`
  when `TAVILY_API_KEY` is unset. It now ALWAYS returns a real function; with no key, that function
  throws a new exported `TavilyUnavailableError` on every call instead of never being reachable.
  Added the `TavilyUnavailableError` class (line ~28).
- `apps/api/src/production.ts:156-160` — `tavilySearchFn` is now spread into `askDeps`
  UNCONDITIONALLY (removed the `...(tavilySearchFn ? { tavilySearchFn } : {})` spread-conditional
  from the ISS-010 version). Production no longer omits the seam in any state.
- `packages/ask/src/ask-v2.ts:173-192` — the `tavilySearchFn(query)` call is now wrapped in
  try/catch. On success: unchanged (merges results, `web_used: true`, `insufficient_coverage:
  false`). On a thrown error (no key, or a real Tavily HTTP/network failure): caught, logged via a
  new `ask.web_fallback_unavailable` audit entry (`recordJob` `status: "failed"`, real `error`
  message attached, `auditLog` entry with the message in `step`), and `insufficient_coverage` /
  `web_used` are left exactly as `ask()` computed them — never flipped to a false "resolved", never
  left to crash the whole `askV2` call (previously an unguarded `await tavilySearchFn(query)` would
  propagate any real Tavily failure straight up and crash `/ask` with a 500 — this unit also fixes
  that latent robustness gap, not just the missing-key case).
- `apps/api/src/ask-web-fallback.test.ts` — replaced the "returns undefined" test with two tests:
  the seam always returns a function, and that function rejects with `TavilyUnavailableError`
  WITHOUT touching `fetch` (no network call on the honest-unavailable path).
- `packages/ask/src/ask-v2.test.ts` — added one test: a throwing `tavilySearchFn` still gets
  invoked (path reached), the failure is logged as `ask.web_fallback_unavailable` with the real
  reason, and `insufficient_coverage`/`web_used` are NOT falsely resolved.
- `apps/api/src/production.test.ts` (NEW FILE) — this repo had no test asserting production's
  wiring; the contract's own "How to verify" step 5 said to verify it by manually reading the file.
  Added 2 tests: `tavilySearchFn` is present in `buildProductionDeps().ask.askDeps` even with no
  key, and `buildProductionDeps()` builds without throwing or needing a live Mongo connection
  (every `createMongo*Deps()` factory in `store.ts` binds lazily — confirmed by running this test).
- `apps/web/src/pages/AskPage.tsx:62-68,98-103` (OUT OF THE ORIGINAL FILE LIST — see "Why I touched
  a 5th/6th file" below) — fixed a real UI-honesty regression this unit would otherwise have shipped:
  before, `web_used: false` always meant "no fallback configured", and the page said exactly that.
  After wiring the seam unconditionally, `web_used: false` can ALSO mean "the fallback was reached
  and honestly failed" — the old message becomes actively FALSE in that case (a fallback IS
  configured; it just isn't succeeding). The page now checks the `auditLog` for the
  `web_fallback_unavailable` entry and shows an accurate, distinct message.
- `apps/web/src/pages/AskPage.test.tsx` — added the new-message test; the pre-existing
  "no web fallback is configured" test is left as-is and still passes (it asserts the TRUE-absence
  case, no `web_fallback_unavailable` audit entry present, which is unaffected).
- `qa/feedback-inbox.md` — appended the contract-conflict entry (2026-09-28), verbatim per the
  brief. `qa/contracts/ask-web-fallback-tavily.md` itself is untouched.

### Why I touched a 5th/6th file outside the brief's list
The brief's file list was "from ripgrep, verify yourself" (i.e., a starting point, not a ceiling),
and explicitly warned: "note that a change altering what an answer page renders IS a UI change even
if it lives far from the DOM." Grepping the frontend for `web_used`/`insufficient_coverage`
(`apps/web/src/pages/AskPage.tsx:98-101`) turned up exactly that case: my backend change makes an
existing, tested UI string false in a state that did not previously exist. Shipping the backend fix
without this would have left a real regression (a misleading claim on the live answer page) as a
direct, foreseeable consequence of this unit's own change — not a pre-existing issue I happened to
notice. I judged fixing it in place as part of this unit's own honesty requirement rather than
filing a new issue against my own just-introduced regression.

## How to verify (commands + expected)
- `pnpm --filter @lkb/ask typecheck` → exit 0
- `pnpm --filter @lkb/api typecheck` → exit 0
- `pnpm --filter @lkb/web typecheck` → exit 0
- `pnpm -r typecheck` → exit 0 (all 10 typecheck-bearing workspace projects)
- `pnpm -r test` → exit 0, every package green
- `git diff --stat packages/ask/src/router.ts packages/ask/src/router.test.ts` → empty (frozen
  interface untouched, contract's own design constraint honoured)
- `git status --porcelain` → no stray mutants, `.env` untouched/ungitignored-clean

## Actual outputs (from maker's own run, this session)

### Typechecks
```
$ pnpm --filter @lkb/ask typecheck
> tsc --noEmit -p tsconfig.json
(exit 0, no output)

$ pnpm --filter @lkb/api typecheck
> tsc --noEmit -p tsconfig.json
(exit 0, no output)

$ pnpm --filter @lkb/web typecheck
> tsc --noEmit -p tsconfig.json
(exit 0, no output)

$ pnpm -r typecheck
Scope: 10 of 11 workspace projects
... (all 10 report "Done")
EXIT:0
```

### Full workspace test suite (fresh run, this session, AFTER all mutation cycles below were
restored — this is the real, current, post-mutation-cleanup state)
```
$ pnpm -r test
packages/core:        7/7    pass
packages/db:          14/14  pass
packages/ai:          75/75  pass
packages/ask:         51/51  pass   (was 50 pre-unit, +1 ISS-274 test)
packages/index:       232/232 pass
packages/ingest:      118/118 pass
apps/api:             199/199 pass  (was 197 pre-unit: -1 removed "returns undefined" test,
                                      +2 replacement ask-web-fallback tests, +2 new production.test.ts)
packages/meeting-bot:  262/262 pass
apps/web:              135/135 pass (Test Files 16 passed (16); was 134 pre-unit, +1 AskPage test)
Total: 1093 tests, 1093 pass, 0 fail. Exit 0.
```

### `router.ts` / `router.test.ts` untouched (frozen interface respected)
```
$ git diff --stat packages/ask/src/router.ts packages/ask/src/router.test.ts
(empty output)
```

### `pnpm lint:structure` — pre-existing failure, NOT a regression from this unit
```
$ pnpm lint:structure
lint-loc: FAIL — 4 violation(s)
  packages/index/src/pipeline/speakers-llm.ts:313 (budget 300)
  packages/meeting-bot/py/sb_join.py:437 (budget 300)
  packages/meeting-bot/src/capture/obs-windows.ts:359 (budget 300)
  scripts/watch/run-watch.mjs:447 (budget 300)
```
Reproduced identically with this unit's changes `git stash`ed (base commit 2bda2f4) — same 4
files, same line numbers, none of them touched by this unit. Pre-existing debt, disclosed not
hidden; not this unit's to fix (out of scope, unrelated files).

### Secrets discipline
`.env` untouched (`git status --porcelain .env` → empty); `git check-ignore -v .env` confirms it is
gitignored. No real API key appears anywhere in the diff (checked via grep for `tvly-`/`sk-`/long
alnum `api_key` values across every changed file — none found). All tests use `fetch` mocks or the
literal dummy string `"test-key"`.

## Capability coverage (each new claim → its isolating falsification)

All mutation runs followed D-020: byte backup before mutating, restore in a `trap` firing on EXIT
(covers success, INT, TERM and ERR — bash's `trap ... EXIT INT TERM ERR`), verified with `cmp -s`
after every restore. No mutant was left on disk at any point (`git status --porcelain` clean after
every cycle, confirmed 5 times below).

| capability | the check that covers it | the falsifying edit | observed (pasted runner output) |
|---|---|---|---|
| `createTavilySearchFn()` ALWAYS returns a function, never `undefined`, even with no `TAVILY_API_KEY` | `apps/api/src/ask-web-fallback.test.ts`: "createTavilySearchFn always returns a function, even with no TAVILY_API_KEY (ISS-274)" | `ask-web-fallback.ts`: revert the `if (!apiKey) { return async () => {...} }` block to `if (!apiKey) return undefined as unknown as ...;` (the pre-ISS-274 shape) | BEFORE: `✔ createTavilySearchFn always returns a function... (1.9ms)` · pass 2/fail 0. AFTER: `✖ createTavilySearchFn always returns a function... (6.49ms)` — `AssertionError: the seam must be reachable even with no key configured / + actual 'undefined'`. CONTROL (`createTavilySearchFn, when a key is set, calls the real Tavily endpoint shape and maps results`) stayed `✔` both before and after — unaffected, since it never hits the `!apiKey` branch. |
| the no-key path throws `TavilyUnavailableError` specifically (not a generic Error, not a silent success), with NO network call | `apps/api/src/ask-web-fallback.test.ts`: "createTavilySearchFn's function rejects with TavilyUnavailableError when no key is set, WITHOUT a network call (ISS-274)" | `ask-web-fallback.ts`: change `throw new TavilyUnavailableError(...)` to `throw new Error(...)` (same message, wrong class) | BEFORE: `✔ ...rejects with TavilyUnavailableError... (2.78ms)` · pass 2/fail 0. AFTER: `✖ ...rejects with TavilyUnavailableError... (4.98ms)` — `AssertionError: The error is expected to be an instance of "TavilyUnavailableError". Received "Error"`. CONTROL (`createTavilySearchFn always returns a function...`) stayed `✔` both before and after. |
| `ask-v2.ts` REACHES the fallback path on a throwing `tavilySearchFn`, catches it, logs `ask.web_fallback_unavailable`, and does NOT falsely resolve `insufficient_coverage`/`web_used`, and does NOT crash `askV2` | `packages/ask/src/ask-v2.test.ts`: "ISS-274: insufficient coverage + tavilySearchFn that THROWS... still reaches the fallback path and degrades honestly" | `ask-v2.ts`: remove the `try { ... } catch (err) { ... }` wrapper around the `tavilySearchFn` call, keeping only the try-body's 4 lines unwrapped | BEFORE: `✔ ISS-274: insufficient coverage + tavilySearchFn that THROWS... (1.37ms)` · pass 2/fail 0. AFTER: `✖ ISS-274: insufficient coverage + tavilySearchFn that THROWS... (1.04ms)` — the test itself throws uncaught: `Error: web fallback unavailable: TAVILY_API_KEY not configured` propagating out of `askV2` (stack trace shows `at tavilySearchFn ... at askV2 (ask-v2.ts:182:30)`), i.e. the exact crash-on-failure regression this unit exists to prevent. CONTROL (`insufficient coverage with no sync webFallbackFn: tavilySearchFn fills the real gap (ISS-010)`, the SUCCESS path) stayed `✔` both before and after — unaffected, since it never throws. |
| `production.ts` wires `tavilySearchFn` UNCONDITIONALLY (no longer omitted when the key is absent) | `apps/api/src/production.test.ts`: "ISS-274: buildProductionDeps wires tavilySearchFn into askDeps even with no TAVILY_API_KEY set" | Two-file mutation (both restored, see below): `production.ts` reverted to `...(tavilySearchFn ? { tavilySearchFn } : {})`, AND `ask-web-fallback.ts`'s `createTavilySearchFn` reverted to return `undefined` (so the conditional actually has something falsy to omit — otherwise the always-a-function fix from mutation 1 would mask this one) | BEFORE: `✔ ...wires tavilySearchFn into askDeps... (6.05ms)` · pass 2/fail 0. AFTER: `✖ ...wires tavilySearchFn into askDeps... (66.29ms)` — `AssertionError: tavilySearchFn must be present in production's askDeps regardless of TAVILY_API_KEY / + actual 'undefined'`. CONTROL (`buildProductionDeps constructs without throwing or requiring a live Mongo/network connection`) stayed `✔` both before and after. |
| `AskPage.tsx` shows an ACCURATE, DISTINCT message when the fallback was reached-but-unavailable, vs. the true "nothing configured" case | `apps/web/src/pages/AskPage.test.tsx`: "ISS-274: distinguishes 'fallback unavailable'... from 'no fallback configured'..." | `AskPage.tsx`: revert the 5-line ternary back to the single-line `{result.web_used ? "..." : "; no web fallback is configured."}` | BEFORE: both the new test and the old "no web fallback is configured" test passed (`Test Files 16 passed (16)`, `Tests 135 passed (135)`). AFTER: `Test Files 1 failed | 15 passed (16)`, `Tests 1 failed | 134 passed (135)` — the new test's own assertion `expect(screen.getByText(/web fallback was reached but is currently/i))` fails with testing-library's "unable to find an element with the text" error (full DOM dump pasted in the run shows no such text; failure points at `AskPage.test.tsx:168:19`, the exact assertion). CONTROL (the pre-existing "no web fallback is configured" test, and all other 133 tests) stayed green — the mutation touches only the branch the new test targets. |

- **Mutation-safety compliance:** every row above was produced by a script that: `cp`'d the target
  file to `/tmp/<name>.bak<N>` first; set `trap '...restore + cmp...' EXIT INT TERM ERR` BEFORE any
  mutation; ran the BEFORE assertion; applied a single anchored Python string-replace (asserted to
  actually match, so a silent no-op mutation can't masquerade as a result); ran the AFTER assertion;
  let the trap fire on script exit. Every restore printed `RESTORED-OK (cmp clean...)`. Confirmed
  with `git status --porcelain` after each of the 5 cycles (and once more at the end) — clean every
  time, no mutant ever left applied.
- **Isolation, not global reddening:** every falsifying edit was a single anchored string
  replacement inside one function, none of them touch imports, type declarations, or anything that
  would break parsing — each AFTER run shows exactly one new failure (the targeted test) with every
  other test in that file, and the stated control, staying green.

## Live browser evidence
Not run as a live Playwright/browser session this manifest — I cannot launch a browser session in
this environment. This IS a UI change (see the AskPage.tsx section above), so per the brief I am
stating this as a GAP, not deleting the section or claiming "not UI-touching":
- `apps/web/src/pages/AskPage.tsx` — the two message-copy states (`web_used`, plain "no fallback
  configured", and the new "unavailable") were exercised via `@testing-library/react` +
  `userEvent`/`vitest`, which renders real React output into jsdom and asserts on the real rendered
  text (see isolating falsification row 5 above, including the pasted rendered-DOM dump under the
  mutation), but this is NOT the same as a live browser (`playwright`) pass — no visual/console/
  interaction check was done in an actual browser window.
- `GAP`: no live-browser confirmation that this text renders correctly styled/positioned in a real
  Chrome instance, and no live end-to-end `/ask` call was made against a running server (the
  contract's own disclosed limitation — remote Mongo host `13.202.206.101:27017` — may or may not
  still apply; not re-checked this session since no code in this unit touches Mongo connectivity).

## Status: checked-PASS

**Handshake status:** checked-PASS (Cycle checked: 0, verdict `qa/verdicts/iss-274-wire-web-fallback.md`,
VERDICT: PASS, SCOREBOARD 5/5 criteria + 4/4 invariants, CAPABILITY-COVERAGE 4/5 rows reproduced,
LIVE-BROWSER `qa/evidence/browser-iss-274-wire-web-fallback-2026-09-28-checker/`) -- closed out 2026-09-28.

**Read the verdict file from the BOTTOM.** It carries TWO `VERDICT:` lines: the Mode A pass ended
`FAIL` at line 13 solely because the shared Playwright profile was locked, and the appended
`## MODE D RE-DISPATCH (cycle 0)` section at line 203 carries the operative `VERDICT: PASS`. A reader
going top-down -- or a tool grepping the first match -- sees the superseded FAIL. Filed under the
ISS-350 class (handshake state cannot be computed from the file's surface form).

**No fix cycle was charged.** The Mode A FAIL was environmental (browser lock), not a defect; the
checker protocol's own rule is that an unexecutable check returns BLOCKED and never bills the maker.
The maker changed nothing between the FAIL and the PASS -- same commit `d23d464`, same Fix cycle 0.
Only Mode D was re-dispatched.

**The `Dual check: required` line above is WRONG and was not honoured.** It was derived from ledger
`severity: high`; the rule (maker SKILL.md 7b) keys on the bound `.goal` task carrying
`criticality: critical`, and `.goal/goal.json` has zero tasks matching this slug. Single checker was
correct. Filed as ISS-274WIRE-1 (low).

**Scope of the live evidence, stated honestly.** This worktree has no `.env`, so the real
`apps/api/src/index.ts` entrypoint cannot start (it awaits a Mongo `connect()` before listening). The
checker therefore drove the real, unmodified `createServer` / `askV2` / `createTavilySearchFn` through
a checker-owned harness that fakes only the Mongo + LLM retrieval layer this unit never touches, over
live HTTP into a real headless Chromium against the real unmodified `AskPage.tsx`. That is a genuine
browser round trip through this unit's actual code -- it is NOT a full production deployment check,
and it does not retire the contract's standing remote-Mongo limitation.

**Carried forward, none fixed here:**
- **ISS-274WIRE-1** (low) -- the mis-derived `Dual check` field, described above.
- **ISS-274WIRE-2** (low) -- this manifest's own capability-coverage row 4 used a TWO-FILE falsifying
  edit, which is inadmissible; the checker rejected the cell as CONTRACT_MISMATCH and reconfirmed the
  capability with its own compliant single-file mutation. The capability is real; the evidence cell
  for it was not.
- **ISS-274WIRE-3** (low, downgraded) -- `apps/web/src/App.tsx` declares `/ask` TWICE (line 27 ->
  AskPage, line 35 -> DashboardPage). The browser settled it: React Router resolves to AskPage, so
  this is dead-code cleanup, not a reachability defect. It was an open reachability QUESTION until a
  browser actually looked.

**Contract amended by the checker, not by this unit.** `qa/contracts/ask-web-fallback-tavily.md`
criteria 1-3, 5 and its disclosed-limitation section were rewritten from "an omitted `tavilySearchFn`
is today's production default" to "always-wired, honest-unavailable on no key", authority D-041
ruling 2 (`Approved-by: Umesh`), commit `02b8343`, with a dated amendment-log entry. The maker
correctly did not touch the contract and routed the conflict to `qa/feedback-inbox.md` instead.
