# Manifest — empty-manual-verdict-refusal

**Contract:** qa/contracts/ingest-indexing-pipeline.md (catalogue-progress-score honesty
invariants — not itself a contract-tracked feature, but this is the same "manual may only
lower, never bypass" rule ISS-031 established)
**Goal task:** none (ledger-driven unit)
**Date:** 2026-09-07
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** ISS-036

## Why

ISS-036 (filed by the checker): `scoreCatalogue` tested `f.manual?.verdict` for **truthiness**
before running the manual-verdict vocabulary check. `manual: { verdict: "" }` is present but
falsy, so the whole branch — including the check that rejects any value outside
`{MISSING,STUB,PARTIAL,REAL}` — was skipped entirely. Contract invariant I3 says an out-of-
vocabulary `manual.verdict` must be refused; an empty string is out of vocabulary and was not
refused. The checker filed it `low` (not a cycle-2 failure) because the blast radius is bounded:
removing a downgrade this way only restores the machine verdict, which can never exceed the
machine-derived percentage the doc already prints — but it is still a silent bypass of a stated
invariant, and the fix direction was already handed to the maker verbatim.

## What changed

**`scripts/lib/catalogue.mjs`, `scoreCatalogue`**: changed the guard from
`if (f.manual?.verdict)` (truthy value) to `if (f.manual && "verdict" in f.manual)` (key
presence). Once inside the branch, the existing vocabulary check
(`if (!VERDICTS.includes(m))`) already handles `""` correctly — an empty string is not a member
of `VERDICTS`, so it now hits the same `upgrades.push(...)` refusal path as any other bad value
(e.g. `"EXCELLENT"` from ISS-031), which `catalogue-score.mjs` turns into a hard `exit 2` refusal
naming the offending feature id. No other branch needed to change — this was a one-line guard
fix, not a new code path.

**`scripts/catalogue.test.mjs`**: one new test — a catalogue with
`manual: { verdict: "", reason: "cleared" }` must score `MISSING` (not silently accept the
empty string as valid) and must appear in `s.upgrades` with the same `/not one of/` message the
existing ISS-031 regression test already asserts for `"EXCELLENT"`.

## Evidence

Full suite green after the fix (22/22, `node --test scripts/catalogue.test.mjs`).

**Mutation-tested with proof of application**:
1. Backed up `scripts/lib/catalogue.mjs`, reverted the guard back to `if (f.manual?.verdict)`
   (confirmed via `grep` the line actually changed).
2. Re-ran the suite: the new ISS-036 test reddened in isolation —
   `AssertionError: an empty string must be refused with the same message as any other bad value`
   (`actual: undefined` — the empty-string case fell straight through to `final = auto.verdict`
   with nothing pushed to `upgrades`, exactly the bypass ISS-036 described). No other test was
   affected.
3. Restored the real fix from the backup, re-ran: 22/22 green again.

`node scripts/catalogue-score.mjs` re-run after the fix: `docs/PROGRESS.md` unchanged (20.2%
adjusted / 28.9% machine-derived, 57 features) — the real `.goal/catalogue.json` has no
empty-string manual verdicts today, so this only changes the failure-mode behavior ISS-036
named, not today's happy path.

`pnpm lint:structure` clean (218 files in LOC budget, 74 dirs in size budget, 15 root files, no
dupes, migrations OK, SNAPSHOT fresh, 0 dependency-cruiser violations).

## How to verify (checker)

1. Read `scripts/lib/catalogue.mjs`'s `scoreCatalogue` — confirm the guard is
   `f.manual && "verdict" in f.manual`, not a truthiness test.
2. Run `node --test scripts/catalogue.test.mjs` — 22/22 green, including the new ISS-036 test.
3. Reproduce the mutation yourself: revert the guard to `f.manual?.verdict`, re-run, confirm
   exactly the ISS-036 test reddens, then restore and confirm 22/22 green again.
4. Confirm `node scripts/catalogue-score.mjs` produces no diff to `docs/PROGRESS.md`.
5. Ledger: ISS-036 should move to `fixed` with `fixed_date` set, citing this manifest.

## Risk / rollback

Pure code change, one-line guard, reversible by `git revert`. No production data touched.

**Status: checked-PASS**

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
