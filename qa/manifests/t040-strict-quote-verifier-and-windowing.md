# Manifest — t040-strict-quote-verifier-and-windowing

**Lane:** T040QUOTE (branch lane/t040quote, base c08a431). **Status:** ready-for-check. **Fix cycle:** 1
**Backlog tier:** 3 (roadmap slice of T-040; T-040 stays `open`/`in_progress`, TASKS.md and goal.json NOT edited).
**Severity gate:** no auth, no tenancy, no data write, no stored schema, no model call, no DB. Pure functions only, not called by any stage. Issue ids for this lane would be `ISS-T040QUOTE-NNN` in `qa/issues.t040quote.jsonl` (none filed).
**Round cap:** 0 prior PASSes name this seam.

## Scope
Two pure, unwired helpers in `packages/index/src/pipeline/`, exported from `packages/index/src/index.ts`:
1. `quote-verify.ts` — `verifyQuote(s)(turns, quotes)` strict verbatim-quote verifier (+ `normaliseForQuote`).
2. `transcript-windows.ts` — `windowTranscript(turns, {maxChars, overlapTurns})`.
Nothing in `summarize.ts`, `grounded*.ts`, any stage, `speaker*` or `run-pipeline.mjs` is touched. A fake-summarizer test shows how claimed quotes would be checked.

## Window parameters and their source
`maxChars = 16000`, `overlapTurns = 2`. Source: `qa/manifests/webinar-release-repair-plan.md` line 59 ("Deterministic full coverage in <=16,000-character windows with two-turn overlap; slice oversized turns preserving exact quote/id"). The TASKS.md T-040 row and `.goal/goal.json` T-040 give NO numbers (only "summary, facts, Q&A, action items with timestamp citations"; `docs/meeting-bot-roadmap.md`: "every claim links to a turn timestamp"), so the plan's values are used. Note the existing `runtimeWindows` in `grounded.ts` uses 4000-char spans: a different, already-wired mechanism, untouched.
Window size is defined on the rendered text: one line per turn `[speaker] text` (speaker cut to 32 chars), lines joined by "\n", `text.length <= maxChars` always. An oversized turn is cut into exact contiguous slices (prefers whitespace in the last 20%, never inside a surrogate pair or before a combining mark / ZWJ), each carrying turn id, `start`/`end` offsets into the original text, `partIndex`/`partCount`. When 2 shared entries cannot coexist with a new entry the overlap shrinks 2->1->0 so every window advances; `overlap` reports the real count.

## Matching rules (quote verifier)
1. Exact substring after normalisation only. No case folding, stemming, NFKC, fuzzy or edit-distance matching.
2. Normalisation (same on source and quote), each justified:
   - NFC per grapheme cluster: canonically equivalent encodings are the same text by Unicode definition.
   - whitespace runs (`\s`, incl. NBSP/newlines) -> exactly ONE space, ends trimmed: layout only; a run never vanishes so tokens never merge ("the fee" != "thefee").
   - U+2018/2019/201A/201B -> `'`; U+201C/201D/201E/201F -> `"`: typography of the same quotation mark.
   - U+2010..U+2015 and U+2212 -> `-`: typography of the same dash/minus.
   - Why meaning cannot change: no rule touches a letter or digit, none deletes a non-space character, whitespace maps to >= 1 space. So equal normal forms imply the same sequence of letter/digit/mark runs in the same order with the same word count. Tested by a seeded property (`normalisation never makes quotes with different letters/digits/word counts equal`) plus a "must NOT equate" pair per rule.
   - Deliberately NOT normalised: case, NFKC (ligature `fi`), zero-width characters, accents ("cafe" != "café").
3. Searched per turn; a quote that matches only across a turn boundary is REFUSED (`spans-turn-boundary`); never across speakers. Optional `speakerRef` on a claimed quote: found only in other speakers' turns -> `wrong-speaker`.
4. Ellipsis (`...` or U+2026): verified only if that exact ellipsis is in the source; otherwise REFUSED `ellipsis-stitched`. Segments are never stitched (chosen over "verify segments separately": a model joining passages is exactly the failure to surface).
5. Minimum 12 code points AND 2 tokens (`too-short`); maximum 2000 UTF-16 units (`too-long`).
6. Match must start and end on a grapheme boundary and a word boundary (`partial-word`): "reven" is not a quote of "revenue"; a cut inside a Devanagari cluster is refused.
7. Several occurrences: ALL locations in source order, up to 20, then `truncated: true`. Offsets are UTF-16 offsets into the ORIGINAL turn text (`turn.text.slice(start,end)` is the matched span).
8. Total: invalid input (non-string, empty, lone surrogates, control characters, huge, null turns, non-array args) yields a typed refusal, never a throw. Typed refusals: not-a-string, empty, too-short, too-long, invalid-characters, ellipsis-stitched, spans-turn-boundary, partial-word, wrong-speaker, not-found.
Complexity: index build O(n); each quote is one KMP pass O(n+m), no backtracking. Tested: 1,000,000-char source with 20 quotes, and the KMP-killer (1M `a` vs 1997 `a` + ` b`), asserted < 8 s (observed about 2.3 s for the pair, dominated by building the index per call).

## NOT done
No wiring into summarize.ts or any stage; no schema/collection/contract change; no model call; no citation fields on stored pages; no strict-webinar mode. T-040 still requires: the actual summary/facts/numbers/Q&A/action-item generation with timestamp citations on every claim, calling the verifier on model output and dropping/marking unverified quotes, calling the windower from the summarizer (per-window completion with covered-ID audit), storing citations (needs the schema authorization described in the repair plan, NOT given), and a live run. Those are later units.

## Known limits
- Index is rebuilt per `verifyQuotes` call; batch quotes into one call (a per-call Intl.Segmenter pass costs about 1 s on 1 MB of non-ASCII text).
- Word boundary treats apostrophe as a boundary ("don" would pass the boundary rule inside "don't"); 12-char/2-token minimum limits the use.
- Truncation/omission at either end of a sentence ("revenue is" of "revenue is not up") is a verbatim substring and therefore verifies; the verifier proves occurrence, not that the excerpt preserves meaning.
- Zero-width or bidi characters differing between model and source cause `not-found` (strict by choice).
- A window cut of an oversized turn inside a Devanagari cluster is avoided only for combining marks/ZWJ; a no-whitespace hard cut may still fall between two independent graphemes.
- Windows' sizes assume the caller renders lines exactly as `[speaker] text`.

## Evidence (node from the toolchain note; run from packages/index)
- `timeout 120 node --test --import tsx src/pipeline/quote-verify.test.ts src/pipeline/transcript-windows.test.ts` -> `tests 31 / pass 31 / fail 0`
- `timeout 120 node --test --import tsx src/pipeline/summarize.test.ts` -> `tests 10 / pass 10 / fail 0`
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0, no output
- `node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (112 dir(s) within budget)`
- Non-blank lines: quote-verify.ts 229, transcript-windows.ts 112, quote-verify.test.ts 177, transcript-windows.test.ts 118.
- Code commit 5e0389c (then one commit adding two tests for the start/end word-boundary split plus this manifest).

## Mutations (14; script run per mutation with 120 s timeout, per-mutation byte backup, restore in `finally`, then `git hash-object <file>` == `git rev-parse HEAD:<file>`: all printed `HEAD-fidelity=true`; `git status` clean afterwards)
| Mutation | Result | Killing test |
|---|---|---|
| M1 case-insensitive match | killed | `normalisation rule: case is NOT folded` |
| M2 drop minimum length | killed | `minimum length and token count; mid-word and mid-cluster matches are refused` |
| M3 allow cross-turn | killed | `a quote spanning a turn boundary is refused, and so is another speaker's turn when scoped` |
| M4 allow mid-word START | first run SURVIVED (end check still caught the test quote); fixed by adding start-only and end-only quotes; re-run killed | `minimum length and token count; mid-word ...` |
| M4b allow mid-word END | killed (after the added quote) | same |
| M5 no dash unification | killed | `normalisation rule: dash`, `... minus` |
| M6 no whitespace collapse | killed | `normalisation rule: whitespace`, seeded normalisation property |
| M7 no NFC | killed | `normalisation rule: NFC` |
| M8 no curly-single unification | killed | `normalisation rule: curly single` |
| M9 ignore speaker scope | killed | `a quote spanning a turn boundary ... when scoped` |
| M10 overlap 1 | killed | `defaults are 16000 chars and a 2-turn overlap`, `overlap is exactly 2 turns ...` |
| M11 window limit off by one (`<` for `<=`) | killed, but reported at FILE level (test-file failure, no single test name; most likely the exact-fit entry never fitting) | file `transcript-windows.test.ts` (the `exactly 16000 ... 16001` test targets it) |
| M12 skip last window | killed (9 tests) | `empty and tiny inputs`, `overlap is exactly 2 turns ...`, coverage tests |
| M13 limit 16001 | killed | `defaults are 16000 chars ...`, `exactly 16000 characters fits ...` |
| M14 cut inside surrogate/mark | killed | `oversized turn: no whitespace, surrogate pairs and combining marks are not cut apart` |
M11 was not re-run after the test edit to name the killing test; unverified at test-name level.

---

# Fix cycle 1 (answers verdict `qa/verdicts/t040-strict-quote-verifier-and-windowing.md`, FAIL cycle 0, ISS-T040QUOTE-001)
**Status:** ready-for-check. **Fix cycle:** 1. Code commit 5f507cf (quote-verify.ts, new quote-token-rule.ts, transcript-windows.ts progress guard, tests); the following commit adds only this manifest.

## READ THIS FIRST: limits of substring verification (for any consumer or wiring unit)
1. **It proves the words appear contiguously in ONE turn by that speaker. It does NOT prove the quote keeps the speaker's meaning.** A negation or qualifier just outside the quoted span is invisible to it: "I do not think it is safe" -> the quote "think it is safe" VERIFIES; "it is not up" -> "is not up" verifies, but so does a cut that drops the "not" at the start. The token rule below closes cuts inside numbers/identifiers only; it cannot and does not try to detect a dropped negation, a dropped "only/never/not yet", or a hedge left outside the span.
2. **A wiring unit must add** (the verifier alone is not enough): require the quote to span a whole sentence or clause (start at turn start or after sentence punctuation, end at sentence punctuation or turn end), OR display the full surrounding sentence/turn next to the quote, linked to the turn id and offsets returned in `locations`; and drop or flag quotes that fail. Do not render a verified quote without its surrounding sentence when that sentence contains a negation.
3. **Wrapper policy (decided): strip ONE matching pair of wrapping quotation marks and report it** (below). Nothing else is stripped: a model that adds a trailing full stop, leading/trailing ellipsis or "(sic)" still gets a refusal.
4. **Window numbers (16000 chars, 2-turn overlap) come from an UNAPPROVED repair plan** (`qa/manifests/webinar-release-repair-plan.md` line 59); they are options with defaults, not decided parameters.

## What failed
`verifyQuote` verified a quote cut at a punctuation joint inside a number or token ("the price is 3" of "3.5", "our margin is 5" of "5-10", "e-mail me at bob" of "bob@x.com") while "1,0" was refused. Also from the verdict: truncation limit stated only for sentence ends (now above), wrappers undocumented, cap applied before the speaker filter, survivors min-length 11 and cap 19, and the off-by-one window mutant killed only by a ~33 s file hang.

## Token-boundary rule (quote-token-rule.ts: one predicate `cutInsideToken(s,p)` applied to BOTH ends)
L = character before the cut, R = after (code points, surrogate pairs whole; Cf format characters such as zero-width and soft hyphen are skipped so they cannot hide a joint). Whitespace or a text edge on either side is a boundary.
- **C1** alnum|alnum is inside a token (words, "3rd", "5k", "1,0|00").
- **C2** alnum | joiner (`. , - / : @ _ ' %`, fullwidth and Arabic-separator forms) is inside iff the character after the joiner is alnum or a currency symbol ("3|.5", "5|-10", "24|/7", "10|:30", "bob|@x.com", "e|-mail", "don|'t", "x|.com/path"); digit|percent sign ("50|%") is always inside. A joiner followed by whitespace, punctuation or the end is SENTENCE punctuation: "is 3" of "is 3. Next", "is 3, and", "is 3" at turn end and "is 3..." verify; "is 3" of "is 3.5" and of "is 3.5. Then" do not.
- **C3** joiner | alnum where the joiner is glued to a previous alnum is inside ("3.|5", "10:|30", "24/|7", "a_|b", "don'|t").
- **C4** prefix | alnum, prefix = any currency symbol or `+ - . , @ #`, is inside ("$|5", "₹|500", "-|5", "+|91").
Scripts without spaces: ideographs, kana and Thai are letters, so C1 still refuses a cut between two of them (unchanged from cycle 0); an unspaced CJK quote is `too-short` because the 2-token minimum counts spaces (pre-existing limit, pinned by a test). The Devanagari danda U+0964 is punctuation, not a joiner: a quote may still end before it (unchanged, tested). Devanagari and fullwidth digits count as digits (tested). Refuse when in doubt.
Consequences worth knowing: a quote starting right after a hyphen/comma/dot glued to a letter ("...but") is refused, and a dash used as punctuation without spaces ("wait-what") is treated as a hyphenated word.

## Location cap
The speaker filter now runs BEFORE the cap: locations by the claimed speaker are collected (all hits scanned, linear), the first `MAX_LOCATIONS` (20) are returned, and `truncated: true` only if more by that speaker exist. `wrong-speaker` is returned only when valid hits exist and none is by the claimed speaker. The old 1000-raw-hit scan limit is gone (a hit past it could be hidden).

## Wrapper policy
Verdict `ok:true` gains `unwrapped: boolean`. If the quote as given does not verify and its normalised form starts and ends with the SAME mark (`"` or `'`; curly forms normalise to these) with no further such mark inside, the trimmed inside is verified instead and the minimum length applies to the inside. A quote that is verbatim WITH its marks in the source verifies as given (`unwrapped:false`). Never stripped: mismatched pairs, a lone mark, `*..*`, `(..)`, a full stop (inside or outside the marks), ellipses, inner marks. The `wrappers:` tests prove each stays refused; stripping only ever tries a substring of the original quote, so a verified inside is always a real, token-aligned, contiguous substring.

## Existing assertions changed
None. The 31 cycle-0 tests and the 10 `summarize.test.ts` tests pass unmodified. `transcript-windows.ts` gained a one-line progress guard (`if (end === start) end = start + 1`) so a regressed limit comparison produces a failing assertion instead of an infinite loop; behaviour for valid input is unchanged.

## D-015 count (the ledger's own recorded reproductions, parsed from `qa/issues.t040quote.jsonl` by the test, not retyped)
`ISS-T040QUOTE-001: 3/3 refused` (the three verbatim calls in the row's evidence), plus the row's "same for 1,000" remark ("the fee is 1" of "the fee is 1,000 rupees today") refused. None left open.

## Property test (seeded, `quote-verify-token.test.ts`)
160 turns built from 23 token kinds (prices, ranges, e-mail, URL path, handle, hyphenated, apostrophe, versions, dates, percent, ordinal) with random trailing `. , ;`. Quotes ending or starting strictly inside a token: 1392/1392 refused as `partial-word`. Token-aligned quotes (4 variants per turn, incl. trailing punctuation): 640/640 verified with `turn.text.slice(start,end) === quote`.

## Boundary tests added (kill the cycle-0 survivors)
11 vs 12 code points (an astral character counts once), 19/20/21 locations, a speaker-B hit behind 25 speaker-A hits, and in `transcript-windows.test.ts` three named fast tests with `{ timeout: 5000 }` for the window limit (exact fit, +1, -1; two-entry exact fit; slices of exactly maxChars).

## Mutations (18; script in the scratchpad: 120 s `timeout` on the test command, byte backup PER mutation, restore in `finally`, then `git hash-object` == `git rev-parse HEAD:<file>`: all `HEAD-fidelity=true`)
Tests run per mutation: quote-verify.test.ts, quote-verify-token.test.ts, transcript-windows.test.ts. ALL 18 killed by named tests:
| # | Mutation | Killed by (first) |
|---|---|---|
| M1 | C1 removed | `token rule C1 ...` |
| M2 | C2 joiner removed | `ISS-T040QUOTE-001 ...`, `token rule C2 joiner ...` |
| M3 | C2 percent removed | `token rule C2 percent ...` |
| M4 | C3 removed | `token rule C3 ...` |
| M5 | C4 removed | `token rule C4 ...` |
| M6 | joiner always inside (no sentence punctuation) | `token rule: sentence punctuation ...` (+8) |
| M7 | format characters not skipped | `token rule: invisible characters ...` |
| M8 | cap before speaker filter restored | `speaker filter runs BEFORE the location cap ...` |
| M9 | wrapper stripped from a non-matching pair | `wrappers: stripping can never turn ...` |
| M10 | wrapper stripped for any first/last char | same |
| M11 | wrapper stripped with marks inside | same |
| M12 | minimum length 11 | `minimum length: exactly 11 ...` |
| M13 | MAX_LOCATIONS 19 | `location cap is exactly 20 ...`, `speaker filter ...` |
| M14 | length in UTF-16 units | `minimum length: exactly 11 ...` |
| M15 | length checked before stripping only | `wrappers: minimum length applies AFTER stripping` |
| M16 | window `<` for `<=` | `exactly 16000 characters fits ...`, `window limit off-by-one: two entries ...` (fast, no hang) |
| M17 | window limit +1 | same two |
| M18 | window limit -1 | same two |
Notes: M3's first run used a pattern that did not match (PATTERN-MISSING, nothing mutated) and was fixed and re-run. M8's first form did not model cap-before-filter and SURVIVED; it was replaced by a faithful form (cap on all valid hits, filter afterwards), which is killed.

## Evidence (node from the toolchain note; from packages/index)
- `timeout 170 node --test --import tsx src/pipeline/quote-verify.test.ts src/pipeline/quote-verify-token.test.ts src/pipeline/transcript-windows.test.ts src/pipeline/summarize.test.ts` -> `tests 59 / pass 59 / fail 0` (31 cycle-0 + 18 new + 10 summarize); it printed `ISS-T040QUOTE-001: 3/3 refused (recorded verbatim)` and `property: 1392 interior cuts refused, 640 token-aligned quotes verified with exact offsets`.
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0 (`tsc=0`), no output.
- `node scripts/lint-dirsize.mjs` (repo root) -> `lint-dirsize: OK (112 dir(s) within budget)`.
- Non-blank lines: quote-verify.ts 239, quote-token-rule.ts 70, transcript-windows.ts 113, quote-verify.test.ts 177, quote-verify-token.test.ts 175, transcript-windows.test.ts 146.
- Unverified: no real model quotes or live ASR text were run; only the seeded corpora and hand-built cases.
