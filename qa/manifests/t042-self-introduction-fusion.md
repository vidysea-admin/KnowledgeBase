# Manifest — t042-self-introduction-fusion

**Handshake status:** ready-for-check
**Fix cycle:** 0
**Goal task:** T-042 "Speaker naming for webinar turns", slice 2 of 3 remaining (self-introduction fusion). Tier 3 (roadmap) pull. NOT claimed: T-042 stays open.
**Lane:** T042FUSION (no issues filed; `qa/issues.t042fusion.jsonl` not created)
**Files (new only):** `packages/index/src/pipeline/speaker-tile-fusion.ts` (127 lines), `speaker-tile-fusion.test.ts` (182), this manifest. No existing file edited (no speaker rule file, no `grounded.ts`, no package index).

## Placement decision (coordinator-approved, option 1)
The merged aligner is `packages/core/src/domain/speaker-tile-alignment.ts`, but the self-identification guards live in `packages/index/src/pipeline` (`speaker-selfid-rules.ts`, `speaker-reported-rules.ts`, `speaker-relation-rules.ts`). `.dependency-cruiser.cjs` rule `core-imports-nothing` forbids core -> index; `ask-index-ingest-only-ai-db-core` allows index -> core. So the fusion is a NEW file in `packages/index/src/pipeline` that imports the alignment types and `foldKey`/`normalizeDisplayName` from `@lkb/core` and the guards from the same directory. `depcruise --config .dependency-cruiser.cjs packages/index/src`: `no dependency violations found (146 modules, 365 dependencies cruised)`.

## Guards reused (no new self-id parser)
`selfIntroductionCandidates` (proposes names) then `citesNameAsSelfIdentification` (relationGate: quoted/reported refusal `isReportedAt`, base naming cue, whole-sentence allow-list `isCleanSelfIdentificationAt`, whole-turn second-introduction refusal `turnHoldsOtherSelfIntroduction`, name-shape checks). A name is intro evidence only if a turn, judged ALONE, passes. Reported speech yields no evidence and no veto.

## Fusion rules (per diarized label; a wrong name is worse than none)
agree -> name (fuller of the two, basis `agree`); tile only -> `tile-only`; intro only -> `intro-only`; tile vs intro differ -> none (`tile-intro-conflict`); 2+ distinct intro names in the label -> none (`intro-names-conflict`; "Priya" vs "Priya Nair" count as two, as in the base); tile refused as `two-strong-names` / `runner-up-too-strong` / `name-on-multiple-labels` -> none (`tile-contradicted`); other tile refusals (no data, thin coverage, lag-unstable, non-person, misaligned) = no tile evidence; final name agreeing with another label's final name -> none for both (`name-on-multiple-labels`). Agreement = folded equality or contiguous whole-token containment either way. Output is a CLAIM (`verified:false`), never a `person:` entity. Per-turn output carries the label's name with the turn's own tStart/tEnd; provenance (turn ids, from/to) per source. Options `allowTileOnly`, `allowIntroOnly` (default true), `maxTurnChars` 50,000.

## Decisions left open (owner)
1. Tile-only naming rests on an untrusted display name (impersonation); the aligner's thresholds are the only defence. `allowTileOnly:false` is the switch.
2. Partial-name agreement ("Priya" vs "Priya Nair") is on by default; stricter exact-only would need a change.

## Evidence (from `packages/index`)
`node --test --import tsx src/pipeline/speaker-tile-fusion.test.ts`: `ℹ tests 14 / pass 14 / fail 0`.
D-015 replay through the fusion path (each recorded reproduction: no intro evidence, no name without a tile, never basis `agree` with a tile):
`PH3 replay ISS-PH3-004: refused 98/98` (7 forms x 14 names); `PH3 replay ISS-PH3-006: refused 85/85` (17 forms x 5 names) plus the Makrand row `I am Rashi and this is Makrand Rajadhyaksha.` -> no names, no turn name. A test asserts every replayed literal is present in the `qa/issues.ph3.jsonl` rows. A "not vacuous" test shows 5 clean introductions DO name. Other tests: agreement, tile only, intro only, conflicts, two-labels clash, reported speech, turn boundaries (cue at end of one turn + name at start of next = nothing), timestamps/order/shuffle-invariance, real aligner end to end, hostile input.
`tsc --noEmit -p tsconfig.json` in packages/index: exit 0. `lint-dirsize`: no pipeline/index entry flagged (pre-existing apps/api, scripts/lib overages unrelated).
Mutations (9 incl. one retest, all killed after adding the nested-turn case for M8): drop guard (3 fail), force agree (2), ignore multi-intro (1), no cross-label clash (1), ignore tile-contradicted (1), allow duplicate ids (1), weak agreement (4), sort-by-start removed (1, after test added). Each: backup, mutate, test with timeout, restore, `cmp` equal to the pre-run copy.

## NOT done
No live tile capture; no wiring into `sync-speakers` or the live runner (D-119); no `person:` mapping. T-042 stays open in TASKS.md / goal.json (not edited).
