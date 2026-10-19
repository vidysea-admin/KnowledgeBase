# Verdict: w27-spkcue

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: 338c675e0fe774dfe7d7321f2c997937c628f961
Base: 4264418c (lane HEAD verified equal to the candidate; diff = 5 files, 2 src + 2 tests + manifest)
Tier: critical (ISS-104), medium (ISS-110, ISS-104CC-3). Checker: independent, ship mode.

## D-015 replay (own script, parsed verbatim from qa/issues.jsonl, not the maker's corpus)
Note: the ledger ids collided (see `id_collision` fields). Speaker ISS-093's 20 attacks live in the row ISS-104; speaker ISS-098's 10 regressions live in the row ISS-109. The rows literally titled ISS-093/ISS-098 in qa/issues.jsonl are golden-set / buildChunks and are not speaker rows.
| Row | Base 4264418c | Candidate 338c675e |
|---|---|---|
| ISS-104 (= speaker ISS-093), 20 recorded attacks, bare predicate (looksLikeAName && !isDiscourseOnly && citesNameAsAnIntroduction) | 19/20 refused (India shipped) | 20/20 refused |
| ISS-104, same 20 through extractSpeakersRuleBased with injected displayName | 20/20 refused | 20/20 refused |
| ISS-110 two recorded probes, predicate | 0/2 resolve | 2/2 resolve |
| ISS-110 two recorded probes, through extractSpeakers | 0/2 | 0/2 (see finding 1) |
| ISS-098 (= ledger ISS-109), 10 recorded recall sentences, predicate / extractSpeakers | 10/10 / 10/10 | 10/10 / 10/10 |
| ISS-108 legitimate controls (9 sentences) | identical results base vs candidate | identical |
No fabricated person name ships for any ISS-104 row at either layer on the candidate.
ISS-104CC-3: the 20-case corpus and the checker's 7 sentences are not recorded in the ledger, so option (a) is impossible and the maker's claim is correct. Option (b) applied: the cost is restated as construction-conditional in source and test comments. Behaviour is unchanged. Replayed here: only the 4 manifest-quoted rows exist (covered by the unit tests, which pass).

## Recall cost / no weakened test
`git diff 4264418c 338c675e` on both test files is additions plus one import change and one comment change. No assertion was removed or loosened (the ISS-093 counter comment is rewritten, not an assertion). Existing legitimate-name tests pass (below). Recorded recall cost: single-token "This is Ruby speaking on the panel." no longer cues through `speaking` (the multi-token form still does). The production allow-list already refused it, so there is no end-to-end change.

## Checks run (timeout 600, exit codes in .checker/*.txt in the lane, untracked)
- 9 speaker test files (the 8 matching speaker-name-rules|speakers-llm|speaker-relation|speaker-rules, plus speaker-twointro.test.ts): 278 tests, 278 pass, 0 fail, exit 0. (The maker quoted 338 for its file set; my 9-file set differs, so no count equivalence is claimed.)
- `tsc --noEmit -p packages/index`: exit 0.
- Own mutation M-A: `speaker-following-rules.ts` final line `return !(word.length > 3 && word.endsWith("ly"))` replaced by `return true`. Per-mutation byte backup, trap EXIT/INT/TERM/ERR, timeout 300. Result: 170/170 PASS, so the mutant SURVIVED (see note 2). Restored: `git -c core.autocrlf=true hash-object` = 7793470a937cdc2d2efc17e6a537d6a425ca8861 = `git rev-parse HEAD:<file>`, and cmp against the backup is clean.
- Not run (per rules): browsers, Mongo, network, full suite, lint-loc/dependency-cruiser (the maker reports workspace-junction noise there; not independently verified).

## Findings
1. ISS-110 end-to-end: the two recorded probes are fixed at the naming-cue predicate (0/2 -> 2/2), but through extractSpeakers they still refuse (0/2 before and after). The cause is the separate production tail allow-list, `speaker-rules/speaker-selfid-rules.ts` lines 59-65, which has no "very briefly" / "first, then" tail. The row measured extractSpeakers at 0eedf2d, before that allow-list existed. This is not a regression, and the row's own cause and fix_direction concern the predicate. The unit does not claim end-to-end, and its manifest says "at the predicate". Hence ISS-110 is "fixed (predicate)" and not "verified". Recommended follow-up, only if recall matters, is to pin a tail in speaker-selfid-rules.ts to the ledger cases.
2. Note (low, not filed): the `-ly adverb` clause in `followedByNoun` has no standing test; mutant M-A survived. Add one test such as "Ruby speaking quickly." resolving, pinned to a recorded case if one exists.

ISSUES-WRITTEN: none

## Ledger rows that MAY flip
- ISS-104: open -> fixed. NOT verified. Its own verified_note still requires the phase-3 live gate and the Approver's call. Offline replay is now 20/20 at both layers.
- ISS-110: open -> fixed, with the end-to-end caveat in finding 1. Not verified.
- ISS-104CC-3: open -> fixed via fix_direction option (b).
Maker closes out by flipping the manifest to checked-PASS. The ledger rows are the maker's or the orchestrator's to edit; the checker did not touch them.
