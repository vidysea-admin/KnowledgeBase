# HUMAN_GATE — `ISS-360` is two different issues in one file, with opposite statuses

**Raised:** 2026-09-28 · by the maker, during the `iss-104-place-vs-person-signal` close-out
**Status:** ANSWERED — 2026-09-28, ruling 2 of D-055 (Approved-by: Umesh); see "Answered" at the end of this file.
**Found by:** a post-merge ledger integrity check, not by a sweep.

## The finding

`qa/issues.jsonl` contains **two rows both carrying `id: ISS-360`**, at lines 358 and 359. They are
not duplicates of one row — they are **two unrelated issues**:

| line | `canonical_id` | title (abridged) | `status` | `feature` |
|---|---|---|---|---|
| 358 | `ISS-360-OBSFLAKE` | `obs-windows` launch() bring-up-diagnostics test is load-flaky under `pnpm -r test` | **open** | `meeting-bot-capture` |
| 359 | `ISS-360-HEARTBEAT` | u4b's 5 new pure heartbeat functions have no committed regression coverage | **fixed** | `u4b-watch-heartbeat-alert` |

Every substantive field differs: `title`, `evidence`, `found_by`, `fix_direction`, `feature`,
`links`, `reproductions`, `regression_check`, `notes`, `fixed_date` — and, decisively, **`status`**.

**This predates the `iss-104` merge.** Verified: `git show eb3c60b:qa/issues.jsonl` already has
2 rows, and `HEAD` still has 2. The merge auto-merged that file but changed only the ISS-104
`checker_note`. Stated explicitly because the merge is the obvious suspect and is innocent.

## Why it matters, rather than being cosmetic

**D-015 requires a fix to be measured against its issue's own recorded reproductions, and that rule
is only as strong as the id resolving to the right row.** `ISS-360` currently resolves to two rows
whose `status` values are `open` and `fixed`. So:

- Any open-issue count is ambiguous by one, in a direction that depends on which row the reader hits
  first. The session-start hook reports a single number.
- A future unit citing "ISS-360" in a manifest, verdict or commit message is ambiguous **forever** —
  which is precisely the harm D-019 names: *"An audit trail whose references silently repoint is
  worse than an incomplete one, because it still looks correct."*
- `ISS-360-HEARTBEAT` is already marked `fixed` with a `fixed_date`, so a reader could reasonably
  conclude the **obs-windows load flake** is fixed. It is not; it is `open`.

**Someone already noticed and worked around it.** The distinct `canonical_id` fields are not an
accident — they are a papering-over that preserves the collision instead of resolving it. That
workaround is why this survived into a third day without being surfaced.

This is the D-019 collision class recurring **inside the main tree's own file**, not across lanes.
D-019 fixed shard-vs-shard id allocation and said nothing about two writers to `qa/issues.jsonl`.

## Why the maker is not fixing it

1. **The maker is not the ledger's writer** — `/checker` is the single writer of `qa/issues.jsonl`.
2. **D-019 forbids renumbering on merge** for lane ids, on the reasoning that ids other artefacts
   cite must stay permanent. These two are main-tree ids, so D-019 does not literally govern them —
   but the same permanence argument applies, and deciding whether it does is not the maker's call.
3. Any resolution changes what an already-committed manifest/verdict/commit citation means. That is
   an Approver decision, not a build unit.

## Options, for the Approver

1. **Promote the `canonical_id`s to real `id`s** (`ISS-360-OBSFLAKE`, `ISS-360-HEARTBEAT`) and
   retire the bare `ISS-360`. Honest and self-documenting; breaks any existing bare-`ISS-360`
   citation, which must then be swept for and annotated rather than silently rewritten.
2. **Leave both rows, add a `disambiguates:` field** and make every reader (hook, sweep, tracker
   audit) fail loudly on a duplicate id instead of silently taking the first. Preserves all
   citations; leaves the ambiguity in the data and moves the fix into every reader.
3. **Renumber the later row** to the next free id. Cheapest in the data, and the option D-019's
   reasoning most directly argues against.
4. **Add a duplicate-id guard and decide nothing else yet** — stop the class recurring, defer the
   repair. This one is compatible with all three above.

## What is NOT in question

- Neither row's content is disputed; both are real findings.
- The `iss-104-place-vs-person-signal` unit is unaffected and PASSed on its own evidence.
- No renumbering, merging or deletion has been done. The file is byte-unchanged by this gate.

## Answered

**Answered:** 2026-09-28 - D-055 ruling 2 (Approved-by: Umesh): the duplicate `ISS-360` is resolved by promoting each row's existing `canonical_id` to a real, distinct id - `ISS-360-OBSFLAKE` (open) and `ISS-360-HEARTBEAT` (fixed). Recorded by the /checker ledger-bookkeeping pass on 2026-10-10 from docs/DECISIONS.md; the ledger now carries no bare `ISS-360` row.

**Gate status:** ANSWERED - recorded inline: 2026-09-28 - D-055 ruling 2 - Umesh (Approver)
