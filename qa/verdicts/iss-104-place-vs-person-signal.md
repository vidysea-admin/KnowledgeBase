# Verdict — iss-104-place-vs-person-signal

**Cycle checked:** 0
**Date:** 2026-09-28
**Checker:** fresh Claude subagent (Mode A unit check), bound root `D:/KnowledgeBase`, worktree
`D:/KnowledgeBase/.claude/worktrees/agent-a0d1591a24bce109e`, HEAD `65fd4ad`, base `d220acb`.

## VERDICT: PASS

## SCOREBOARD: 2/2 contract criteria evidenced ([C2b], [C12] — no new criterion, no criterion
changed), 0/0 new invariants (none added). Unit-specific claims: 2/2 issues addressed honestly
scoped (ISS-104 partial, ISS-SPKDATA-001 confirmed); 3/3 capability rows reproduced; 3/3 controls
held.

## FAILURES:
- none at >80% confidence against this unit's own claims or the contract. One finding filed to the
  ledger as a note for a future cycle (see ISSUES-WRITTEN) — it does not fail this unit; see
  EXPLANATION.

## CAPABILITY-COVERAGE: 3/3 rows reproduced, 3/3 CONTROL rows confirmed clean

Re-verified in three separate throwaway copies of the worktree (outside the bound root, never
edited in place in the bound tree). Each copy confirmed GREEN on the single named test file
(`speaker-name-rules.test.ts`, 106/106) before its mutation, matching the manifest's claimed
methodology.

| # | Falsifying edit (single-hunk, single-file, as the manifest claims) | GREEN-before (copy) | RED-after (copy) | Correct assertion fired? |
|---|---|---|---|---|
| 1 | `citesNameAsAnIntroduction`: `const place = readsAsAPlaceOrOrg(...)` → `const place = false && readsAsAPlaceOrOrg(...)` | 106/106 | 102/106, 4 fail: `India`, `Mumbai`-`from`, `Bangalore` place-signal rows + the cost row | Yes — exactly the 4 rows the manifest names |
| 2 | `hasNamingCue`: `if (HERE_AT.test(rawAfter) && endsTheClause(...)) return true;` → `if (HERE_AT.test(rawAfter)) return true;` | 106/106 | 103/106, 3 fail: 2 here-deictic rows + the ISS-093/ISS-104 ledger row for `Google` | Yes — the ledger measurement itself moves, as claimed |
| 3 | `HANDOVER_MARKERS`: delete `"coming up next", ` | 106/106 | 104/106, 2 fail: the handover row + the ISS-093/ISS-104 ledger row for `Mumbai` | Yes |
| C1 | (row 1's mutation) | — | `ISS-098 recall` (10 rows): 0 among the 4 failures | Control holds |
| C2 | (row 2's mutation) | — | `here-idiom recall` (6 rows): 0 among the 3 failures | Control holds |
| C3 | (row 3's mutation) | — | `ISS-255` rows (3 present): 0 among the 2 failures | Control holds |

Each mutation left the module parsing/importing (only 2–4 of 106 tests failed each time, never a
cascade), so the assertion that fired is the one each check is named for, per the checker's rule.
No edit touched a fixture/config/CI file or more than one file — each was a single-hunk edit to
`speaker-name-rules.ts`, confirmed by reading the diff before applying it.

## LIVE-BROWSER: not-applicable (changed paths: `packages/index/src/pipeline/speaker-name-data.ts`,
`packages/index/src/pipeline/speaker-name-rules.ts`, `packages/index/src/pipeline/speaker-name-rules.test.ts`,
`qa/manifests/iss-104-place-vs-person-signal.md` — no route, view, component, API handler, CLI
surface or persisted document in the diff; confirmed by reading the full diff myself, not by
trusting the manifest's persona-walk skip line).

## ISSUES-WRITTEN: ISS-104CC-3 (medium, new) · ISS-104 (checker_note appended, status unchanged:
open) · ISS-SPKDATA-001 (open → fixed)

## EXECUTOR: claude-opus-5 subagent (maker build agent) (checker: claude-sonnet-subagent — self != executor)

## EXPLANATION:

**What I re-derived myself, independently of the manifest's test file and pasted numbers:**

1. **D-015 measurement (ISS-104's own 20 recorded reproductions).** I transcribed the 20 cases
   directly from `qa/issues.jsonl`'s ISS-104 row (not from the maker's test file) into my own
   throwaway script and ran it against `extractSpeakers` on both the base commit (`d220acb`,
   fresh `git worktree add --detach`, `pnpm install`) and this worktree. Got **17/20 → 19/20**,
   with the same single residue (`India`) — exact match to the manifest. ISS-104 correctly stays
   `open` in the ledger; the row is **not** claimed closed by this unit and I have not closed it.
   The maker's reasoning that `"This is India speaking on the panel."` is not separable from
   `"This is Rahul speaking on the panel."` by anything inside that one sentence holds up: no
   locative preposition governs "India" in that turn, so the place signal has nothing to read.
   The stated generalisation (a prior turn supplying the locative frame) is real — I confirmed
   `"Our students in India. India speaking on the panel."` is refused in this worktree.

2. **The false-positive direction.** The manifest's own 20-case corpus is not committed anywhere
   (only 4 rows + 3 escape examples are quoted verbatim), so I could not reproduce its 19/20 →
   16/20 figure byte-for-byte. I built an analogous 7-case corpus using the same construction the
   manifest itself names ("one shape": a locative-governed self-mention plus a weak affiliation
   cue for the same name elsewhere in the turn) across 6 different single-token names plus the
   pre-existing Asia/`over to` case, and measured BEFORE 19/20 → AFTER 13/20 — a 6/19 (~32%) cost
   in my corpus, not 3/20 (15%). Reading `readsAsAPlaceOrOrg`/`LOCATIVE_GOVERNORS`, the mechanism
   is genuinely candidate-independent (no per-name logic at all), so this generalises: the
   construction the manifest itself identifies as "the one case the signal genuinely cannot
   resolve" is refused **deterministically for any single-token name**, not just the 3 the
   manifest happened to test. I filed this as **ISS-104CC-3 (medium)** — it is a measurement-
   transparency finding (the headline "15%" is corpus-selection-dependent and could read as a
   small, evenly spread cost when the real behaviour is closer to 0%-outside/100%-inside the
   vulnerable construction), not a functional defect: the refusal direction is still the safe one
   under [C12], and D-052 ruling 2 explicitly authorized this trade-off. It does not fail this
   unit — the unit does not claim a specific bounded false-positive rate as a contract criterion,
   and the manifest is already honest that the residue's separability is "a real judgement call"
   for the checker. I judged the call: the mechanism is fine and safe, but the number reported for
   it is not reliable and a future cycle (or the Approver) should see the corrected framing.

3. **Capability coverage** — reproduced exactly as tabulated above, in copies made and mutated
   outside the bound tree; the bound worktree was verified `git status --porcelain` clean both
   before and after (I did briefly copy two of my own probe scripts into the worktree to run them
   with the right `tsx` loader context, then deleted them before finishing — no bound-tree file
   was edited, and `git status` was re-confirmed clean afterward).

4. **Diff scope.** Read `git diff d220acb...HEAD` in full: exactly the 4 files the manifest names
   (`speaker-name-data.ts`, `speaker-name-rules.ts`, `speaker-name-rules.test.ts`, the manifest
   itself). The one function-signature change (`hasNamingCue` gained a 4th parameter) is a
   modification, not a removal — all call sites are updated in the same diff. No place, country,
   city or company name appears in any shipped **executable** data — `LOCATIVE_GOVERNORS` is pure
   prepositions and `NEVER_A_PERSON` is untouched; every place-name string in the diff is inside a
   doc comment or the test fixture file, matching D-052 ruling 2's explicit rejection of a
   gazetteer. The `ISS_093_GAZETTEER` shrink from `{India, Mumbai, Google}` to `{India}` is a
   **legitimate** consequence of the fix, confirmed independently in (1) above (Mumbai and Google
   really are now refused) — not a weakened test.

5. **Mutation safety.** `scripts/lib/mutate.mjs` requires a file to be byte-identical to HEAD
   before it may be mutated and restores via `git checkout --`, which is a per-mutation guarantee
   by construction (no run-scoped backup, no `trap` at all) — matches D-020 as amended by
   D-050-SPEAKER ruling 3. `node scripts/lib/mutate.mjs assert-clean` reports `MUTATIONS CLEAN:
   none outstanding` in the bound worktree. My own capability-coverage reproductions used
   disposable copies outside the bound root specifically so no restore mechanism was needed there
   at all.

6. **Re-run verify commands myself, full output (not through a pipe):**
   - `node --test --import tsx "src/**/*.test.ts"` — BEFORE (base) 285/285, AFTER (worktree)
     304/304, exit 0.
   - `npx tsc --noEmit -p tsconfig.json` — exit 0, no output.
   - `node scripts/lib/audit-closed-class.mjs` — 409 words (SET A 299 + SET B 110), LIVE BYPASSES
     0/409, unchanged before/after.
   - `node scripts/lint-loc.mjs` — same 5 violations before and after
     (`speakers-llm.ts:313`, `sb_join.py:437`, `obs-windows.ts:359`, `dispatch-state.test.mjs:332`,
     `run-watch.mjs:572`), none in the three changed files. Confirmed the three files' own
     `countLoc` (the project's own counting function, not `wc -l`): 271/300, 119/300, 392/400 —
     exact match to the manifest's table.
   - `node scripts/lint-dupes.mjs` — OK, 456 unique exports.
   - `lint-dirsize` and `snapshot.mjs --check` failures are pre-existing (reproduced on the base
     commit independently) and not chargeable to this unit, confirming the manifest's claim.

7. **ISS-SPKDATA-001.** Re-derived the comment-aware `NEVER_A_PERSON` count myself with an
   independent extractor (strip block comments, then line comments, then count quoted strings):
   **422 raw / 421 unique**, duplicate `everyone` — exact match. Cross-checked
   `closed-class-audit-words.json`: `words.length` 409 (SET A 299 + SET B 110),
   `excludedCollectiveAddress.words.length` 12; `421 − 12 = 409` holds. `NEVER_A_PERSON` was not
   touched by this unit's diff. Flipped the row **open → fixed** in `qa/issues.spkdata.jsonl` (the
   maker did not touch it, per its own manifest).

**Why this is a PASS despite ISS-104 staying open:** the unit's own claim is a **partial, honestly
disclosed fix of a critical row**, not a close, and every number and mechanism behind that claim
reproduced exactly under independent re-derivation. The one place my own measurement diverged from
the manifest's (the false-positive cost) is a reporting-transparency gap, not a defect in the code
or a false claim about what the code does — filed to the ledger rather than failed, per the
checker's rule that only findings defensible at >80% confidence go under FAILURES, and this one is
a note about how a true number is framed, not a wrong result.
