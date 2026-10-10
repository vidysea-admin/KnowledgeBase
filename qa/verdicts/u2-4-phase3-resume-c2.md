# Verdict - u2-4-phase3-resume-c2

## Cycle 3 (current)

VERDICT: FAIL
Cycle checked: 3
Date: 2026-10-10 · Checker (independent; did not build the unit) · Candidate: lane/ph3 d5c8912 (base 536a56a)
Judged against: qa/contracts/speaker-resolution-llm.md (unchanged; C14 still deferred to the Approver), qa/gates/speaker-segment-identity.md phase-3 bars, D-015, security class (uncapped).
Manifest: qa/manifests/u2-4-phase3-resume-c2.md (Fix cycle 3). The live gate was not run and was not attempted. No model, no network, no browser, no full suite.

### Why FAIL (not HOLD)
The two cycle-2 defects are fixed: every recorded reproduction is refused, no path bypasses `relationGate`, and there are 0 predicate-level lane-only acceptances. But the extended grid I built (template classes the maker's grid does not contain) finds a NEW critical defect, ISS-PH3-004, that only the lane ships when the model cites the neighbouring turn: the self-identification route ships reported speech, a question and an address form as the speaker's own name.
Reproduction (extractSpeakers, injected complete `[{speakerRef:'spk:0',displayName:'Nikhil',turnIds:['t2']}]`, turns `[spk:0 "He said I am Nikhil.", spk:0 "I think so, yes.", spk:1 "ok"]`): BASE refuses, LANE SHIPS spk:0 -> Nikhil. Same for "She told us, I'm Nikhil.", "He said: I am Nikhil, and left.", "People go, I am Nikhil, and stall.", "I was told my name is Nikhil.", "Do you think I am Nikhil?", "I am, Nikhil, still waiting for the slides." (and, with spk:1 owning the text, citing t2: spk:1 -> Nikhil). Cited directly at t1 the base ships these too (inherited cue defect), but the lane's block-location path (cycle 1b: a cited turn only LOCATES a block) turns the base's refusal into a shipment. `relationGate` applies `isReportedAt` only to the third-party routes; self-identification gets `isQuotedAt` plus the base cue, and `hasNamingCue` strips commas and reads "do you think I am Nikhil" as "i am" + name.

### Merge-safety answer
"Is it safe to merge lane/ph3 ahead of the live run?" **NO**, by the stated definition (merging cannot add a wrong attribution): ISS-PH3-004 is an input on which the lane ships a wrong name and the base does not. Everything else I could construct is either base-equal or a correct or D-052-accepted attribution (below). The defect is small and local (see its fix_direction); once closed with the seven texts in the grid, the answer is expected to be YES with the recall cost in section 5.

### 1. The 304 lane-only acceptances (OWN_BLOCK_SELF_ID)
Reproduced: `node --test --import tsx src/pipeline/speakers-differential.test.ts` (timeout 170, 12 s, 5/5 pass) prints
`DIFF predicate: 1280 cells, base accepts 450, lane accepts 152, lane-only 0`
`DIFF end-to-end: 15360 cells, base ships 2700, lane ships 608, lane-only 304 (on allow-list 304 [["OWN_BLOCK_SELF_ID",304]], NOT allowed 0), base-only (recall lost) 2396`.
I replayed the same grid (copy of its constants, scratch probe) and dumped all 304. Every one is layout `same-turn` (152) or `own-block-other-turn` (152); the label is spk:0; the label's OWN turn is a self-identification ("My name is X and I lead admissions." 50, "Hi all, X here." 50, "Good morning everyone, X speaking." 50, "I am X from the admissions team." 50, "Hello, I'm X." 50, "I'm in <place> today and my name is X." 50, "This is X speaking on the panel." 4, multi-token names only); and in all 304 the model CITED THE TRAILING spk:1 turn "ok" (t2 or t3), a turn that merely sits next to the block. The lane locates spk:0's adjacent block and ships the name from spk:0's own self-identification; the base needs the cited turn to contain the name, so it refused. Never on a label that does not own the text (0 cells, whole-grid check in section 2).
Names: 14 persons (two multi-token) = 172 cells, genuine self-introductions of a person: correct by the contract. 11 place/org/calendar names (Paris, Mumbai, India, Delhi, London, Dubai, Google, Amazon, Vidysea, English, Diwali; 132 cells), e.g. "Hi all, Amazon here.", "Hello, I'm Google.", "I am Dubai from the admissions team.", "My name is India and I lead admissions.": explicit self-naming cues, which D-052 ruling 2 (Approved-by Umesh) deliberately keeps so a real person named Paris resolves. The base ships the same text when the model cites it directly, so this is inherited residue, not new, but I cannot call these correct.
Sample of 40 spread over names, templates and layouts (printed by my probe): 25 genuine person self-ids (judged correct), 15 place/org-named self-ids (D-052 residue: unverifiable, plausibly wrong), 0 reported, negated or question forms. Those forms are not in the maker's grid, which is the gap (ISS-PH3-004, ISS-PH3-005).

### 2. Extended grid, base vs lane through extractSpeakers (mine)
44 names (14 persons, 30 place/org/discourse/role/closed-class) x 56 templates x 7 layouts x 2 proposed labels x every cite.
Templates: genuine self-id; negation "I am not X", "My name is not X"; not identity "I am with X", "I am next to X", "I am X's colleague", "If I were X", "I am sure X will join"; address "I am, X, ..."; reported or quoted "He said I am X", 'He said "I am X"', "She told us, I'm X", "People go, I am X", "I was told my name is X"; question "Am I X?", "Do you think I am X?", "Is my name X?"; place or org "This is X's view", "I am in X today", "This is India speaking on the panel"; plus handover, thanks, address and quoted forms.
Layouts: own turn; own block + other turn; own mid-block; preceding turn; following turn; both neighbours; own block + third-person mention.
Result, 108,416 cells: lane ships 14,040, base 15,744; lane-only 8,424; base-only 10,128; ships on a label that does not own the text: base 7,872, lane 0.
- Refused by both, as required: "I am not X", "My name is not X", "I am with X", "I am next to X", "I am X's colleague" (apostrophe is a name joiner, so no occurrence), "If I were X", "I am sure X will join", "Am I X?", "Is my name X?", 'He said "I am X"' (the lane's quote guard; the base ships it), "This is India speaking on the panel.", "This is X's view", and every word in NEVER_A_PERSON (Everyone, Team, Not, To, Welcome, Sorry, Monday, Hi).
- Lane-only WRONG, person names: exactly seven forms, 1,212 cells (ISS-PH3-004, critical): "He said I am X." / "She told us, I'm X." / "He said: I am X, and left." / "People go, I am X, and stall." / "I was told my name is X." / "Do you think I am X?" / "I am, X, still waiting for the slides." Plus "This is Makrand Rajadhyaksha Sharma's view." for multi-token names. The same seven forms with 22 place/org names.
- Both ship (inherited, listed so the owner sees them): the same seven forms when cited directly; role words Chair, Moderator, Host, Admin, Panel, Sir and org names under "I am X." / "Hello, I'm X.".
- Cycle-2 grid (30 x 22 x 4): its templates are a subset of the maker's committed grid (32 names x 40 templates x 5 layouts), which I ran in full (above): predicate 0 lane-only; end to end 304 lane-only, all OWN_BLOCK_SELF_ID. The maker's numbers are true; the grid is incomplete.

### 3. The gate is the only path; the differential test
- Callers: `grep -rnE "citesNameAs|hasNamingCueAt|namingTurns|relationGate|RELATION_ROUTES|isReportedAt|isQuotedAt"` over the repo, excluding tests and the frozen copy: `speakers-llm.ts` imports only `namingTurns`; `namingTurns` calls only the three predicates, each of which is `relationGate(...)`; `hasNamingCueAt` is called only inside `relationGate`; `index.ts` exports only looksLikeAName / isDiscourseOnly / containsNameVerbatim / citesNameAsAnIntroduction (the base cue, called by no production code). No legacy path and no direct inner check. `speaker-reported-rules.ts` is used only by the gate.
- Route switch: `routes` is a defaulted parameter of the gate and an optional parameter of the three predicates, i.e. a default, not an invariant. Only tests pass it; production cannot reach it today (not exported through index.ts, `namingTurns` passes none). `RELATION_ROUTES` is typed Readonly but not frozen. Filed low (ISS-PH3-005). Mutations: handover ON killed, thanks ON killed, gate ignores the switch killed.
- Frozen-base fidelity: `diff <(git show 536a56a:packages/index/src/pipeline/<f>.ts) frozen-base-536a56a/<f>.mts` differs only in the 2-line "FROZEN REFERENCE" header plus: speaker-name-rules line 25 `./speaker-name-data.js` -> `./speaker-name-data.mts`; speakers-llm lines 27-28 `./speakers.js` -> `../speakers.js` and `./speaker-name-rules.js` -> `./speaker-name-rules.mts`; speaker-name-data none. Nothing else. The lane's speakers.ts and speaker-name-data.ts are unchanged versus base.
- `.mts` outside budgets: 124 + 289 + 344 lines (10,490 + 17,257 + 18,029 bytes). `structure.config.json` counts only `.ts/.py/.mjs` for loc and `.ts` for dupes; nothing treats this directory specially, so `.mts` does keep a 344-line file out of the 300-line counter and its exports out of the dupes counter. The manifest discloses it. I judge it a legitimate test fixture (a verbatim reference never imported by production code, needed because the comparison runs the whole base `extractSpeakers`, which a golden table cannot), not a dodge; it is a budget-evading mechanism by construction and the Approver may prefer a `git show` of the base at test time.
- Would the differential test catch a weakening? With the nine-file set: handover ON killed, route switch ignored killed, self-id skips base cue killed, quoted guard dropped killed (by another file). Differential test ALONE: handover ON killed (3 fail), self-id skips base cue killed (2), route switch ignored killed (2), but "drop the quoted-speech guard" SURVIVES it (fail 0). Its allow-list premise ("the base accepts the same turn cited directly") also licenses any lane-only shipment the base would ship when cited directly, so it cannot see ISS-PH3-004 (ISS-PH3-004/005).

### 4. D-015 by issue id (mine; recorded texts verbatim, every cite t1..tn)
Probe `d015.mts` (scratch): predicate level (looksLikeAName && !isDiscourseOnly && any of the three relation predicates) and end to end in six layouts: single turn; same turn; own block + other turn; preceding turn; following turn; preceding turn with the label = the speaker.
- ISS-104: 20 recorded attacks: lane 0/20 shipped (20/20 refused) at predicate level and in all six layouts; base ships 1/20 (India) at predicate level and in every layout. Open: none.
- ISS-282: `node --import tsx qa/probes/iss282-c0-replay.mts` -> `--- ISS-282 recorded wrong links refused: 8/8` (reads the recorded cycle-0 model text; offline).
- ISS-PH3-001: 3/3 recorded texts refused (predicate level and all six layouts). ISS-PH3-002: 6/6 refused (predicate level and all six layouts).
- ISS-093: the 20-case corpus is still asserted in speaker-name-rules.test.ts (106/106 pass; the gazetteer is empty).
- ISS-094 / ISS-098 (the Prasanti / Doris Day / Priya address forms cycle 2 rewrote): now asserted REFUSED for the addressee at the speaking label, which is the contract's direction (an address names the person ADDRESSED, ISS-282). The genuine forms (greeting or address to the NEXT speaker) are no longer shipped at all, since the handover and thanks routes are OFF. That matches the contract; it is a recall decision (section 5).
- ISS-255: replay `ISS255 "4/4"`, wrongPairs 0. True, but because the routes that produced the bad pairs are OFF, as the maker says; agree.
- ISS-283 not delivered. ISS-289 relational scorer and ISS-290 as in cycle 2. ISS-PH3-003: the lock now has an automated test (`node --test qa/evidence/u2-4-phase3-precision-regate-2026-09-22/corpus-lock.test.mjs`: 4/4) and the no-op mutation is killed (2 fail); the unpinned-session and 01-block-stats parts of the row remain open.
- Left open by name: ISS-PH3-004 (above), and the inherited D-052 residue of place/org names under explicit self-naming cues.

### 5. Recall cost, measured
Replay of the recorded c1 model text: `node --import tsx qa/evidence/u2-4-phase3-precision-regate-2026-09-22/08-replay.mts --from c1 --tag c3chk` then `05-score.mjs --tag c3chk --raw-tag c1`. I read both first: they import only node:fs / node:path, the lane's own source and corpus-lock; no fetch, no provider call, no spawn. Outputs deleted afterwards. The base row is the same script with its import pointed at the frozen base `speakers-llm.mts` (scratch copy).
| Code | accepted | correct | wrong identities | wrong evidence pairs | additions |
|---|---|---|---|---|---|
| lane d5c8912 | 3 | 3 | 0 | 0 | 0 |
| BASE 536a56a (frozen copy, same replay) | 15 | 0 | 15 | 15 | 0 |
Counts are per session-run (3 runs). The base accepts five wrong identities in every run: Sonal (atlas-skilltech spk:0), Priyanka Roy (creative-futures spk:0), Shithij (in-focus-3 spk:1), Bhavya (uk-beyond spk:4), Jubin (leeds spk:3). The lane accepts one identity per run, Jubin Thakkar spk:0 (leeds; already covered by the deterministic floor), correct. So on the recorded corpus merging loses NO correct attribution and removes all 15 wrong ones. The cycle-2 lane's 12 correct names were never in production; they are what the OFF routes gave up. Phase-3 bar 5 (at least one correct addition) is not met even offline: additions 0.
Synthetic base-only cells, committed grid: 2,396. My rule-based classification of all of them (crude): 2,204 wrong attributions rightly refused (750 quoted or reported, 726 place/org/closed-class names, 378 another speaker's self-id or mention credited to the label, 350 address or introduction naming someone else), 24 CORRECT attributions now lost ("This is Nikhil speaking on the panel." by the label that speaks it: 12 persons x 2 layouts; the lane needs "X speaking" to open the clause, the price of ISS-104's "This is India speaking on the panel."), 168 PLAUSIBLE but unverifiable (an address or introduction of a person in the turn before the label's block: "Good morning Nikhil, please go ahead.", "Please welcome Sonal.", "Let me introduce Sumit.", "Ruby, what do you think about this?"; correct when the next block really is that person; with no gold I do not count them). A stratified 40-cell sample (printed by my probe) gave 6 correct-lost, 6 plausible-lost, 28 rightly refused.
Plain statement: the recall cost on the recorded corpus is zero correct names. The synthetic cost includes correct attributions in principle ("This is X speaking" and the next-speaker address class, which the base ships today), none of which occur in the recorded corpus.

### 6. Tests, types, budgets, mutations
- Each `node --test --import tsx src/pipeline/<file>.test.ts` under `timeout 170` from packages/index: speaker-relation-rules 10/10, speaker-relation-ledger 8/8, speakers-differential 5/5, speakers-llm 50/50, speaker-name-rules 106/106, speakers-windows 29/29, speakers 16/16, speaker-docs 13/13. `node --test qa/evidence/u2-4-phase3-precision-regate-2026-09-22/corpus-lock.test.mjs`: 4/4. `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` (timeout 180): exit 0, 16 s.
- `node scripts/lint-dirsize.mjs`: OK (110 dirs). `node scripts/lint-loc.mjs`: 7 violations, all pre-existing and none in speaker files. `node scripts/lint-dupes.mjs`: 1 violation (`recordApproval` in packages/db and packages/meeting-bot), not in speaker files. speakers-llm.ts: 300 non-blank lines (limit 300).
- Mutations (own harness: per-mutation byte backup, restore in `finally` plus a SIGINT/SIGTERM handler, `spawnSync` timeout 170 s, then `git hash-object == git rev-parse HEAD:<file>` after each; the six speaker test files together unless noted):

| # | Mutation | Result |
|---|---|---|
| M1 | handover route ON | killed (9 fail); differential alone killed (3) |
| M2 | thanks route ON | killed (8) |
| M3 | thanks predicate bypasses `relationGate` | killed (7) |
| M4 | gate drops `isQuotedAt` | killed (1); differential alone SURVIVES |
| M5 | gate drops `isReportedAt` (third party) | killed (1) |
| M6 | self-identification skips `hasNamingCueAt` | killed (11); differential alone killed (2) |
| M7 | gate drops place/org refusal | killed (1) |
| M8 | gate ignores the route switch | killed (9); differential alone killed (2) |
| M9 | gate drops looksLikeAName / isDiscourseOnly | killed (5) |
| M10 | possessive exemption in `readsAsAPlaceOrOrg` removed | SURVIVED: equivalent mutant (agree with the maker): `nameOccurrences` treats `'` and `’` as name joiners, so an occurrence is never followed by `'s` and the branch is unreachable |
| M11 | corpus lock `verifyCorpus` no-op (corpus-lock.test.mjs) | killed (2) |

HEAD fidelity after all runs: speaker-relation-rules.ts ae6c81171bf6a177178045ee430fbfce9344bf76, speaker-name-rules.ts bceef61e79b6120c814b5f0045192b2f7a22da78, corpus-lock.mjs 9f47f1b4b56d9b6e470c19afa99022824c0d4d43, each equal to `git rev-parse HEAD:<file>`.

### Established and remaining
Established at code level: one gate and no bypass; handover and thanks OFF and the OFF state pinned by tests; recorded ISS-104 / ISS-282 / ISS-PH3-001 / ISS-PH3-002 reproductions all refused at predicate and end-to-end level; the lane never binds a name to a label that does not speak it; replay 3/3 correct, 0 wrong, against the base's 15/15 wrong.
Not established: the five live gate bars. Live command (repo root): Ollama qwen3:8b digest 500a1f067a9f, `node --import tsx qa/evidence/u2-4-phase3-precision-regate-2026-09-22/04-regate-eval.mts --runs 1,2,3 --tag c4` then `node --import tsx qa/evidence/u2-4-phase3-precision-regate-2026-09-22/05-score.mjs --tag c4`. Bars: (1) accepted precision 100%, (2) zero wrong label/name/citation links, (3) floor preservation, (4) stability across 3 live runs, (5) at least one correct addition (not met offline).
Recommendation: do not merge this candidate. One more small maker cycle for ISS-PH3-004 (extend the reporting / question / address refusal to the self-identification route, add the seven texts to the grid and to the ledger test, make the allow-list premise independent of the base's own acceptances). After that, merging ahead of the live run is defensible: the recorded corpus shows 15 wrong names removed and no correct name lost, at the price of "This is X speaking" and next-speaker addresses. Re-enabling handover and thanks stays a decision for after the live run. ISS-PH3-001 and -002 stay `open` in this verdict because the rule that sets them verified applies on a HOLD; their recorded cases measure fixed (3/3, 6/6) and they can be verified on the next cycle's HOLD.

ISSUES-WRITTEN: ISS-PH3-004 (critical, new), ISS-PH3-005 (low, new), both in qa/issues.ph3.jsonl. No existing row changed.

EXPLANATION: The cycle-2 fix is real and the maker's numbers reproduce exactly (1280/0, 15360/304/2396, ISS-104 20/20, replay 3/3). The risk it leaves is the self-identification route, which the maker treated as the safe baseline because it sits on the base cue. The base cue is itself loose for reporting verbs, questions and comma-address, and the lane's cycle-1b block-location path means a neighbouring citation now ships what the base refused. The maker's differential grid did not contain those forms, and its allow-list is defined by what the base accepts, so it could not find them. The 304 allow-listed cells are genuine self-introductions (172 person names correct; 132 place/org names are the D-052 residue, which the base also ships).

---

# Cycle 2 (superseded by cycle 3; kept as recorded)

VERDICT: FAIL
Cycle checked: 2
Date: 2026-10-10 · Checker (independent; did not build the unit) · Candidate: lane/ph3 12af112 (base 536a56a)
Judged against: qa/contracts/speaker-resolution-llm.md (C2/C2a/C2b/C12; this base has no C14), qa/gates/speaker-segment-identity.md phase-3 bars, D-015, security class (uncapped).
Manifest: qa/manifests/u2-4-phase3-resume-c2.md (ready-for-check, Fix cycle 2). The live gate was not run and was not attempted here.

## Why FAIL (not HOLD)
Two reproducible code defects, both in the security class, found by running the lane against the base.
1. ISS-PH3-002 (critical). `citesNameAsHandover` and `citesNameAsThanks` never call `hasNamingCueAt`. The manifest says all relation predicates "call the base cue first, so they can only narrow". True only for `citesNameAsSelfIdentification`. The other two bypass the place-versus-person signal and the ISS-255 handover refusal. The recorded ISS-104 attack "Coming up next, Mumbai from the west zone." ships `person:mumbai` through the new route; the base refuses it.
2. ISS-PH3-001 (critical, raised from low). Reported speech ships a name end to end.

## Merge-safety question
"Is the lane's code strictly safer than or equal to the base for every input (accepts nothing the base refused)?" **NO.**
- Lane-accepts-base-refuses over 30 names x 22 address/handover/thanks templates, predicate level: 160/660, including Paris, Mumbai, India, Google, English, Diwali, Delhi, Amazon, plus plain person names.
- Same grid through `extractSpeakers` over 4 layouts: 432/2640 ship on the lane and not on the base.
- Place/org examples (base refuses, lane ships spk:0): "Coming up next, Mumbai from the west zone." (ISS-104 #18, preceding turn), "Over to you, India.", "Welcome to the Mumbai office. Over to you, Mumbai.", "Thank you, Google." / "Thank you, Amazon." (following turn), "Thank you, Paris, for hosting us. Our students in Paris were great."
- The widening toward person names (a handover or thanks naming the neighbour block) is deliberate design, the thing the live gate is meant to measure. Place/org names and quoted speech are not.
- Mutation M6 (adding `hasNamingCueAt` to `citesNameAsHandover`) is KILLED by the lane's own tests: the suite pins the divergence from the base as intended.
- Must change before merging ahead of the live run: the relation predicates need the place/org and closed-class protections on the third-party occurrence (or the handover/thanks routes stay off until the live gate), the reported-speech guard needs to cover a reporting verb earlier in the clause and a colon-quote, and regression tests need the recorded ISS-104 texts in the preceding- and following-turn layouts.

## 1. No protection dropped in the port
`git diff 536a56a 12af112 -- speaker-name-rules.ts` shows 4 lines changed only by adding `export` (HANDOVER_MARKERS, SELF_NAMING_CUES, FUNCTION_FOLLOWERS, nameOccurrences) plus the new 5-line `hasNamingCueAt`. No rule removed or weakened. `speakers-llm.ts` still applies `looksLikeAName` and `isDiscourseOnly` (the NEVER_A_PERSON denylist) before any evidence step. So the denylist is intact on every path. The place signal and the handover refusal are intact in `citesNameAsAnIntroduction`/`hasNamingCue`, but are NOT consulted on the handover/thanks route (above).
Base vs lane, ISS-104's 20 recorded attacks, predicate level (`looksLikeAName && !isDiscourseOnly && cue`): base accepts 1/20 (India), lane relation predicates accept 1/20 (Mumbai, via handover). Different input, same count. Through `extractSpeakers`, same-turn layout: base 1/20 (India), lane 0/20. Preceding-turn layout: base 0/20, lane 1/20 (Mumbai).
ISS-282's 8 recorded links: base shipped them (that is the issue); lane refuses 8/8 (probe below).
Existing negative fixtures: I ran the base's five speaker test files unmodified against the lane code. 6 base assertions change: "India" residue (now refused, an improvement), ISS-098 Prasanti address, "Doris Day" greeting, "Priya" address, two ISS-094 Prasanti address forms (all address-makes-addressee-the-speaker, the ISS-282 direction). All other base negative fixtures still hold. Scratch copies deleted.

## 2. The two rewritten tests, the emptied gazetteer
- Originals (`git show 536a56a:...speaker-name-rules.test.ts`): "Good morning Doris Day, please go ahead." and "Our office is in Priya's building. Priya, what do you think?" asserted that the addressee is the speaker of that turn. Under the contract and ISS-282 this is the inversion the re-gate measured at 0/8: an address names the person ADDRESSED. The rewrite is legitimate. Behaviour dropped: address makes the speaking label the addressee. It is not lost recall: the greeting/handover class still ships for the label whose block FOLLOWS (speakers-windows test "a handover by ANOTHER speaker binds the label whose block immediately FOLLOWS it"), and the offline replay accepts 12 correct with 4 additions where the c1 live run accepted 0. The original address forms are asserted refused (speaker-relation-rules.test.ts, speakers-llm.test.ts). The multi-token collision bound ("Day") is preserved by the "Doris Day here." form.
- Weaker coverage, noted: the "Priya's building" rewrite no longer exercises an address after a possessive place cue. Mutation M7 (remove the possessive exemption in `readsAsAPlaceOrOrg`) SURVIVES all four test files. I did not establish whether the base test killed it; low, not filed separately.
- `ISS_093_GAZETTEER`: a `Set(["India"])` of ISS-093 corpus names expected to still SHIP (known residue); the loop asserts refusal for every name not in it. It is now empty because "X speaking" binds only when X opens a clause, so "This is India speaking on the panel." is refused through the LLM path. All 20 corpus cases are still asserted (speaker-name-rules tests 106/106); nothing silently stopped being asserted. Caveat: at bare-predicate level `citesNameAsAnIntroduction` still accepts India (probe 19/20).

## 3. D-015 by issue id (measured by me, recorded reproductions verbatim)
- ISS-104: `node --import tsx qa/probes/iss104-rederive.mts` -> `--- refused 19/20`; open at predicate level: "This is India speaking on the panel." The row's recorded setup is single turn + injected complete, i.e. through `extractSpeakers`: lane 20/20 refused (India now refused). So the maker's 19/20 and 20/20 are both true. But the same 20 texts as a preceding turn ship Mumbai on the lane (0 on the base): not a pass for the class (ISS-PH3-002). Open case: Mumbai (relation route), India (predicate level).
- ISS-282: probe `qa/probes/iss282-c0-replay.mts` reads the recorded cycle-0 `raw-proposals.jsonl` and `run-results.jsonl` unmodified (unparseable calls replayed as recorded text; call counts asserted = windows*3). Output: `--- ISS-282 recorded wrong links refused: 8/8` (Sonal x2, Priyanka Roy, Shithij, Anisha, Bhavya, Jubin spk:1, Jubin spk:3). Offline only; not a live measure.
- ISS-289: recorded `spk:3 -> Jubin` (leeds t088) refused, as is its spk:1 twin (inside the 8/8). The relational scorer (`wrongEvidencePairsRelational`) uses gold persons and block adjacency and imports no production predicate, so it is independent of the acceptance rule. Limit: it checks geometry only, not that the evidence text names the person (identity correctness comes from the gold-block check). The old circular check is kept and labelled NOT independent.
- ISS-290: tamper test in a temp copy (one byte appended to 2026-08-27-in-focus-4/turns.json): `05-score.mjs` and `04-regate-eval.mts` both throw `ISS-290: corpus drift -- changed/missing: [2026-08-27-in-focus-4]` before any provider call; the untampered run passes the lock. Six sessions are unpinned and only printed to stderr; 01-block-stats.mjs is unchanged. Partial against the row's fix_direction (fail loudly, all three scripts); enough to stop silent drift of the scored 11, not enough for the row to close. No automated test (ISS-PH3-003, low).
- ISS-255: replay output `"ISS255":"3/4"`; case 4 fails 12 of 18 evidence pairs, and legacy `wrongPairs` = 18. Both re-ask the base `citesNameAsAnIntroduction` / require an evidence turn inside a gold block of the named person. Handover and thanks turns are spoken by someone else, so they fail by construction. Not evidence of 18 wrong attributions (`wrongIdentities` 0, `wrongPairsRelational` 0). But the 12 pairs ARE the empirical trace of the lane accepting evidence the base cue refuses, which is the finding in ISS-PH3-002.
- ISS-PH3-001: reproduced end to end, see Issues.

## 4. Offline replay (mine, tag chk2; no model, no network: read 08-replay.mts and 05-score.mjs, only readFileSync/writeFileSync and local imports)
`08-replay.mts --from c1 --tag chk2` then `node --import tsx 05-score.mjs --tag chk2 --raw-tag c1` gives accepted 12, correct 12, precision 1, wrongIdentities 0, wrongPairs 18, wrongPairsRelational 0, floorTurns 2, floorCoveredTurns 42, contradicted 0, stableAll true, additions 4, ISS255 "3/4". Identical to the maker's. Accepted in all 3 runs: visa spk:0 Rashi, creative-futures spk:1 Sumit, in-focus-3 spk:1 Nikhil, leeds spk:2 Nupur. This replays recorded c1 model text through new code; stability is one recorded sampling. My output files deleted.

## 5. Tests, types, mutations
- `node --test --import tsx` each under `timeout 170`: speaker-relation-rules 12/12, speakers-llm 50/50, speaker-name-rules 106/106, speakers-windows 29/29, speakers 16/16, speaker-docs 13/13. `tsc --noEmit -p packages/index` exit 0 (timeout 180).
- Mutations, per-mutation byte backup, restore in trap on EXIT/INT/TERM/ERR, `timeout 170` on every test run, then `cmp` and `git hash-object == git rev-parse HEAD:<file>`:

| # | Mutation | Result |
|---|---|---|
| M1 | self-identification skips base cue (`hasNamingCueAt && ` -> `true &&`) | killed (speaker-name-rules, 7 fail) |
| M2 | one evidence turn may bind two labels (guard deleted) | killed (speakers-windows, 1 fail) |
| M3 | drop reported-speech guard (`!reported(...)` -> `true`) | killed (speakers-windows, 1 fail) |
| M4 | remove denylist word "not" | killed (speaker-name-rules, 1 fail) |
| M5 | label-wide instead of per-block (`ownBlocks = []`) | killed (speakers-windows, 3 fail) |
| M6 | handover predicate also requires base cue | killed (relation-rules 1, windows 2): shows the divergence is pinned as intended |
| M7 | remove possessive exemption in `readsAsAPlaceOrOrg` | SURVIVED all four files (low gap) |
| M8 | corpus lock a no-op | no automated test exists; checked by hand (tamper test), see ISS-PH3-003 |

All files restored; hashes equal HEAD after each run.

## 6. Budgets and scope
`lint-dirsize` OK (109 dirs). `lint-loc`: 7 violations, none in speaker files (maker reported the same 7 pre-existing). `git diff 536a56a 12af112` touches no qa/contracts, qa/verdicts, qa/issues.jsonl, TASKS.md, .claude or skills. No ledger status changed by me either.

## C14 ruling (checker as contract owner): DEFER TO THE APPROVER, contract unchanged
C14 says phase-3 bar 2 is measured for this path by `wrongEvidencePairsRelational` rather than the legacy counter. That is a choice of what counts as a wrong citation link, hence an Approver decision, not routine. Do not adopt it now:
1. It says it does not relax C2/C2a/C2b/C12 ("name verbatim, in a cue-shaped occurrence, exactly as before"). The lane's handover/thanks evidence is not base-cue-shaped (12 of 18 pairs fail the base cue). As written C14 would assert something the code contradicts.
2. The relational counter is geometric. ISS-PH3-001 ("He said over to you, Nikhil") produces an evidence turn adjacent to a block and would pass it, so on its own it cannot discriminate wrong citations.
3. Adopting it before ISS-PH3-002 is fixed would legitimise the very pairs that expose the bypass. A reading that happens to let 18 -> 0 is not a reason.
Recommendation to the Approver: reconsider after the relation predicates carry the place/closed-class/quote protections and the relational counter also checks that the evidence text names the person.

## Established at code level / what remains
Established: ISS-282's 8 recorded wrong links no longer ship from the recorded cycle-0 output; the replay gives 12/12 correct and 0 relational wrong; the corpus lock refuses a tampered session; six speaker test files and tsc are green; mutations M1-M6 are killed.
Not established, and not claimable: the five live gate bars. Live command: Ollama with qwen3:8b digest 500a1f067a9f, then from the repo root `node --import tsx qa/evidence/u2-4-phase3-precision-regate-2026-09-22/04-regate-eval.mts --runs 1,2,3 --tag c2` then `node --import tsx .../05-score.mjs --tag c2`. Bars: (1) accepted precision 100%, (2) zero wrong label/name/citation links, (3) floor preservation, (4) stability across 3 live runs, (5) at least one correct addition. The cycle-1 FAIL of the old branch (an offline replay is not sufficient) stands. ISS-283 not delivered.

ISSUES-WRITTEN: ISS-PH3-002 (critical, new), ISS-PH3-003 (low, new); ISS-PH3-001 severity low -> critical (only the severity changed, plus a `checker_note` field with the reproduction). All in qa/issues.ph3.jsonl.

EXPLANATION: The unit is a careful port and its offline numbers reproduce exactly. The defect is the claim underneath them: that every relation predicate sits on top of the base cue. Handover and thanks do not, so place and organisation names and reported speech get through that the base refused, and the ISS-104 20/20 was only measured with the evidence in the speaker's own turn. Fix cycle 3 should fix those two, add replays of the recorded ISS-104 texts in the neighbouring-turn layouts, and re-submit; the live run still follows.
