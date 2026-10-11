# Manifest — t042-speaker-tile-alignment

**Status:** ready-for-check
**Fix cycle:** 0
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
3. Its clock is the same session-relative clock as the diarizer turns (the lag test shows 1-3 s skew is tolerated; a larger or drifting offset is not corrected here).
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
