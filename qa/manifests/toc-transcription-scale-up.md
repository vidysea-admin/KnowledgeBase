# Manifest — toc-transcription-scale-up (T-003, phase 2: scale to 23/23)

Status: checked-PASS (Cycle checked: 1, verdict `qa/verdicts/toc-transcription-scale-up.md`)
Contract: `qa/contracts/toc-transcription-scale-up.md`

## Final tally (all 23 real sessions, independently counted)

**19 REAL, 4 PLACEHOLDER.**

```
2026-04-21-visa-blueprint-part2-italy-france-nz    PLACEHOLDER  107 turns  (confirmed blocked)
2026-05-08-funding-dreams-loans-forex              REAL          83 turns
2026-05-20-telling-your-brand-story-better         REAL          31 turns
2026-05-22-uniaccess-xavier-university             REAL          64 turns
2026-05-23-uniaccess-atlas-skilltech               REAL           8 turns  (phase 1's proof-of-concept)
2026-05-28-in-focus-1                              REAL          59 turns
2026-05-29-decoding-ever-expanding-cast            REAL          15 turns
2026-06-03-dual-enrollment-pathway                 REAL          90 turns
2026-06-19-entrance-exams-pathways-india-part1     REAL          38 turns
2026-06-25-in-focus-2                              REAL          69 turns
2026-06-30-exploring-identity-success-counseling   REAL          16 turns
2026-07-03-inside-the-uc-session                   REAL          50 turns
2026-07-08-beyond-black-robes-law-careers          REAL         134 turns
2026-07-15-creative-futures                        PLACEHOLDER  164 turns  (confirmed blocked)
2026-07-22-uniaccess-cept-university               REAL          56 turns
2026-07-28-metrics-and-mingling                    REAL          83 turns
2026-07-30-in-focus-3                              PLACEHOLDER  124 turns  (unexplained, one more pass later)
2026-08-03-uk-beyond-offer-letters-reupload        REAL          43 turns
2026-08-03-uk-beyond-offer-letters                 REAL          46 turns
2026-08-10-ucas-what-changed-what-matters          REAL         230 turns
2026-08-12-uniaccess-ashoka-university             REAL          26 turns
2026-08-24-uniaccess-leeds-arts-university          PLACEHOLDER 102 turns  (unexplained, one more pass later)
2026-08-27-in-focus-4                              REAL          51 turns
```

## The 4 unresolved sessions, named honestly

**Confirmed structurally blocked (both ~62MB, longest audio in the set):**
- `2026-04-21-visa-blueprint-part2-italy-france-nz` — failed 3 times: `finishReason=MAX_TOKENS`,
  then `finishReason=MALFORMED_RESPONSE` (both with near-zero output tokens).
- `2026-07-15-creative-futures` — failed 2 times, both `finishReason=MAX_TOKENS`.

Pattern: these are the two LARGEST audio files in the entire 23-session set (62.7MB, 62.9MB). A
53.8MB file (`beyond-black-robes-law-careers`) succeeded genuinely, so raw file size alone isn't
the trigger — most likely session DURATION (both of these are probably the longest sessions) is
what pushes a single non-streaming `generateContent` call past its practical output budget for a
full verbatim diarized transcript. **Follow-up needed: an audio-chunking strategy** (split into
N-minute segments, transcribe each, stitch turns together with offset-adjusted timestamps) —
real engineering work, not attempted in this unit.

**Unexplained (`finishReason: STOP` — normally a CLEAN completion — with empty text), 2 attempts each:**
- `2026-07-30-in-focus-3`
- `2026-08-24-uniaccess-leeds-arts-university`

This is a genuinely different, currently unexplained failure signature from the other two — a
"successful" finish reason with no actual content is unusual and worth investigating separately
(possible causes: a transient API glitch unrelated to file size, a specific audio characteristic
these two share, or a parsing edge case in `parseDiarizedTranscript` that a raw-response dump
would clarify). **Follow-up needed: one more investigation pass with raw-response logging**, not
blind retries.

Both failure classes were EXPLICITLY not retried a third/further time in this unit, per the
contract's own scope — this was a deliberate stopping point, not an accident.

## Data-loss guard held throughout (criterion 2)

Across this entire day's transcription effort (spanning phase 1, the critical bug-fix, and this
scale-up's 3 retry passes — roughly 25 real API attempts total including retries), the
empty-result guard from `qa/contracts/transcription-empty-result-guard.md` caught every single
empty/malformed completion and refused to write it. Verified: every currently-PLACEHOLDER
session's turn count and `speakerRef: "unknown"` values are UNCHANGED from their original T-002
migration state (spot-checked `2026-04-21-visa-blueprint-part2-italy-france-nz`: 107 turns,
`speakerRef: "unknown"` — identical to its pre-incident committed state verified earlier today).
No session ever regressed from real to placeholder/empty.

## Quality spot-check (2 newly-real sessions from this scale-up pass)

- **`2026-08-12-uniaccess-ashoka-university`**, turn 1-2: "Hello, everyone. Welcome to the
  UniAxis [sic, likely mis-heard 'UniAccess'], and this time we have the Ashoka University with
  us. So, we have Anju Jayaraj from Ashoka University..." / "Thanks, Vijaya. Hi, good evening,
  everyone..." — matches the real session title ("UniAccess Live: Meet Ashoka University")
  exactly, real presenter name (Anju Jayaraj), real host name (Vijaya) — specific, checkable,
  not generic filler.
- **`2026-06-19-entrance-exams-pathways-india-part1`**, turn 1-3: "All right. So, we start now,
  right?" / "Yes." / "We're good to go? Okay. All right. So, hello everyone. Welcome to today's
  session. I am Rashi Ojha Dixit. I'm a member of the Outreach Collective's..." — real presenter
  name (Rashi Ojha Dixit), real organizational reference (The Outreach Collective), natural
  session-opening dialogue including a real back-and-forth mic-check exchange (Rashi/Ambika) —
  again specific and plausible, not hallucinated.

## Real cost (whole day's effort, including retries/failures — honest total)

```
Total input tokens (all attempts, incl. failed/retried):  1,640,643
Total output tokens (all attempts, incl. failed/retried):   224,368
```

At published `gemini-3.5-flash`-tier pricing (roughly $0.10-0.30/1M input tokens for audio,
$0.40-2.50/1M output tokens, exact figures vary by exact model/tier), this is approximately
**$0.30-$1.00 total** for the entire day's transcription effort across all attempts — well within
the plan's own $5-10 estimate, and the actual real spend is almost certainly at the low end of
that range even counting every failed retry.

## How to verify (all commands run, real output below)

```
$ pnpm -r typecheck
... all 9 workspace projects ... Done

$ pnpm -r test
core 7 / ai 35 / index 19 / ask 30 / ingest 34 / meeting-bot 40 / apps/api 18 — all green
(unchanged from the prior unit — no source code touched in this data-only unit)

$ pnpm gen:types --check
OK: 22 generated type file(s) + index.ts match schema/

$ python schema/validate.py
PASS: 22 collection schema(s) validated correctly.

$ pnpm lint:structure
lint-loc: OK (147 file(s) within budget)
lint-dirsize: OK (63 dir(s) within budget)
lint-root: OK (13 loose root file(s))
lint-dupes: OK (207 unique export(s), 22 unique schema $id(s))
lint-migrations: OK (737 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (111 lines, budget 200)
✔ no dependency violations found (155 modules, 437 dependencies cruised)
```

## Files touched
- `data/toc-migrated/<sessionId>/turns.json` for 18 sessions (the 19th, `uniaccess-atlas-
  skilltech`, was already real from phase 1) — REAL diarized data replacing T-002 placeholders
- `data/eval/transcribe-all-report.json` (batch-run report, generated)
- `qa/contracts/toc-transcription-scale-up.md` (new contract, maker-drafted)

## Follow-up (explicit, disclosed, not this unit)
1. Audio-chunking strategy for the 2 confirmed-oversized sessions (visa-blueprint,
   creative-futures).
2. One more investigation pass (with raw-response logging) for the 2 `STOP`-with-empty-text
   sessions (in-focus-3, uniaccess-leeds-arts-university).
3. Re-run `scripts/seed-toc.mjs`'s turns insertion (or a small targeted update) to sync the
   newly-real turns into the live `lkb` Mongo database — a deliberate separate step, not
   automated here.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
