# Verdict — t044-transcript-qa-clamp

VERDICT: PASS
Cycle checked: 1
Scope: pure module `packages/ai/src/stt/transcript-qa.ts` (+ test) at commit cb91310, judged against contract `qa/contracts/t044-transcript-qa-clamp.md` (C1-C9). The unit does NOT complete T-044: driver wiring is held by D-119 and T-044 remains open.

## Independent results

Commands run from `KnowledgeBase-lanes\transcript\packages\ai`, Node from the codex runtime:
- `node --test --import tsx src/stt/transcript-qa.test.ts` -> tests 16, pass 16, fail 0.
- `node --test --import tsx src/stt/gemini-file-upload.test.ts` -> tests 22, pass 22, fail 0.
- `node ...\typescript\lib\tsc.js --noEmit -p tsconfig.json` -> no output, exit 0.

- C1 PASS: own probe (scratchpad t044-check\probe.mts) checked the postcondition on every returned turn for durations 1e-9, 1e-300, 1, 186, 1e6, 1e15, 1e300, MAX_VALUE with tEnd 2x duration, tEnd fractionally above (1e-7 snapped to 186 uncounted; 1e-3 counted), tStart 185.9999999 (kept, tEnd 186), -0/-0 (kept as -0, satisfies 0 <= -0), negative, reversed, identical tStart/tEnd (both kept), and 200000 turns (347 ms). No violation.
- C2 PASS: JSON snapshot of input unchanged in every case; Object.freeze'd array of frozen turns accepted; confidence, speakerLabel and an arbitrary extra field preserved.
- C3 PASS: for every probe case inputCount = outputCount + dropped; clampedCount = clampedIndices.length; no duplicate dropped index; no index both clamped and dropped. 200000-turn case: 100000 kept, 100000 dropped.
- C4 PASS: tStart == D and tStart > D dropped with `start-at-or-beyond-duration`, suspectedHallucination true, indices in pastEndIndices (tests plus probe).
- C5 PASS: NaN, 0, -1, Infinity, "186", undefined all give durationValid=false, 0 output, reason invalid-duration. Non-numeric / null turns give invalid-timing without throwing.
- C6 PASS: probe on ten 22.3 s turns, D=186 -> totalTurnSec 223, overshootSec 37, 9 kept, index 9 dropped, index 8 clamped.
- C7 PASS: "Hello, world!" / "hello world" / "HELLO   world." and accented variants yield one run of 3 (original index, length); threshold 2.7 floors to 2 (run of 3 reported); a run of 5 reports one run of length 5; punctuation-only text ignored.
- C8 PASS: mutation table below, 10/10 killed.
- C9 PASS: `git show --stat cb91310` touches exactly `transcript-qa.ts`, `transcript-qa.test.ts` and `qa/manifests/t044-transcript-qa-clamp.md`; none of gemini-file-upload.ts, scripts/transcribe-long-session.mjs, scripts/upload/*, scripts/lib/transcript-provenance* changed. Lane `git status` was clean before my files.

## Mutation check (per-mutation byte backup in scratchpad, 60 s timeout, restore in try/finally, hash check after each)

| # | Mutation | Result |
|---|---|---|
| M1 | remove `tEnd = durationSec` clamp | killed (exit 1) |
| M2 | `tStart >= durationSec` -> `>` | killed |
| M3 | default repeat threshold 3 -> 4 | killed |
| M4 | negative tStart no longer set to 0 | killed |
| M5 | remove tEnd<tStart repair | killed |
| M6 | tolerance flip (`durationSec + tol` -> `durationSec`) | killed |
| M7 | nonMonotonic `<` -> `>` | killed |
| M8 | overshoot sign flip | killed |
| M9 | durationValid `> 0` -> `>= 0` | killed |
| M10 | drop `pastEndIndices.push` | killed |

After every restore and at the end: `git hash-object` = 0d4c0fbea31654c50f5c249215e809e076b7beb1 = `git rev-parse HEAD:packages/ai/src/stt/transcript-qa.ts`. No mismatch; no timeouts.

ISSUES-WRITTEN: none
EXPLANATION: C1-C9 hold on my own evidence; manifest claims (16/22 tests, clean tsc, 223->37, bounds, stated limits) all reproduced. Notes, not filed (low severity, not backlog): (a) `repeatThreshold: NaN` makes the threshold NaN so no runs are ever reported (silent disable; Infinity likewise); (b) the text normaliser strips combining marks (`\p{M}` is not kept), so Devanagari "नमस्ते" normalises to "नमस त" - still equal across repeats so detection works, but the reported `text` is mangled; (c) emoji-only turns normalise to empty and are never flagged as repeats; (d) a -0 tStart/tEnd is returned as -0 (numerically valid). Still needed for T-044 (outside this unit): wire the clamp into the driver and persist the report (blocked by D-119), run on real transcripts, and any re-timing of drift that leaves tStart inside the audio but wrong (the module clamps, it does not re-time).
