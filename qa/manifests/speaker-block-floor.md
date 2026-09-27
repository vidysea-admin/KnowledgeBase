# Manifest — U2.4 segment-aware speakers, phase 1: deterministic block floor (2026-09-21)

Status: checked-PASS (see qa/verdicts/speaker-block-floor.md)
Fix cycle: 0

**Unit:** implement phase 1 of the ANSWERED speaker-segment-identity gate (Option A): identity
evidence becomes block-scoped, never label-wide. Tier: 4 (roadmap U2.4, gate answered by Umesh
2026-09-21 with the persona end-state note recorded in the gate file).

## What changed (existing files only, per the gate's plan)
1. `packages/index/src/pipeline/speakers.ts` — `ResolvedSpeaker` gains
   `blocks: { startTurnIndex, endTurnIndex }[]` (turn-index windows of the contiguous block(s)
   holding the verbatim self-naming evidence); `resolveSpeakers` computes contiguous speaker
   blocks over the full turn list (a block ends at any label change or named turn) and scopes
   each identity to the block(s) containing its citing turns. The verbatim rule, contradiction
   refusal, and "leave low-confidence unresolved" behaviour are UNCHANGED.
2. `packages/index/src/pipeline/speakers-llm.ts` — the LLM path's pushed identity now carries
   the same block scoping, sourced from the deterministic floor for the same speakerRef/name
   (its identity decisions were already re-filtered by the verbatim rule above).
3. `packages/index/src/pipeline/speaker-docs.test.ts` — fixtures updated to carry blocks.
4. `packages/index/src/pipeline/speakers.test.ts` — 4 NEW block-scoping tests:
   - resolved identity carries the citing block's turn-index window;
   - a RECURRING label is NOT one person: only the evidence block is claimed (the gate's exact
     visa-session shape: spk:N recurs around named participants);
   - an identity never spans a block interrupted by a named turn;
   - two separate self-naming blocks of the same label+name claim BOTH blocks.

## D-015 measurement against the recorded corpus
The gate's own measured evidence re-verified live before coding: 494 positional turns form
**240 contiguous blocks** across **29 session/label pairs** (probe run against
`data/toc-migrated/*/turns.json`) — exactly the gate's numbers. The recurring-label test
mirrors the gate's concrete example (spk:N recurring around Kanchan/Shagun in the visa session).
No ledger-recorded reproduction exists for THIS unit (it is a new gate-approved phase, not a
bug fix); the gate's evidence itself is the reproduced corpus.

## Evidence
- `pnpm --filter @lkb/index test`: **207 pass / 0 fail** (203 prior + 4 new).
- `pnpm --filter @lkb/index typecheck`: exit 0.
- `pnpm -r typecheck`: exit 0. `pnpm -r test`: all 8 packages fail 0.
- Corpus probe: `positional turns: 494 | contiguous blocks: 240 | session/label pairs: 29`.

## Honest scope
- NO schema change, NO Mongo write, NO model call (phase 1 only — the gate's phase order).
- `scripts/sync-speakers.mjs` measurement (block/turn-based coverage) is phase-1.5 work with the
  next unit; this unit does not touch the sync script yet (its current label-wide 78/494 number
  is unchanged and still honest for what it measures).
- Persona + knowledge-profile fields are the phase-4 write unit's target (recorded in the gate).


**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
