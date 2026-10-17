# u2-4-suggestion-regate-w17

Status: ready-for-check
Fix cycle: 0
Lane: lane/w17-u24regate, base a0391420 (candidate SHA = the lane commit; see git log)
Issues: ISS-282 (NOT flipped; the checker judges). Evaluation only: no production write, no Mongo, no stored-speaker change.
Policy basis: orchestrator ruling (suggestion-only, every name human-confirmed, no phase-4 write). Provider: Ollama Cloud glm-5.3-flash first, deepseek-v4.1-flash fallback (never used), Gemini not used.

## Diagnosis of the recorded 0%
- Not id drift. `corpus-lock.mjs verifyCorpus()` passes on the 11 pinned sessions, block counts equal gold (240), and the c1 replay's call-count guard matched. data/toc-migrated was last touched 2026-10-09 (backup commit) and the lock hashes match.
- One real ordering mismatch found: in `2026-04-21-visa...` the file order differs from the tStart order that production passes (`apps/api/src/indexing/speaker-suggest.ts` sorts by tStart): 118 of 291 turns sit at another index; label sequence is identical (17 blocks), but block starts move by 1 (e.g. 80->81, 141->142). Gold block NUMBERS stay valid; turn INDICES do not. The new scorer derives blocks from the order the pipeline saw and throws if the two orders give different label sequences.
- Not a scoring bug: the cycle-0 8 wrong links were real acceptances (address/gratitude turns credited to the addressee), re-confirmed by the checker re-score. They came from the old window path, replaced since by the grounded gate (D-132). 04-regate-eval.mts / 05-score.mjs / 08-replay.mts still assume that window path (call index = window*3) and are not valid for the grounded path; left untouched.
- Conclusion: genuine defect of the old path, since replaced; the 0% does not describe the current suggestion path.

## What changed (harness + evidence only; qa/evidence/u2-4-phase3-precision-regate-2026-09-22/)
09-suggest-regate.mts (runs production extractSpeakersGrounded({suggest:true}) per pinned session, wx outputs, hard call cap, key read from main .env, never printed), suggest-score-lib.mjs + suggest-score-lib.test.mjs (6 tests), 10-suggest-score.mjs, run-results / call-log / measurement-summary `.u24regate-20261017.*` (call-log carries model text of every call, up to 6000 chars).

## Result (3 outer runs x 11 sessions, 294 provider calls in the scored process; cap 700; 0 fallbacks, 0 failures, 0 degraded)
| | Before (cycle-0 live, old window path) | After final tier | After suggested tier |
|---|---|---|---|
| outputs (session-run entries) | 8 | 3 | 12 |
| correct | 0 | 3 | 12 |
| precision | 0% | 100% | 100% |
| wrong links | 8 | 0 | 0 |
| recall (gold-named session/label/person pairs, 28; any run / every run) | 0 additions | 1/28 | 8/28 / 2/28 |
| session sets identical across 3 runs | no | 11/11 | 8/11 |
Per speaker (runs produced/correct): final: leeds spk:0 Jubin Thakkar 3/3 (deterministic-floor self-intro). Suggested: creative-futures spk:1 Priyanka Roy 1/1, spk:0 Priyanka Roy 1/1; in-focus-3 spk:1 Nikhil 1/1, spk:6 Bhakti 3/3; leeds spk:2 Nupur 1/1, spk:2 Alka 1/1, spk:1 Sangeeta 1/1; in-focus-4 spk:0 Bhakti 3/3.
Caveats: correctness is judged by the 2026-09-22 hand labels (gold-labels.json), unchanged. 12 outputs is a small sample: 100% precision on 12 entries (8 distinct pairs) does not show a 100% rate. glm output varies between identical calls (temperature 0/seed 42 is not deterministic on the cloud), so the 2-of-3 vote drops most proposals: recall is low by design. A first launch of this harness (killed with pkill, it survived) ran to completion unrecorded, its files deleted: about 240 extra calls whose output was discarded and is not scored.

## How to verify
- `node --test qa/evidence/u2-4-phase3-precision-regate-2026-09-22/suggest-score-lib.test.mjs` (6 pass)
- `node qa/evidence/u2-4-phase3-precision-regate-2026-09-22/10-suggest-score.mjs --tag <newtag>` re-scores (opens its output wx; pick a new tag) or re-derive the numbers by reading run-results.u24regate-20261017.jsonl.
- Live re-run: `node --import tsx .../09-suggest-regate.mts --tag <newtag> --runs 1,2,3 --cap 700` (needs OLLAMA_API_KEY in the main .env).
- `node scripts/lint-loc.mjs --all`: OK (10 stages, 0 failed).
