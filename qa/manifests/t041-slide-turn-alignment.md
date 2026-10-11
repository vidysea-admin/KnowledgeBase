# Manifest — t041-slide-turn-alignment
**Status:** checked-PASS (Checked: qa/verdicts/t041-slide-turn-alignment.md, cycle 0, 3ec3dbd)
**Fix cycle:** 0
**Tier:** 3 (roadmap task). First slice of T-041. T-041 stays OPEN.
**Goal task:** T-041 "Slide keyframes -> OCR -> attached to turns by time" (done when: "slide text is searchable next to the speech", docs/meeting-bot-roadmap.md)
**Severity / ceremony:** no auth, tenancy or data write. Pure function, nothing wired, no stored schema touched.

## What T-041 requires
Keyframe extraction (scene-change dedupe) -> OCR -> attach to turns by time. The roadmap states no model, granularity or data shape. TASKS.md only notes "video capture proven live 2026-09-24". No decision (DECISIONS.md) covers slides, OCR or vision storage. No slide/keyframe type exists in the repo (only `lean-video.ts` content hint "slides").

## Scope (this slice only)
The ALIGNMENT step: pure, unwired. Files (packages/core/src/domain, 7 -> 10 files, `lint-dirsize` OK):
- `slide-turn-alignment.ts` (130 lines) — `alignSlidesToTurns(slides, turns, {sessionEndSec?, counter?})`, `normalizeSlideText`.
- `slide-turn-alignment.test.ts` (125), `slide-turn-alignment.property.test.ts` (108).

## Input shape and ASSUMPTIONS the OCR slice must confirm
- `SlideObservation {id: string, tSec: number, text: string, confidence?: number}`; `tSec` = capture time, seconds from session start.
- `AlignTurn {id, tStart, tEnd, speakerRef?}` — field names follow `generated/turns.ts` (tStart/tEnd seconds from session start; `speakerRef` accepted and ignored: alignment does not depend on speaker).
- A1: one observation = one sampled frame already reduced to text by a later stage; keyframe dedupe may or may not have run (repeats are merged here regardless).
- A2: observation `id` is unique per observation within a session (duplicates reject ALL holders).
- A3: `confidence` (0..1) is validated if present and otherwise ignored; no low-confidence policy is chosen here.
- A4: capture times and turn times share one clock (session start). Turn times are assumed already QA-clamped (T-044).
- A5: blank/whitespace-only text means "no slide visible" (ends previous slide, attaches nothing). The OCR stage must decide whether an unreadable frame is blank or omitted.
- A6: `sessionEndSec` is optional; absent means the last slide is open-ended (`to: null`).
- Near-duplicate slides (animation build steps, OCR jitter, a cursor) are NOT merged: later concern, needs a policy and a measured corpus.

## Boundary rules
- Intervals half-open [from, to). Slide on screen from first observation to next DIFFERENT slide's first observation (or session end).
- Sameness: text equal after NFC + whitespace collapse + trim. Only consecutive observations merge; A,B,A = 3 segments. Slide id = first observation id; all merged ids in `observationIds`.
- Sort stable by (time, id), code-unit compare. Equal capture times with different text: later id wins, earlier gets an empty span.
- Turn gets every slide with overlap > 0, time-ordered, each with `{turnId, slideId, from, to, overlapSec}`; primary = longest, ties earliest. Zero-length turn: the slide with from <= t < to, overlap 0. Gap or before first slide: none.
- Never throws. Typed errors (`errors[]`, items excluded): invalid-input, invalid-id, duplicate-id, invalid-time (NaN/Infinity/non-number), negative-time, end-before-start, invalid-text, invalid-confidence, invalid-session-end.
- Provenance by reference: turn id + slide id + overlap range (same tStart/tEnd seconds convention as Turns). Slide text is never returned, copied or logged; turns are not mutated (tested).

## Complexity
Sort O(n log n + m log m); sweep O(n + m + k), k = reported pairs (two pointers, slide pointer monotone). Tested via injected counter at 100,000 turns x 5,000 slides: ops <= 3*(n+m+k) and < n*m/1000.

## NOT done
No OCR/vision call, no keyframe extraction or scene-change detection, no ffmpeg, no storage, no wiring into any stage, no schema/contracts change, no search/index of slide text. TASKS.md and goal.json untouched; T-041 remains open.
**Owner decision needed (wiring slice):** where slide text is stored, retention, and redaction. Slide text is untrusted and can contain passcodes, meeting links and personal data; it also becomes searchable next to speech (tenancy and redaction implications). This slice stores and logs nothing.

## Proposed next slices (in order)
1. Slide-observation type + schema/fixture proposal and the owner decision on storage/retention/redaction (needs Umesh; touches schema, so its own unit).
2. Keyframe selection (pure scene-change dedupe over frame hashes; needs a sample recording, ffmpeg run on a quiet machine).
3. OCR/vision adapter behind an interface, hermetic fake in tests (needs a vision API key and an approved model/cost; real call only after slice 1 decision).
4. Wiring: stage that emits observations, calls `alignSlidesToTurns`, stores references (needs slice 1 decision; driver is held by D-119 for related files).
5. Index slide text for search next to speech (tenant-scoped; the T-041 "done when").

## Evidence (worktree C:\Users\product\Desktop\KnowledgeBase-lanes\t041align, packages/core)
`node --test --import tsx src/domain/slide-turn-alignment.test.ts src/domain/slide-turn-alignment.property.test.ts` -> `ℹ tests 19 / pass 19 / fail 0`. Includes: 200 seeded cases vs brute-force O(n*m) oracle (pair set, overlap ranges, ordering, sum of overlaps <= turn duration, primary longest/earliest, per-slide view = transpose of per-turn view); 40 seeded permutation-invariance cases; 100k x 5k operation-count test (~1.1 s, assertion is on ops not time).
`node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0.
`node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (115 dir(s) within budget)`.

## Mutations (per-mutation byte backup, 120 s hard timeout, restore in finally, `git hash-object` equal before/after; 11 mutations, all KILLED)
| Mutation | Killing tests (first) |
|---|---|
| M1 `to <= s` -> `to < s` (boundary) | slide boundary is half-open...; zero-length turn...; oracle |
| M2 merge of identical observations removed | repeated identical observations merge...; NFC normalisation... |
| M3 primary = first, not longest | slide change mid-turn...; oracle |
| M4 blank frame treated as slide (gap gets slide) | blank frame ends the previous slide... |
| M5 observation sort removed | unsorted inputs...; identical capture times...; permutation |
| M5b turn sort removed | many turns under one slide...; permutation; oracle |
| M6 last slide not extended (to = from) | slide change mid-turn...; many turns under one slide...; repeated identical observations... |
| M7 negative time accepted | hostile inputs yield typed errors |
| M8 end < start accepted | hostile inputs yield typed errors |
| M9 duplicate ids not rejected | duplicate ids reject every holder... |
| M10 `seg.from < e` -> `<=` | slide boundary is half-open...; oracle |
Disclosure: the harness was first run from the shared session scratchpad under the generic name `mutate.mjs` (since removed); it touched ONLY the absolute path of this lane's `slide-turn-alignment.ts`. After type fixes (non-null assertions) the full run was repeated with a harness inside this worktree (deleted before commit); M6 was re-run separately. Final: file restored, `git hash-object` equals the pre-run blob and HEAD.
