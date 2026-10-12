# Verdict: iss-t040gen-010-011-rejection-and-lowercase-abbrev

VERDICT: FAIL
Cycle checked: 0
Commit checked: 6f0e88a (lane/t040reject)
Scope: `packages/index/src/pipeline/notes/sentence-span.ts` + `grounded-notes.test.ts`; the `dropUnverified` option stays off by default.

## EXPLANATION

ISS-T040GEN-011 is fixed. ISS-T040GEN-010's recorded reproduction is fixed, but the stated safety property of its rule is false: a meaning-reversed quote still ships when the marker sits AFTER the unlisted abbreviation. One medium defect, filed as ISS-T040GEN-012; -010 and -011 stay open until it is closed.

1. Fixture changes (each diff hunk read). None weakens a safety test; all strengthen or keep the same assertion, and no assertion was deleted.
   - "lakh. Fees" -> "rupees. Fees", "recommend it" -> "recommend waiting", "it's done" -> "it's finished", "I don't know" -> "I don't remember", "No. 5 is good" -> "excellent", "I said no" -> "I said yes": these are positive "a real break still lets the next sentence be judged alone" cases. The old words are now merged (<=4 letters, marker on the left), which fails closed. Same assertion, longer word.
   - 007b "Yes, apply early." / "Sure." / "Yes, absolutely." used to ship; now assert `unconfirmed-by-short-reply`. Stricter, not weaker.
   - 009 last case now uses a 5+ word question, because the short follow-up rule drops the old shape. Only the recall control changed; the question-is-not-evidence assertions are untouched.
   - No meaning-reversal case now passes because of a fixture change.

2. ISS-T040GEN-010 probes (my own, all word- and mark-aligned sub-quotes). Marker on the left (the recorded repro) is fixed: `pvt./univ./mgmt./pg./asst./qtr.` tails return `starts-mid-sentence`. Marker on the right is NOT:
   - "Admission is open for pvt. Colleges do not take March applications." -> the quote "Admission is open for pvt." ships (null). The real sentence negates it. Meaning reversed.
   - "Admission is open for pvt. Colleges only if you apply early." and "Seats are open in pvt. Colleges but not in govt ones." -> the left fragment ships the same way.
   - "pvt. Colleges do not accept March applications." and "We pvt. Colleges accept March applications, not." ship only fragments that carry or omit nothing contradictory ("pvt.", or the full tail including its own "not"), so those variants are harmless.
   Cause: the no-break test looks only at the text LEFT of the dot. The manifest claims "with no marker on the left a wrong break cannot hide a negation"; that is true for the right-hand quote but not for the left-hand one, whose omitted tail now sits in the next "sentence" and is never checked by `omits-qualifier`. This hole pre-dates the unit (HEAD behaves the same), but the unit's stated fix for -010 and its stated safety argument cover it. Direction: also keep the break merged when a marker occurs between the dot and the next real boundary (a lookahead using the same `MARKER`); measure the recall cost against the 11.4 points.

3. ISS-T040GEN-011 probes: "Fees are 1000 rupees. Wrong." / "Ignore that." / "Not for freshers at this college though." / a 12-word "Wrong figure ..." / "Nope, I misquoted ..., sorry." -> all dropped (`retracted-by-reply`); a clause quote followed by ", no it is 1200" or ", ignore that" is dropped; "Hmm, wrong." (3 words) is dropped by the short-follow rule. The maker's replays pass. Still shipping, as the manifest admits (cue-vocabulary gap, not a regression): a >5-word rejection that does not open with a cue word ("Hold on, incorrect, it is 1200 for everyone here.", "Ignoring that figure, it is 1200 ...", "Hmm, no, 1200 ...", "The figure I gave you ... was mistaken entirely."). Note only; this class is open-ended by construction.

4. Recall, for the owner. The option is off by default and not wired to the live runner, so nothing live changes. With it ON, cumulative whole-sentence quote recall on data/toc-migrated falls from 71.9% (HEAD) to about 55.7%, and clause quotes from 60.5% to 52.1% (-16.2 and -8.4 points; I did not re-measure, the manifest's numbers are the maker's and its HEAD baseline matched cycle 3). Roughly 4 in 9 whole-sentence quotes are now refused. The cost is stated honestly in the manifest; it is the price of failing closed, and the 71% figure quoted at merge no longer holds.

5. Counts re-run by me: grounded-notes 28/28; all `packages/index/src/pipeline` tests 441/441; `tsc --noEmit -p packages/index` exit 0. No LLM, Mongo or network.

6. Mutations (own harness inside the worktree, per-mutation byte backup, hash checked): A drop the retraction-cue check (`retractsPrevious` line) hash a72e7366 -> 27/28, KILLED. B make -010 unconditional-break (remove the marker-left early return) hash 06d81d80 -> 27/28, KILLED. Restored; `git hash-object sentence-span.ts` b1323c8a == `git rev-parse HEAD:` b1323c8a. Harness and probe deleted; worktree and main trees clean (apart from this verdict and the ledger row).

ISSUES-WRITTEN: ISS-T040GEN-012
