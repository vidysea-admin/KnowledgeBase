# iss-ph3-001-002-004-006-reported-speech-names

**Handshake status:** checked-PASS (Checked: qa/verdicts/iss-ph3-001-002-004-006-reported-speech-names.md, cycle 0, d055571; no source change; offline scope; ISS-104 stays open pending phase-3 live gate)
Fix cycle: 0
Tier: 2 (critical ledger rows still `open` in qa/issues.ph3.jsonl while qa/manifests/u2-4-phase3-resume-c2.md is checked-PASS cycle 6).
Lane: lane/ph3close. Class: measurement unit; NO source edit, NO new test file. Ledger for this lane: qa/issues.ph3close.jsonl (none filed).

## Question
Are ISS-PH3-001, -002, -004, -006 fixed at HEAD 031b0e2 with stale `open` rows, or still reproducible?

## Answer
Fixed at HEAD. Every recorded reproduction is refused, at predicate level and end to end through `extractSpeakers`. The rows are stale (the u2-4 cycles 3-6 fixes landed; the checker verified the recorded cases each cycle but did not flip these rows; the ph3 file shows 7 open, 2 verified). Status change is the checker's job; no row was edited here.

## Step 1 measurement (existing standing tests, run verbatim from packages/index, HEAD 031b0e2)
| id | recorded reproductions | refused before any change | test that pins it |
|---|---|---|---|
| ISS-PH3-001 | 3 texts x predicate + 3 layouts (own/preceding/following) | 3/3 (all cells refused) | speaker-relation-ledger.test.ts "ISS-PH3-001 (reported speech)" |
| ISS-PH3-002 | 6 texts (3 preceding-layout, 3 following-layout) x predicate + 3 layouts; plus ISS-104's 20 in 3 layouts | 6/6; ISS-104 20/20 in every layout | speaker-relation-ledger.test.ts "ISS-PH3-002", "D-015 ISS-104" x4 |
| ISS-PH3-004 | 7 forms x 14 names = 98 texts | predicate 98/98; end to end 980/980 over 10 binding layouts (includes the row's layouts A/B citing t2) | speaker-selfid-ledger.test.ts |
| ISS-PH3-006 | 17 forms read from the ledger row + 2-name case, x 7 names = 121 texts | predicate 121/121; end to end 5,566 cells, shipped 0 | speaker-selfid-allowlist.test.ts (reads qa/issues.ph3.jsonl, not retyped) |

No reproduction is left open. Because equivalent standing regression tests already exist, none was added (the brief: commit a test only if no equivalent exists).

## Evidence (packages/index, node v24 off PATH, `node --test --import tsx <file>`)
- speaker-relation-ledger.test.ts: `D-015 ISS-104 predicate: refused 20/20`; `end-to-end own turn / preceding turn / following turn: refused 20/20` each; ISS-PH3-001 and -002 tests pass. All 6 tests ok, no `not ok`.
- speaker-selfid-ledger.test.ts: `D-015 ISS-PH3-004 predicate: refused 98/98`; `D-015 ISS-PH3-004 end to end: refused 980/980`.
- speaker-selfid-allowlist.test.ts: `D-015 ISS-PH3-006 predicate: refused 121/121`; `D-015 ISS-PH3-006 end to end: 5566 cells, shipped 0`.
- Recall: the same files include the accept-on-purpose cases (selfid-ledger "accepted on purpose", allowlist "accepted shapes") and pass; source is unchanged so recall is unchanged by construction.

## Not covered
- Live (LLM) gate: offline only, as in the u2-4 cycle-6 verdict.
- Related rows ISS-104 (open, critical; its 20 recorded attacks are 20/20 refused in the above), ISS-282/283/289 read for context only, not re-measured beyond what the files above assert.
- Ledger row status flips (open -> verified) for ISS-PH3-001/002/004/006 and ISS-104 are left to the checker.
