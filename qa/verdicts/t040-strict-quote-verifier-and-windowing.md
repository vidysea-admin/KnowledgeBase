# Verdict — t040-strict-quote-verifier-and-windowing

**VERDICT: FAIL**
**Cycle checked:** 0
**Commit checked:** 3d52e9b (unit commits 5e0389c, 3d52e9b; base c08a431)
**Scope:** pure helpers, unwired; T-040 stays open; no model run.

## EXPLANATION
Re-run by the checker: targeted tests 41/41 (31 new + 10 summarize), `tsc --noEmit` exit 0, `lint-dirsize` OK,
non-blank lines 229/112/177/118 (budgets met), `summarize.ts` diff empty, `index.ts` +2 export lines only, no speaker-*,
run-pipeline, schema, contract or enforcement edit. Window parameters are options with defaults 16000/2, source named in the manifest (plan line 59).

**False verified (the dangerous direction).** About 1,250 inputs of my own (23 hand-built meaning-change pairs, 600 seeded
mutations, plus targeted truncation probes). Held: case, NFKC ligature, fullwidth and Arabic-Indic digits, nukta/halant/ZWJ/ZWNJ,
zero-width, soft hyphen, NBSP, tab, U+2028 join, "its" vs "it's", "non compliant", word reorder, mid-word cut, CJK/Thai mid-word, wrong speaker
(id or case), quote read by another speaker, stitched "..." — all refused. Dash/minus unification verifies "5–10" vs "5−10": typography, accepted.
FAILING CLASS (ISS-T040QUOTE-001): a quote cut at a punctuation joint inside a number or token verifies:
`"the price is 3"` of "the price is 3.5 dollars today"; `"our margin is 5"` of "5-10 percent"; `"e-mail me at bob"` of "bob@x.com".
Digit-to-digit mid-number cuts ("1,0") are refused, so the boundary rule is inconsistent for numbers. Changing a value is meaning-relevant.

**Meaning-flipping truncation** ("I do not think it is safe" -> "think it is safe"; "it is not up" -> "we cannot say it is") verifies; only the 12-code-point/2-token
minimum and word boundaries stand in the way. The manifest's Known limits do state "truncation ... verifies; the verifier proves occurrence, not meaning", but only
for sentence ends, and not for numbers or negation-dropping at the start. Not FAIL on its own; required manifest wording in the fix cycle.

**False refused:** of 40 model-style quotes (20 genuinely verbatim), wrapping quote marks, a trailing full stop absent in source and lead/trail ellipsis
are all refused (22/40 verified, the remainder were non-verbatim by design). Surrounding quotation marks are NOT stripped; the manifest does not say so.
Low note: the 20-location cap is applied before the speaker filter, so a real speaker-B occurrence beyond 20 earlier A occurrences returns `wrong-speaker`.

**Totality/cost:** 0 throws on hostile set (empty, lone surrogates, control chars, null turns, 5000-char quote); 10,000 quotes against a small source 0.2 s.
1 MB: 250k/500k/1M = 0.12/0.30/0.87 s (linear). 1 quote 0.83 s; 200 quotes 2.7 s (ASCII) and 1.0 s (non-ASCII): about 10 ms/quote after a ~0.8 s build; practical, not quadratic.
**Offsets:** 433 verified locations over 3,000 random texts (multiple spaces, composed/decomposed, curly quotes, dashes, NBSP, Devanagari): slice of the original
text normalises to the quote in 433/433.
**Windowing:** seeded property, 2,000 transcripts (empty, one turn, 15,990-16,010 char turns, 50k turns, 400 tiny turns): deterministic, every turn covered, no window over 16,000,
slice offsets contiguous and reconstruct each turn, overlap equals the reported value and is 2 whenever the 2 shared entries plus a new one fit; 0 violations. Verification runs
on the source turns, so a quote straddling two slices still verifies; the manifest does not state this composition (minor).

**Mutations (per-mutation backup, restore, HEAD hash fidelity ok each, tree clean):** case-insensitive killed; NFKC killed; end-boundary dropped killed; start-boundary dropped killed;
speaker check dropped killed; overlap 1 killed (2 tests); window limit 16001 killed (4); offsets in normalised coordinates killed (3).
SURVIVED: minimum length 11 (no 11-code-point boundary test); MAX_LOCATIONS 19 (cap test compares against the exported constant). M11 (`<` for `<=`): the exact-fit entry never
fits so the window loop never advances; it dies as a test-FILE failure after about 33 s (hang/timeout of `transcript-windows.test.ts`), not by a named assertion. A fast named killer would be a test that
calls windowTranscript on a 16000-char turn with a bounded iteration guard.

Fix cycle needs: ISS-T040QUOTE-001 code fix and regression cases, manifest wording on numeric/negation truncation and unstripped quote marks, boundary tests for 11/12 code points and the cap.

ISSUES-WRITTEN: ISS-T040QUOTE-001
