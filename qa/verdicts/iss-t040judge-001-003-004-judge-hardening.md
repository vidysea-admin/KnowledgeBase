# Verdict: iss-t040judge-001-003-004-judge-hardening

VERDICT: PASS
Cycle checked: 0
Checker: independent, commit 967ee8a6 (lane/t040judgefix). No model calls.

## EXPLANATION
- Price table: none exists. usage_events (apps/api/src/usage/store.ts, router.ts) holds counts and error rates only; packages/ai providers (gemini, openai, anthropic, ollama) hard-code `costUsd: 0`; only claude-code reports a real cost. The maker's claim holds. The judge cannot defer to any table.
- Ceiling rate $1 in / $5 out per Mtok: it overestimates for the routed/default models (gemini-2.5-flash roughly 0.30/2.50, gpt-5.1-mini lower), so the cap trips earlier. Notes (not blocking): it UNDER-estimates anthropic default (claude-sonnet-4-5, about 3/15) and any gemini pro tier, but note-judge routes only [claude-code, gemini], and claude-code's real cost is kept. "ollama/ free" is true for local Ollama; any Ollama CLOUD model would also match the `ollama/` prefix and be costed 0, so the cap never trips for it. ollama is not on the note-judge route today. Filed low (ISS-T040JFIX-001).
- Injection: 11 attacks x 6 fields (note, text, id, kind, speakerRef, turnId): nested/quadruple delimiters, fullwidth and single-guillemet look-alikes, CR/LF, U+0085, U+2028, newline plus "assistant:"/"system:", 2 MB text, JSON-breakout quotes. In every case exactly 6 lines, 4 delimiter tokens, both bodies parse as JSON. Raw U+0085 passes through but cannot forge an ASCII delimiter. The tests assert the actual `job.messages` (system equals NOTE_JUDGE_PROMPT, user text). Wiring only; real model resistance unproven (maker says so; live eval is a follow-up).
- Default path: diff vs 42f9399e touches only judge.ts, judge.test.ts, the new test and the manifest. summarize.ts and drop-mode.ts are unchanged; judge.ts code runs only when noteJudge is supplied. No-judge output is byte-identical.
- Replay: ISS-T040JUDGE-001 closed (gemini-shaped reply costed, cap trips; NaN/Inf/-1 rejected 3/3; NaN cost cannot disable the cap). ISS-T040JUDGE-003 closed (injection and forged delimiters stay in blocks, fuzz above). ISS-T040JUDGE-004 closed (late-answer call asserted for different/unsure/same). ISS-T040JUDGE-002 untouched by design.
- Mutations (7, each a per-mutation byte backup restored in a trap, 180 s timeout, git hash-object equal to HEAD blob after each; harness deleted): cost always 0 killed (3 fail); cap ignored killed (3); delimiter escape removed killed (1); late call removed killed (1); NaN cap accepted killed (1); ollama-not-free killed (1); raw body instead of JSON killed (compile/test fail). 7/7 killed.
- Suites: notes/*.test.ts + summarize + claims 77/77 pass; `tsc --noEmit -p packages/index` clean.

## ISSUES-WRITTEN
- ISS-T040JFIX-001 (low, note only, not entered in the backlog): `ollama/` prefix is treated as free, which is wrong for Ollama cloud models; the rate is a ceiling only for flash-class models. Revisit if ollama or anthropic is added to the note-judge route.
