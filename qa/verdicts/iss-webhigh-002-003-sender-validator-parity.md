# Verdict: iss-webhigh-002-003-sender-validator-parity

VERDICT: FAIL
Cycle checked: 0

EXPLANATION:
- Fixture gaps: (a) the "backslash" row is "a\b@x.example" in JSON, which decodes to U+0008 (backspace), not a backslash (verified via JSON.parse: length 12, char 0x08). Mutants dropping backslash from the forbidden class SURVIVE in both apps/api sender-ascii.ts and engine parseStrictEmail (test rc 0). The manifest's "each of <>(),;:"\ is pinned" claim is false for backslash. (b) No empty-string row.
- Otherwise complete: attack set (U+200B x2, U+202E, U+0430 x2, NBSP, BOM), 320 (len 320)/321 (len 321) boundary, 7 other special chars, 2 punycode, plain ASCII. Both packages read the same file via fs (apps/api ../../../../qa/..., meeting-bot ../../../../../qa/...), so drift fails a test.
- Parity: API rejects all 23 fixture rows' reject set; no over-rejection. 19 own probes (empty, tab, leading/trailing ws, "@@", no dot domain, leading "@", trailing dot, "..", NUL, space, DEL, 310-char local, 64-char label, [1.2.3.4], ', [ ]): API never rejects what engine accepts. API is looser than the engine only on structure/trim (tab, newline, "ann@@x", "ann@x", "@x.example", "ann@x.example.", "ann@x..example", "-x" label, long label, IP literal): documented as a character gate; those are inert to the engine. Note only.
- Later-rule test: kills rules.slice(0,1) mutant (rc 1). Good.
- Mutations (per-mutation backup, hash-object == HEAD verified each): api len<=321 KILLED; api drop ':' KILLED; api drop '<' KILLED; api drop '(' KILLED; engine >321 KILLED; first-rule-only KILLED; api drop backslash SURVIVED; engine drop backslash SURVIVED.
- tsc: apps/api 0, meeting-bot 0. meeting-bot join-rules + sender tests 155/155. apps/api full suite (D2_FIXTURE_PYTHON = main .venv) 804 tests, 803 pass, 1 fail: "a hanging write does not delay the response and is abandoned at the timeout" (timing test under CPU load; unrelated to this diff, not re-run on base).
- Fix needed: JSON-escape the backslash ("a\b@x.example"), add empty-string row, ideally assert each named row contains its character. Production code change itself is correct.

ISSUES-WRITTEN: ISS-WEBHIGH-004 (new, qa/issues.webhigh.jsonl). ISS-WEBHIGH-002 stays open pending fix; ISS-WEBHIGH-003 verified (first-rule-only mutant killed) and left for close-out with the fix cycle.
