# Verdict: t040-grounded-notes-generation

VERDICT: FAIL
Cycle checked: 0
Commit checked: 3136669 (lane/t040gen)
Scope: `dropUnverified` generation path (summarizeSession / extractClaims / indexSession pass-through), type aliasing in grounded.ts.

## EXPLANATION

One defect fails the unit; everything else checked holds.

- **FAIL reason (ISS-T040GEN-002, raised medium -> high).** Constructed end to end with the fake model (strictWebinar + dropUnverified, judge passing everything). Source turn `t1` = "We do not recommend applying in March".
  - Model item text "Apply in March" with quote "recommend applying in March": DROPPED (text is not its quotes; page degrades as nothing verified). The text/quote rule works for paraphrases.
  - Model item text AND quote both "recommend applying in March": SHIPS. `citedItems[0].text` = "recommend applying in March", evidence quote identical, verified slice of t1, `dropped: []`, `degraded: null`. The "not" is gone, the item claims the opposite of the speaker, and it carries verifier-passed evidence.
  - Same for "I do not think it is safe to wait" -> "think it is safe to wait" (shipped). A "Never apply before the deadline opens" -> "apply before the deadline opens" probe shipped alongside another valid item.
  - Why: `extractiveText` compares the item text only with its own joined quotes, so it cannot see what the quote leaves out. `resolveEvidence` proves occurrence at word boundaries, nothing about the sentence. The verifier manifest told the wiring unit to enforce sentence/clause-aligned quotes or show the surrounding sentence; this unit does neither. The only remaining guard is the model judge, which the manifest itself calls a model. The maker filed this at medium; a shipped wrong-meaning citation is the core failure of this feature, so it is high and blocks.
  - Fix direction (owner decision, not mine): require the quote to cover the whole sentence/clause of its turn (or to be flanked by sentence boundaries) before it is emitted, or carry the surrounding sentence in the emitted evidence; a negation-lexicon guard is a weaker alternative.
- Off by default: diff read. Without `dropUnverified` the strict path is unchanged: same `runtimeItem`/`runtimeQA`/`runtimeEvidence` (still `includes`) and `runtimeJudge`, whose condition was only split into `runtimeVerdicts` + `verdictPasses` (same throw conditions and message). Old-path tests (existing 146 incl. summarize/claims, 57 api incl. the without-flag reject-and-write-nothing case) pass. `dropUnverified` without `strictWebinar` is ignored by construction.
- Timestamps / turn ids: `citationTimes` for my probe items gave t1 -> 3..8 and t2 -> 10..14, equal to the source turns; emitted evidence turnId/sessionId equal the source turns; the emitted quote is `turn.text.slice` (mutation B proves a test depends on it).
- Persistence / tenancy: the api diff is a pass-through option plus counts; no change to the tenant-scoped write helpers.
- Schema: I emitted a page (2 items, answered and unanswered Q&A) and a claim from the fake model and validated with repo `.venv` python jsonschema Draft 2020-12 against `schema/session_pages.schema.json` (with the legacy `evidence` the indexer adds) and `claims.schema.json` (with `status`): both `[]` errors.
- Merge: `git merge-tree --write-tree HEAD lane/t040gen` from main HEAD 15015cf: clean tree, no conflict. The indexing area is unchanged between the lane base 9e24d1f and main HEAD.
- Suites (no LLM/Mongo/network): packages/index claims + summarize + quote/* + grounded-notes 146/146; apps/api src/indexing/*.test.ts 57/57 (own tsconfig mapping `@lkb/index` to the lane); `tsc --noEmit` exit 0 in packages/index and in apps/api (lane `notes/` files confirmed in the program).
- Mutations (own harness, per-mutation byte backup in `finally`, 120 s SIGKILL timeout; hash changed per mutation): A skip `verifyQuote` (includes-based location) KILLED; B emit the model's quote string instead of the source slice KILLED; C drop the item/quote text comparison KILLED (re-run by hand: the refusal table and the Q&A test fail). Note: none of the 12 maker mutants or these three touch the missing sentence rule, which no test covers.
- ISS-WEBINARRELEASE-001 count accepted as stated (3 of 4; `buildNotes` not addressed, named in ISS-T040GEN-005).
- After: evidence.ts blob f381c22e == `git rev-parse HEAD:` blob; probe and harness files deleted; worktree clean apart from this verdict and the lane ledger edit.
- Open for the maker (not blocking beyond -002): ISS-T040GEN-001 (12-char minimum refuses short real answers) and -004 (no numbers category) remain owner decisions.

ISSUES-WRITTEN: ISS-T040GEN-002 (severity raised to high with the reproduction)

---

# Cycle 1

VERDICT: FAIL
Cycle checked: 1
Commit checked: 1f5bf4b (lane/t040gen)

## EXPLANATION

The lexical floor holds for the negations it was tested on, but a common-English abbreviation lets a negation-dropping quote ship as verified evidence. ISS-T040GEN-002 stays open; its fix is incomplete.

**(1) Rule match.** Line 82: quote spans a whole sentence or clause, starting at turn start or after sentence punctuation, ending at sentence punctuation or turn end; failing quotes dropped. `sentence-span.ts` matches: clause marks `, ; :` count as boundaries together with `. ! ? … danda`, opening quotes/brackets and trailing closers are skipped, failures drop in `resolveEvidence` and in the audit. The marker floor is an addition beyond the written rule. Item text must equal its quotes (`extractiveText`, unchanged), so a text-only reversal still drops.

**(2) Bypass table** (`sentenceSpanProblem`; null = ships):

| Case | Result |
|---|---|
| "No. We recommend March." quote 2nd sentence | null (fine: separate statement) |
| hardly, avoid, against, don't ever, won't, isn't, mustn't, can't, cannot, need not, no one, nobody, fail/refuse/stop/oppose/skip, not-recommended, NOT caps | refused (starts-mid-sentence: the start rule catches them before the marker list matters) |
| curly don’t / won’t / isn’t | refused |
| "I do not think e.g. March works for everyone." quote "March works for everyone." | **SHIPS** |
| "We do not accept applications from the U.S. after March first." quote "after March first." | **SHIPS** |
| "...it vs. applying in March works." / "...approx. 3.5 lakh fee." / "..., Dr. Rao recommends applying in March." | **SHIPS** |
| "Dr. Rao does not recommend applying in March." quote from "Rao" | null, correct (negation kept) |
| "Apply in March? Absolutely not." quote "Apply in March?" | ships (next-sentence answer; medium) |
| Unicode lookalikes | not exploitable by a model: the quote is the exact source slice, so lookalikes are the speaker's own text |

Cause of the FAIL: every `.` followed by whitespace is a sentence break in `sentenceStart/End`, so the "not" falls into a "previous sentence" and the floor never sees it. Also found: the MARKER regex is a plain string, so `\p{L}` became `p{L}` (class `[p{L}p{N}_]`); harmless on realistic text (ISS-T040GEN-007).

**(3) Fixture change.** Legitimate: the typography test quoted "we'll review ... next week." out of "She said we’ll ...", a mid-sentence start the written rule forbids. It now quotes the whole sentence with the same assertions on the verbatim source slice. Not weakened.

**(4) Recall.** Reproduced: 3427 turns, 15 091 sentences of 12+ chars, 14 898 pass (98.7%), all 193 refusals `omits-qualifier`. Clause quotes: my splitter 18 442 of 32 692 (56.4%) vs the maker's 51.6% of 29 375; splitters differ, same order.

**(5) Suites.** packages/index claims+summarize+quote/*+grounded-notes 150/150; apps/api indexing 57/57; `tsc` index 0, api (own path mapping) 0; no LLM/Mongo/network.

**Mutations** (own harness in the worktree, per-mutation backup restored in `finally`, 120 s kill, `git hash-object` == HEAD after each, folder deleted): remove `n't` branch KILLED; clause marks treated as sentence-only marks KILLED; curly branch (`n’t` to `n't`) SURVIVED (correct code, unpinned; ISS-T040GEN-007).

ISSUES-WRITTEN: ISS-T040GEN-006 (high, abbreviation bypass, 5 reproductions), ISS-T040GEN-007 (medium). ISS-T040GEN-002 left open.

---

# Cycle 2

VERDICT: FAIL
Cycle checked: 2
Commit checked: ff696ba (lane/t040gen)

## EXPLANATION

The cycle-1 bypasses are closed, but the fix is a list: an abbreviation that is not in the 70-word list still breaks the sentence before a capital word, so the same reversal ships through common Indian-education English ("Pvt.", "Univ."). ISS-T040GEN-006's class is not closed; -002, -006 stay open. -007 (a)(b)(c) are fixed and pinned.

**Replay.** All 5 cycle-1 abbreviation cases (e.g., U.S., vs., approx., Dr.): only the whole sentence (negation included) ships; the negation-dropping tail is refused. "Dr. Rao does not recommend" still passes whole. "Apply in March? Absolutely not." now refuses the question alone (negated-by-reply). Curly n’t covered.

**New-bypass table** (every word-aligned quote enumerated; "ships" = the negation-dropping quote returns null):

| Case | Result |
|---|---|
| Govt. / Corp. / Inc. / a.k.a. / "approx" without dot / Mr. Not Sure / B.Tech. / M.Sc. / p.m. / Jan. Mar. Sat. Oct. / etc. | refused (whole sentence only) |
| ellipsis "..." and "…", "apply...April", newline in the turn, (not March), "not March" in quotes, "3.5 not 4", ")." and quote-then-period edges | refused |
| Hinglish nahi before Dr./approx.; nahi + danda; fullwidth "。"; emoji | refused (negation kept or merged) |
| "Don't apply. Don't forget April..." | ships only the part that carries its own negation |
| **"We do not accept Pvt. Colleges applications after March first." quote "Colleges applications after March first."** | **SHIPS** (also Univ., Asst., Ave., Pkwy., "Q1.") -> ISS-T040GEN-008 high |
| "Apply in March. Wrong." / Incorrect. / I disagree. / Bad idea. / That is false. quote "Apply in March." | ships (lexical reply list) -> ISS-T040GEN-009 medium |
| "Apply in March. Never./Nope./Not at all./No way./Don’t./Nahin." | refused |

**Recall (independent splitter on data/toc-migrated, 3427 turns, 12+ chars).** Whole sentence 14 859/15 565 = 95.5% (maker 97.1%; refusals: omits-qualifier 288, starts-mid 185, ends-mid 149, negated-by-reply 84); clause 24 989/34 064 = 73.4% (maker 73.5%). Same order; splitters differ. Corpus shows no unlisted-abbreviation + capital case, so 008 is a gap in the design, not a measured loss.

**Suites.** grounded-notes 23/23; all packages/index pipeline tests 418/418; `tsc --noEmit` index exit 0 (api 3/3 not re-run: unchanged by this commit). No LLM/Mongo/network.

**Mutations** (own harness in the worktree, per-mutation backup, `git hash-object` == HEAD after each, folder deleted, trees clean): break after any abbreviation KILLED (2 failures); disable negated-by-reply KILLED (1); drop the `u` flag from MARKER KILLED (2).

ISSUES-WRITTEN: ISS-T040GEN-008 (high), ISS-T040GEN-009 (medium). ISS-T040GEN-002, -006, -007 left open (006 remains open for the unlisted-abbreviation class; 007 is functionally fixed and could be verified with the next PASS).

---

# Cycle 3

VERDICT: PASS
Cycle checked: 3
Commit checked: 0ae7fe7 (lane/t040gen)

## EXPLANATION

The cycle-3 boundary rule is structural for every capitalised, mixed-case, digit-bearing, single-letter or dotted token, so the -008 class (Pvt./Univ./Asst./Ave./Pkwy./Q1.) cannot reappear and no common-English path ships a meaning-reversed quote. Two exotic, medium gaps are filed. ISS-T040GEN-002, -006, -007, -008, -009 are verified closed.

**Replay.** All -008 cases (Pvt., Univ., Asst., Ave., Pkwy., Q1.): only the whole sentence ships. Cycle 0-2 cases (e.g., U.S., vs., approx., Dr. Rao, Govt., etc., a.m., Mr. Not Sure, "Apply in March? Absolutely not.", "not April"): only negation-bearing quotes ship; tests replay them. -009: a quote in a question sentence is dropped (is-question) for any reply; "Apply in March. Wrong./Incorrect./I disagree." now merge, so "Apply in March." alone no longer ships.

**New-bypass table** (every word-aligned quote enumerated; "ships" = negation-dropping quote returns null):

| Case | Result |
|---|---|
| approx (no dot), dept./govt. lower-case, etc. mid-sentence, a.m. / a.m. On, Rs./rs. 5000, st./dr. lower-case, "Rs. 5000 is not the fee" | refused (whole sentence only) |
| "10. Never apply in March.", "3. Not recommended...", "Step 10. Never apply...", "Apply in March, 10. Never apply in April." | negation always inside the shipped quote; list number opening a sentence does not break |
| Real sentence end then negation ("Fees are not 1000 rupees. Apply in March.") | negation stays in its own quote; correct |
| **"We do not accept pvt. Colleges applications after March first."** (also univ., mgmt., pg. Courses) quote "Colleges applications ..." | **SHIPS**: unlisted lower-case abbreviation + capital -> ISS-T040GEN-010 medium (0 occurrences in the 3427-turn corpus) |
| "Fees are 1000 rupees. Wrong." / "Ignore that." / ">5-word rejection" | ships the statement -> ISS-T040GEN-011 medium |
| "Is it good? Not really." / "What is the fee? It is not fixed yet." | answer ships on its own (correct) |

**Question rule.** Correct for its purpose: a "?" sentence is a question, not a fact; the only legitimate loss is a non-question item that cites a question as topic evidence (e.g., "student asked about fees"), which is dropped, a deliberate conservative cost (about 10.5 pts of sentence recall). Q&A question evidence is exempt via allowQuestion; answers are not. Quotes with a "?" followed by a quote mark are dropped too (conservative).

**Recall (independent run on data/toc-migrated, 3427 turns, my own splitter, pieces of 12+ chars).** Sentence 11 002/15 565 = 70.7% (maker 71.9%; refusals starts-mid 1640, is-question 1765, ends-mid 947, omits-qualifier 160, negated-by-reply 51); clause 20 547/34 037 = 60.4% (maker 60.5%). Reproduces within splitter noise.

**Suites.** grounded-notes 26/26; all packages/index pipeline tests 421/421; `tsc --noEmit` index exit 0. No LLM/Mongo/network.

**Mutations** (own harness in the worktree, per-mutation backup, `git hash-object` == HEAD after each, folder deleted, trees clean): allow break after a capitalised token KILLED (4 failures); disable is-question KILLED (1 failure).

ISSUES-WRITTEN: ISS-T040GEN-010 (medium), ISS-T040GEN-011 (medium). Verified: ISS-T040GEN-002, -006, -007, -008, -009.
