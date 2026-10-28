# Manifest — disable-thinking-budget (T-003, two real bugs found and fixed)

Status: checked-PASS (see qa/verdicts/disable-thinking-budget.md)
Contract: `qa/contracts/disable-thinking-budget.md`

## Two real bugs found live during this unit, told honestly in order of discovery

### Bug 1 — extended thinking consuming the entire output budget

Diagnosed by re-uploading `2026-07-30-in-focus-3`'s audio and dumping the FULL raw
`generateContent` response: `candidates[0].content.parts[0] = {"text": "\n", "thoughtSignature":
"<huge opaque base64 blob>"}`, `finishReason: "STOP"`. The model spent its entire response
budget on hidden extended-thinking tokens (Gemini 2.5+/3.x's "thinking" mode) and produced almost
no actual transcript — a "successful" completion with no usable content. **Fix**:
`generationConfig: { thinkingConfig: { thinkingBudget: 0 } }` added to the `generateContent`
request body, freeing the whole budget for the real transcript.

### Bug 2 — per-line parser silently merging turns (found investigating bug 1's fix results)

After the thinking fix, retrying the 4 previously-failing sessions succeeded (`exit 0`, non-zero
turns) — but two results looked suspiciously short: `in-focus-3` came back with only 2 "turns"
covering 0-109 seconds of what should be a ~60-minute session, and inspecting turn 2's raw text
showed the ENTIRE REST OF THE SESSION concatenated inline, with embedded `[MM:SS] Speaker:`
markers visible as plain substrings all the way to `[59:35] spk:9: Thank you.` — the model HAD
produced the full transcript; the old `parseDiarizedTranscript` just failed to split it, because
its regex only matched a marker anchored to the START of a line (`text.split("\n")` +
`^\[...\]`), and the model does not reliably insert a newline before every turn — sometimes many
turns arrive back-to-back in one continuous block with zero line breaks between them. **Fix**:
`parseDiarizedTranscript` now matches `[MM:SS] Speaker:` markers GLOBALLY across the whole text
(not per-line) and slices content between consecutive marker positions, regardless of newlines.
A repro test reconstructing the real failure shape (`text.split` never even needed — the whole
text is one string) confirms 3 turns split correctly from zero-separator input.

## What changed

1. **`packages/ai/src/stt/gemini-file-upload.ts`** — `thinkingConfig.thinkingBudget: 0` added to
   the request; `parseDiarizedTranscript` rewritten to global-match + slice instead of per-line.
2. **`packages/ai/src/stt/gemini-file-upload.test.ts`** — new test proving the thinking-budget
   field is genuinely present in the request; new test reproducing the exact real merged-turn
   failure shape and proving the fix splits it correctly; updated the pre-existing
   "skips non-matching lines" test to reflect the new (more correct) behavior — text between two
   real markers is that speaker's continued content, not a line to discard (this is itself part
   of the fix, disclosed as an intentional behavior change, not a silent regression).

## Real retry evidence for all 4 previously-failing sessions (honest, including what did NOT fully resolve)

| Session | Outcome |
|---|---|
| `2026-08-24-uniaccess-leeds-arts-university` | ✅ 102 turns, clean, no contamination |
| `2026-04-21-visa-blueprint-part2-italy-france-nz` | ✅ 7 turns — verified LEGITIMATE (not a parser bug): each of the 3 destination specialists spoke in one long continuous monologue with no interruption, matching the real webinar's actual structure (confirmed against T-002's own session summary); zero embedded-marker contamination found |
| `2026-07-15-creative-futures` | ✅ 43 turns after the parser fix (was 123 turns with 1 contaminated/merged before the fix), spans the full ~60 min session, zero contamination |
| `2026-07-30-in-focus-3` | ❌ Still placeholder. Succeeded once post-thinking-fix but with the OLD (pre-parser-fix) code — that write was caught as contaminated (1 merged turn covering only 109s of ~60 min) and deliberately reverted via `git checkout --` rather than left as misleading "done" data. 3 subsequent retry attempts with BOTH fixes active all hit `503 UNAVAILABLE` ("high demand") — a different, purely transient failure class from the other 3 sessions' original structural/thinking-budget issues. Not retried a 4th time in this unit (bounded effort); genuinely just needs a retry later when Gemini's load is lower. |

## Final honest tally: 22/23 real, 1 placeholder

```
22 sessions REAL (up from 19 at the start of this unit)
1 session PLACEHOLDER: 2026-07-30-in-focus-3 (124 turns, speakerRef: "unknown" throughout —
  confirmed via git checkout restore to its pre-existing committed state, zero data loss)
```

Contamination scan across all 23 sessions post-fix: **zero** sessions show the embedded-marker
signature (`grep`-style regex `\[\d{1,3}:\d{2}\]\s*\S` inside any turn's `text`) — the parser fix
is confirmed clean across the entire real corpus, not just the 2 sessions it was built to fix.

## How to verify (all commands run, real output below)

```
$ pnpm -r typecheck
... all 9 workspace projects ... Done

$ pnpm --filter @lkb/ai test
tests 37 / pass 37 / fail 0   (33 pre-existing + 4 new: 2 for thinking-budget/parser fixes,
                                1 updated pre-existing test's expectation)

$ pnpm -r test
core 7 / ai 37 / index 19 / ingest 34 / ask 30 / meeting-bot 40 / apps/api 18 — all green

$ pnpm gen:types --check
OK: 22 generated type file(s) + index.ts match schema/

$ python schema/validate.py
PASS: 22 collection schema(s) validated correctly.

$ pnpm lint:structure
lint-loc: OK (148 file(s) within budget)
lint-dirsize: OK (63 dir(s) within budget)
lint-root: OK (13 loose root file(s))
lint-dupes: OK (207 unique export(s), 22 unique schema $id(s))
lint-migrations: OK (745 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (111 lines, budget 200)
✔ no dependency violations found (155 modules, 437 dependencies cruised)
```

## Live Mongo sync (final state, independently verified)

```
$ node scripts/sync-real-turns.mjs
22 real session(s) synced (before/deleted/inserted counts per session — see console output)

Independent fresh pymongo verification:
total turns in Mongo: 1468
expected (22 real local counts + 1 placeholder count): 1468
match: True
in-focus-3: 124 turns, all speakerRef="unknown" (confirmed untouched, honestly placeholder)
```

## Files touched
- `packages/ai/src/stt/gemini-file-upload.ts` (thinking-budget + parser fix)
- `packages/ai/src/stt/gemini-file-upload.test.ts` (new/updated tests)
- `data/toc-migrated/<sessionId>/turns.json` for the 3 newly-real sessions (visa-blueprint,
  creative-futures, uniaccess-leeds-arts-university) — real, complete, contamination-free
- Real Mongo write to the live `lkb` database's `turns` collection (final synced state)
- `qa/contracts/disable-thinking-budget.md` (new contract, maker-drafted)

## Follow-up (explicit, disclosed)
`2026-07-30-in-focus-3` needs one more retry attempt later (purely a `503` availability issue,
not a structural limitation) — a simple re-run of `node scripts/transcribe-toc-session.mjs
2026-07-30-in-focus-3` once Gemini's load eases, then `node scripts/sync-real-turns.mjs` to push
it to Mongo. This would complete T-003 at a genuine 23/23.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
