# Contract — gemini-audio-transcription (T-003, phase 1: pipeline + proof-of-concept)

> Ground truth for scaling real Gemini diarized transcription beyond the single manually-piloted
> session (`27th-August-In-Focus`). `GEMINI_API_KEY` is now valid (confirmed via a real
> `models.list` call, HTTP 200, 2026-09-03) — ISS-015 is resolved. Drafted by the maker; /checker
> adopts or amends on first check.

## Scope, and a deliberate phased approach (disclosed up front)
The 22 remaining sessions' audio files (`raw/TOC/TOC-Materials/Audio/*.m4a`) range 6.8MB–63MB —
too large for Gemini's inline-base64 `generateContent` path (the existing `packages/ai/src/stt/
gemini.ts` adapter only supports that, and would exceed request-size limits on most of these
files). This unit does TWO things: (1) build the real File-API upload + poll + transcribe
capability (injectable transport, tested with fakes — same pattern as every prior adapter, no
real network call required to PASS the checker cycle); (2) as the actual proof this capability
works, run ONE real transcription against the cheapest/smallest real file
(`23rd-May-UniAccess-ATLAS-Skilltech.m4a`, 6.8MB) and report the real cost + a quality spot-check
in the manifest. **Scaling to the remaining 21 sessions is explicit, deliberate follow-up work**
(same "sequenced spend" language TASKS.md already used for T-003) — not automated in this unit,
so a human stays in the loop on real recurring API cost before the whole batch runs unattended.

## Criteria (each machine-checkable)

1. **`packages/ai/src/stt/gemini-file-upload.ts`** (new, alongside `gemini.ts`): the Gemini File
   API flow, behind its own small `UploadTransport` seam (the shared `Transport` type in
   `provider.ts` doesn't expose response headers, which the resumable-upload handoff needs — a
   deliberate, narrow addition rather than widening the shared type every other adapter depends
   on). `uploadFile(bytes, mimeType, transport, apiKey, displayName?): Promise<{fileUri: string,
   name: string}>` (resumable upload per Google's documented protocol: an initial POST to start
   the upload session reading the `x-goog-upload-url` response header, then a PUT with the raw
   bytes to that URL), `pollFileState(name, transport, apiKey): Promise<'ACTIVE'|'FAILED'|
   'PROCESSING'>` (single poll, not a sleep-loop — the CALLER retries), `transcribeUploadedAudio
   (fileUri, transport, apiKey, model?): Promise<{turns: Turn[], usage: {inputTokens: number,
   outputTokens: number}}>` (calls `generateContent` referencing the uploaded file by URI, same
   diarization-prompt convention as `gemini.ts`'s inline path, parses `[MM:SS] SpeakerName: text`
   lines from the response into `Turn[]` via an exported `parseDiarizedTranscript(text): Turn[]`
   pure helper — `tStart` from the parsed `[MM:SS]`, `tEnd` = the NEXT turn's `tStart`, and the
   LAST turn's `tEnd` = its own `tStart + 30` seconds, a documented fallback since the true end
   isn't known from timestamps alone). No real network call required by the test suite.
   **D-119 clarification (2026-10-09, approved by Umesh):** an optional verified positive finite
   media duration may bound only that inferred final end to `min(tStart + 30, duration)`, and
   only when `tStart < duration`. Unknown, omitted, nonpositive or nonfinite duration preserves
   the pure parser's legacy fallback; a start equal to or beyond duration remains invalid for
   the existing downstream timing guard. Intermediate ends, explicit provider boundaries,
   raw provider bytes, transcript text and speaker labels are preserved. Internal long-session,
   upload-submission and real-proof callers obtain the actual trusted local `ffprobe` duration
   and reject an invalid measurement before provider requests or transcript publication;
   supplied invalid duration at the provider-call entry also refuses before transport use.
   This narrow approved exception does not stretch incomplete long transcripts to media end
   or weaken existing timing/completeness validation. The prior 172-byte production response
   is the regression floor, replayed at 15s recording and 12.650958s extracted-audio durations.
2. **`scripts/transcribe-toc-session.mjs <sessionId>`** (new, real CLI tool, same `tsx/esm/api`
   pattern as `scripts/seed-toc.mjs`): resolves `<sessionId>` to its real audio file under
   `raw/TOC/TOC-Materials/Audio/`, uploads it via criterion 1's real functions (real transport
   this time — `apps/api/src/ai-transport.ts`'s pattern, or a local equivalent, using the real
   `GEMINI_API_KEY`), polls until `ACTIVE` (bounded retry with backoff, never an infinite loop —
   fails loudly after N attempts), transcribes, and writes the parsed turns into
   `data/toc-migrated/<sessionId>/turns.json` (REPLACING the placeholder `speakerRef: "unknown"`
   entries T-002 left there — the exact known limitation T-002's manifest disclosed). Prints the
   real token usage / cost estimate it gets back from the API.
3. **Real proof-of-concept run, reported honestly**: the manifest documents an ACTUAL real
   invocation of `scripts/transcribe-toc-session.mjs` against
   `2026-05-23-uniaccess-atlas-skilltech` (the smallest real audio file), with the real console
   output (upload confirmation, poll attempts, real usage/cost numbers from the API response) and
   a human-readable spot-check comparing 2-3 parsed turns against the actual audio content's
   known topic (UniAccess/ATLAS SkillTech session) for plausibility — not a claim of perfect
   accuracy, just evidence the pipeline produces real, sane, non-garbage diarized output.
4. **Tests exist and pass**: `packages/ai/src/stt/gemini-file-upload.test.ts` covering
   `uploadFile` (posts to the correct resumable-upload endpoints via the injected transport, no
   real network), `pollFileState` (maps a fake transport's status responses to `ACTIVE`/
   `FAILED`/`PROCESSING`), `transcribeUploadedAudio` (parses a fake `[MM:SS] Speaker: text`
   response into correctly-shaped `Turn[]`, computing `tEnd` from the next turn's `tStart` and the
   last turn's `tEnd` from a sane fallback — document the exact rule).
5. **No regression**: `pnpm -r typecheck`, `pnpm -r test`, `pnpm gen:types --check`,
   `python schema/validate.py`, `pnpm lint:structure` all clean.

## Non-goals for this unit
- Does NOT transcribe the other 21 sessions — that is deliberate, explicit follow-up (T-003b or a
  direct continuation once the proof-of-concept and its real cost are reviewed). No retry-with-
  backoff SLEEP inside the test suite (bounded, fast, fake-driven). No wiring into `apps/api`'s
  production `/ask` (T-003 is a data-backfill concern, not a request-time one). No change to
  `gemini.ts`'s existing inline-base64 path (kept for genuinely small audio, unchanged).
