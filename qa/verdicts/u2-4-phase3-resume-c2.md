# Verdict - u2-4-phase3-resume-c2

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
