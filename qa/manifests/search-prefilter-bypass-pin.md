# Manifest — search-prefilter-bypass-pin

**Contract:** qa/contracts/search-route.md (invariant **[I6]**, the superset property)
**Goal task:** none (ledger-driven)
**Date:** 2026-09-08
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** **ISS-074** (medium, the bypass class), **ISS-075** (low, the
self-contradicting comment). ISS-073 remains open by design.

## Why

The `search-prefilter-coverage` checker PASSed the unit and then asked a question I had not:
is ISS-072 *closed*, or *displaced*? It deleted the delegation in `search-store.ts`, hand-rolled
a defective filter inline, and got **typecheck exit 0, 96/96, 59/59 — nothing reddened.**

That is correct and it is a fair hit. My extraction closed the **derivation** class (change how
`buildTurnPrefilter` derives tokens → tests fail) but left the **bypass** class wide open (stop
calling it at all → silence). I had *moved* the untested boundary, not removed it. The fix
direction was written in ISS-072's own `fix_direction` — the source-assertion pattern this repo
already runs twice — and I did not take it. That is the actual lesson: the remedy was already on
the page.

This is now the third instance this session of the same underlying mistake, and the progression is
worth naming honestly: ISS-069 (tested nothing), ISS-072 (tested the primitive, not its
consumption), ISS-074 (tested the consumption, not the bypass of it). Each fix was correct and
each left the next layer open, because each time I verified the thing I had just built rather than
asking what an editor could still do to break it.

## What changed

1. **`apps/api/src/search-prefilter-single-source.test.ts`** (new, 3 tests) — the source-text
   regression pin, deliberately modelled on the existing
   `tree-index-root-filter-single-source.test.ts` rather than invented: same rationale (the store
   calls `turnsColl()` with no injectable handle, so it cannot be pinned by real behaviour without
   live Mongo), same narrow framing, same honesty about what it does not prove. It pins three
   distinct bypass routes:
   - the delegation import exists and `buildTurnPrefilter(` is called **exactly once** (0 = bypassed);
   - the file contains **no `$regex` and no `$or:`** — the literal inline-filter attack;
   - the file does **not call `lexicalQueryTokens`** — the subtler bypass, which *looks* correct
     because it is the scorer's own tokenizer while stepping around the one function whose tests
     enforce the superset property.
2. **`apps/api/src/search-prefilter.ts`** — ISS-075. `escapeRegex`'s comment claimed unescaped
   tokens were "a correctness and a denial-of-service surface" while the test file proved the
   opposite; the shipped module contradicted itself. Rewritten to say plainly that it is
   **currently-unreachable defence-in-depth**, why it stays anyway (the guarantee belongs to the
   tokenizer, and preserving punctuation — e.g. keeping "c++" as one token — is a plausible future
   change that would make it live with no other warning), and that the unreachability was verified
   by brute-forcing codepoints 0x0000–0x2FFF.

No production behaviour changed: one comment and one new test file.

## Evidence

**The decisive replay — the checker's own bypass attack.** Deleted the delegation and hand-rolled
the defective inline filter it used:

| | before this unit | after this unit |
|---|---|---|
| full `@lkb/api` suite | **96/96, 0 fail** (bypass invisible) | **97 pass / 2 fail of 99** |

Restored → 99/99. I also ran a **second, different** bypass the checker did not: re-deriving
tokens via `lexicalQueryTokens` directly in the store. The first two tests correctly stayed green
(the delegation is still present and no inline filter exists) and **only the third fired** —
confirming the three tests discriminate between the three routes rather than all tripping on any
edit. Restored → 3/3.

`pnpm --filter @lkb/api test` — **99/99** (96 pre-existing + 3 new).
`pnpm --filter @lkb/index test` — 59/59, untouched.
`pnpm -r typecheck` — exit 0. `pnpm lint:structure` — clean, 0 dependency violations / 263 modules.

**Live parity re-verified against production Mongo** (read-only, script deleted): identical
turnIds and scores across all 6 queries; `RESULT PARITY ACROSS ALL QUERIES: YES`. Latency this
run 957ms — see below.

**On latency I am now declining to quote a headline figure at all.** Four independent
measurements of the same change exist: ~30% (mine, sequential blocks), ~17% and ~9.8% (two
checkers, interleaved), and this run at 957ms against a 1422ms baseline. The direction is
consistent and the mechanism is understood and measured (transfer 1064ms vs compute 38ms); the
magnitude is dominated by network variance to a remote host and is **not a stable constant**.
Quoting any single number as *the* improvement would be false precision.

## What this deliberately does not do

- **ISS-073 stays open.** The Unicode case-folding bound (U+0130/U+212A), 0 occurrences in 2118
  turns, needs Mongo-side collation. The checker agreed with deferring but added a caveat I am
  recording rather than acting on: *"0 occurrences is a snapshot and nothing watches the
  transition"* — the proportionate strengthening is **monitoring the count**, not fixing the hole.
  That is a real follow-on unit; it is not this one, and inventing it now would be scope creep.
- **This does not make `createMongoSearchDeps` behaviourally tested.** A source pin is weaker than
  exercising the real query, and I am not claiming otherwise. It closes the specific regression
  class ISS-074 names. The honest general answer is an injectable collection handle (the shape
  `indexSession` already gained for ISS-056), which is a larger refactor.

## How to verify (checker)

1. Read `search-prefilter-single-source.test.ts` — confirm it follows the existing
   `tree-index-root-filter-single-source.test.ts` pattern and that its framing does not overclaim.
2. **Replay both bypasses yourself.** (a) Delete the delegation in `search-store.ts` and inline an
   `$or`/`$regex` filter → expect the full `@lkb/api` suite to fail (97/99), not just an isolated
   file. (b) Add a `lexicalQueryTokens(` call to `search-store.ts` → expect **only** the third
   test to fail, proving the three tests discriminate. Confirm each mutation genuinely changed the
   file via a backup `diff`; restore and confirm 99/99.
3. Try to find a **fourth** bypass these three tests miss. That is the question I got wrong twice
   in a row, so it is the one most worth asking again rather than taking my word that the class is
   now closed.
4. Run `pnpm -r typecheck`, `pnpm --filter @lkb/index test` (59/59), `pnpm lint:structure`, and
   reproduce live parity yourself.
5. Judge ISS-075's fix: is the rewritten `escapeRegex` comment accurate now, and is keeping
   currently-dead defence-in-depth the right call versus deleting it?

## Risk / rollback

One comment and one test file; zero production behaviour change; read-only against the database.
Reversible by `git revert`.

**Status: checked-PASS** — PASS from `qa/verdicts/search-prefilter-bypass-pin.md` (Cycle checked: 1, matching Fix cycle 1), committed `b1fd6b9`. Closed out on the 2026-09-08 reconcile tick.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
