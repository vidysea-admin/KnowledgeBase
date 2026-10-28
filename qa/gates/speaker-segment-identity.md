# HUMAN_GATE — segment-aware speaker identity

**Question:** Should U2.4 replace the unsafe session-wide `spk:N -> person` assumption with
turn-block/segment-scoped identity evidence before any further speaker resolution is accepted?

## Evidence that makes this a product/data-model decision

Across the 11 affected sessions, 494 positional turns form **240 contiguous speaker blocks** but
only 29 session/label pairs. Twenty-two pairs recur; nine have conflicting named neighbours. In the
visa session alone, `spk:0`/`spk:1` recur around Kshitij, Shagun, Bhakti, and Kanchan. Therefore a
single session-wide label can cover multiple people, and counting every turn with that label as one
resolved person would create false identity links.

## Proposed phased implementation, all in existing files

1. **Correct the deterministic floor first.** In
   `packages/index/src/pipeline/speakers.ts` (`ResolvedSpeaker`, `SpeakerResolution`,
   `resolveSpeakers`) represent the exact turn block to which identity evidence applies; update the
   existing speaker tests and `scripts/sync-speakers.mjs` measurement so resolved-turn coverage is
   block/turn based, never label-wide.
2. **Add local candidate generation only after that foundation PASSes.** In
   `packages/index/src/pipeline/speakers-llm.ts` (`buildCitableTranscript`, `extractSpeakers`) use
   bounded <=8-turn windows and strict structured output; extend the existing naming-cue rules and
   tests; make `packages/ai/src/providers/ollama.ts` pass schema plus deterministic local options;
   pin the `speakers` route to local Ollama in `apps/api/src/production.ts` and
   `config/ai-routing.yaml`.
3. **Evaluate without writes.** Hand-label the 240-block corpus, run the frozen local `qwen3:8b`
   digest three times with no Mongo/job writer, and require 100% accepted identity precision, zero
   wrong label/name/citation links, deterministic-floor preservation, stable accepted facts, and at
   least one correct addition.
4. **Keep persistence separate.** Do not change `schema/`, rewrite `turns.speakerRef`, or persist
   model-derived identities until an independent checker PASSes that precision gate and a later
   write unit is separately approved.

This follows `ARCHITECTURE.md` H3/H4 and the brain pages `eval-workflow` and
`multiple-eval-pipelines`: define the real target, use hand-labelled production-shaped gold, and
separate component precision, workflow linkage, safety, and operational evals.

## Options

- **A — segment-aware plan (recommended).** Build the four phases above through separate
  maker/checker units.
- **B — deterministic only.** Keep the current verified identities but correct the reported
  coverage so it does not treat a label as a whole-session person; do not use an LLM.
- **C — keep session-wide mapping.** This accepts the measured false-merge risk and will be recorded
  as an explicit product decision; no implementation will silently assume it.

**Answer format:** `speaker-segment-identity: A`, `speaker-segment-identity: B`, or
`speaker-segment-identity: C`.

**Blocks:** U2.4 model expansion and any model-derived speaker write. It does not block other
catalogue work.

**Opened:** 2026-09-09T18:00:46+05:30 after corpus block measurement and fresh AI-engineering review.

**Answered:** 2026-09-21 — **A (segment-aware plan)**. Umesh approved the four-phase plan, with an
added product direction recorded alongside it: every resolved speaker should ultimately carry a
**full persona + knowledge profile** (their organisations, roles, topics, and cited claims), not
just a display name. That persona end-state is the target data-model shape for the eventual
speaker write unit; it does NOT change the phase order here — the deterministic block floor
(phase 1) and no-write precision eval (phase 3) still come first, and `schema/` changes stay
behind the separate approved write unit (phase 4).

**Gate status:** ANSWERED — recorded inline: 2026-09-21 — **A (segment-aware plan)**. Umesh approved the four-phase plan, with an
