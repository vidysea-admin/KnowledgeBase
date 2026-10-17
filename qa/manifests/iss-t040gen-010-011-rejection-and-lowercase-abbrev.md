# iss-t040gen-010-011-rejection-and-lowercase-abbrev

**Handshake status:** checked-PASS
Fix cycle: 1
Tier: 4 (open medium issues ISS-T040GEN-010, ISS-T040GEN-011; the unit touches the data-write quote gate, so full ceremony). Lane: lane/t040reject (base e4d6f14). Qualified ids: ISS-T040GEN-010 and ISS-T040GEN-011 (ledger `qa/issues.t040gen.jsonl`, not edited here; the checker verifies and closes).
Scope: `packages/index/src/pipeline/notes/sentence-span.ts` + `grounded-notes.test.ts`. The `dropUnverified` option stays OFF by default and is not wired anywhere new.

## ISS-T040GEN-010 (unlisted lower-case abbreviation before a capital word)
No English dictionary exists in node_modules (searched for word-list/dictionary/stopword/spell packages: none; no /usr/share/dict). Rule: a "." after a lower-case token of <= 4 letters (not a plain number) that is followed by a capitalised word does NOT break when the sentence so far (from the last real break) contains a negation/qualifier marker (`MARKER`). With no marker on the left a wrong break cannot hide a negation, so it stays a break. Reason for the marker condition: the unconditional version cost 32 points of sentence recall (71.9% -> 39.8%); the marker-conditional one costs 11.4. Longer lower-case words (>= 5 letters) still break.
Replay (verbatim checker cases): pvt. Colleges, univ. Colleges, mgmt. Quota, pg. Courses (+ asst. Dean, qtr. Fees): the tail quote now returns `starts-mid-sentence`, the whole sentence still ships.

## ISS-T040GEN-011 (statement followed by a rejection)
Rule, in `sentenceSpanProblem` when the quote ends a real sentence: the NEXT sentence of the turn (a) opening with a retraction cue or negator (ignore, scratch, wrong, incorrect, correction, I mean, sorry, actually, not, no, never, nope, nah, nahi, nahin, false, disregard, forget, retract, cancel, rather, oops, mistake, that is wrong/not/false, I disagree, take that back, bad idea, any `...n't`; also after a leading and/also/plus/then/so/because/which/or) of ANY length -> `retracted-by-reply`; or (b) <= N words and not an additive continuation -> `unconfirmed-by-short-reply`. A clause quote whose next clause opens with a cue is `retracted-by-reply` too. N = 5 (`SHORT_FOLLOW_WORDS`, overridable per call with `opts.shortFollowWords`).
Replay (verbatim checker cases): "Fees are 1000 rupees. Wrong." / "Ignore that." / "Not for freshers at this college though." (> 5 words) plus scratch that, I mean, sorry, actually, correction, not true, nahi, incorrect, I disagree, a 9-word "Wrong figure ..." : all dropped, also through the full `emitted` pipeline. "And/Also ..." and longer neutral follow-ups still ship.

## Evidence
- `node --test --import tsx src/pipeline/notes/grounded-notes.test.ts`: 28/28 (26 before + 2 new replay tests). All earlier replays (002, 006, 007, 008, 009) still pass unchanged except fixtures below. All `packages/index/src/pipeline` tests: 441/441. `tsc --noEmit -p packages/index`: exit 0. No LLM/Mongo/network.
- Fixtures changed because the new rules intentionally merge more (recall cost, never a wrong citation): "lakh. Fees" -> "rupees. Fees"; "I said no. Apply" -> "I said yes. Apply" (marker "no" on the left now merges); "recommend it. Apply" -> "recommend waiting. Apply"; "it's done. Colleges" -> "it's finished. Colleges"; "I don't know." -> "I don't remember."; "No. 5 is good." -> "No. 5 is excellent."; the 007b "Yes, apply early." / "Sure." / "Yes, absolutely." cases, which shipped before, now assert `unconfirmed-by-short-reply`; the 009 last case uses a long question. No assertion was deleted.
- Recall on data/toc-migrated (3427 turns; my own naive splitter, pieces of 12+ chars, the cycle-3 script was not kept; the HEAD baseline reproduces the maker's cycle-3 numbers exactly: 15157 / 33751, 71.9% / 60.5%):

| variant | sentence quotes | clause quotes |
|---|---|---|
| HEAD (cycle 3) | 10901/15157 = 71.9% | 20413/33751 = 60.5% |
| + 010 only | 9170 = 60.5% | 18238 = 54.0% |
| + 010 + cues (N=0) | 9098 = 60.0% | 18111 = 53.7% |
| + N=3 | 8739 = 57.7% | 17826 = 52.8% |
| + N=5 (chosen) | 8448 = 55.7% | 17575 = 52.1% |
| + N=8 | 7952 = 52.5% | 17120 = 50.7% |

  N=5 chosen: it matches MAX_REPLY_WORDS and the checker's "<= 5 words" class (cues carry the longer ones); N=3 saves 2 points but leaves 4-5-word rejections ("That is totally wrong.") shipping, N=8 costs 3 more. Cost of N=5 alone: 294+ (650 sentence refusals incl. interaction) of 15157; cues alone: 72 sentence quotes; 010 alone: 11.4 points sentence, 6.5 clause. Total cost vs HEAD: -16.2 points sentence, -8.4 clause.
- Mutations (harness in the worktree, per-mutation byte backup restored in `finally`, 120 s SIGKILL, restored hash == original after the run, harness deleted): A remove the 010 rule KILLED; B disable cue check KILLED; C disable short-follow rule KILLED (2); D drop the clause-cue branch KILLED; E drop conjunction-then-cue stripping KILLED; F make 010 unconditional (drop marker condition) KILLED (4); G empty CONTINUATION class KILLED (2). None survived.

## Honest limits
- Short-follow and cue sets are judgement parameters (N=5; the cue vocabulary is small and closed, matched only at the start of the next segment); a rejection phrased without a cue and longer than N words ("The correct number is 1200 rupees.") still ships the earlier statement. A genuine confirmation ("Yes, absolutely.") also drops: fail closed.
- 010 stays open for a lower-case <= 4-letter abbreviation whose left side holds no marker; there a wrong break cannot hide a negation (the marker is the safety property), but it can split a clause without one.
- apps/api suite not re-run (this unit changes only `sentence-span.ts`).

## Fix cycle 1 (responds to verdict cycle 0, FAIL: ISS-T040GEN-012; -010 and -011 stay open until the checker closes them)
Merged codex/machine-migration-2026-10-09 first (merge 9e0be9b8). Two conflicts, both mechanical: `sentence-span.ts` (main added `opts.judged` and split out `lexicalNegationProblem`; kept both, and `lexicalNegationProblem` now takes `opts.shortFollowWords` so the lane's N still applies), and `grounded-notes.test.ts` (main moved the whole cycle-1.. block to `grounded-notes-sentence-span.test.ts`; took main's file and re-applied the lane's 98-line test diff there with `git apply`, all 6 hunks clean).

**ISS-T040GEN-012 fix.** In `isBoundary`, the ISS-T040GEN-010 no-break rule now also fires when MARKER occurs between the dot and the next strong mark (`tailToStrongMark`, a plain forward scan; it deliberately does not call `isBoundary`/`sentenceEnd`, which would recurse through `sentenceStart`). The left fragment then ends mid-sentence and the merged whole sentence carries the marker, so `omits-qualifier` sees it.

**Evidence (D-015, counts by issue id, replaying the ledger row's own recorded cases parsed from `qa/issues.t040gen.jsonl` at test time, not a hand-copied corpus):**
- ISS-T040GEN-010: 1/1 refused (the row records one verbatim case; its "same for univ./mgmt./pg." variants are in the earlier cycle-0 replay test, still passing)
- ISS-T040GEN-011: 3/3 refused
- ISS-T040GEN-012: 2/2 refused (the row's third, "... pvt. Colleges only if you apply early.", is elided in the ledger; it is replayed in full, with univ./mgmt./pg./asst. variants, in the authored list: 7/7 refused, whole merged sentence still ships, no-marker control still breaks).
- `node --test --import tsx src/pipeline/notes/grounded-notes-sentence-span.test.ts`: 16/16 (2 new). All `packages/index` tests: 673 pass / 0 fail. Notes + judge tests 15 consecutive runs: 15/15. `tsc --noEmit -p packages/index` exit 0. `node scripts/lint-loc.mjs --all` exit 0. apps/api suite not run (it only reaches this code behind the off-by-default option). No LLM/Mongo/network/browser.
- Mutation (per-mutation byte backup, restored in finally, hash checked): remove the new `tailToStrongMark` clause -> 14/16, KILLED; restored hash == pre-run hash.
- Fixtures changed (each merges now, fail closed; same assertions): `fill fast` -> `fill quickly`; `Cost is 3.5 lakh.` -> `3.5 rupees.`; judge-rules `karo. Nahi.` -> `kijiye. Nahi.`. judge-rules replay constant 11 -> 4: the structural layer now refuses the abbreviation cases itself, so fewer ship under an always-same judge (per id: -011 3/3 still caught by the rules; -010 and -012 now 0 ship).
- Recall, same naive splitter, same corpus (3427 turns), measured by script this cycle (the HEAD baseline and cycle-0 figures reproduce exactly):

| variant | sentence quotes | clause quotes |
|---|---|---|
| base e4d6f14 (cycle 3) | 10901/15157 = 71.9% | 20413/33751 = 60.5% |
| cycle 0 (6f0e88a) | 8448 = 55.7% | 17575 = 52.1% |
| cycle 1 (this) | 7786 = 51.4% | 16562 = 49.1% |

  The -012 fix costs a further 4.3 points of sentence recall and 3.0 clause; total vs base -20.5 / -11.4. Cost cause: any sentence ending in a lower-case word of <= 4 letters followed by a sentence that contains a marker ("... fill fast. We do not ...") is now one merged sentence; indistinguishable from "pvt. Colleges do not" without a dictionary. Owner decision, not mine: whether this recall is acceptable with the option ON (it stays OFF by default).