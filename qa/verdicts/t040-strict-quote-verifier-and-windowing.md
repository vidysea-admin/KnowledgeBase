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

---

# Cycle 1

**VERDICT: FAIL**
**Cycle checked:** 1
**Commit checked:** 4a1112b (code commit 5f507cf; cycle-0 verdict 8d441f3)
**Scope:** pure helpers, unwired; T-040 stays open; no model run.

## EXPLANATION
Re-run by the checker: targeted tests 59/59 (quote-verify 31 + quote-verify-token 18 + transcript-windows + summarize 10), `tsc --noEmit` exit 0,
`lint-dirsize` OK, non-blank lines 239/70/113/177/175/146, `git diff 8d441f3 4a1112b -- '*.test.ts'` removes no line (additions only),
`summarize.ts` untouched, no speaker-*/run-pipeline edit, lane files do not overlap main's packages/index speaker changes, `git merge-tree` shows no conflict.

**D-015.** ISS-T040QUOTE-001: 3/3 recorded verbatim calls refused (parsed from the ledger row), plus the row's "1,000" remark refused. Cycle 0's class is closed for the listed joiners.

**False verified (the dangerous direction), about 4,600 inputs of my own** (316 numeric/identifier/unit pairs, a 90-symbol scan, 3,685 invisible-character probes, 500 seeded aligned quotes).
Held: 3.5, 3,5, 5-10, 5 en-dash 10, 10:30am, 24/7, 5k, 3rd, 2x, 1e6, v2.1.3, $5, -5, +91, bob@x.com, x.com/path, user_name, node.js, e-mail, re-sign, don't, it's,
Rashi's (quoting the name out of the possessive is refused: treated as inside the token, the safe side), x², 1½, H₂O, 1.000,50, Devanagari digits, Arabic-Indic digits with U+066B/U+066C,
CJK; ten of eleven invisible Cf characters (ZWSP/ZWNJ/ZWJ, soft hyphen, LRM/RLM, word joiner, bidi embeds) in source or quote.
FAILING CLASS 1 (ISS-T040QUOTE-002, high): any symbol not in the closed JOINERS list is a boundary, and a trailing symbol before whitespace is "sentence punctuation":
`"we need someone who has 10"` of "...has 10+ years of experience"; `"our main language is C"` of "C++ for the backend"; `"the team is in R"` of "R&D";
`"the area is 3"` of "3×4"; `"the sum is 2"` of "2+2"; `"the temperature was 5"` of "5°"; `"the board of AT"` of "AT&T". The quote's token differs from the source token and the value/term changes.
This contradicts the module header ("when in doubt the rule refuses") and the manifest's "closes cuts inside numbers/identifiers".
FAILING CLASS 2 (ISS-T040QUOTE-003, medium): U+FEFF is JS whitespace, so it becomes a space before the Cf skip runs: `"the revenue is r"` of "r﻿evenue" verifies (268 probes, all U+FEFF); a quote with U+FEFF equals a source with a real space.
Documented limit, not a failure: whitespace-separated tokens are whole tokens ("1" of "1 000", "₹" of "₹ 500", "5" of "5 to 10"); the manifest does not name the space-as-thousands-separator case (low: add one sentence).

**Wrapper policy.** Held: a quote verbatim with its marks verifies as given (unwrapped:false); `"..."` / `'...'` / curly forms strip once and report unwrapped:true; mismatched straight pair, `"...".`, doubled marks, nested `"'..'"`, lone mark,
marks around under-minimum text, marks-only strings, and `"A" and "B"` are all refused; strip is never applied twice; offsets after stripping slice the original turn exactly (checked with multi-space, NFC/NFD and curly marks).
Observations (low, not filed): a curly-open/straight-close pair (`“...\"`) strips because both normalise to the same mark; stripping `'tis ...'` against a source that has "tis" works, and against a source with the elision apostrophe it verifies the span without the apostrophe;
a wrapped quote by the wrong speaker returns `not-found` rather than `wrong-speaker`. A quote cannot become verified unless its stripped inside is a real, aligned, contiguous substring.

**Cap.** 50 speaker-A hits followed by a speaker-B hit: B's location returned (truncated:false); A returns 20 with truncated:true; no speaker returns 20, truncated:true; unknown speaker returns wrong-speaker.
Scale (slow, loaded machine): 100,000 repetitions in one 2.7 MB turn 3.0-3.6 s, 400,000 (10.8 MB) 13.4-14.0 s, linear; 100,000 turns x 20 quotes 3.4 s; overlapping `a a a` 1.0 s. Output stays at 20 and `truncated:true` reports that more exist.
Memory is linear and dominated by the index (about 200 bytes of heap per source character: 527 MB at 2.7 MB, 1.46 GB at 10.8 MB), not by hits; worth a manifest note for the wiring unit (cap source size or window before verifying).

**Offsets and windowing.** 500 seeded cases (4 whitespace kinds, NFC/NFD, curly quotes, en dash, Devanagari, 133 with wrappers stripped): 458 verified, 0 offset mismatches (the 42 refusals were my own mis-built double-wrapped or too-short inputs).
Own windowing property over 1,000 transcripts (maxChars 64/200/500/16000, overlap 0-3, oversized turns, astral and combining characters): 0 violations (limit, coverage, contiguous slices, determinism), and output identical to the cycle-0 `transcript-windows.ts` (`git show 8d441f3:`) on all 1,000: the progress guard changes nothing for valid input.

**Limits section.** The "READ THIS FIRST" block states in plain words: proves contiguous presence in one turn by that speaker, NOT meaning (negation example), what a wiring unit must add, the wrapper policy, and that 16000/2 come from an unapproved plan. Adequate.
Required edits when the code is fixed: (a) item 1 and the Token-boundary section claim cuts inside numbers/identifiers are closed; true only for the listed joiners (re-word after ISS-002 is fixed); (b) the cycle-0 "Known limits" still says apostrophe is a boundary ("don" would pass), now false: delete or correct;
(c) add one sentence on whitespace-separated numbers and on index memory.

**Mutations (14 of mine; 120-300 s timeouts, per-mutation byte backup, restore in `finally`, `git hash-object` == `git rev-parse HEAD:<file>` true after every one, tree clean):**
C1 removed killed; C2 removed killed; percent clause dropped killed (first attempt was a malformed mutant, redone); C3 removed killed; C4 removed killed; Cf skip removed killed (invisible-characters test only);
strip without matching pair killed; min length not applied after stripping killed; cap before speaker filter killed; unwrapped always false killed; strip on any first/last char killed; min tokens 1 killed; window `<` for `<=` killed (fast, named tests).
SURVIVED: progress guard removed (M11): equivalent for valid input (slices never exceed maxChars, so the branch is unreachable); it only matters under a regressed limit, which the fast window tests now catch first. Score 13/14, the survivor equivalent.

ISSUES-WRITTEN: ISS-T040QUOTE-002 (high), ISS-T040QUOTE-003 (medium); ISS-T040QUOTE-001 marked verified.

## Merge conditions
Do not merge. Fix cycle 2 needs: ISS-T040QUOTE-002 (symbol glued to the cut side counts as inside, with the 7 exact cases above plus a symbol-scan property as regression, reported by id per D-015),
ISS-T040QUOTE-003 (U+FEFF), and the three manifest edits above. Nothing else is required; no existing assertion may change. After PASS the lane may merge with no conflicts (no overlap with main).

# Cycle 2

**VERDICT: PASS**
**Cycle checked:** 2
**Commit checked:** 1bac09f (code commits 8ed30c3, ce5d96b; cycle-1 verdict 4e13621)
**Scope:** pure helpers, unwired; T-040 stays open; no model run.

## EXPLANATION
**D-015 (own run from the ledger rows):** ISS-T040QUOTE-001 3/3 refused; -002 7/7 refused; -003 1/1 refused. None left open.

**False verified: none in about 62,000 inputs of my own.** (a) 279 hand-built edge cases plus targeted reruns; (b) a 60,000-cut seeded fuzz over an alphabet of letters, digits, ~50 symbols, closing/opening characters, Cf/odd characters and 10 space kinds, with an independent token-level oracle (middle tokens equal, ends differ only by opening/closing characters, wrappers aside): 2,864 verified, 0 violations (the one oracle hit was a legitimate wrapper unwrap). Checked and refused: 3.5 / 3.)x / 3.).x / 3.,x; 5' 5" 5’ 5” 5′ 5″ 5'' 5'. 5',; f(x) start; 5"wide; every Cf, ZWSP, WJ, BOM, U+180E, soft hyphen, U+034F, Hangul fillers, U+3164, U+2800, tag chars and variation selectors adjacent to a cut (29 code points x 7 placements); decomposed resume+U+0301 (cut inside grapheme: not-found/partial); Han/Thai/Tibetan/Lao/Khmer interior cuts, glued mixed-script cuts. Accepted by design: "3. 5" and "1, 000" quoting "...3" / "...1" (closing mark then whitespace), "rock ' n" quoting "rock", "'tis" quoting "tis", "5.'" quoting "5", and "10<thin/narrow-nbsp/nbsp/figure space/ideographic space>000" quoting "10" (space-separated numbers). All are whole-token truncations: documented-limit class, not FAIL.

**Scan cap:** closing run of 0-8 accepted, 9+ refused (dots, parens, "!", mixed, quotes); opening run likewise; 9+ followed by alnum also refused; the cap cannot turn a refusal into acceptance (overflow returns false). Mutation with overflow=accept killed.

**Timing (1 MB source, long dot/paren/a-run/mixed punctuation):** 1 quote 0.8-1.3 s, 200 quotes 3.1-3.4 s; 100,000 repeats of "wait.........(9 dots) now" x 200 quotes 1.9 s: linear, no quadratic behaviour.

**False refused, 40+ honest quotes** (English, Hinglish, Devanagari with danda, wrapper quotes, commas, "?", ")" and "]", possessives, hyphenated words, "5 kg", "10%", "₹500", "5-10"): 42 of 45 verified; the 3 refusals were my own errors (under minimum length twice, one quote dropped "₹"). No genuine boundary refusal on ordinary sentence-level quotes. Known false-refusal shapes (all in the manifest's list): possessive/contraction cut, trailing interrupted-speech dash, leading ellipsis, Cf adjacent to cut, >8 marks, unspaced scripts, quote mark after a digit (also `he said "I want 5"` quoting `I want 5`).

**Earlier items hold:** all 98 unit tests pass (5 test files; maker's 108 includes summarize); offsets slice correctly in the unit tests; mixed curly/straight wrapper pair accepted and documented; speaker filter before cap, windowing and one-turn rule are covered by unchanged passing tests. `git diff 4e13621 1bac09f -- '*.test.ts'`: additions only (288 insertions, 0 deletions). The removed surrogate code was dead: `quoteMayStart/End` read `charAt` and no astral code point is whitespace/opening/closing; lone surrogates are rejected earlier in normaliseQuote (tests unchanged and green). Scope unchanged (only quote-token-rule.ts, quote-verify.ts, 2 new tests, manifest; summarize.ts, speaker-*, run-pipeline.mjs untouched). `tsc --noEmit` exit 0; `lint-dirsize` OK; file sizes 65-242 non-blank lines; `git merge-tree` against codex/machine-migration-2026-10-09: clean, no conflicts; index.ts export lines unchanged by this cycle.

**Limits section:** adequate. READ THIS FIRST states contiguity-not-meaning, wiring requirement, wrapper policy, defaults' origin; cycle-1 clause section is marked SUPERSEDED; "Limits added by cycle 2" lists new false refusals and space-separated numbers, and the cycle-0 apostrophe statement is gone. Non-blocking nits (low, not filed): the number limit names "1 000" only and not "1, 000", "3. 5" or thin/narrow no-break spaces; matching-rule 6 in the cycle-0 section still says "word boundary" (superseded by the allow-list text in the cycle-2 section).

**Mutations (19 of mine; per-mutation byte backup, restore in finally, 280 s SIGKILL timeout, `git hash-object` == `git rev-parse HEAD:` true after each; git status clean):** closing gains +, %, - killed; opening gains $ killed; opening chain not required to follow whitespace killed; whitespace gains U+FEFF, U+200B killed; Cf as whitespace killed; cap overflow accepts (start and end) killed; unit-mark rule removed killed; unit mark extended to "." killed; end-of-text and start-of-text not boundaries killed; MAX_RUN 7 killed. SURVIVED: MAX_RUN 9 (off-by-one on the cap value: the suite pins "long run refused" but not exactly 9; behaviour at 9 is correct today; low, file-don't-fix).

**Harness note:** my harnesses (mut.mjs, mutB.mjs, written by me) lived in the shared scratchpad and touched only the absolute path of this worktree's quote-token-rule.ts; both were deleted afterwards. I also once ran `node mut2.mjs` in the scratchpad, which I had not written (a foreign file); it failed immediately with ENOENT on a relative `src/domain/lean-video.ts` and modified nothing (my worktree status was clean afterwards).

ISSUES-WRITTEN: none. ISS-T040QUOTE-002 and ISS-T040QUOTE-003 marked verified.

## Merge conditions (cycle 2)
May merge (source scope only; unwired; T-040 stays open). No conflicts expected. Optional manifest nits above. Wiring unit must still honour the limits section (contiguity not meaning; show surrounding sentence).
