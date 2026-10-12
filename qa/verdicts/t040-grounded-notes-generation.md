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
