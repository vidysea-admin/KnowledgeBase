# Manifest — t042-speaker-tile-alignment

**Status:** ready-for-check
**Fix cycle:** 1
**Goal task:** T-042 "Speaker naming for webinar turns (Zoho tile names + intros + sync-speakers)", FIRST slice only. Tier 3 (roadmap) pull. Roadmap row (docs/meeting-bot-roadmap.md:69): "map `spk:N` to panelist names (Zoho tile names + self-introductions + existing `sync-speakers`)"; exit criterion "today's 4 panelists named correctly". NOT claimed: T-042 stays open.
**Round cap / classification:** the deterministic speaker-RULES seam in `packages/index` (self-introduction rules) has 14 speaker-related verdicts in `qa/verdicts` (`u2-4-*` and siblings), well past the cap of 2 PASSes for non-security polish. This unit is a DIFFERENT mechanism: aligning the meeting platform's displayed participant names to diarized turns by time, in a NEW pure module in `packages/core/src/domain`. It is a new feature slice of a roadmap task, not a finding-driven round on the rules seam, and it touches NO `packages/index/speaker-*` file. It is attribution-relevant (a wrong name is a fabricated attribution about a real person), so it gets full ceremony. If the checker reads the cap as seam-wide, raise a HUMAN_GATE.
**Date:** 2026-10-11 · **Lane:** T042TILE (no issues filed; `qa/issues.t042tile.jsonl` not created)
**Files (new only):** `packages/core/src/domain/speaker-tile-alignment.ts` (218 non-blank lines, budget 300), `speaker-tile-alignment.test.ts` (152), `speaker-tile-alignment.property.test.ts` (124) (tests 276 total, budget 400), this manifest. Package index NOT edited. `node scripts/lint-dirsize.mjs`: `lint-dirsize: OK (117 dir(s) within budget)`.

## Gap analysis confirmed
`grep -rn -i "active.speaker\|speaking.indicator\|participant.name\|\btile\b" packages/meeting-bot/src --include=*.ts` excluding tests printed nothing: NO active-speaker or tile-name capture exists. `grep` for generic-name lists ("zoom user", "conference room", "guest") in `packages/core` / `packages/schema` found none, so there is no exported non-name list to reuse; this module carries a small documented regex plus an injectable predicate. Nothing from `packages/index` is imported.

## Scope
`alignTileNamesToTurns(activeSpeakerLog, turns, options) -> { labels, errors }`. Pure, unwired, no I/O. For each diarized speaker label: at most one proposed display name, or NO name with a typed reason. The output never rewrites turns and carries provenance (turn ids, time range, seconds of agreement/disagreement).

## Input shape (conservative) and EVERY assumption about a capture that does not exist
Log: `{ tSec, displayName: string|null, confidence?, source? }[]`, `tSec` = seconds from session start, same clock as the turns. Turns: `{ id, tStart, tEnd, speakerRef }` with `speakerRef` the diarizer's anonymous label (`spk:0`).
Assumptions the future capture slice must meet or revisit:
1. A capture will exist that reads the platform UI (tile highlight / active-speaker DOM or API) from a live meeting. Unverified for Zoho/Zoom/Meet/Teams; each platform differs.
2. It samples PERIODICALLY (at least every `maxHoldSec` = 5 s) rather than only on change. A change-only log would be capped at 5 s per event and refused as thin coverage; raise `maxHoldSec` only with that capture design in hand.
3. Its clock is the same session-relative clock as the diarizer turns (CORRECTED in fix cycle 1: the cycle-0 claim that 1-3 s skew is tolerated was true only for long turns; see Fix cycle 1).
4. `displayName: null` (or blank) means "nobody highlighted"; the platform shows the participant's chosen display string verbatim (we do not know if a platform truncates, appends "(Host)", "(You)" or a role badge: such names are refused as role labels, a recall cost).
5. `confidence`, if the capture has it, is 0..1; below `minConfidence` an observation is a release, not a vote. `source` is validated as a string and otherwise unused in this slice.
6. During crosstalk the highlight credits every label whose turn overlaps; the module cannot tell who the platform meant, and refuses a name that wins two labels.
7. Turn timestamps are accurate enough that a 25%-coverage / 60%-agreement bar means something (T-044 drift fixes are separate).
8. The bot's own display name is known and passed as `botDisplayName`.

## Decision rules and defaults (all are named options, none hidden)
"Observed" = seconds of the label's turns during which SOME name was highlighted (non-person names count). Per-label turns are unioned so no second is counted twice.
| Option | Default | Rule and justification |
|---|---|---|
| `minNameSeconds` | 10 | top name needs >= 10 s: a few seconds is flicker or lag, not evidence |
| `minNameFraction` | 0.6 | top name >= 60% of the label's OBSERVED time (clear majority) |
| `maxRunnerUpFraction` | 0.2 | runner-up <= 20% of observed: a mid-meeting rename (<=20% under the old string) still names the dominant string; above that is refused. A runner-up that itself reaches `minNameSeconds` is `two-strong-names` (diarizer merge), else `runner-up-too-strong` |
| `minCoverageFraction` | 0.25 | observed time must cover >= 25% of the label's total turn time, so a name cannot rest on a sliver of the label's talk |
| `maxHoldSec` | 5 | an observation holds until the next one, capped, so one stale sample cannot claim minutes |
| `minConfidence` | 0.5 | weaker observations are releases |
| `botDisplayName` | none | excluded (case-insensitive, normalised) -> `bot-own-name` |
| `isNonPersonName` | none | injectable; ORed with the defaults, so it can only add refusals; a throwing predicate refuses |
Cross-label: a name that would win two labels is refused for BOTH (`name-on-multiple-labels`): the diarizer split one person or two people share a device. No cascade re-evaluation. A top name that is a non-person string (device/room/role words, phone numbers/no letters, > 100 chars, control or bidi characters) -> `non-person-name`; this is checked on the winner among ALL names, so a label whose top highlight is "iPhone" is never given the runner-up. Check order: no-observations, insufficient-coverage, bot-own-name, non-person-name, insufficient-duration, runner-up (two-strong-names / runner-up-too-strong), insufficient-fraction, then the cross-label pass. Boundary comparisons carry a 1e-9 float epsilon. Equality of names: NFC + whitespace collapse + trim ONLY (no case-folding, no title stripping: "Priya" and "priya", "Dr. Priya Nair" and "Priya Nair" are different names and refuse each other). The default non-person set is a small documented regex (iphone ipad android galaxy pixel macbook laptop room guest host co-host presenter panelist attendee participant notetaker recorder bot dial-in phone unknown speaker moderator admin zoom webex), word-bounded ("Roomi Khan" and "Meet Shah" pass). Cost: "Priya (Host)" is refused; conservative by design.

## Display-name claim, NOT identity; owner policy left open
A named label returns `{ kind: "display-name-claim", source: "platform-display-name", verified: false, displayName }`. It means only "the platform DISPLAYED this string while this voice was speaking". Display names are untrusted user-chosen strings (a participant can rename to the host's name or to a public figure's); a malicious or mistaken string is returned as data and never interpreted. No `person:` entity, id or alias is created. Whether, when and how a display-name claim may be mapped to a `person:` entity (and what to do about impersonation, e.g. requiring host-confirmed names or a second signal) is a SEPARATE decision that needs the owner's policy (D-052 territory: Umesh's ruling that ambiguous place/person names need a contextual signal and that a wrong name must be refused over guessed). Not decided here.

## NOT done
No capture of tiles or active-speaker state (needs a live meeting, browser and per-platform DOM work). No wiring, no import from anywhere, package index untouched. No mapping to `person:` entities. No change to the existing speaker rules or `sync-speakers`. Self-introduction fusion (second T-042 signal) not done. T-042 stays open in TASKS.md and goal.json (not edited).

## Next slices
1. Capture: a meeting-bot observer that samples the active-speaker indicator (needs a live Zoho/Meet/Teams meeting and a decision about each platform's selector; produces the log shape above plus a measured sampling interval and clock offset).
2. Owner policy ruling on display-name claims to `person:` (host-confirmed names, impersonation handling, roster cross-check).
3. Wiring: a read-only pipeline stage that runs this on a session, stores claims with provenance next to (never over) turns, and feeds the existing speaker alias path only after the ruling.
4. Fusion with self-introduction and `sync-speakers`: agreement raises confidence, disagreement refuses.
5. Calibration of thresholds against the 4-panelist session from a real capture.

## Evidence
Node: codex runtime on PATH. From `packages/core`:
`node --test --import tsx src/domain/speaker-tile-alignment.test.ts src/domain/speaker-tile-alignment.property.test.ts`
```
scale ops=373790 (naive would be 1000000000)
tests 19 / pass 19 / fail 0   (all 19 listed names show a check mark)
```
Tests (named): 4-panelist fixture (claim shape, evidence 60 s agree / 0 disagree, turn ids t0,t4, range 0-150); lag 1-3 s; rename mid-meeting at the threshold (20/100 accepted, 21/100 refused, 5/100 accepted, 30/100 refused, small runner-up under 10 s); diarizer split; diarizer merge; bot name (and it is the option that excludes it); device/room/role/phone/bidi/control/long names (16 refused strings; 5 real names pass); injectable predicate; thresholds (9 s refused, 10 s accepted, 20% coverage refused, fraction taken from observed time); flicker (10% tolerated, 50% refused, low-confidence samples are releases); max hold (5 s cap, 100 s log gap is not a hold); normalisation (NFC equal, case and titles distinct, case preserved in output); overlapping turns; empty inputs; no mutation of inputs.
Oracle: `oracle: per-(label,name) overlap seconds agree on 400 seeded small meetings` passes: the oracle walks half-second slots and picks the latest observation at or before each slot, an independent second way to compute seconds per (label, name); equality is exact on the 0.5 s grid, across maxHold in {1, 2.5, 5, 10}.
Invariants over 600 seeded meetings (pass): no name on two labels; every named label recomputes all thresholds from its own returned evidence; agree + disagree = observed; claim always `verified:false`, `source: platform-display-name`; shuffling both input arrays gives a byte-identical `labels`.
Scale: 50,000 observations x 20,000 turns (20 labels): 373,790 counted operations (binary-search steps + holds visited), asserted < 700,000, versus 1,000,000,000 for a naive pairing. Sorting is O(n log n + m log m) and not counted (same convention as the sibling module).
Hostile: NaN/Infinity/negative/string times, non-string names, bad confidence/source, empty/duplicate ids (every duplicate refused), wrong labels, bad options -> typed errors, never a throw; `__proto__`, `constructor`, `toString`, `hasOwnProperty` as names AND ids AND labels come back as plain data and `Object.prototype` is not polluted; a 10,000-char name, a bidi-override name and a control-character name are refused (`non-person-name`) and returned verbatim as inert candidate data.
`node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` in packages/core: exit 0, no output.

## Mutations (13, all killed; harness was a lane-private untracked script, deleted before commit)
Per mutation: byte backup, mutate, run both test files with a 240 s hard timeout, restore in `finally`, `cmp` equal, and `git hash-object` equal to the pre-run blob `624c5beb00e43c523d8d3d9188ebf4e513a38f35` after every one (final check also equal). Killers:
| # | Mutation | Killed by (test names) |
|---|---|---|
| M1 | runner-up check removed | invariants; rename mid-meeting; diarizer merge; normalisation |
| M2 | minimum duration removed | invariants; thresholds |
| M3 | one name allowed on two labels | invariants; diarizer split; overlapping turns |
| M4 | two-names-one-label (refuse only when runner-up beats top, i.e. picks the first on a tie/near-tie) | invariants; rename; diarizer merge; normalisation |
| M5 | bot's own name not excluded | the bot's own display name |
| M6 | hold bound removed | oracle; thresholds; max hold |
| M7 | fraction against total meeting time | thresholds (40 s of 100 s, all agreeing) |
| M8 | case-folding introduced | normalisation (and many others, since output case changes) |
| M9 | output marks verified identity | 4-panelist fixture; invariants |
| M10 | non-person check removed | device/room/role names; injectable predicate; hostile |
| M11 | coverage check removed | thresholds (20% coverage) |
| M12 | confidence floor ignored | flicker/low-confidence |
| M13 | same-label overlapping turns double counted | oracle; overlapping turns |

## Known limits for the checker
Per-label union ignores which of two same-label overlapping turns is "right" (only affects which turn id carries the seconds). The firstEndingAfter binary search assumes holds sorted by end, which holds because holds are disjoint and time-ordered. Names with ZWJ/ZWNJ are allowed (legitimate in Indic scripts); other format characters are refused.

---

# Fix cycle 1 (verdict `qa/verdicts/t042-speaker-tile-alignment.md`, FAIL cycle 0; ISS-T042TILE-001 high, -002 medium)

## What failed, and why a fixed-lag assumption was wrong
Cycle 0 compared each turn with the log AS GIVEN. The platform highlight lags speech by an unknown, varying delay. When a turn is not much longer than that delay, the leading seconds of the highlight belong to the PREVIOUS speaker, so the wrong name takes 75-83% of a label and the 0.2 runner-up cap does not save it: 2 speakers x 4 s turns x 3 s lag gave 10/10 swapped names (4 speakers x 6 s x 5 s lag: all four swapped). "1-3 s lag tolerated" held only because the cycle-0 test used 30 s turns. Fixing a lag value (or trimming) cannot work because the lag is unknown: the requirement is that the answer must not DEPEND on it. (002) Observations at the same tSec with different names were ordered by name and the alphabetically last silently won.

## The stability rule (precisely)
1. Option `maxLagSec`, default 6 (the checker swapped names at 3 s and 5 s; 6 gives room), valid 0..30.
2. Shift set: lag in {0, 0.5, 1.0, ..., maxLagSec} (13 shifts at the default). At shift L an observation at t is credited to speech at t - L (log moved earlier). Step 0.5 s: seconds per (label, name) are piecewise linear in L, so the grid can miss the true worst case by at most 0.5 s per turn boundary; negligible next to `maxHoldSec` (5 s) and next to any turn long enough to carry the 10 s minimum.
3. Per label, the whole v0 threshold chain (minimum seconds 10, fraction 0.6, runner-up cap 0.2, coverage 0.25, non-person, bot) runs at EVERY shift. A name is proposed only if the SAME name passes the chain at ALL 13 shifts (worst case, never the best shift). If some shift would name and not all agree: `lag-unstable`. If no shift names, the lag-0 reason is reported unchanged.
4. Cross-label: a name (compared by `foldKey`) that wins two labels at ANY shift is refused for both (`name-on-multiple-labels`).
Evidence (named labels only): the v0 fields at lag 0 plus `lagStability {maxLagSec, stepSec, shifts, worstWinnerFraction (min over shifts), worstRunnerUpFraction (max), minAgreeSec (min)}`.
Edge-trim alternative (ignore the first/last `maxLagSec` of each turn, drop turns under 2x that) is NOT implemented: it assumes the lag is within the trim and gives no signal when it is not; it discards 12 s of every turn at the default whether or not it matters, and refuses nothing that stability does not already refuse (a trimmed middle dominated by the other name is also a stability failure). Redundant for safety, costly for recall; not combined, so nothing untested ships.
Complexity: K shifts, K <= 101 (13 stable + 40 diagnostic at the default = 53; at the cap 61 + 40). Each shift is one binary search per effective turn plus the holds it covers; holds are built once. Total O(K (m log n + covered holds)), K constant, still near-linear. The operation-count test keeps its bound, now per shift: 20,000 turns x 50,000 observations = 19,870,161 ops over 53 shifts = 374,908 per shift (v0: 373,790 for one shift), asserted < 700,000 x shifts. A second scale test (4,000 x 50 s turns) names all 20 labels at 6,139,856 ops.

## The conflict rule (002)
Observations within `CONFLICT_EPS_SEC` = 1e-6 s of the first of a group that DIFFER (two names, or a name and a release) are an ambiguous instant: they collapse to ONE release, so the interval counts for no name and lowers coverage; never ordered by name. Equal names at one instant (after NFC/whitespace) are one observation. `meeting.conflictInstants` counts them. Recorded repro (Anna + Zed at each of 60 s): no name, `observedSec` 0, 60 conflict instants (`no-observations`). Anna + null: no name.

## The misalignment rule and its limit
Agreement A(L) = sum over labels of the top name's seconds at shift L. Scanned at the 13 stable shifts and at the outer lags -1..-10 and maxLagSec+1..maxLagSec+30 (step 1; bounded, 40 extra shifts). If the best outer value exceeds the best stable value by more than `misalignMarginFraction` (default 0.02) of all label seconds, the meeting gets NO names: every label `timeline-misaligned`, `meeting.status = "timeline-misaligned"`, with `meeting.diagnostics {inRangeBestLagSec, inRangeAgreementSec, outOfRangeBestLagSec, outOfRangeAgreementSec, gainSec, marginSec}`. A negative best lag (highlight BEFORE speech, physically implausible) is the first symptom covered. Why the TOP name's seconds only: an earlier (top minus rest) variant rewarded pushing the minority name off the edge of the turn and refused healthy small cases.
Limits, measured: offsets -10, -3, +10, +30 s are refused on a strict 4-speaker round robin (20 s turns) and on 395/400, 17/400, 400/400, 400/400 random mixed meetings. A structure-PRESERVING offset outside [-10, +36] is undetectable: 2 strict speakers with 30 s turns and a -30 s offset are named SWAPPED with `status: ok` (asserted by the test `DOCUMENTED LIMIT`). The shared or measured clock stays a wiring precondition.

## Normalisation keys (item 5)
`foldKey` = NFKC, upper-then-lower case (full case-fold approximation; merges sharp s and long s), NFKC again, whitespace collapsed, trimmed. Used for EXCLUSION ONLY (the bot's name; the non-person regex is applied to the NFC form and the NFKC form, so fullwidth "Admin" is excluded) and for the cross-label REFUSAL ONLY ("Priya" / "priya" / "PRIYA" / fullwidth "Priya" on two labels: both refused). Both can only add refusals. The returned claim keeps the displayed string (NFC + whitespace as before: "PrIyA" returns "PrIyA"). Inside one label names still pool by NFC + whitespace only, so case twins there stay two candidates (`two-strong-names`).

## Simulation (oracle-known; `speaker-tile-alignment.sim.test.ts`)
Ground truth first: 2-8 speakers, random alternation, turn lengths 1-10 s (short), 1-120 s log-uniform (mixed), 20-120 s (long); the log is DERIVED: true lag uniform in [0, 6], per-sample jitter up to 0.5 s, flicker to a random participant up to 10%, dropouts up to 30%, sampling every 1-5 s, silence gaps, plus +-0.3 s noise on the turn boundaries handed to the function. Asserted: every proposed name equals the ground-truth name of that label.

| meetings | labels | named | wrong | meetings `timeline-misaligned` |
|---|---|---|---|---|
| short-turn 1200 | 5,972 | 97 (1.6%) | 0 | 156 |
| mixed 1200 | 5,895 | 4,995 (84.7%) | 0 | 36 |
| long-turn 1200 | 5,857 | 5,822 (99.4%) | 0 | 1 |

Total 3,600 meetings, 17,724 labels, 10,914 named, ZERO wrong. No threshold or margin was tuned: the first run was already zero. The recall cost is the point: short-turn meetings almost never get a name (1.6%) because when turns are of the order of the lag the evidence cannot say who is who.
Beyond `maxLagSec` (a measured limit, NOT a guarantee): true lag 6-7.5 s mixed: 231/5,791 named, 0 wrong, 1,138/1,200 meetings refused as misaligned. True lag 6.5-10 s: short 0/2,932 named, mixed 0/3,009, long 358/2,997, 0 wrong (600/600, 600/600, 530/600 meetings refused as misaligned). On these seeds no wrong name appears past the range, but nothing proves it: a lag beyond `maxLagSec` could produce a wrong name where it flips the winner without producing a gain above the margin. `maxLagSec` is conservative at 6 s; raise it (never lower it) if the capture is slow.
Constant offsets, random mixed meetings (400 each): -10 s 13 labels named, 395 meetings refused, 0 wrong; -3 s 1,658 named, 17 refused, 0 wrong; +10 s and +30 s 0 named (all refused), 0 wrong. Fixed seeds: a measurement, not a proof (see the swapped strict-2-speaker case above).

## Limits left open
True lag beyond `maxLagSec`; undetectable structure-preserving offsets; thresholds and margin uncalibrated against a real capture; the 0.5 s grid approximates the exact worst case; a single long label under a wrong highlight is still indistinguishable from a right one (cycle-0 note); display names remain untrusted claims.

## Wiring preconditions (restated from the verdict, plus the new ones)
1. A shared clock, or a measured offset reported by the capture; the stage must refuse or shift when unmeasured (this function detects some offsets only).
2. Calibrate thresholds (10 s, 0.6, 0.2, 0.25, 5 s, maxLagSec, margin) on a real captured session with known speakers.
3. Owner (Umesh) ruling on display-name claims to people (host-confirmed names, impersonation, roster cross-check).
4. Never write a claim into a `person:` field, alias or speaker rename; store beside turns with provenance.
5. Person mapping must compare names case-folded, NFKC and confusable-skeletoned (`foldKey` covers case and compatibility forms only, NOT cross-script homoglyphs such as a Cyrillic first letter).
6. The capture emits AT MOST ONE highlighted name per sample (a multi-person highlight must be split by a documented rule or reported as a release); simultaneous different names are treated as a release here.

## D-015 counts (the issues' own recorded reproductions)
- ISS-T042TILE-001: 2 speakers, turn/lag 4/3, 3/3, 5/5, 6/5: 0 wrong of 10 label decisions each, 0 named, all `lag-unstable`; 10/10 (lag beyond the range): 0 wrong of 10, `timeline-misaligned`; 4 speakers 6 s / 5 s lag: 0 wrong of 20, `lag-unstable`. Refused-or-correct 6/6 recorded cases. The issue's seeded sweep (400 meetings, lag 0-5 s, mean turn 3-28 s, 2-4 speakers; the checker's seeds are not recorded, so this is my generator of that shape): 0 wrong of 626 named labels (1,188 labels).
- ISS-T042TILE-002: Anna + Zed at every second of 0-59 on a 0-60 label: not named (`no-observations`, 0 observed s); Anna + null: not named. 2/2.
- No recorded reproduction left open.

## Assertions changed in the 19 earlier tests (old -> new, why)
1. `empty and missing inputs`: `deepEqual(..., {labels:[],errors:[]})` -> also `meeting: {status:"ok",conflictInstants:0,shiftsEvaluated:13,diagnostics:null}` (the result gained a `meeting` field).
2. `rename mid-meeting` and `thresholds`: exact-boundary arithmetic (20/100 accepted, exactly 10 s, 20% coverage, fraction of observed, no-observations) now runs with `maxLagSec: 0` (lag 0 only). Under stability a limit-exact split cannot stay exact at all 13 shifts (it is `lag-unstable` by design), so the boundary arithmetic is still tested where it is exact; the stable-range behaviour is covered by the new tests.
3. `scale`: asserted 20 named labels -> asserts 0 named (5 s turns are lag-sensitive) and the bound 700,000 per shift x shifts; a new long-turn scale test names all 20.
4. `hostile input` prototype-key block: 20 s turns -> 60 s turns (so the labels resolve under stability). `oracle`: models the rule that coincident different observations are one release.
No other assertion changed.

## Mutations (15, all killed; lane-private harness, deleted before commit)
Per mutation: byte backup, mutate, run the test files with a 240 s hard timeout, restore in `finally`, byte compare, `git hash-object` equal to the pre-run blob after each; final blobs equal.

| # | Mutation | Killed by |
|---|---|---|
| M1 | stability check removed (shift-0 verdict only) | ISS-T042TILE-001 recorded reproductions; thresholds apply at the WORST shift; scale |
| M2 | only lag 0 and maxLag checked, not the range | recorded reproductions; long turns resolve + evidence; misalignment; scale; empty inputs |
| M3 | thresholds at the BEST shift | recorded reproductions; worst-shift test; cross-label under shifts; invariants |
| M4 | two-labels refusal at lag 0 only | cross-label refusal is evaluated under every shift |
| M5 | simultaneous conflict resolved by sort order | ISS-T042TILE-002 repro; simultaneous observations; oracle |
| M6 | conflict interval counted for both names | ISS-T042TILE-002 repro; simultaneous observations; oracle |
| M7 | negative-lag diagnostic removed | misalignment test; scale |
| M8 | exclusion without NFKC/case-fold | exclusion and refusal keys |
| M9 | refusal key not case-folded | exclusion and refusal keys |
| M10 | `verified` set true | 4-panelist fixture; invariants |
| M11 | non-person regex without the NFKC form | exclusion and refusal keys |
| M12 | equal simultaneous names counted as conflict | simultaneous observations; oracle |
| M13 | misalignment margin ignored | misalignment margin test (survived the first run; test added; then killed) |
| M14 | misalignment rule removed | misalignment test |
| M15 | evidence fractions not the worst case | long turns resolve + evidence |

## Evidence
Node: codex runtime on PATH. From `packages/core`:
`node --test --import tsx src/domain/speaker-tile-alignment.test.ts src/domain/speaker-tile-alignment.property.test.ts src/domain/speaker-tile-alignment.lag.test.ts src/domain/speaker-tile-alignment.sim.test.ts`
```
scale ops=19870161 over 53 shifts (naive pairing would be 1000000000)
scale-long ops=6139856 over 53 shifts
tests 34 / pass 34 / fail 0
```
`node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` in packages/core: exit 0, no output. `node scripts/lint-dirsize.mjs`: `lint-dirsize: OK (117 dir(s) within budget)`.
Files (non-blank lines; budgets 300 source / 400 tests): `speaker-tile-alignment.ts` 248, `speaker-tile-names.ts` 27, `speaker-tile-scan.ts` 59; tests `.test.ts` 155, `.property.test.ts` 144, `.lag.test.ts` 166, `.sim.test.ts` 100. Nothing under packages/index, the package index, qa/contracts, qa/verdicts, enforcement paths, TASKS.md or ledger statuses was touched.
