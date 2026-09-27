# Manifest — vacuous-evidence-probes

**Contract:** none. ISS-203 owns the missing vacuity criterion; the `handshake-liveness` START is a
pending HUMAN_GATE. Judge against ISS-202 items 1 and 2's recorded fix directions.
**Goal task:** none — QUEUE row 2, tier 2.
**Date:** 2026-09-09
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** **ISS-202 items 1 and 2** (high).

## Item 2 — the empty-query guard test, and MY FIRST FIX WAS ALSO VACUOUS

The original asserted `expect(spy).not.toHaveBeenCalled()` **without ever submitting**, so it held
whether or not `handleSubmit` guarded. It only ever proved the button's `disabled` attribute.

**My first fix typed `{Enter}`**, on the belief that a form submits on Enter regardless of button
state. **That is false**, and I found out only by mutating: browsers perform implicit form
submission only when an **enabled** submit button exists. Removing `handleSubmit`'s
`trimmed === ""` guard left the whole suite at **46/46** under that version — the fix for a vacuous
test was itself vacuous, and green.

Dispatching `submit` on the form reaches the handler. The same mutation now **kills 1 test**.

| | M-empty-guard-removed (`trimmed === ""` dropped) |
|---|---|
| original test | survives |
| my `{Enter}` fix | **survives** — 46/46 |
| `fireEvent.submit(form)` | **KILLED** — 45/46 |

Added a non-vacuity leg proving the spy is reachable at all, and deleted the comment asserting the
Enter behaviour I had just disproved.

## Item 1 — the live rank probe could not fail

It compared each hit's `(turnId, sessionId)` against a Map built from **the same array the hits were
derived from**. `lexicalSearchTurns` emits those fields off those very objects, so
`mismatchedPairs=0` was arithmetic. And ISS-083/084 are defects in `createMongoSearchDeps` — which
the probe **never called**. It reported a claim it structurally could not support as verified.

Per the recorded fix direction it now (a) runs the real store and (b) uses an **independent** oracle,
re-reading each hit's turn by `_id` straight from the collection, plus refusing to report success on
zero hits.

**Proven capable of failing, not asserted to be.** Pairing hit *i* with hit *i+1*'s `sessionId`
(ISS-084's shape):

```
q="visa student university funding"  mismatchedPairs=6  mismatchedJoins=6
q="2026 intake"                      mismatchedPairs=0  mismatchedJoins=0
q="counselling"                      mismatchedPairs=2  mismatchedJoins=2
```

**Honest limit:** the middle query reports 0 even under the mutant, because all ten of its hits come
from **one session** — rotating `sessionId` among identical values changes nothing. The probe's
sensitivity depends on per-query corpus diversity, and I am not claiming otherwise.

Live run against real Mongo, unmutated: **22 hits across 3 queries, 0 mismatched pairs, 0
unresolvable turns, 0 mismatched joins.** That zero now means something.

## How to verify

- `pnpm --filter @lkb/web test` → **46 pass, 0 fail**
- drop `trimmed === ""` from `AskPage.tsx:52` → **45/46**, the ISS-202 test fails; restore → 46/46
- `npx tsx --env-file=.env qa/evidence/live-rank-probe-2026-09-08.mjs` → three lines, all zeros
  **(superseded — ISS-213: that dated artifact is restored and void; the instrument now lives at
  `qa/probes/rank-probe.mjs`. See `qa/manifests/rank-probe-relocation.md`.)**
- `node scripts/lib/mutate.mjs assert-clean` → none outstanding

## Live browser evidence

**SKIP — instrument unavailable.** The Playwright MCP profile
(`ms-playwright-mcp/mcp-chrome-dde8b72`) is locked by a browser instance left running by an earlier
checker subagent; `browser_navigate` and even `browser_close` both return *"Browser is already in
use"*. 44 Chrome processes are alive on this machine and I will not kill them unilaterally — some
are likely the user's own.

**A SKIP is a stated gap, never a pass** (D-024), so this unit should not PASS on my say-so for that
criterion. Two things for the checker to weigh, and I am deliberately not deciding either myself:

1. **Its own Mode D run may well succeed** — a fresh subagent has previously driven this browser
   fine, and the lock may clear.
2. **The trigger here is arguably over-broad.** The only matching path is
   `apps/web/src/pages/AskPage.test.tsx` — a **test file**. No runtime surface changed, and no
   shipped behaviour differs. But D-024 says a project may NARROW `qa/ui-surfaces.json` and never
   reason around it ad hoc, so I am recording the SKIP rather than self-exempting. Whether test
   files should be excluded from the pattern is a config question that belongs to the checker or the
   Approver.

## Status: checked-PASS

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
