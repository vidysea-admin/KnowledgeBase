# Manifest — t040-strict-quote-verifier-and-windowing

**Lane:** T040QUOTE (branch lane/t040quote, base c08a431). **Status:** checked-PASS (Checked: qa/verdicts/t040-strict-quote-verifier-and-windowing.md, cycle 2, eb45cc9). **Fix cycle:** 2
**Handshake status:** checked-PASS (canonical field per D-042/D-043; verdict cycle 2 PASS; the "ready-for-check / Fix cycle: 1" line under Fix cycle 1 below is history, superseded by the cycle-2 close-out)
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
   - whitespace runs (the explicit set of cycle 2, incl. NBSP/newlines; NOT the JavaScript regex shorthand, which also contains U+FEFF) -> exactly ONE space, ends trimmed: layout only; a run never vanishes so tokens never merge ("the fee" != "thefee").
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
- Memory: the index is about 200 bytes of heap per source character (pieces per grapheme plus the normalised string), so a 1 MB transcript costs roughly 200 MB while the index lives; verify in batches per transcript, do not hold indexes for many transcripts at once.
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
1. **It proves the words appear contiguously in ONE turn by that speaker. It does NOT prove the quote keeps the speaker's meaning.** A negation or qualifier just outside the quoted span is invisible to it: "I do not think it is safe" -> the quote "think it is safe" VERIFIES; "it is not up" -> "is not up" verifies, but so does a cut that drops the "not" at the start. The boundary rule (cycle 2, below) refuses a cut that lands next to any character that is not whitespace and not listed punctuation, so it closes cuts glued to a symbol, number, identifier or word; it does NOT close a cut inside a space-separated number ("1 000": quoting "1" verifies; documented limit) and it cannot and does not try to detect a dropped negation, a dropped "only/never/not yet", or a hedge left outside the span.
2. **A wiring unit must add** (the verifier alone is not enough): require the quote to span a whole sentence or clause (start at turn start or after sentence punctuation, end at sentence punctuation or turn end), OR display the full surrounding sentence/turn next to the quote, linked to the turn id and offsets returned in `locations`; and drop or flag quotes that fail. Do not render a verified quote without its surrounding sentence when that sentence contains a negation.
3. **Wrapper policy (decided): strip ONE matching pair of wrapping quotation marks and report it** (below). Nothing else is stripped: a model that adds a trailing full stop, leading/trailing ellipsis or "(sic)" still gets a refusal.
4. **Window numbers (16000 chars, 2-turn overlap) come from an UNAPPROVED repair plan** (`qa/manifests/webinar-release-repair-plan.md` line 59); they are options with defaults, not decided parameters.

## What failed
`verifyQuote` verified a quote cut at a punctuation joint inside a number or token ("the price is 3" of "3.5", "our margin is 5" of "5-10", "e-mail me at bob" of "bob@x.com") while "1,0" was refused. Also from the verdict: truncation limit stated only for sentence ends (now above), wrappers undocumented, cap applied before the speaker filter, survivors min-length 11 and cap 19, and the off-by-one window mutant killed only by a ~33 s file hang.

## Token-boundary rule (cycle 1; SUPERSEDED by the allow-list in Fix cycle 2 below; `cutInsideToken` and clauses C1-C4 no longer exist)
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

---

# Fix cycle 2 (answers verdict FAIL cycle 1 at 4a1112b: ISS-T040QUOTE-002 high, ISS-T040QUOTE-003 medium)
**Status:** checked-PASS (Checked: qa/verdicts/t040-strict-quote-verifier-and-windowing.md, cycle 2, eb45cc9). **Fix cycle:** 2. Code commits 8ed30c3 and ce5d96b (quote-token-rule.ts rewritten, quote-verify.ts, two new test files); the following commit adds only this manifest.

## What failed, and why a joiner list cannot work
Cycle 1 listed the characters that JOIN a token (`. , - / : @ _ ' %`) and treated every other symbol as a boundary, and a trailing one as sentence punctuation. So "has 10" verified against "has 10+ years" (also C of C++, R of R&D, 3 of 3x4, 2 of 2+2, 5 of 5 degrees, AT of AT&T). A deny-list is complete only if it names every character Unicode will ever assign; the next unnamed symbol reopens the hole. Separately, JavaScript's regex whitespace shorthand contains U+FEFF, so "r<U+FEFF>evenue" collapsed to "r evenue" and "the revenue is r" verified. Cycle 2 inverts the rule: it names where a quote MAY start or end, and everything else is inside a token without being named.

## The boundary allow-list (quote-token-rule.ts, 65 non-blank lines, two predicates)
Judged on the joined normalised text; turns are joined with one space, so a turn edge is whitespace.
- **START at a** is legal iff, scanning backwards from a over at most 8 OPENING characters, the next character back is whitespace or the text start.
- **END at b** is legal iff, scanning forwards from b over at most 8 CLOSING characters, the next character is whitespace or the text end.
- **OPENING** (7): `"` `'` `(` `[` `{` `«` `‹`. Quotation marks and brackets are the only things speakers and transcribers put in front of a first word; curly forms are already normalised to the straight pair. `'` is a member, but it only counts when what is behind it is whitespace/start, so "don't" and "Rashi's" are never opened by their apostrophe.
- **CLOSING** (16): `"` `'` `.` `,` `;` `:` `!` `?` `)` `]` `}` `»` `›` `…` `।` `॥`. Sentence and clause marks (`. , ; : ! ?`) because a model drops them or a quote ends before them; ellipsis because "wait..." ends a thought; danda and double danda are the Devanagari full stops (tested); closing quote/bracket mirror OPENING. Because each must be followed by whitespace/end, "3.5", "1,000", "10:30", "x.com", "a_b" stay one token.
- **Digit guard:** a quotation mark that is the FIRST closing character after a digit (astral digits included) is a unit mark (5', 5"), not a closer: refused.
- **Not in either set, therefore interior:** letters, digits, `+ & x degree % @ _ / - # $ * = ~ ·`, superscripts, fractions, emoji, every Cf character, every other symbol. Nothing is named to be refused.
- **Bounded scans:** at most 8 opening/closing characters are skipped (a longer run is refused), so a run of 100k dots cannot make a quote scan quadratic (mutation M11).

## Whitespace (explicit; never the regex shorthand)
TAB LF VT FF CR, SPACE, U+00A0, U+1680, U+2000-U+200A, U+2028, U+2029, U+202F, U+205F, U+3000 (the Unicode Zs spaces plus the line breaks). This is exactly the old shorthand MINUS U+FEFF. Used for normalisation (runs become one space), the quote's control-character check and the boundary test.

## Cf decision (decided once): kept as characters, never whitespace, never a boundary, NOT stripped
Stripping was rejected: ZWJ/ZWNJ change Indic and Persian words, and strip-then-compare would make "pa<ZWSP>id" equal "paid", a different encoded string. Instead Cf characters stay in both source and quote, so text with one never equals text without (strict `not-found`), offsets map to the original trivially, and because a Cf character is neither whitespace nor opening/closing, any cut next to one is refused by the allow-list with no special case. Covered as a PROPERTY over the whole Cf category (170 code points enumerated from the Unicode database, not a hand list): 680 adjacent cuts refused. Cost: "paid<ZWSP> now" cannot be quoted as "paid" (false refusal; see limits).

## Hard cases and decisions (each is a named test in quote-verify-boundary.test.ts)
| Case | Decision | Why |
|---|---|---|
| "3." at end of turn / "3. Next", quoting "...is 3" | verifies | `.` closing, then end/whitespace |
| "3.5" quoting "is 3"; "3.5. Next" quoting "is 3" | refused | `.` then `5` |
| "U.S. policy" quoting "...the U.S" / "...the U" | verifies / refused | the final period is sentence-shaped; the inner one is followed by `S` |
| "e.g." quoting "...e.g" / "...e" | verifies / refused | same |
| "Dr. Rao" quoting "...Dr" | verifies | an abbreviation period is indistinguishable from a sentence period; the word is intact |
| "wait..." quoting "wait" | verifies | `...` is a closing run |
| "(as I said before)" quoting the inside | verifies | `(` opening after whitespace, `)` closing before whitespace |
| "50%" quoting "50" | refused | `%` is neither closing nor whitespace |
| "$5" quoting "5" (start) | refused | `$` is not opening |
| "don't" quoting "don"; "re-sign" quoting "re" | refused | `'` then `t`; `-` is not closing |
| "Rashi's" quoting "Rashi" | refused, FALSE REFUSAL | the apostrophe cannot be told from a possessive; documented |
| "word-word" with an em dash, no spaces | refused | the dash normalises to `-`, which is not closing |
| "no I-- I mean" (interrupted-speech dash) quoting "...no I" | refused, FALSE REFUSAL | a trailing dash is not closing; documented |
| "...so we agreed" quoting "so we agreed" | refused, FALSE REFUSAL | a leading ellipsis is not opening; the quote may include the ellipsis instead |
| 5' / 5" / astral digit + `'` | refused | digit guard |
| signed number "-5": whole / sign dropped | verifies / refused | `-` is not opening |
| "10+" and "C++" quoted whole | verifies | the quote ends before whitespace, symbol included |
| NBSP, ideographic space, tab, newline | whitespace | in the explicit set |
| Cf next to the cut (before or after) | refused | not whitespace, not listed |
| Thai and Han with no spaces | interior cuts REFUSED (fail closed) | see below |
| Devanagari danda | closing | tested |

Scripts without spaces (Han, Hiragana, Katakana, Thai, and the like): the allow-list has no interior boundary for them, so only whole-turn quotes or quotes aligned to the spaces the transcript happens to contain verify; every interior cut is refused. Decided acceptable for this slice (English/Hinglish/Devanagari webinars); keeping a grapheme-only rule for named scripts would reopen exactly the "closed list" defect. Pinned by tests. (Unspaced CJK was already `too-short` because of the 2-token minimum.)

## Wrapper low notes
- A mixed curly/straight pair (curly open, straight close) is ACCEPTED on purpose: rule 2c makes the two forms one mark, because an ASR/LLM round trip swaps them; a kind mismatch (`"` vs `'`) stays refused. Tested both ways; the doc comment says so.
- A wrapped quote whose inside exists only under another speaker now returns `wrong-speaker` (one-line fix; tested for wrapped and bare, and still `ok` for the right speaker).

## Existing assertions changed
None. All cycle-0/1 assertions pass unmodified; no previously verified quote is now refused and no refusal test was deleted. The only behaviour changes are the new refusals and `wrong-speaker` for wrapped quotes.

## D-015 counts (recorded reproductions parsed from `qa/issues.t040quote.jsonl` by the test, not retyped)
- ISS-T040QUOTE-002: **7/7 refused** (the verbatim call "has 10" plus the six `'quote' of 'fragment'` pairs: C, R, 3, 2, 5, AT; the source is the quote continued by the recorded fragment). Plus the row's symbol scan as start and end cuts for 22 symbols: all refused. None left open.
- ISS-T040QUOTE-003: **1/1 refused**, and the row's reverse (quote with U+FEFF vs source with a real space) is now `not-found` both ways.
- ISS-T040QUOTE-001: **3/3 refused** (still), plus the "1,000" remark.

## Property tests (no symbol list; seeded; quote-verify-property.test.ts)
- 4000 random code points, 90% from the whole BMP (surrogates excluded) and 10% from planes 1-16, excluding only the explicit whitespace, opening and closing sets (and control characters, which make the QUOTE invalid for another reason). For each: a token `ab<c>cd` plus a prefix and a suffix placement: 24,000 adjacent cuts (end before c, end after c, start at c, start after c, prefix, suffix), **24,000/24,000 refused**.
- One-off exhaustive run (scratch script, not in the suite): every BMP code point outside the sets, 4 cuts each: **253,500 cuts, 0 verified**.
- Honest direction: 1500 random tokens with optional opening and closing punctuation, 4 whitespace-aligned quotes each: **6000/6000 verified with `text.slice(start,end) === quote`**.
- Cf: all 170 Cf code points, 4 cuts each (680): all refused.

## False-refusal cost (40 natural sentences, 20 English + 20 Hinglish, ordinary punctuation)
Every whitespace-aligned window of 3-6 words, as the raw substring and with leading opening / trailing closing punctuation stripped, length >= 12: **1844/1844 verified, 0 refused**. Refused shapes arise only where the model changes text at a cut, listed in the hard-case table and repeated in the limits below.

## Mutations (16; 280 s `timeout` on the test command with SIGKILL, byte backup PER mutation, restore in `finally`, then `git hash-object` == `git rev-parse HEAD:<file>`: all `true`)
Tests per mutation: quote-verify.test.ts, quote-verify-token.test.ts, quote-verify-boundary.test.ts, quote-verify-property.test.ts. All killed by named tests:
| # | Mutation | Killed by (first) |
|---|---|---|
| M1 | closing widened to any non-alphanumeric (old behaviour) | `ISS-T040QUOTE-002: every recorded reproduction...`, `hard case: 50% quoting 50` |
| M2 | opening widened likewise | `ISS-T040QUOTE-002: the symbol scan...`, `hard case: $5 quoting 5` |
| M3 | regex whitespace shorthand restored | `ISS-T040QUOTE-003: ... U+FEFF is not whitespace`, the Cf property |
| M4 | Cf treated as a boundary | `hard case: Cf character before the quote`, the Cf property |
| M5 | end of turn not a boundary | `hard case: 3. at end of turn` (+22) |
| M6 | closing punctuation allowed without following whitespace/end | `ISS-T040QUOTE-001 reproductions`, `hard case: 3.5 decimal` |
| M7 | minimum length 11 | `minimum length: exactly 11 code points refused...` |
| M8 | speaker filter after the cap | `speaker filter runs BEFORE the location cap` |
| M9 | digit guard removed | `hard case: 5' (feet)`, `astral digit then unit mark` |
| M10 | text start not a boundary | `hard case: 3. then sentence` (+29) |
| M11 | scan runs unbounded | `rule predicates: a long run ... (bounded scan)` |
| M12 | wrapped wrong-speaker fix removed | `wrappers: a wrapped quote by the wrong speaker...` |
| M13 | NBSP not whitespace | `hard case: NBSP is whitespace` |
| M14 | digit guard reads one UTF-16 unit | `hard case: astral digit then unit mark` |
| M15 | danda not closing | `hard case: Devanagari danda...`, honest-direction property |
| M16 | opening set empty | `hard case: (as I said) quoting the inside` |
Notes: the first M14 targeted astral handling in the start scan, which was dead code (no astral character is a set member) and SURVIVED; that code was deleted (ce5d96b) and M14 retargeted at the digit guard. A quoting slip in the harness had halved regex backslashes in M1-M4, so those four and M13 were re-run with corrected mutants and killed as listed.

## Evidence (node from the toolchain note; from packages/index)
- `timeout 300 node --test --import tsx src/pipeline/quote-verify.test.ts src/pipeline/quote-verify-token.test.ts src/pipeline/quote-verify-boundary.test.ts src/pipeline/quote-verify-property.test.ts src/pipeline/transcript-windows.test.ts src/pipeline/summarize.test.ts` -> `tests 108 / pass 108 / fail 0`. It printed: `ISS-T040QUOTE-002: 7/7 refused (recorded verbatim)`, `ISS-T040QUOTE-003: 1/1 refused (recorded verbatim)`, `ISS-T040QUOTE-001: 3/3 refused (recorded verbatim)`, `Cf property: 170 format characters, 680 adjacent cuts refused`, `symbol property: 4000 random code points (whole BMP + astral), 24000 adjacent cuts, all refused`, `honest direction: 6000/6000 aligned quotes verified with text.slice(start,end) === quote`, `false-refusal: 1844/1844 whitespace-aligned quotes verified; refused: 0`.
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> `tsc=0`, no output.
- `node scripts/lint-dirsize.mjs` (repo root) -> `lint-dirsize: OK (112 dir(s) within budget)`.
- Non-blank lines: quote-token-rule.ts 65, quote-verify.ts 242, quote-verify-boundary.test.ts 142, quote-verify-property.test.ts 129 (quote-verify.test.ts 177 and quote-verify-token.test.ts 175 unchanged).
- Unverified: no real model quotes or live ASR text were run; the 40 sentences are hand-written.

## Limits added by cycle 2 (also true for any consumer)
- FALSE REFUSALS the consumer may hit (all fail closed): possessive or contraction cuts ("Rashi" of "Rashi's"); a trailing interrupted-speech dash ("no I-- I mean" quoting "no I"); a source with a leading ellipsis quoted without it; a Cf character (zero-width, BOM, bidi mark) adjacent to the cut; more than 8 consecutive opening or closing characters; unspaced scripts (Han, Kana, Thai) except whole-turn or space-delimited quotes; a quotation mark right after a digit (5', 5").
- Space-separated numbers ("1 000", "1 234 567"): quoting "1" verifies, because the space is a legal boundary. Documented limit, not closed.
- An abbreviation period counts as sentence punctuation ("Dr" of "Dr. Rao" verifies); a quote that drops a qualifier just outside the span is still a verbatim substring (limit 1 above).
- Memory: about 200 bytes of heap per source character while an index lives.
