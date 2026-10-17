# Contract - t041-keyframe-dedup (owned by checker; maker never edits)
Scope: pure function dedupeKeyframes over SYNTHETIC hashes; unwired. Defaults (threshold 5 bits, scene-cut scale) are unvalidated.
1. Invalid input (non-hex, mixed length, unsorted/duplicate/NaN/Infinity/negative time, bad options) returns keyframes [] plus typed errors; never throws. Empty input returns empty with no errors.
2. A frame joins the current run iff Hamming distance to the last KEPT frame <= threshold (never to the previous frame): slow drift must split. Hex case-insensitive.
3. Output: every kept id/tSec/hash exists in the input; ascending tSec; spans tile [first frame time, endSec ?? last frame time] with no gap or overlap; frameIds concatenate to the input ids in order; same input gives identical output.
4. minDurationMs: a run shorter than it merges into the previous run (leading flicker merges forward; A,flicker,A is one run); a forced cut (diff >= sceneCutDiff) is never merged by rejoin.
5. Not guaranteed: monotonicity of keyframe count in the threshold (greedy anchoring; see verdict). Consumer note: output has no `text`; alignSlidesToTurns rejects slides without text (invalid-text), so the OCR stage must add it.
