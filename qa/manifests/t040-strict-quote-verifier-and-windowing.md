# Manifest — t040-strict-quote-verifier-and-windowing

**Lane:** T040QUOTE (branch lane/t040quote, base c08a431). **Status:** ready-for-check. **Fix cycle:** 0
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
