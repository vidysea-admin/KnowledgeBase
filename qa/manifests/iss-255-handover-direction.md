# Manifest — ISS-255 fix: handover-direction rule (2026-09-21)

Status: checked-PASS (see qa/verdicts/iss-255-handover-direction.md)
Fix cycle: 0

**Unit:** fix the critical handover inversion found by the U2.4 phase-3 eval. Tier: 2 (open
ledger issue, high severity, identity/data-write class).

## What changed (existing files only)
1. `packages/index/src/pipeline/speaker-name-rules.ts` — `HANDOVER_MARKERS` (invite/next speaker/
   next presenter/hand over/over to/take us forward/...) + `SELF_NAMING_CUES`; `hasNamingCue`
   refuses every cue branch except an explicit self-naming when a handover marker sits in the
   before-context of the name occurrence. Rationale recorded inline (ISS-255).
2. `packages/index/src/pipeline/speakers-llm.test.ts` — the two ISS-094 corpus rows that pinned
   the old belief ("Our next presenter is Nilesh Gotecha.", "Over to Ruby") are SUPERSEDED to
   refusal tests with the full reason in a comment (ISS-255 fix_direction applied, not a silent
   edit); the boundary test's handover text swapped to a non-handover form ("My name is Ruby").
3. `packages/index/src/pipeline/speaker-name-rules.test.ts` — 3 NEW ISS-255 reproduction tests:
   the recorded moderator-handover case refused; the real speaker still self-names through the
   handover; self-naming survives when a marker is also present.

## D-015 measurement against the recorded corpus
ISS-255's own live reproduction (the visa session, t205/t206): re-run AFTER the fix —
- `qa/probes/speakers-shipped-eval.mts` (real Ollama, real shipped extractSpeakers): resolves
  NOTHING for that session (correct conservative refusal) instead of the WRONG `spk:0 -> Ruby`
  identity it shipped before the fix.
- `qa/probes/deterministic-floor-check.mts`: the floor still resolves `spk:2 -> "Ruby"` citing
  t206 ("My name is Ruby") with its block scope — the ground truth preserved.
- The ledger corpus conflict is resolved EXPLICITLY: two ISS-094 rows pinned the measured-false
  belief; they are superseded in place with the reason, and the supersession is recorded here and
  in the ISS-255 row.

## Evidence
- packages/index: 213 pass / 0 fail. Monorepo typecheck: exit 0. Monorepo tests: fail 0 x8.
- Live re-run: the inversion no longer ships; nothing was written to Mongo (no-write discipline).

## Honest scope
- The handover rule's corpus-level recall cost is bounded and recorded: two recorded handover-form
  rows are now refusals for same-label proposals. If a future checker measures a real recall loss
  from this (a recorded introduction that should ship), that is a new ledger row with evidence,
  not a silent revert.
- The 2-of-3 run-agreement requirement for the LLM path (ISS-255 fix_direction (2)) is recorded
  for the phase-3 gate re-run; it is NOT implemented in this unit (no further model wiring without
  the precision-gate unit).

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
