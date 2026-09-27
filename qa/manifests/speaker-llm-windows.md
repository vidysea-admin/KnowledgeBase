# Manifest — U2.4 phase 2+3: segment-scoped LLM candidates + no-write precision eval (2026-09-21)

Status: checked-PASS (see qa/verdicts/speaker-llm-windows.md)
Fix cycle: 0

**Unit:** phase 2 (bounded windowed LLM path + local routing pin) and phase 3 (no-write eval of
the frozen local model) of the ANSWERED speaker-segment-identity gate. Tier: 4 (roadmap U2.4).

## What changed (existing files only)
1. `packages/index/src/pipeline/speakers-llm.ts` — segment-aware windows IN PLACE:
   `buildSpeakerWindows()` builds one <=8-turn window per contiguous block (240-block semantics),
   with <=3 turns of before-context clamped so context never reaches into another unresolved
   block; long blocks chunk into <=8-turn windows sharing the block's true scope;
   `extractSpeakers` now issues one provider call PER WINDOW (not one session-wide prompt —
   the merge-across-people the gate measured as unsafe), keeps successful windows when some fail,
   reports partial failures via `degraded`, and degrades to the deterministic floor only when
   EVERY window fails.
2. `packages/ai/src/providers/ollama.ts` — opt-in per-job `structured` carrier: `format` (JSON
   schema passthrough to Ollama structured outputs), `options` (deterministic sampling), `think`
   (qwen3's reasoning block otherwise consumes the whole prediction budget: measured 1.5s/42
   eval-tokens with think:false vs empty content at 400 tokens without).
3. `config/ai-routing.yaml` — `speakers: [ollama]` (public models off identity adjudication).
4. `apps/api/src/production.ts` — ollama model pinned to the gate's frozen `qwen3:8b`
   (`SPEAKERS_OLLAMA_MODEL` override for tests), per the gate's "pin the speakers route to local
   Ollama".
5. Tests: 3 new window tests (window per block + before-context clamp; two blocks = two windows;
   window-failure degradation paths). 210 pass / 0 fail in packages/index; monorepo typecheck
   exit 0; apps/api 173/0.

## Phase 3 eval (NO writes, NO Mongo; direct Ollama, work outside the API)
Live runs against the frozen digest `qwen3:8b` (digest 500a1f067a9f), think:false,
temperature 0, seed 42, real TOC session `2026-04-21-visa-blueprint-part2-italy-france-nz`
(291 turns, 196 positional, 17 blocks, 37 windows):

- Raw-window probe (3 runs): NOT stable — run 1 vs runs 2-3 accept different name sets
  (`Dr. Anjali Mehta` / `Shagun Handa` / `Ruby Thomas` appear only in runs 2-3; some with zero
  valid citations); same label resolves to MULTIPLE names within one run. Latency ~270s/run.
- Shipped-pipeline probe (the real extractSpeakers with every shipped filter): ACCEPTED exactly
  one identity — `spk:0 -> "Ruby"` citing t205. **WRONG**: t205 is the moderator's handover turn
  ("I invite our next speaker, Ruby, from Uni-Italia"); the ground truth is spk:2 self-naming
  ("My name is Ruby", t206 — which the deterministic floor resolved correctly with blocks).
- **Phase-3 verdict: the 100%-precision bar FAILS today.** The inversion is filed as ISS-255
  (high). Nothing was written anywhere (phase 3 is no-write BY DESIGN); the write unit (phase 4)
  stays blocked until the precision gate holds. The contradiction refusal and verbatim filters
  worked as designed — the residual defect is the handover-direction semantics, a real, named,
  fixable rule, not noise.

## Honest scope
- The eval used ONE affected session (the visa session the gate itself cites). Whole-corpus
  3-run eval (~500 windows x 3) is future work once ISS-255's rule lands; this unit claims the
  harness, the measurement, and the verdict, not corpus-wide precision.
- Determinism across runs is NOT achieved by temperature+seed alone; ISS-255 records the
  2-of-3 agreement requirement for the eventual gate.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
