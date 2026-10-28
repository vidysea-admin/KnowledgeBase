# Manifest — loop-safety-mutation-guard

**Contract:** qa/contracts/structure-lint.md (closest existing — repo-integrity gates). **No
contract covers mutation-testing safety.** Contracts are checker-owned; please judge whether this
warrants a new one and author it if so.
**Goal task:** none (D-014, plan "MAKE THE MAKER-CHECKER LOOP WORK PROPERLY")
**Date:** 2026-09-08
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** none filed — this closes a control gap found by incident, not by a ledger row.

## Why

On 2026-09-08 the ISS-083 mutation (`score: 0.5`) was found applied to **production source**
(`apps/api/src/search-store.ts`) *after* its checker had verified the restore as byte-identical
with a clean `git status`. `git log --all -S` confirms no commit ever captured it — it stayed out
of history **by timing, not by a control**. A read-only audit confirmed the gap is total: no hook,
no lint gate, no commit guard, and no CI check would have caught it. The corrective rule existed
only as an unfolded note in `qa/feedback-inbox.md`.

## What changed

1. **`scripts/lib/mutate.mjs`** (new) — `apply` / `restore` / `assert-clean` / `list`. The design
   is one precondition: **a file must be `committed` (bytes identical to HEAD) before it may be
   mutated.** That buys two guarantees at once — restore becomes authoritative (`git checkout --`
   against known-good HEAD), and it **cannot clobber the concurrent session** sharing this tree,
   because a file they are mid-edit on reads `modified` and `apply` refuses it.
2. **Reuses `scripts/lib/evidence.mjs` (`trustOf`) — adds no git logic.** That helper already
   implements `git diff --quiet HEAD -- <path>` and is tested; it was wired only to
   `catalogue-score.mjs`. The gap was **wiring, not capability.**
3. **`.claude/hooks/mc-precommit.ps1`** — one narrow `deny` while `qa/.mutations-active` is
   non-empty. Previously WARN-only (always `exit 0`). Authorized by **D-014**; denying is safe
   where allowing is not — `allow` would skip the human prompt, `deny` only adds a stop.
4. **`scripts/lib/mutate.test.mjs`** (new, 5 tests) + wired into `test:lint`.
5. **`docs/DECISIONS.md` D-014** — supersedes D-013, restating it with **one** rule corrected.

## The correction to D-013 (the reason this is not a rubber-stamp)

D-013 capped a seam at 2 PASSes. Measured: **ISS-078, the cross-tenant read disclosure, was found
at round 5 after FOUR consecutive PASSes.** A count-based cap would have closed the seam two rounds
early and shipped it. D-014 replaces it with a class-based cap: security-class findings (tenancy,
auth, cross-tenant read, data write) are **never** capped; everything else caps at 2.

Also corrected: D-013 blames `checker/SKILL.md:127` for requiring issues on every check. That line
is the output field `ISSUES-WRITTEN: <ISS-ids | none>` — it explicitly permits `none`. The real
cause of 84 self-generated issues was the maker's own dispatch prompts saying *"then try to find a
fifth/eighth bypass."*

## Evidence

| check | result |
|---|---|
| `node --test scripts/lib/mutate.test.mjs` | **5/5 pass** |
| `pnpm lint:structure` | clean — lint-loc 245 files, dirsize 75 dirs, dupes 255 exports, SNAPSHOT fresh, tracker-audit G1 OK, **depcruise 0 violations / 267 modules** |
| `pnpm -r typecheck` | exit 0 |
| `pnpm --filter @lkb/api test` | 109/109, 0 fail |

**The incident, reproduced end-to-end on the file it happened to:** armed
`apps/api/src/search-store.ts` → applied the real `score: 0.5` mutation → `assert-clean` **exit 1**
(`1 armed, 1 still differ from HEAD`) → `restore` → `RESTORED … verified identical to HEAD` →
`assert-clean` exit 0 → `grep` confirms `score: hit.score,` back.

**Hook deny, proven live:** with a mutation armed, the hook emits
`{"permissionDecision":"deny", …"BLOCKED: a mutation is still armed"}`; after restore it emits
nothing. Re-verified after the file move.

**Two failures I hit and fixed, both caught by the tests rather than by me:**
- `apply` crashed when `qa/` did not exist (`writeLedger` never `mkdir`ed). Fixed in the source.
- Test (d)'s byte-for-byte assertion failed on Windows CRLF. Pinned `core.autocrlf=false` in the
  test sandbox rather than weakening the assertion — `trustOf` was right all along, git normalizes.

**`lint-dirsize` genuinely failed** at 32 files vs a 30 budget, so both files moved to
`scripts/lib/` (beside `evidence.mjs`); all callers repointed and re-verified.

## What this does NOT do

- It does **not** stop two loops interleaving *inside* one unit — `qa/gates/concurrent-maker-sessions.md`
  is still open, and Umesh's ruling is that both loops run and coordinate via commits.
- It does **not** enforce use. A maker that mutates a file without calling `apply` is unguarded;
  the guard only binds once armed. Making it unconditional would need a tree-wide clean assertion
  at close-out, which is noisy while a second session is legitimately dirty.
- `qa/.mutations-active` is not gitignored — deliberate, so an abandoned arm is visible.

## How to verify (checker)

1. Reproduce the incident yourself: arm a committed file, mutate it, confirm `assert-clean` exits 1
   and the hook denies; restore; confirm exit 0 and `git diff` empty. **Do not trust the table.**
2. **Try to defeat the guard.** Specifically: can you clear `qa/.mutations-active` by hand and
   commit a mutated file? (Test (c) says yes — the ledger is bookkeeping, not the safety property.)
   Is that acceptable, or does the deny need to be tree-wide? That is the judgment I want.
3. Confirm `apply` refuses a file another session has dirty — the concurrency claim.
4. `pnpm test:lint`, `pnpm lint:structure`, `pnpm -r typecheck`, `pnpm --filter @lkb/api test`.
   **Note:** two `catalogue-cli.test.mjs` cases assert a clean tree and fail while this unit is
   uncommitted. Confirm they pass once committed, and that they were already failing beforehand
   (`.goal/goal.json`, `docs/PROGRESS.md` were dirty from another session at tick start).
5. Judge D-014's class-based cap against the history in `qa/verdicts/search-store-injectable-handle.md`.
6. `ISSUES-WRITTEN: none` is a complete check here if you find nothing. Do not hunt a bypass to
   justify the check — that habit is precisely what D-014 exists to stop.

## Risk / rollback

New script + tests (additive); one deny branch in a hook that previously never denied; one
append-only DECISIONS entry. No product code touched — `apps/`, `packages/` unchanged.
Reversible by `git revert`, except D-014 which is append-only by protocol and would need a
superseding entry.

**Status: checked-PASS** — PASS from `qa/verdicts/loop-safety-mutation-guard.md` (Cycle checked: 1,
matching Fix cycle 1), committed `782234d`. 8/8 criteria, 4/4 invariants.

**Two corrections the checker made to this manifest, both accepted:**

1. **My stated reason for the `catalogue-cli` failures was wrong.** I claimed `docs/PROGRESS.md`
   was left dirty by the other session. The checker found it **clean** before it ran anything: the
   whole diff is one banner line (`EDITED SINCE COMMIT — .goal/catalogue.json…`) baked into the
   *tracked* file by commit `fbbafc0`, two commits before this unit. Right conclusion (not this
   unit's fault), wrong route. My instruction to "confirm they pass once committed" is **falsified**
   — it is committed and they still fail. Belongs to the session that made `fbbafc0`.
2. **I mis-located my own weak spot.** I offered test (c) — "the ledger can be cleared by hand" — as
   the guard's hole. The checker points out that models *deliberate evasion*, which no local hook
   survives anyway (`--no-verify`, or a human typing git). The 2026-09-08 incident was **forgetting,
   not evasion**, and against forgetting the ledger fails closed. It also notes I undersold the
   design: the safety property is the **`apply` precondition** (HEAD-identity at arm time), not the
   ledger — that is what makes `git checkout --` authoritative and structurally deletes the
   "restore reported success but didn't hold" failure. It survives the ledger being deleted, and is
   now recorded as **[I1]** in the new contract.

**On the tree-wide question I asked it to attack:** it agreed with narrow, and gave the reason I
had not — a tree-wide assertion would refuse ~100% of commits while a second session is
legitimately dirty, so it would be switched off; and tree-dirtiness is not mutation. Recorded as
**[I3]**, CRITICAL to reverse. Its better alternative is **per-unit close-out (C7)**: the checker
asserts the files *it* armed match HEAD — procedure, not code.

**It authored `qa/contracts/loop-safety.md`** (C1–C8, I1–I4) derived wholly from D-014, so no fresh
START gate is needed — flagged in that file for Umesh to ratify.

**ISS-086 (high) — a real miss of mine, fixed this tick.** D-014's `Result` field says
`.claude/CLAUDE.md`'s round-cap paragraph is replaced. **I never made that edit.** DECISIONS is
history; CLAUDE.md is what each tick obeys — so the rule actually in force remained the count-based
cap that D-014 itself measures as having closed the search seam two rounds before ISS-078 was
found. Writing a decision and not applying it is worse than not deciding, because the decision log
then reads as though it were done. Both passages are now corrected in place (the cap is
class-based; the `checker/SKILL.md:127` misreading is retracted inline).

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
