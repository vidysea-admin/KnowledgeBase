# u2-4-phase3-resume-c2

Status: ready-for-check
Fix cycle: 6
Priority tier: 2 - open critical ISS-282 / ISS-104 and high ISS-283 / ISS-289 (also medium ISS-284, ISS-290). Authorized by D-122 (Approver ruling 2026-10-10: `origin/wave/u2-4-phase3-fix` is RESUMED through the maker-checker pair).
Security class: data-write precondition (U2.4 phase-4 persists identities) - full ceremony, uncapped.
Lane: `lane/ph3` (worktree KnowledgeBase-lanes/ph3), base 536a56a. Ledger shard: `qa/issues.ph3.jsonl` (one low row).
Issues addressed: ISS-282 (offline only), ISS-104 (no regression), ISS-289, ISS-290, ISS-284 (partly). NOT closed: ISS-283 and the five live gate bars.

## What was done: RE-APPLIED, not merged
Branch `origin/wave/u2-4-phase3-fix` (13 commits, merge-base 4aa9d13, ~416 commits behind) was not merged. Its source and test changes were 3-way applied (`git merge-file`, CRLF-normalised) onto the lane. Its manifests, verdicts, ledger, contract and corpus-dump were not brought. The branch's cycle-1 FAIL verdict finding (ISS-U2-4-1: the 1b code was only replayed offline, never measured live) is unchanged and is repeated under "Not delivered".

Source (packages/index/src/pipeline, non-blank lines): `speakers-llm.ts` 300 (base 313; relation binding ported, `namingTurns` moved out, comments condensed); `speaker-name-rules.ts` 275 (four constants/functions exported plus `hasNamingCueAt`; NO rule removed or weakened); NEW `speaker-relation-rules.ts` 97 (`citesNameAsSelfIdentification`, `citesNameAsHandover`, `citesNameAsThanks`, `namingTurns`, with the branch's reported-speech / quote guards and clause-opening allowlist). The branch put the three predicates in speaker-name-rules.ts; that file had 287 lines against a 300 budget, so they live in a new file that calls `hasNamingCueAt` (base cue + closed-class denylist + place-vs-person + handover refusal) FIRST and then adds the relation. It can only narrow what the base accepts.
Tests: `speakers-llm.test.ts` 364, `speakers-windows.test.ts` 334, `speaker-name-rules.test.ts` 394 (in-place edits, net shrink; was 417), NEW `speaker-relation-rules.test.ts` 66.
Evidence dir `qa/evidence/u2-4-phase3-precision-regate-2026-09-22/`: `04-regate-eval.mts`, `05-score.mjs` (from the branch, plus the ISS-290 hook and ISS-289 label), NEW `08-replay.mts`, NEW `corpus-lock.mjs` + `corpus.lock.json`, recorded inputs `raw-proposals.c1.jsonl` and `run-results.c1.jsonl`, outputs `run-results.c2r.jsonl` and `measurement-summary.c2r.json`. Probes: NEW `qa/probes/iss282-c0-replay.mts`; `qa/probes/iss104-rederive.mts` copied unchanged from the main checkout, where it is untracked.

## Conflict resolution
- `speaker-name-rules.ts`: whole-file conflict (the lane added `speaker-name-data.ts` with the 409-word closed-class denylist, `readsAsAPlaceOrOrg`, the `here`/`speaking` idiom rules, ISS-255 handover refusal). Took the lane version entire and added the branch's relation rules as new code in a new file. The branch's comment-condensing edits to this file were NOT taken.
- `speakers-llm.ts`: merged clean with the lane's ISS-269/270 degraded-window accounting (`WindowFailure`, `junkFailures`) intact.
- `speaker-name-rules.test.ts`: one conflict, `ISS_093_GAZETTEER`, resolved to the empty set (the branch closes India and Mumbai through the LLM path; the lane had already closed Mumbai and Google). Two lane recall tests asserted exactly the behaviour ISS-282 forbids (an ADDRESS making the addressee the speaker) and were rewritten to the self-identifying equivalent: "Good morning Doris Day, please go ahead." became "Good morning everyone, Doris Day here."; "Our office is in Priya's building. Priya, what do you think?" became "... My name is Priya." The original address forms are now asserted REFUSED in `speaker-relation-rules.test.ts`. CHECKER: please confirm these two rewrites are legitimate.

## Evidence (real output; node v24.19.0 from the codex runtime, node_modules junctions to the main tree)
- `node scripts/lint-dirsize.mjs`: before `OK (109 dir(s) within budget)`, after `OK (109 dir(s) within budget)`.
- `node scripts/lint-loc.mjs`: before 8 violations including `speakers-llm.ts:313`; after 7 violations, none in speaker files (the other 7 are pre-existing and untouched).
- From packages/index, each under `timeout 170`, `node --test --import tsx src/pipeline/<file>`: speaker-relation-rules `tests 12 pass 12 fail 0`; speakers-llm `tests 50 pass 50 fail 0`; speaker-name-rules `tests 106 pass 106 fail 0`; speakers-windows `tests 29 pass 29 fail 0`; speakers `tests 16 pass 16 fail 0`; speaker-docs `tests 13 pass 13 fail 0`.
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` in packages/index: no output, exit 0.
- Offline replay, `node --import tsx qa/evidence/u2-4-phase3-precision-regate-2026-09-22/08-replay.mts --from c1 --tag c2r` (4 s; 33/33 session-runs, call counts matched windows*3), then `node --import tsx qa/evidence/u2-4-phase3-precision-regate-2026-09-22/05-score.mjs --tag c2r --raw-tag c1`:
  `accepted 12, correct 12, precision 1, wrongIdentities 0, wrongPairs 18 (legacy), wrongPairsRelational 0, floorTurns 2, floorCoveredTurns 42, contradicted 0, stableAll true, additions 4, ISS255 "3/4"`.
  Accepted, identical in all 3 outer runs: visa spk:0 Rashi, creative-futures spk:1 Sumit, in-focus-3 spk:1 Nikhil, leeds spk:2 Nupur. This reproduces the branch's own numbers. It is a replay of c1's RECORDED model text through the new code, not a live measurement.
- Bar-2 reading, left to the checker: legacy `wrongPairs` is 18 and ISS-255 case 4 fails (12 of 18 evidence pairs) because both re-ask the base `citesNameAsAnIntroduction` on greeting/handover/thanks turns, which the base rule refuses by design. The branch's contract change C14 (below) rules the relational count to be the bar-2 measure; I did not apply it.

## D-015: each issue's OWN recorded reproductions, by id
- ISS-104: `node --import tsx qa/probes/iss104-rederive.mts` (the 20 attacks recorded in the row) gives `--- refused 19/20`, identical on the lane base and with this unit (checked by stashing the change). The row's own notes say 15/20, later 17/20 on record; this probe now gives 19/20 and "I am Not sure about that." / Not is refused. OPEN: "This is India speaking on the panel." / India still ships at the bare predicate level (place class, no gazetteer, per the ledger). Through the shipping path (`extractSpeakers`; the 20-case ISS-093 corpus in `speaker-name-rules.test.ts`) all 20 are refused, India included, because "X speaking" binds only when X opens a clause. No regression.
- ISS-282: `node --import tsx qa/probes/iss282-c0-replay.mts` replays the cycle-0 recorded model output (`raw-proposals.jsonl`) through the new code: `--- ISS-282 recorded wrong links refused: 8/8` (Sonal x2, Priyanka Roy, Shithij, Anisha, Bhavya, Jubin spk:1, Jubin spk:3). Offline: it shows the 8 recorded links no longer ship from that recorded output, not that a fresh live run is precise.
- ISS-289: the recorded case `spk:3 -> Jubin` on leeds t088 (evidence turn spoken by spk:1: "Hi. Hi. Hi. Hi, Jubin, go now.") is among the 8 above: refused, as is its spk:1 twin. Scoring side: `wrongEvidencePairsRelational` in `05-score.mjs` uses gold persons and block adjacency and imports no production predicate, so it is independent of the acceptance rule (it was already in the branch; the cheap fix was to label the circular ISS-255 case 4 `NOT independent` in its own name field, done). Caveat: the relational check's `blocks` still come from the accepted result, filtered by gold, so a wrong block cannot pass.
- ISS-290: `corpus-lock.mjs` pins the 11 sessions in `gold-labels.json` by sha256 of each `turns.json` (CRLF-normalised) in `corpus.lock.json`. Both `05-score.mjs` and `04-regate-eval.mts` call `verifyCorpus()` first and throw on drift (before any provider call), and print the 6 positional sessions outside the pin by name. Tested: appending one byte to a pinned `turns.json` gave `Error: ISS-290: corpus drift ...`; restored, `git status data` clean. Limit: the lock hashes today's data and cannot prove it equals what was labelled on 2026-09-22 (the c1 replay's call counts match, which is circumstantial support).
- ISS-284: not closed (undisclosed files and stale pasted numbers were cycle-0 manifest defects). The corpus-drift half is covered by ISS-290.

## Contract change for the CHECKER (makers never edit qa/contracts)
The branch added to `qa/contracts/speaker-resolution-llm.md` a section "Phase-3 gate bar-2 reading" with criterion [C14] and a changelog row: phase-3 bar 2 ("zero wrong label/name/citation links") is measured for this path by `05-score.mjs`'s `wrongEvidencePairsRelational` (evidence turn inside, or adjacent in the cue's direction to, a claimed block whose gold person is the accepted name), never by the legacy `wrongEvidencePairs`, which only a self-naming turn can satisfy. It states it does not relax C2/C2a/C2b/C12 (verbatim + cue still required). The branch's changelog calls it routine; whether it is routine or a CRITICAL amendment needing the human is the checker's and Approver's call. Full text: `git show origin/wave/u2-4-phase3-fix:qa/contracts/speaker-resolution-llm.md`.

## Not delivered
1. NO live run. The phase-3 gate protocol (`qa/gates/speaker-segment-identity.md` step 3) requires the shipping code to run three outer times against the frozen local model: 2340 provider calls at temperature 0, seed 42, to a local Ollama. Ollama is not installed on this machine. It needs Ollama with `qwen3:8b` at digest `500a1f067a9f`, then from the repo root `node --import tsx qa/evidence/u2-4-phase3-precision-regate-2026-09-22/04-regate-eval.mts --runs 1,2,3 --tag c2` followed by `node --import tsx qa/evidence/u2-4-phase3-precision-regate-2026-09-22/05-score.mjs --tag c2`. Expect hours of CPU (the branch's c2 attempt was paused for RAM), so it must not run beside the production search worker.
2. The five live gate bars are therefore NOT evidenced: bar 1 precision, bar 2 zero wrong links, bar 3 floor preservation, bar 4 stability across 3 live runs, bar 5 at least one correct addition. They are measured here only on the offline replay of c1's recorded text. The gate is NOT claimed met. The recorded c1 LIVE result (earlier code) remains a clean FAIL (0 accepted).
3. ISS-283 (three complete live runs / stability) is not delivered; the replay's `stableAll true` replays one recorded sampling.
4. Not run: mutation runs (checker's job, `scripts/lib/mutate.mjs`), the full test suite, a monorepo build, browsers. Only packages/index was typechecked.
5. Known gap, filed low as ISS-PH3-001: `citesNameAsHandover("He said over to you, Nikhil, and left.", "Nikhil")` is true (reported speech is not caught when the reporting verb precedes the cue). Not in any recorded reproduction.
6. Ledger statuses (ISS-282/283/284/289/290/104) are not touched; closing them is the checker's.

NOTE (cycle 3): the cycle-2 sentences above that say the relation predicates "call `hasNamingCueAt` FIRST" and "can only narrow what the base accepts", the ISS-104 "no regression" line, and item 5 are SUPERSEDED by the next section. They were false for handover and thanks.

# Fix cycle 3 (checker verdict u2-4-phase3-resume-c2, cycle 2: FAIL; ISS-PH3-001 and ISS-PH3-002, both critical)

## What failed, and why the cycle-2 claim was false
`citesNameAsHandover` and `citesNameAsThanks` never called `hasNamingCueAt`; only `citesNameAsSelfIdentification` did. The place-versus-person signal, the organisation refusal and the ISS-255 handover refusal were bypassed on the two new routes, and reported speech was caught only when `said` sat next to the NAME. Run against the base: 432 of 2640 end-to-end cases (30 names x 22 templates x 4 layouts) shipped on the lane and not on the base ("Coming up next, Mumbai from the west zone." as a preceding turn, "Over to you, India.", "Thank you, Google.", "He said over to you, Nikhil, and left."). I never ran the base beside the lane; the 20/20 ISS-104 figure was measured only with the evidence in the label's own turn.

## The gate (speaker-relation-rules.ts, `relationGate`)
ONE wrapper decides whether an occurrence may bind. A predicate is written as `relationGate(route, text, name, check, routes?)`: it supplies only its pattern check, and `check` can only ADD conditions. The gate applies, in order: route switched on; `looksLikeAName`; not `isDiscourseOnly` (the denylist); not inside quoted speech (`isQuotedAt`, any style: straight and curly double quotes, guillemets, CJK corner brackets, single quotes, a name straight after a quote mark); then
- self-identification: the BASE cue `hasNamingCueAt` (place-versus-person, organisation, ISS-255 handover refusal);
- handover / thanks: not a place or organisation reading of the citing turn (`readsAsAPlaceOrOrg`, now exported) and not reported speech (`isReportedAt` in the new `speaker-reported-rules.ts`: a reporting verb anywhere earlier in the clause, a reporting verb then a colon, or a reporting verb right after the name: said, told, asked, wrote, added, heard, according to, like, go/goes/went, ...). When in doubt it refuses.
All three exported predicates are built through the gate, so a new predicate cannot skip it. `speaker-name-rules.ts` changed by one word versus cycle 2 (`export` on `readsAsAPlaceOrOrg`).

## Routes: self-identification ON; handover OFF; thanks OFF (`RELATION_ROUTES`)
Handover and thanks are DISABLED. The base refuses every handover context by design (ISS-255), so `hasNamingCueAt` cannot be applied to them, and the remaining protections cannot separate a bare capitalised word that is a person from one that is not without the place lookup D-052 ruled out: "Over to you, India.", "Thank you, Google.", "Coming up next, Mumbai from the west zone." pass every contextual test. With the routes forced ON (test `forced ON`), the gate still refuses all quoted, reported, place-governed and function-word cases, but 202 third-party acceptances of plain-looking names the base refused remain (Nikhil, Rashi, ..., and also India, Google, Mumbai). I did not keep the routes on to improve the replay. Re-enabling is a decision for after the live run.
Recall consequence, stated plainly: the true positives of cycle 1b that were named only by a neighbour's handover or thanks (cycle-2 replay: visa spk:0 Rashi, creative-futures spk:1 Sumit, in-focus-3 spk:1 Nikhil, leeds spk:2 Nupur) are no longer shipped. `speakers-windows.test.ts` (5 tests) and `speaker-relation-rules.test.ts` (2 tests removed or replaced) were changed from asserting handover/thanks binding to asserting refusal; the [id:...] test now uses a self-identification.

## Differential harness (committed): `speakers-differential.test.ts`
Chosen: a FROZEN VERBATIM COPY of the base in `packages/index/src/pipeline/frozen-base-536a56a/` (`speaker-name-rules.mts`, `speaker-name-data.mts`, `speakers-llm.mts`, from `git show 536a56a:...`, imports adjusted, header marked "frozen reference, differential testing only"). `.mts` so the loc and dupes lints and tsc do not see them; `speakers.ts` is unchanged between base and lane and imported as-is. Not a golden table, because the end-to-end decision needs the base `extractSpeakers`. Budgets: dirsize OK (pipeline dir now 23 files, limit 30); the `.mts` copies are outside the loc counter (extensions .ts/.py/.mjs), which I note as the cost of this choice.
Grid: 32 names (persons, a multi-token name, places, organisations, function words, calendar/festival words) x 40 templates (self-introduction, address, handover, thanks, place-governed, and 16 quoted or reported forms in every quote style) x 5 layouts (own turn; own block, other turn; preceding turn; following turn; both neighbours), citing the template turn, the label's turn, or the last turn.
Result (`DIFF` lines printed by the test):
- predicate level: 1280 cells, base accepts 450, lane accepts 152, lane-only acceptances 0 (cycle 2: 160 of 660).
- end to end: 15360 cells, base ships 2700, lane ships 608, lane-only acceptances 304, of which on the allow-list 304 and NOT allowed 0 (cycle 2: 432 of 2640 unaccounted for). Base-only (recall lost versus base) 2396; most of these are base shipments the contract calls wrong (an address making the addressee the speaker, ISS-282), but the count is reported unfiltered.
- ALLOW-LIST, one class: OWN_BLOCK_SELF_ID. T is a turn of the label's OWN block that the base accepts when cited directly; the model cited a different turn that sits in or next to that block. Same turn, same cue, same protections, same label; only the citation differs. Layouts where T belongs to another speaker are never allowed.

## D-015 by issue id (each row's own recorded reproductions; predicate / end to end: own turn, preceding turn, following turn)
- ISS-104: 20 recorded attacks (`speaker-relation-ledger.test.ts`, verbatim from `qa/probes/iss104-rederive.mts`). Lane predicates 20/20 refused (India included: self-identification needs "X speaking" to open the clause); end to end 20/20, 20/20, 20/20 refused (the Mumbai preceding-turn case is now refused). The base predicate probe itself still gives `--- refused 19/20` (India), unchanged base code, so that one is a base residue the lane closes.
- ISS-282: `node --import tsx qa/probes/iss282-c0-replay.mts` gives `--- ISS-282 recorded wrong links refused: 8/8`; the 8 real-corpus cases also stay in `speakers-windows.test.ts`.
- ISS-PH3-001: all 3 recorded cases ("He said over to you, Nikhil, and left."; "Someone said: over to you, Nikhil."; "The chair told me earlier that it was over to you, Nikhil.") refused at predicate level and end to end in all 3 layouts, and refused with the routes forced ON.
- ISS-PH3-002: all 6 recorded cases (Mumbai x2, India as preceding turn; Paris, Google, Amazon as following turn) refused at predicate level and in all 3 layouts. With the routes forced ON only Paris (place signal in the same turn) would still be refused; Mumbai, India, Google and Amazon would ship, which is why the routes are OFF.
- ISS-255: replay `ISS255 "4/4"` (cycle 2: 3/4) and legacy `wrongPairs` 0 (cycle 2: 18): every evidence turn that ships now passes the base cue `citesNameAsAnIntroduction` itself. Meaning: the 12 pairs that exposed the bypass are gone because the routes that produced them are off, not because they were repaired.
- ISS-093: the 20-case corpus is still asserted in `speaker-name-rules.test.ts` (106/106 pass).
OPEN, by name: none among the recorded cases. Not measured: any fresh live run.

## Replay (offline, recorded c1 model text; no model, no network)
`08-replay.mts --from c1 --tag c3r` then `05-score.mjs --tag c3r --raw-tag c1`: accepted 3, correct 3, precision 1, wrongIdentities 0, wrongPairs 0 (c2: 18), wrongPairsRelational 0, floorTurns 2, floorCoveredTurns 42, contradicted 0, stableAll true, additions 0 (c2: 4), ISS255 "4/4" (c2: 3/4). The accepted count fell from 12 to 3 and the 4 additions are gone. Phase-3 bar 5 (at least one correct addition) is therefore NOT met even offline now. I did not tune any rule to recover it.

## Test gaps the checker named
- M7 (possessive exemption in `readsAsAPlaceOrOrg`): it is an EQUIVALENT mutant. `nameOccurrences` already drops "Priya's" because the apostrophe is a NAME_JOINER, so the branch is unreachable and no test can kill it. The ledger test now pins what protects "At Priya's desk, Priya here." (the occurrence list). Not a production change.
- Corpus-lock (ISS-PH3-003): `qa/evidence/u2-4-phase3-precision-regate-2026-09-22/corpus-lock.test.mjs` (4 tests, `node --test`): a synthetic one-session corpus in a temp dir; an appended byte makes `verifyCorpus` AND the real `05-score.mjs` refuse; a missing session and a lock-only entry refuse; `04-regate-eval.mts` calls `verifyCorpus` before any provider call. Mutation M8 (verifyCorpus a no-op) is now killed (2 fail). Remaining of ISS-PH3-003: unpinned sessions are still only printed, and `01-block-stats.mjs` is not covered.

## Evidence (cycle 3; node v24.19.0, from packages/index unless noted, each under timeout 170)
- `node --test --import tsx src/pipeline/<file>`: speaker-relation-rules `pass 10 fail 0`; speaker-relation-ledger `pass 8 fail 0`; speakers-differential `pass 5 fail 0` (about 15 s); speakers-llm `pass 50 fail 0`; speaker-name-rules `pass 106 fail 0`; speakers-windows `pass 29 fail 0`; speakers `pass 16 fail 0`; speaker-docs `pass 13 fail 0`. From the repo root: `node --test qa/evidence/u2-4-phase3-precision-regate-2026-09-22/corpus-lock.test.mjs` `pass 4 fail 0`.
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json`: no output, exit 0.
- `node scripts/lint-dirsize.mjs`: `OK (110 dir(s) within budget)`. `node scripts/lint-loc.mjs`: the same 7 pre-existing violations, none in speaker files. Loc: speaker-relation-rules.ts 119, speaker-reported-rules.ts 39, speaker-name-rules.ts 275, speakers-llm.ts 300 (unchanged), speaker-relation-ledger.test.ts 87, speakers-differential.test.ts 131, speakers-windows.test.ts 332, speaker-relation-rules.test.ts 54.
- Mutations (per-mutation byte backup, restore in `finally`, `cmp` verified after each): gate drops the base cue on self-identification, killed (2 fail); handover route ON, killed (3 fail); third-party gate skips the place check, killed (1 fail); skips the reported check, killed (1 fail); gate drops `isQuotedAt`, killed by the quoted-self-identification test (1 fail); M7, equivalent; M8 killed.
- Replay and probes as above. `qa/probes/iss282-c0-replay.mts`: 8/8. `qa/probes/iss104-rederive.mts`: 19/20 (base predicate).

## Not delivered (unchanged in substance)
The live gate is still outstanding and NOT claimed: Ollama qwen3:8b digest 500a1f067a9f, 2340 calls, `04-regate-eval.mts --runs 1,2,3 --tag c2` then `05-score.mjs --tag c2`. The five gate bars are not evidenced. Contract change C14 stays deferred to the Approver; qa/contracts is untouched. ISS-283 not delivered. No ledger status changed.

---

# Fix cycle 4 (checker verdict u2-4-phase3-resume-c2, cycle 3: FAIL; ISS-PH3-004 critical, ISS-PH3-005 low)

## What failed, and why the cycle-3 differential missed it
`relationGate` applied `isReportedAt` only on the third-party routes; self-identification got `isQuotedAt` plus the base cue, and `hasNamingCue` strips commas, colons and full stops before looking for "i am" and never looks at the sentence around it. So "He said I am Nikhil.", "She told us, I'm Nikhil.", "Do you think I am Nikhil?", "I am, Nikhil, still waiting" and the rest passed. The lane's block-location path (a cited turn only LOCATES a block; cycle 1b) then turned the base's refusal (the cited neighbour does not contain the name) into a shipment. The cycle-3 differential missed it twice over: (1) its grid had no reported, hearsay, question, hypothetical, negation, address or relation self-identification forms (its "reported" tag covered handover and thanks forms only); (2) its allow-list was "anything the base accepts when the model cites the turn directly", which contains the base's own wrong acceptances, so any such form was waved through whatever the lane did. Run alone it also did not kill "drop the quoted-speech guard", because no quoted self-identification template was in the grid.

## Route-independent guards (speaker-relation-rules.ts, speaker-reported-rules.ts, new speaker-selfid-rules.ts)
`occurrenceAccepted(route, text, name, at)` is the single per-occurrence decision: name-shaped and not a function word; then, for EVERY route and before any pattern, `isReportedAt` (quoted OR reported: a quote of any style, a reporting verb earlier in the clause, a reporting verb then a colon, a reporting verb right after the name); then the route's base protection (self-identification: the base cue `hasNamingCueAt`; third parties: not a place or organisation reading); then the route's pattern (`PATTERNS[route]`, a table, so a route cannot be added without passing the guards). `relationGate(route, text, name)` = route switched on in the frozen table AND some occurrence passes `occurrenceAccepted`. Self-identification's pattern is `isCleanSelfIdentificationAt` (speaker-selfid-rules.ts), which also requires the cue to sit DIRECTLY before the name (no comma or full stop between; the base strips them) and refuses questions, hedges, negation and a longer possessive name.
Reporting-guard tuning: `like` stays a quotative ("they were like, I'm X") but not in "would like / I'd like / like to"; "I should say:" / "let me add:" (the speaker introducing their own next words) is exempt, which the existing ISS-255 test "call me Ruby" requires.

## Families now refused (each example refused at predicate level and in all 10 binding layouts)
- Reported / quoted: "He said I am X." / "She told us, I'm X." / "He said: I am X, and left." / "People go, I am X, and stall." / "She wrote: my name is X." / 'He said "I am X"' / "The slide shows “My name is X.”".
- Hearsay: "I was told my name is X." (refused: `told`), "My colleague says my name is X.", "Apparently I am X.". Decision: hearsay about one's own name is refused. "They call me X." / "Call me X." are ACCEPTED on purpose: they state what the speaker is called, with no reporting verb.
- Questions: "Do you think I am X?", "Am I X?", "Is my name X?", "What if I am X?" (sentence ends in "?" or opens with an auxiliary or wh-word).
- Hypotheticals and hedges: "If I were X, ...", "Suppose I am X.", "I wonder whether I am X." (if, suppose, imagine, assume, whether, unless, wish, maybe, perhaps, might, probably, guess, think*, believe*, wonder*, hope*, doubt*, were).
- Negation (in the clause): "I am not X.", "I'm no X.", "My name is not X.", "Please don't call me X.".
- Address (name set off by commas or a full stop): "I am, X, still waiting for the slides.", "I am. X, are you there?".
- Relation, not identity: "I am X's colleague." (a possessive is no occurrence), "I am with X.", "I am next to X.", "This is for X.", "This is X's view.", "This is X Sharma's view." (name followed by a longer possessive name), "I am sure X will join.", "I am glad X is here." (the cue must be directly before the name).
Kept ACCEPTED, deliberately: my name is / my name's / I am / I'm / call me / they call me X; "X here" and "X speaking" opening a clause; "This is <Full Name>" opening a clause; "Hello everyone, I would like to introduce myself, I'm X.". Recall limits I knowingly accept: a hedge, negation, reporting or question word earlier in the same sentence refuses ("I think I'm X", "Before we go ahead, I'm X"; but "I think we start. I'm X." is two sentences and still ships); curly-apostrophe "I’m X" does not match the base cue and is refused, as in the base.

## Block-binding rule (namingTurns; speakers-llm.ts untouched at 300)
A self-identification binds ONLY the label whose OWN turn contains it. A cited turn only LOCATES a block of the proposed label (its own, or the label's block right before or after the cited turn). Evidence is a turn that (a) lies inside that block, (b) is spoken by the proposed label itself (explicit `speakerRef === label` filter added), and (c) passes `relationGate("selfIdentification")`, i.e. every guard above. The cited turn itself is never evidence unless it also satisfies (a)-(c). A neighbour of a different label is never evidence for this label (handover and thanks are OFF), so a self-identification spoken by another label never binds the proposed one. Tested layouts (speaker-selfid-ledger.test.ts, 10): own turn cited; neighbour cited, same label (own next turn; other label's trailing turn); label = speaker citing the next block; boundary (T last in the block, cite first turn or next block; T first in the block, cite the preceding turn); DIFFERENT label (T cited; filler cited; T after the block): refused.

## ISS-PH3-005
`RELATION_ROUTES` is `Object.freeze({...} as const)`. The `routes` override parameter is removed from `relationGate` and the three predicates (arity 3 and 2, pinned by a test). The forced-ON tests use `occurrenceAccepted`, which ignores the switch, is documented TEST SEAM ONLY, and a test scans every non-test source file under packages/index/src to confirm only speaker-relation-rules.ts mentions it. Handover and thanks stay OFF.

## The repaired differential test (speakers-differential.test.ts, 144 non-blank lines)
Grid: 14 names (5 persons incl. two multi-token; 9 place, organisation, role, calendar, language and function words) x 52 templates (8 genuine self-identifications; 7 reported; 3 hearsay; 5 quoted; 4 question; 3 hypothetical; 4 negation; 2 address; 8 relation; 9 third-party handover, thanks, address) x 7 layouts (own turn; own first of block; own last of block (boundary); preceding; following; both neighbours; between blocks) x 2 proposed labels (spk:0 and spk:1, so label = speaker is covered) x EVERY cited turn: 29,120 end-to-end cells through `extractSpeakers`, base and lane; plus 728 predicate cells. All seven ISS-PH3-004 recorded forms and every family above are in the grid.
Allowed class, defined POSITIVELY by `oracle(T, N)`, written for the test with no call into production code: the WHOLE turn is an optional greeting followed by exactly one of `My name is N` / `I am|I'm N` / `Call me|They call me N` / `N here` / `N speaking` / `This is N speaking`, with the name directly after the cue, and the turn contains no quote mark, question mark, or word from {said, says, told, tell, wrote, go, goes, went, like, think, thought, if, not, no, never, wish, suppose, whether, wonder, apparently, were, n't}. The test asserts EVERY lane shipment (not only lane-only ones) has evidence that is spoken by the shipped label and oracle-clean. An oracle self-check test pins that it accepts only the "genuine" templates (a weak oracle would make the test vacuous).
Result (printed by the test): `DIFF predicate: 728 cells, base accepts 354, lane accepts 79, violations 0`; `DIFF end-to-end: 29120 cells, base ships 5664, lane ships 1422, lane-only 790, outside the oracle class 0, base-only (recall lost) 5032`.
Lane-only 790 by class (form / name kind): call-me 100 person + 120 place-org-role; i-am 100 + 120; my-name-is 50 + 60; x-here 50 + 60; x-speaking 50 + 60; this-is-speaking 20 person (multi-token names only). Persons 370, place-org-role 420. Each is a genuine own-turn self-identification reached through a neighbouring citation; none is quoted, reported, a question, negation, address or relation.
Proof that the repaired test fails on the old code and on the named mutation (each run on the differential test ALONE; per-mutation byte backup in memory, restore in `finally`, `git hash-object` compared with the pre-mutation blob after every run):
| Mutation | Result |
|---|---|
| cycle-3 sources of speaker-relation-rules.ts and speaker-reported-rules.ts (`git show d5c8912:...`) | KILLED: 3 fail; 167 predicate acceptances outside base-or-oracle, 3006 lane shipments outside the allowed class, plus the frozen-routes test |
| drop the quoted-speech guard (`isQuotedAt` always false) | KILLED: 2 fail; 33 predicate acceptances and 594 lane shipments outside the class (the cycle-3 differential: SURVIVED) |
| `occurrenceAccepted` drops `isReportedAt` | KILLED: 2 fail |
| `isCleanSelfIdentificationAt` always true | KILLED: 2 fail |
| `RELATION_ROUTES` not frozen | KILLED: differential 1 fail; speaker-selfid-ledger 1 fail |
The harness is a scratch script outside the repo (backup and `finally` restore, not a trap); after every restore the blob hash equalled the pre-mutation hash; the final HEAD-fidelity check is below.

## D-015 by issue id (recorded reproductions verbatim; predicate level and end to end; all layouts)
| Issue | Corpus | Result |
|---|---|---|
| ISS-PH3-004 | 7 recorded forms x 14 names listed in the row (98 texts) | predicate 98/98 refused; end to end 980/980 refused (98 texts x 10 binding layouts, including the recorded layouts A and B) |
| ISS-PH3-001 | 3 recorded texts | refused, predicate and all layouts (speaker-relation-ledger.test.ts) |
| ISS-PH3-002 | 6 recorded texts | refused, predicate and all layouts |
| ISS-104 | 20 recorded attacks | predicate 20/20, own turn 20/20, preceding 20/20, following 20/20 refused |
| ISS-282 | 8 recorded wrong links | `qa/probes/iss282-c0-replay.mts`: `--- ISS-282 recorded wrong links refused: 8/8` |
| ISS-093 | 20-case corpus | still asserted in speaker-name-rules.test.ts (106/106 pass) |
OPEN, by name: none among the recorded cases. ISS-PH3-003's unpinned-session and 01-block-stats parts remain open (unchanged).

## Replay (offline, recorded c1 model text; no model, no network)
`08-replay.mts --from c1 --tag c4r`, then `node --import tsx 05-score.mjs --tag c4r --raw-tag c1` (05-score needs `--import tsx`):
| Code | accepted | correct | wrong | additions |
|---|---|---|---|---|
| base 536a56a (the cycle-3 checker's measurement of the frozen base, same replay) | 15 | 0 | 15 | 0 |
| lane cycle 3 | 3 | 3 | 0 | 0 |
| lane cycle 4 | 3 | 3 | 0 | 0 |
Same names as cycle 3 (Jubin Thakkar, spk:0 leeds; one per run); no correct name dropped by the stricter rules. wrongPairs 0, ISS255 "4/4", stableAll true. Phase-3 bar 5 (at least one correct addition) is NOT met even offline: additions 0. Nothing was tuned. New files: `measurement-summary.c4r.json`, `run-results.c4r.jsonl` (same naming as c2r, c3r).

## Places, organisations and role words under "I am X": D-052
Behaviour NOT changed. Base and lane both ship "Hello, I'm Google.", "My name is Paris.", "Hi all, India here.", "I am Moderator today." (probe: Paris, India, Google, Moderator, Diwali, English, Amazon, Mumbai and Chair are all accepted under "Hello, I'm N." / "My name is N." / "Hi all, N here."; Everyone, Not and Sorry are refused as function words). In the differential grid 420 of the 790 lane-only acceptances are of this kind (call-me 120, i-am 120, my-name-is 60, x-here 60, x-speaking 60; names Paris, India, Google, Moderator, Diwali, English); they are inside the oracle class by definition (a clean first-person self-identification).
What D-052 says (docs/DECISIONS.md, `## D-052 | 2026-09-28`, Ruling 2, Approver Umesh): "The remaining speaker bypasses (India, Mumbai, Google) are place/organisation names that are each also a real person's name, so no word list can separate them — only the surrounding sentence can. Umesh chose 'add a place-vs-person signal' over accepting the residue, over a place-name lookup list, and over parking it. ... A place-name lookup list was specifically NOT chosen, because it wrongly rejects real people named India or Paris and the list never ends." So D-052 authorizes a contextual signal and rejects any name list; it does not itself mention an explicit "Hello, I'm Google." introduction. The code (speaker-name-rules.ts, `readsAsAPlaceOrOrg`) reads the ruling as keeping "my name is Paris" resolvable while demoting only the weak after-cues. Role words (Moderator, Chair) are not mentioned by D-052 at all. For the Approver: a speaker's explicit introduction as a place, organisation or role word cannot be told from a person of that name without the lookup D-052 rejected; the lane inherits the base's behaviour exactly here.

## Evidence (cycle 4; node v24.19.0, from packages/index unless noted, each under timeout)
- `node --test --import tsx src/pipeline/<file>.test.ts`: speaker-relation-rules `tests 10 pass 10 fail 0`; speaker-relation-ledger `8/8`; speaker-selfid-ledger (new) `8/8`; speakers-differential `pass 5 fail 0` (about 40 s); speakers-llm `50/50`; speaker-name-rules `106/106`; speakers-windows `29/29`; speakers `16/16`; speaker-docs `13/13`. From the repo root: `node --test qa/evidence/u2-4-phase3-precision-regate-2026-09-22/corpus-lock.test.mjs` `pass 4 fail 0`.
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json`: no output, exit 0.
- `node scripts/lint-dirsize.mjs`: `lint-dirsize: OK (110 dir(s) within budget)` before and after. `lint-loc.mjs`: the same 7 pre-existing violations, none in speaker files; `lint-dupes.mjs`: the same 1 pre-existing (`recordApproval`). Non-blank lines: speaker-relation-rules.ts 100, speaker-reported-rules.ts 44, speaker-selfid-rules.ts 49, speakers-llm.ts 300 (not touched), speakers-differential.test.ts 144, speaker-selfid-ledger.test.ts 110.
- `node --import tsx qa/probes/iss282-c0-replay.mts`: `--- ISS-282 recorded wrong links refused: 8/8`.

## Not delivered (unchanged in substance)
The live gate is still outstanding and NOT claimed: Ollama qwen3:8b digest 500a1f067a9f, 2340 calls, `04-regate-eval.mts --runs 1,2,3 --tag c2` then `05-score.mjs --tag c2`. The five gate bars are not evidenced. Bar 5 (a correct addition) is not met even offline (additions 0). Handover and thanks are OFF. Contract change C14 stays deferred to the Approver; qa/contracts is untouched. ISS-283 not delivered. No ledger status changed. Unverified: behaviour on live model output; the oracle and the guards are English-only; the hedge and negation word lists were not tuned against real transcripts beyond the recorded corpus.

---

# Fix cycle 5 (checker verdict u2-4-phase3-resume-c2, cycle 4: FAIL; ISS-PH3-006 critical, ISS-PH3-007 low)

## Why four cycles of deny-listing failed
Cycles 1 to 4 each answered "is this a clean self-identification?" with a list of BAD contexts (reporting verbs, hedges, negation, quote marks). A list over free text is closed only for contexts someone has already seen; each checker round found one more ("I am N, he said." where the verb comes AFTER, "His words:", "Repeat after me", "in the movie", "Usne kaha", and "I am Rashi and this is Makrand" where a second name rides along). The block-location path turns any base-cue false positive into a shipment under a neighbouring citation, so every unlisted context was a wrong name. Cycle 5 inverts the rule: a name is accepted only when the sentence holding the cue is, end to end, one of a few positively described shapes; every unknown word, in any language, fails to match. The independent oracle in the differential test is inverted too: it ENUMERATES the allowed strings (a generated set), so there is no deny-list in the test to be outflanked.

## The allow-list (speaker-selfid-rules.ts, 95 non-blank lines; `isCleanSelfIdentificationAt`)
Unit of text: the SENTENCE that holds the cue, plus a positive test of its neighbours. Why not the whole turn: the one correct name in the recorded corpus (Jubin Thakkar, 2026-08-24 Leeds Arts) is the 4th sentence of a 132-sentence turn ("Well, thank you so much for sharing that, and ... Um, let me quickly introduce myself first. My name is Jubin Thakkar. I am the South Asia representative ..."). A whole-turn rule would refuse the only correct name.
- The sentence = OPENERS, then a cue, then exactly ONE name (the candidate), then a closed TAIL, then `.` or `!` or nothing. A `?` refuses. No filler: "I'm Rashi, yeah." refuses.
- Before it: walking back, every earlier sentence must be opener-only ("Hi everyone.", "Thank you.") until the start of the turn or a LEAD-IN sentence ("Let me quickly introduce myself first."); a lead-in announces the speaker's own introduction, so what precedes it is free. Any other sentence directly before ("Repeat after me.", "Quote.", "He said hello.") refuses: that is how framing crosses a full stop.
- After it: the next sentence, if any, must open with a closed first-person or continuation word (I, I'm, we, my, our, today, welcome, thank(s), and, so, before, first, let, over, hi, hello, good, okay, uh, um, please, now, also). "That is what he said." / "Those were his words." / "Unquote." refuse.
- Typography: straight and curly apostrophes identical (normalised in `occurrenceAccepted` and again in the module), whitespace collapsed.
Openers (closed list in the file): hi, hello, hey, namaste, good morning/afternoon/evening/day, okay, ok, so, well, alright, now, um, uh, thanks, thank you, welcome, everyone, all, folks, friends, and, again, actually, there. Lead-in phrase (same sentence or the previous one): let me / I would like to / I'd like to / I want to / allow me to, with quickly|briefly|just|first|also, then "introduce myself".
Cues (`SHAPES` table): (1) `my name is|my name's|I am|I'm|this side` + name; (2) `this is` + name, FULL NAME only (2+ tokens; "This is Priya." introduces someone), optionally followed by `speaking`; (3) name + `here|speaking`, with the idiom tails below; (4) the single exact shape `Before I invite our next speaker, I should say: call me N.`
Tail (what may follow the name; `tailOk`): nothing; ` today`; `, and welcome`; ` from <up to 5 words>` where every word is capitalised/numeric or in a closed lowercase list (the, of, team, office, department, university, college, school, institute, admissions, marketing, sales, international, recruitment, outreach, partnerships, regional, programme, program, group, company, centre, center); ` and I lead|head|manage|handle|run|look after|work with/on/at/in/for ...`, ` and I am|I'm a|an|the ...`, ` and I will|I'll be ...`, ` and today we|I ...`, each followed by 1 to 6 plain lowercase words outside a small STOP set (negation, reporting and role-play words; belt and braces inside a six-word clause). "in the movie", "ka friend", "'s colleague", a second capitalised name after "and", any other comma clause and any Hindi word start no listed tail, so they refuse. The "<Name> here|speaking" shape alone also accepts the idiom tails pinned by ISS-098 and ISS-104 recall tests: ` here`, ` again`, ` now`, ` over Zoom`, ` (word)`, ` as the <1-3 words>`, ` to talk about <1-4 words>`, ` -- good to be here|with you`, `... thanks all`, ` today from <org>`, ` speaking from <org>`.
Accepted: "My name is Ruby and I lead admissions." / "Hi all, Ruby here." / "Hello, I’m Rashi from the Leeds office." / "This is Makrand Rajadhyaksha from Vidysea." / the Jubin turn. Refused: "I am Rashi and this is Makrand Rajadhyaksha." (BOTH names), "I'm Rashi, yeah.", "Call me Nikhil.", "They call me Nikhil.", "Thank you, Priya. I'm Rashi.", "I'm Rashi. That is what he said.", "Mera naam Rashi hai.", "Rashi here has an announcement.".
Still applied first, unchanged: name-shaped and not a function word; `isReportedAt` (quote or reporting) on every route; the base cue; evidence spoken by the bound label; frozen routes, handover and thanks OFF. Hindi cues ("mera naam N hai", "main N hoon") are NOT added: recall for a later, separately checked unit. "myself Rashi" is not a base cue and stays refused.

## `call me` (decision)
Accepted: ONLY the exact shape `Before I invite our next speaker, I should say: call me Ruby.`, required by speaker-name-rules.test.ts "ISS-255: handover markers do not block genuine direct self-naming". "Call me X" and "They call me X" are now REFUSED (their only requirement was cycle 4's own selfid-ledger "accepted on purpose" assertion, which I removed; the cycle-4 checker called hostile variants arguable). Pinned as refused in speaker-selfid-allowlist.test.ts.

## Which existing test requires which accepted shape
- `I am|I'm|my name is|my name's N` with tails and openers: speaker-relation-rules.test.ts (Ruby, "...I lead admissions."), speakers-llm.test.ts ("I am Amrita Mhapankar, and welcome.", "Actually, my name is Rahul Mehta."), speaker-selfid-ledger.test.ts (lead-in "Hello everyone, I would like to introduce myself, I'm Ruby.").
- Opener-only previous sentences and a first-person next sentence: speaker-name-rules.test.ts ISS-255 recorded ground truth "Thank you. Hello everyone. My name is Ruby. I work at Uni-Italia."; the lead-in rule: the recorded Jubin turn.
- `this side N`: speakers-llm.test.ts "Good morning, this side Nilesh Gotecha from CEPT." and ISS-094. `this is <Full Name>`: speaker-relation-rules.test.ts, ISS-094, speakers-llm.test.ts.
- `N here|speaking` + idiom tails: ISS-098 recall (10 texts), ISS-104 here-idiom recall (6 texts), speakers-llm.test.ts "Anita Desai here.", "Ruby here again.", "Hello, D'Souza here.".

## Test edits that record a recall cost (changed on purpose)
- speaker-name-rules.test.ts: four former positives need a FREE sentence before the cue ("We met in Paris. My name is Paris.", "I am in Mumbai today. My name is Mumbai Sharma.", "Our office is in Priya's building. My name is Priya.", "Coming up next, I will share the slides. My name is Nilesh."). They are now asserted REFUSED ("cycle 5 recall cost"), with allow-list-friendly twins in the positive lists ("Hi, my name is Paris.", "Hello, my name is Mumbai Sharma.", "Hello everyone, I'm Priya.", "Hello everyone, I would like to introduce myself, my name is Nilesh."). The file is at 399 non-blank lines (budget 400).
- speakers-windows.test.ts ISS-282: "I'm Kshitij, and over to Ruby." became "I'm Kshitij. Over to Ruby." (a second name in the same sentence now refuses Kshitij too; two sentences keep the test's purpose: one evidence turn never binds two labels).
- speaker-relation-ledger.test.ts M7: "At Priya's desk, Priya here." self-identification now asserted false (a free clause precedes the cue).
- speaker-selfid-ledger.test.ts: "They call me Nikhil." removed from the accepted list.

## The repaired differential test (speakers-differential.test.ts, 159 non-blank lines) and the proof it fails on the cycle-4 sources
Grid: 14 names x 92 templates x 8 layouts (the cycle-4 seven plus "own block with a third-person mention") x 2 labels x every cite = 59,248 end-to-end cells through `extractSpeakers`, base and lane; 1,288 predicate cells. New templates: all 17 recorded ISS-PH3-006 forms verbatim, the Makrand case in both directions, "I am {N} and this is Priya.", framing across a full stop (Repeat after me. / Quote. / He said hello. / Reading aloud from the script.), trailing attribution ("That is what he said.", "Those were his words.", "Unquote."), role play, Hindi-mixed ("Mera naam N hai.", "Namaste, usne bola I'm N."), filler ("I'm N, yeah."), plus new genuine multi-sentence and curly-apostrophe forms. The oracle is a generated set (BEFORE x OPENER x FORM x TAIL x END x AFTER); it imports nothing from production and does not copy the allow-list table. The test asserts EVERY lane shipment's evidence is spoken by the shipped label and is in that set.
Result now: `DIFF predicate: 1288 cells, base accepts 764, lane accepts 112, violations 0`; `DIFF end-to-end: 59248 cells, base ships 13752, lane ships 2240, lane-only 1331 [["person",617],["place-org-role",714]], outside the oracle class 0, base-only (recall lost) 12843`.
Against the cycle-4 sources (speaker-relation-rules.ts and speaker-selfid-rules.ts from 301b9cc written in, same new test, byte backup restored in `finally`, `git hash-object` equal afterwards): `DIFF predicate: 1288 cells, base accepts 764, lane accepts 478, violations 377`; `DIFF end-to-end: ... lane ships 9560, lane-only 1111, outside the oracle class 7540`; 2 of 5 tests fail. So the repaired test catches ISS-PH3-006: 7,540 shipments outside the allowed class on the cycle-4 sources, 0 now.
Mutation runs (per-mutation backup, restore in `finally`, hash check after each; every restore hash-equal):
| Mutation | Test | Result |
|---|---|---|
| allow-list always true | differential | KILLED (fail 2) |
| drop the previous-sentence walk | differential | KILLED (fail 2) |
| drop the next-sentence check | differential | KILLED (fail 2) |
| tail accepts anything | differential | KILLED (fail 2) |
| drop `isReportedAt` from the gate | speaker-selfid-ledger | KILLED (fail 2) |
| ISS-PH3-007: remove the speaker==label filter in `namingTurns` | speaker-selfid-allowlist (new, direct call) | KILLED (fail 1); the differential alone still passes it, as the checker said (equivalent through `extractSpeakers`) |

## ISS-PH3-007
speaker-selfid-allowlist.test.ts: a direct `namingTurns` call on a block holding spk:0 "Hello, I'm Nikhil.", spk:1 "Hello, I'm Priya.", spk:0 "Thanks." Asserts label spk:0 binds Nikhil at [0] and Priya at [] (another label's self-introduction does not bind), and the mirror for spk:1.

## D-015 by issue id (recorded reproductions verbatim; predicate level and end to end)
| Issue | Corpus | Result |
|---|---|---|
| ISS-PH3-006 | the row's 17 forms READ FROM qa/issues.ph3.jsonl x 7 names, plus the Makrand case for both names | predicate 121/121 refused; end to end 8 layouts x 2 labels x every cite (5,566 turn cells): 0 shipped (speaker-selfid-allowlist.test.ts) |
| ISS-PH3-004 | 7 forms x 14 names (98 texts) | predicate 98/98 refused; end to end 980/980 refused (speaker-selfid-ledger.test.ts) |
| ISS-PH3-001 / -002 | 3 / 6 recorded texts | refused, predicate and all layouts (speaker-relation-ledger.test.ts 8/8) |
| ISS-104 | 20 recorded attacks | predicate 20/20; own turn 20/20; preceding 20/20; following 20/20 refused |
| ISS-282 | 8 recorded wrong links | `qa/probes/iss282-c0-replay.mts`: `ISS-282 recorded wrong links refused: 8/8` |
| ISS-093 | its 20 | still asserted in speaker-name-rules.test.ts (110/110) |
| ISS-094 / ISS-098 | as asserted | the ten ISS-098 recall texts and the ISS-094 forms still resolve (speaker-name-rules.test.ts, speakers-llm.test.ts) |
OPEN, by name: none among the recorded cases. ISS-PH3-003's unpinned-session and block-stats parts remain open (unchanged).

## Replay (offline, recorded c1 model text; no model, no network)
`08-replay.mts --from c1 --tag c5r`, then `node --import tsx 05-score.mjs --tag c5r --raw-tag c1`:
| Code | accepted | correct | wrong | additions |
|---|---|---|---|---|
| base 536a56a | 15 | 0 | 15 | 0 |
| lane cycle 4 | 3 | 3 | 0 | 0 |
| lane cycle 5 | 3 | 3 | 0 | 0 |
Same name as cycle 4 (Jubin Thakkar, spk:0, one per run x 3 runs); no correct name lost. It is the long Leeds Arts monologue; the allow-list accepts it through the lead-in sentence ("Um, let me quickly introduce myself first.") and the first-person next sentence ("I am the South Asia representative ..."), generic shapes, not a special case. wrongPairs 0, ISS255 "4/4", stableAll true. Bar 5 (a correct addition) is NOT met even offline (additions 0). Nothing was tuned. New files: measurement-summary.c5r.json, run-results.c5r.jsonl.

## Recall cost: 40 natural introductions (author-written for this report; the number goes to the owner)
The lane accepts 25 of 40 (24 before one unambiguous opener, "there", was added for "Hi there! I'm Jubin."). Refused (15):
- Free text or a comma clause around the name: "Hi, this is Kshitij from Vidysea." (this is + single name), "Hi, it's Ruby here from the Leeds office." (cue "it's" is not a base cue), "I think most of you know me, I'm Sumit." (free clause before), "Thanks for having me. I'm Sonal.", "So, I'm Ankit, and welcome to the session.", "Hello everyone, I'm Ruby, and I'm the regional manager.", "Hi, I am Makrand, from the visa team." (lowercase "visa" not in the org list), "Hi everyone, I’m Anisha, thrilled to be here.", "Hello all, Prasanti here, happy to join.", "Good morning everyone. I'm Sonal, and I am a counsellor at Vidysea." (comma before "and I am"), "Welcome to the webinar, my name is Rashi.".
- Other cues: "Myself Rashi, I lead the South Asia team.", "Hi, myself Ankit from CEPT." (not base cues), "This side Nupur, good morning all." (trailing clause), "Hello, you can call me Sumit.".
The three the cycle-4 checker named stay refused. No shapes were added to inflate the count. Candidate later units, each separately checked: single-name "this is", "it's N here", comma-and tails, Hindi cues.

## Places, organisations and role words (policy unchanged; D-052; open Approver question)
Cycle-4 grid (the 8 genuine templates x Paris, India, Google, Moderator, Diwali, English, Everyone, Not, Sorry x the 7 old layouts x 2 labels x every cite): base ships 768, lane cycle 4 756, lane cycle 5 540 (Paris, India, Google, Moderator, Diwali, English 90 each; Everyone, Not, Sorry 0). Not worse. In the new differential grid 714 of 1,331 lane-only shipments are of this kind (inside the oracle class by definition).

## Evidence (cycle 5; node v24.19.0, from packages/index unless noted, each under timeout)
- `node --test --import tsx src/pipeline/<file>.test.ts`: speaker-relation-rules pass 10 fail 0; speaker-relation-ledger 8/0; speaker-selfid-ledger 8/0; speaker-selfid-allowlist (new) 6/0; speakers-differential 5/0 (about 27 s); speakers-llm 50/0; speaker-name-rules 110/0; speakers-windows 29/0; speakers 16/0; speaker-docs 13/0. Repo root: `node --test qa/evidence/u2-4-phase3-precision-regate-2026-09-22/corpus-lock.test.mjs` pass 4 fail 0.
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json`: no output, exit 0.
- `node scripts/lint-dirsize.mjs`: `lint-dirsize: OK (110 dir(s) within budget)` before and after. `lint-loc.mjs`: the same 7 pre-existing violations, none in speaker files. Non-blank lines: speaker-selfid-rules.ts 95, speaker-relation-rules.ts 101, speaker-reported-rules.ts 44, speakers-llm.ts 300 (untouched), speakers-differential.test.ts 159, speaker-selfid-allowlist.test.ts 78, speaker-name-rules.test.ts 399.
- `node --import tsx qa/probes/iss282-c0-replay.mts`: `--- ISS-282 recorded wrong links refused: 8/8`.

## Not delivered (unchanged in substance)
The live gate is still outstanding and NOT claimed: Ollama qwen3:8b digest 500a1f067a9f, 2340 calls, `04-regate-eval.mts --runs 1,2,3 --tag c5` then `05-score.mjs --tag c5`. The five gate bars are not evidenced. Bar 5 (a correct addition) is not met even offline. Handover and thanks are OFF. Guards and shapes are English-only. Contract change C14 stays deferred to the Approver; qa/contracts is untouched. No ledger status changed. Unverified: behaviour on live model output; the tail lists (org words, STOP words) were not tuned against real transcripts beyond the recorded corpus; the 40 introductions are author-written, not sampled.

---

# Fix cycle 6 (ISS-PH3-008 critical, ISS-PH3-009 medium)

## The Approver's ruling and its scope
Umesh, 2026-10-11: do cycle 6, narrowly: close the two-introductions-in-one-turn case; nothing else. Nothing was loosened: no accepted shape added, no recall work, the single `call me` sentence untouched, no edit to qa/contracts, qa/verdicts, enforcement paths or ledger statuses. speakers-llm.ts is untouched (300 non-blank lines).

## What failed, and why the candidate count must precede the filter
Turn `Hello everyone, I'm Priya. Hello everyone, I'm Rashi.` with both names proposed for spk:0: the base ships nothing (two names for one label, contract C7); cycle 5 shipped spk:0 -> Priya. The allow-list refuses Rashi early (the sentence before it is not opener-only), so only Priya reaches the contradiction check, which sees ONE name and never fires. Counting "how many introductions does this turn hold" AFTER the filter counts only what the filter let through; the question must be asked of the raw turn, before any position, tail or lead-in test.

## The rule as built
1. `selfIntroductionCandidates(turn)` (speaker-selfid-rules.ts): every capitalised name run directly after a self-naming cue (`my name is | my name's | i am | i'm | this side | this is | call me`) or directly before `here | speaking`, ANYWHERE in the turn (no sentence, quote, tail or lead-in test), that passes the two shape checks the base also applies to a proposed name (`looksLikeAName`, not `isDiscourseOnly`). Leading opener words before an `X here` run ("Hi Priya here") are stripped. No new cue list: the cues are the base's `SELF_NAMING_CUES` plus the allow-list's own `this side | this is | here | speaking`.
2. `turnHoldsOtherSelfIntroduction(turn, name)` is true when any candidate is not `name`. `occurrenceAccepted` (self-identification route only) returns false then. Effect: a turn holding a different-name candidate credits NO name to the label, whichever names the model proposed and whichever turn it cites.
3. The same name twice ("Hello, I'm Priya. I'm Priya.") is not ambiguous and still ships.

## Name-equality decision
Exact string equality after collapsing whitespace and curly apostrophes. The base has no same-person rule: it keys a label's names by exact string (`byName`), so "Priya" vs "Priya Sharma" and "Priya" vs "PRIYA" are two names there and are two names here: the turn is refused. No case or diacritic folding. Pinned by test; mutants M3a/M3b (first-token equality, case folding) are killed.

## Neighbours (item 2) and cases deliberately left OPEN
- Falls out of the same rule, now refused: `Hi, I'm Rashi. I'm Priya.` (single proposal, either name), `Hello, I'm Rashi. Hello, I'm Priya.`, `Hi. I'm Priya. I'm Rashi.`
- OPEN, no code: `Hi, I'm Rashi. I mean Priya.` (`I mean` is not a cue; adding it is a new cue list, out of scope; the base ships Rashi here too, so it is not a lane-vs-base regression) and `Hi, I'm Rashi. I'm kidding.` / `I'm Rashi and I am a fake.` (single name, low plausibility; ruled out of scope).
- Observed, not changed: a turn mixing a self-introduction with an ADDRESS of another name ("Hello, I'm Priya. Rashi, what do you think?"): the lane never ships where the base refuses (checked on 6 such texts). The address cue is deliberately NOT a candidate: counting "Thank you, Priya, for the introduction. I'm Rashi." as ambiguous would cost a very common correct introduction. The Approver may want to rule on that trade-off.

## ISS-PH3-009 (medium): closed
The missing test was a few lines: `speaker-twointro.test.ts` asserts `Hello, I'm Rashi and I lead Priya.`, `... and I work with Rahul Mehta.`, `Hello, I am Rashi and I will be handing over to Priya.` and `... and I lead Admissions.` are refused (and lowercase `and I lead admissions` is still accepted). Mutant M5 (`[a-z]` -> `[A-Za-z]` in tailOk) is now killed. No design change.

## D-015 by issue id (recorded reproductions verbatim, from the ledger rows; no authored corpus substitutes for them)
| Issue | Corpus | Result |
|---|---|---|
| ISS-PH3-008 | the row's 4 two-name turns READ FROM qa/issues.ph3.jsonl, both names proposed, 8 layouts x 2 labels x every cite | `ISS-PH3-008: 184/184 two-name cells refused` (base ships 0 of them as well) |
| ISS-PH3-008 | the row's 3 single-proposal texts | 1/3 refused (`I'm Priya`); 2/3 OPEN by name above (`I mean Priya`, `I'm kidding`) |
| ISS-PH3-008 grid | 84 cells rebuilt from the row's description: 6 first sentences x 7 second sentences x 2 name pairs, both names proposed for spk:0 citing t1 | base ships 0, lane ships 0, lane-only 0. NOTE: this is my reconstruction; the checker's exact 14 base-shipping cells are not in the row, so the base count differs from the verdict's 14 |
| ISS-104 | 20 recorded attacks | predicate 20/20; own, preceding, following turn 20/20 each (speaker-relation-ledger 8/8) |
| ISS-PH3-006 | 17 forms x 7 names + Makrand case | predicate 121/121; end to end 5,566 cells, 0 shipped |
| ISS-PH3-004 | 7 forms x 14 names | predicate 98/98; end to end 980/980 |
| ISS-PH3-001 / -002 | 3 / 6 recorded texts | refused (speaker-relation-ledger 8/8 incl. both) |
| ISS-255 | handover turn with/without full stop | speaker-name-rules 110/110 incl. the ISS-255 tests; replay ISS255 "4/4" |
| ISS-282 | 8 recorded wrong links | `--- ISS-282 recorded wrong links refused: 8/8` |
No count regressed.

## Replay (offline, recorded c1 model text; tag c6r; no model, no network)
`08-replay.mts --from c1 --tag c6r` then `05-score.mjs --tag c6r --raw-tag c1`: accepted 3, correct 3, precision 1, wrongIdentities 0, wrongPairs 0, additions 0, ISS255 "4/4", stableAll true. The three are spk:0 -> "Jubin Thakkar" (Leeds Arts t006), as in cycle 5. No correct name lost to the new rule. Bar 5 (a correct addition) is still NOT met offline.

## Recall
The cycle-5 set of 40 was not committed; reconstructed for this cycle as the 15 refused texts quoted verbatim in the cycle-5 section above plus 26 author-written introductions (41 texts; author-written, not sampled). Cycle-5 predicate (rule off): 25 of 41; cycle 6: 25 of 41; none lost. The new rule only refuses a turn that holds a second, different self-introduction cue+name.
Differential (speakers-differential.test.ts, unchanged): `DIFF predicate: 1288 cells, base accepts 764, lane accepts 112, violations 0`; `DIFF end-to-end: 59248 cells, base ships 13752, lane ships 2240, lane-only 1331, outside the oracle class 0, base-only 12843`. Identical to cycle 5 (that grid proposes one name per cell, so it cannot see this class; the new 84-cell test does).

## Mutations (own harness outside the repo: per-mutation byte backup, restore in `finally`, spawnSync timeout 170 s per file, restore verified by byte compare and `git hash-object` equal to the pre-mutation blob; run over the speaker-twointro, speaker-selfid-allowlist, speaker-name-rules, speaker-relation-ledger tests)
| # | Mutation | Result |
|---|---|---|
| M1 | remove the whole-turn rule | KILLED (5): the 184-cell recorded test, the single-name test, the 84-cell grid, "same name twice ... different name refuses" |
| M2 | count candidates AFTER the allow-list filter (the cycle-5 bug) | KILLED (5): same tests |
| M3a | different names treated as the same (first-token equality) | KILLED (1): "name equality is EXACT" |
| M3b | case folding | KILLED (1): "name equality is EXACT" |
| M3c | no name is ever "other" | KILLED (5) |
| M4 | rule applied to the first sentence only | KILLED (6): grid, recorded cells, single-name, whole-turn |
| M5 | ISS-PH3-009: capitals allowed in the `and I lead ...` tail | KILLED (1): "ISS-PH3-009 ..." |
| M6 | drop the `X here|speaking` candidate form | KILLED (1): "candidates are found anywhere in the turn" |
Restore verified after every mutation. My first run of M4 was invalid (the mutation text lost a backslash and was a no-op, so it printed SURVIVED); re-done with a working mutation, killed.

## Evidence (node v24.19.0, from packages/index unless noted, each under timeout 170)
- `node --test --import tsx src/pipeline/<file>.test.ts`: speaker-twointro (new) pass 8 fail 0; speaker-selfid-allowlist 6/0; speaker-selfid-ledger 8/0; speaker-relation-ledger 8/0; speaker-relation-rules 10/0; speaker-name-rules 110/0; speakers-llm 50/0; speakers-windows 29/0; speakers-differential 5/0; speakers 16/0; speaker-docs 13/0.
- Key output: `ISS-PH3-008: 184/184 two-name cells refused (recorded two-name turns 4); base ships 0` and `ISS-PH3-008 grid: 84 cells, base ships 0, lane ships 0, lane-only 0`.
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json`: no output, exit 0.
- `node scripts/lint-dirsize.mjs`: `lint-dirsize: OK (110 dir(s) within budget)`. `lint-loc`: the same 7 pre-existing violations, none in speaker files. Non-blank lines: speakers-llm.ts 300 (untouched), speaker-selfid-rules.ts 131, speaker-relation-rules.ts 102, speaker-twointro.test.ts 118, speaker-name-rules.test.ts 399 (untouched).
- `node --import tsx qa/probes/iss282-c0-replay.mts`: `--- ISS-282 recorded wrong links refused: 8/8`.
- New files: speaker-twointro.test.ts, measurement-summary.c6r.json, run-results.c6r.jsonl.

## Not delivered / standing statements
The live gate has NOT been run (Ollama qwen3:8b digest 500a1f067a9f, 2340 calls: `04-regate-eval.mts --runs 1,2,3 --tag c6` then `05-score.mjs --tag c6`). ISS-104 and ISS-282 are NOT closed by this unit and no ledger status was changed. Handover and thanks stay OFF. Unverified: behaviour on live model output (a real model proposing both names of a merged turn); the 84-cell grid is a reconstruction of the checker's; English-only cues; the recall set is author-written.
