# Manifest — ISS-255 (2): 2-of-3 run agreement on the LLM speaker path (2026-09-21)

Status: checked-PASS (see qa/verdicts/speaker-run-agreement.md)
Fix cycle: 0

**Unit:** implement the stability mechanism ISS-255's fix_direction requires before the phase-3
precision gate can re-open: window sampling runs AGREEMENT_RUNS=3 times and only identities
proposed by >=AGREEMENT_THRESHOLD=2 runs reach the evidence filters.

## What changed (existing files only)
1. `packages/index/src/pipeline/speakers-llm.ts` — the window loop runs 3x; votes are keyed on
   (speakerRef, lowercased displayName) so casing variants vote together; a (label, name) pair
   proposed in fewer than 2 runs never proceeds; total-failure and no-array degradations
   reference the new call count; partial window failures still report via `degraded`.
2. Evidence merge across runs deduped (one copy per turn id) — a same-turn recurrence across
   runs no longer triple-counts.
3. 2 NEW tests: a 1-of-3 proposal is refused while the 3-of-3 identity ships; evidence merges
   across runs without duplication.

## D-015 measurement
The recorded reproduction is ISS-255's own live evidence (run 1 vs runs 2-3 instability on the
visa session). The voting layer is the direct implementation of the recorded fix_direction (2).
Live re-run of the shipped pipeline on the visa session (3 internal runs, ~389s): still NO
accepted identity — the unstable proposals (1/3 votes) are refused and the session resolves
nothing, which is the correct conservative outcome while the floor keeps `spk:2 -> Ruby`
(deterministic-floor-check probe re-run, unchanged).

## Evidence
- packages/index: 215 pass / 0 fail. Typecheck: exit 0. Monorepo tests: fail 0 x8.
- Live: shipped-eval probe (3-run voting) + floor-check probe re-run, no writes.

## Honest scope
- Voting stabilises ACCEPTANCE but does not by itself make the LLM path precision-pass the gate:
  the write unit (phase 4) stays blocked until the precision re-gate measures 100% accepted
  precision + zero wrong links on the hand-labelled corpus, per the answered gate's phase 3.
- Latency: 3x window runs (~389s for one session with qwen3:8b on CPU). Recorded for the gate
  design; no optimisation claimed.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
