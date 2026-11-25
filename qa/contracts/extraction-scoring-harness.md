# Contract — extraction-scoring-harness (unit D2, D-227)

> Status: adopted by /checker 2026-11-25. Authority: D-227; plan section 7 lane D D2. Scope: `scripts/eval-extraction.mjs`, `packages/index/src/eval/extraction.ts` (`evaluateExtractionCase`), their tests, and the
> thresholds file this unit adds. Feeds launch row G14 (`go-live-acceptance.md`). Relation: `parallel-extraction-adjudication.md` and `parallel-golden-human-review.md` cover the human review packet; this contract covers the scorer.
> Owner's words: the harness exists but "scores 72 local claims with no accepted gold set and no thresholds". Thresholds PROPOSED for Umesh's approval: 0 fabricated citations; claim support at least 95%; machine-checked
> tier at least 98%; fact coverage at least 70%; topics 90% precision and 70% recall; decisions 85% and 70%; 0 false decisions on no-decision sessions.

## Criteria
- **[D2H-C1] Gold scoring.** `scripts/eval-extraction.mjs --gold <path>` scores against a human gold set in the shape the review tooling exports (the manifest cites the exporting tool and commits a fixture of that
  shape) and reports each of these metrics with numerator and denominator: fabricated citations (count), claim support, machine-checked tier, fact coverage, topics precision and recall, decisions precision and recall,
  false decisions on no-decision sessions. Fixtures are labelled synthetic; no synthetic fixture value is ever reported as a measurement of the real corpus. Without `--gold` the script behaves exactly as today
  (offline replay of `--input`; no provider, Mongo or dotenv, JSON only on stdout).
- **[D2H-C2] Thresholds from a file.** `--thresholds <path>` reads the bar from a file; the run exits non-zero when any measured metric misses it. The file carries `status: proposed|approved`; the proposed numbers above ship
  in a file marked `proposed`; nothing in code hard-codes them (a test changes a number in the file and the exit code flips). The output prints the file's status; a run against a `proposed` bar is labelled
  `bar: proposed` and can never be cited as acceptance for G14, which needs `approved`. Without `--thresholds` the output states `bar: none` and makes no pass/fail claim.
- **[D2H-C3] Not-measured is not a number.** A metric whose inputs are absent (or whose denominator is 0) is reported `not-measured`, never 0 or 100. It fails the run only if the thresholds file marks it required, with
  a distinct exit code or reason.
- **[D2H-C4] Reviewer agreement.** Where two reviewers labelled the same claim the harness reports the agreement rate, the count of double-labelled claims and the measure used; without double labels it reports `not-measured`.
- **[D2H-C5] Definitions pinned.** The manifest states in one line each the denominator of every metric above (for example what "machine-checked tier" and "fact coverage" divide by). Definitions are part of the proposal
  for Umesh's approval, not a maker choice.
- **[D2H-C6] Regression.** Existing tests and the `--input` replay output are unchanged; new tests cover C1-C4 including a falsification for each (a metric miss, a flipped threshold, an absent input, a missing second label).

## Invariants
- **[D2H-I1]** The harness reads only local files: no network, no database, no secret, no model call.
- **[D2H-I2]** The script never writes the gold set or the thresholds file.

## Out of scope
Producing the human gold set, approving thresholds, running the 300-claim audit (row G14, human work). Consent (D-210).

## Amendment log
- 2026-11-25 · routine · created. Maker reading [D2H-a]->C1 (tightened: synthetic-fixture labelling), [D2H-b]->C2 (tightened: proposed/approved status printed and non-citable for G14; `bar: none`), [D2H-c]->C3,
  [D2H-d]->C4; added C5 (denominators pinned for approval), C6 · folds inbox "unit-level checks for wave 1" (D-227)
