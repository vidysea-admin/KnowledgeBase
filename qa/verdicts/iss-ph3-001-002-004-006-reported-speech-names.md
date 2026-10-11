# Verdict: iss-ph3-001-002-004-006-reported-speech-names

VERDICT: PASS
Cycle checked: 0
Commit checked: a54a0f4 (lane/ph3close); no source changed by the maker (confirmed: manifest-only commit)
Scope: OFFLINE deterministic rules and fake-completion end-to-end only; live LLM gate not run.

## EXPLANATION

The claim holds: every recorded reproduction in the five rows is refused at HEAD, the rows were stale. I re-derived the corpora from the ledger rows, not from the maker's table.

Per-issue counts (own extraction vs test corpus vs run output):
- ISS-PH3-001: 3 recorded texts in the row; test PH3_001 holds the same 3; refused 3/3 at predicate and in 3 layouts (own/preceding/following). Maker 3/3: agree.
- ISS-PH3-002: 6 recorded (Mumbai x2, India, Paris, Google, Amazon); same 6 in the test; 6/6. Maker 6/6: agree.
- ISS-104: 20 recorded attacks parsed from the row by script and compared to the test's ISS_104 array: identical, 20 vs 20, same order. Predicate 20/20, end to end 20/20 in own, preceding and following layouts. The 'I am Not sure about that.' / Not case is in the corpus and refused (not shipped as person:not). Maker 20/20: agree.
- ISS-PH3-004: 7 forms x 14 names = 98 predicate, 98/98; end to end 980/980 (10 binding layouts). Maker 98/98: agree.
- ISS-PH3-006: 17 forms parsed from the row's evidence (I counted 17 by hand and by regex) + the two-name case, x 7 names = 121; predicate 121/121; end to end 5,566 cells, shipped 0. The test reads the forms from qa/issues.ph3.jsonl, not retyped. Maker 121/121: agree.
No recorded reproduction is un-replayed. The tests call the production predicates and extractSpeakers (fake completion only), not copies.

Test runs (packages/index, node --test --import tsx, timeout 600): speaker-relation-ledger 6/6 ok, speaker-selfid-ledger and speaker-selfid-allowlist all ok, zero `not ok`.

Mutation (harness ph3close-chk-mutate.mjs, own, untracked, deleted; byte backup per mutation, restored in finally, 240s timeout per test run):
- M1 RELATION_ROUTES handover/thanks false->true: KILLED (speaker-relation-ledger: ISS-PH3-002, ISS-104 predicate, ISS-104 preceding turn go red).
- M2 isReportedAt always false: KILLED by speaker-selfid-ledger (ISS-PH3-005 route-independence and forced-ON tests). The ISS-PH3-004 98-text tests stay green under M2, because the self-id allow-list also refuses those forms (redundant defence, not a gap).
- M3 selfIdentification pattern replaced by `text.length > 0`: KILLED (speaker-selfid-allowlist: PH3-006 predicate, PH3-006 end to end, refused-however-innocent).
- M4 base naming cue skipped on the self-id route: SURVIVED all three files (the allow-list makes it redundant; low, note only).
HEAD fidelity: git hash-object equals git rev-parse HEAD: for speaker-relation-rules.ts and speaker-reported-rules.ts; git status clean before ledger edits.

Scope honesty:
- PH3-002 is closed by the OFF switch, not by the guards. With handover/thanks forced ON (my own check via occurrenceAccepted), 5 of the 6 recorded cases are accepted by those predicates (only the Paris "students in" case is refused). The row's own fix_direction offers "hold the handover and thanks routes behind the live gate", and a differential test pins the routes OFF, so the row is verified; it must be re-opened if those routes are ever enabled. PH3-001's 3 texts are refused by the guards even with the route forced ON.
- ISS-104, PH3-004, PH3-006 name broader classes in their fix_direction (candidate-level rejection, allow-list). Their recorded strings are all refused and later cycles' differential grids cover the class offline; I did not re-run those grids.
- ISS-282 (critical, open): this evidence does not touch it (it is the phase-3 live re-gate result; needs a live re-run). ISS-283 (high, open): not touched (stability of the live run, 11 sessions x 3 runs). ISS-289 (high, open): not touched (the scorer's circular citation test; this evidence uses the production predicate itself). All three left open.

ISSUES-WRITTEN: none
