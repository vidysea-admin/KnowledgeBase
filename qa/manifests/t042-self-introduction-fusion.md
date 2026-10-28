# Manifest — t042-self-introduction-fusion

**Handshake status:** checked-PASS
**Fix cycle:** 1
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

## Fix cycle 1 (against FAIL verdict, commit 7ee2745; fix commit ecb94ee; cycle-0 history above is kept)

Scope: only `speaker-tile-fusion.ts` and its test. No ledger status changes (ISS-T042FUSION-001/-002/-003 stay as filed; the checker closes them).

- **ISS-T042FUSION-001 (high):** `FUSION_DEFAULTS.allowTileOnly` is now **false** (tile-only label -> none, `source-disabled`). When enabled, the tile name must pass `cleanTileName`: leading titles (Dr/Mr/Mrs/Ms/Prof...) and a trailing decoration (` | X`, ` - X`, `(...)`) are stripped, and the remainder must be 1-4 tokens of letters only, capitalised, 2+ chars, not ALL-CAPS (so no digits, `@`, `&`, `.` inside, single initials, emails), pass `looksLikeAName` and `isDiscourseOnly` (speaker-name-rules, over `NEVER_A_PERSON` -- REUSED), pass core `nonPerson` (the aligner's device/room/guest list -- REUSED), and contain no word from a small NEW role/org/team/device list (`NOT_A_PERSON_WORDS`: vidysea, admissions, sales, support, student, corp, samsung, redmi, team, ...). No existing list covered org/role/device words, hence the new one. A non-person-shaped tile is treated as no tile evidence (`tileRefusal: "non-person-name"`), so a clean introduction still names the label as `intro-only`.
- **12-case replay** (checker's list verbatim, real aligner): default -> **0/12 named**. Tile-only enabled -> only `Rahul | Vidysea` -> `Rahul` and `Priya (Vidysea)` -> `Priya` are named; the other 10 none. Choice: with the owner-opt-in on, a first name left after stripping an org decoration is a real person name. The 13 other listed names also stay none by default; enabled, only `Priya - Vidysea`, `Priya Nair (she/her)`, `Dr. Priya`, `Mr. Rahul Verma` name (as Priya / Priya Nair / Priya / Rahul Verma). Residual: a single-token org like "Acme" is indistinguishable from a first name by shape, hence the default-off.
- **ISS-T042FUSION-002 (medium):** new test pins Raj/Rajesh Kumar, Raj Kumar/Rajesh Kumar, Ana/Anais, Pri/Priya, ya Nair/Priya Nair, Priya Nair/Priya Sharma (through fusion -> `tile-intro-conflict`) and Raj tile + Rajesh Kumar intro. The substring mutant survived cycle 0 because no test asserted any false-agreement pair.
- **ISS-T042FUSION-003 (low):** leading titles are dropped before agreement (a bare "Dr" has no tokens and agrees with nothing); a single token against a fuller name agrees only as the fuller name's FIRST token, so a bare surname ("Kumar") never agrees with "Rajesh Kumar". Returned names are title-stripped. Merged-label limit (one intro names every turn of the label) is unchanged and documented for the wiring unit.
- **Kept:** guard reuse, PH3-004 98/98 and PH3-006 85/85 + Makrand replays (tile-only enabled in the replay so the tile path is still exercised).
- **Evidence:** test file 18/18 (`node --test --import tsx src/pipeline/speaker-tile-fusion.test.ts`); `tsc --noEmit` in packages/index exit 0. Mutations (own harness inside the worktree, per-mutation byte backup in `finally`, 240 s timeout, hash-verified against HEAD after each): substring agreement KILLED, default tile-on KILLED, shape gate removed KILLED, title strip removed KILLED, surname-contiguous KILLED, role/org list removed KILLED, decoration strip removed KILLED, shape regex opened KILLED; both files' blobs equal HEAD after; harness deleted.
