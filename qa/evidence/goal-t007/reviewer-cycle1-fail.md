# Independent checker verdict — goal-t007-review-source

VERDICT: FAIL
Cycle checked: 1
Task: T-007, priority tier 3. Scope: seven current reviewer-source API/UI/client/queue files,
against companion contract clauses 1–6 and full-parent C12 privacy/current provenance.
The manifest was in_progress at this review; this is a proven candidate acceptance failure,
not a ready-for-check PASS or whole-task verdict. Historical UI PASS is unchanged.

## Proven failure

`validate()` checks current source and pending invalidation before its final awaited
transcript-head query. A source consent withdrawal or new pending-invalidation marker
during that last query leaves the head/candidate unchanged and permits earlier private
evidence to return. Moving the candidate reload before final validation corrected the earlier
effective-head race but did not establish a coherent cross-state permission boundary.

Original reproduction **ISS-T007REVIEWSOURCE-001: 0/2 refused; unaffected control 1/1 PASS**.
Exact unchanged corpus: `qa/evidence/goal-t007/review-source-checker.test.ts`, SHA256
`30D3D3B6720332FB1E993AA7F35D3A6AC25350A5A6E1E5DFC931E03AE9AD3F5A`.
Both attacks invoke actual detector/repository and source reader with the fake Mongo
capability; they withdraw source consent or insert a pending marker at transcript-head
lookup 6 while preserving candidate JSON. Both actual failures were `Missing expected
rejection (ReviewSourceStaleError)`, rather than startup or fixture errors.

Independent probes were written by this checker and executed centrally by the sole CPU
broker. Exact receipt: `qa/evidence/goal-t051checker-broker-t007-reviewer-independent-red.json`;
raw `.stdout.txt` and `.stderr.txt` sibling artifacts retain named results/stack traces.
Invocation from repository root: bundled Node
`--import tsx --test --test-concurrency=1 --test-timeout=30000 qa/evidence/goal-t007/review-source-checker.test.ts`.
Outer bound 90,000 ms; UTC 2026-10-14T21:46:13.209Z → 21:46:14.398Z;
elapsed 1,185.062 ms; exit 1; counts 3 tests, 1 pass, 2 fail, 0 skipped/cancelled.
Receipt before/after seven source/probe/dependency pins are unchanged.

## Checked identity and source review

Source review resumed at 2026-10-14T21:43:09.2025440Z; seven packet pins checked at
2026-10-14T21:44:52.5225655Z. Original source byte backup confirmed at
2026-10-14T21:47:07.7522574Z, with the same source hash as the earlier actual run.
Receipt and current source/probe readback at 2026-10-14T21:48:14.0726925Z confirm unchanged
failure bytes. Per-command read durations: 0.8470132 s, 1.2838262 s, 0.49436 s,
0.4402047 s, 0.4386638 s (all exited 0). Exact review/probe drafting and broker approval
phase intervals were not instrumented; do not attribute gaps by subtraction.

| Candidate file | SHA256 |
| --- | --- |
| apps/api/src/whatsapp-review/review-source.ts | 4991950A7D4684A7780FA2C4D275FC298143C4A70FD57D077FC7343B3345FC93 |
| apps/api/src/whatsapp-review/review-source.test.ts | 2FFFF96B2E96373949ECB93F060F67B4B93DD97C342150D29D2587F273F83A19 |
| apps/web/src/pages/whatsapp-review/client.ts | A761B2CB887BBF572045B8BAEB804590A7030A2840D8D5C984C2FA99F61974ED |
| apps/web/src/pages/whatsapp-review/ReviewSourcePage.tsx | 136B04A65A1E65B5257E03C4857E9D0C4C263B21BF4D45DE599B4C5C15359C58 |
| apps/web/src/pages/whatsapp-review/ReviewSourcePage.test.tsx | 857BF7F8861B070FE8EA9ADCCC31D42909E6459BB52CD15EBF592BF4BB5A4781 |
| apps/web/src/pages/whatsapp/ReviewQueue.tsx | 1006C17696B628E5BBD156F1D20A7B730CA7AACFD12825A5292A967384E20614 |
| apps/web/src/pages/whatsapp/ReviewQueue.test.tsx | 6A837C0BDE141928C680F362D2299CF819173398D518652CC8820713D0CF5B1F |

Original source preserved at `qa/evidence/goal-t007/review-source-baseline-4991950A.ts.txt`.
Direct source review included full new reader/router/page/client, changed queue link,
actual AuthContext/shared fetch/effective-reader/canonical store and root composition.
Auth scope, tenant checks, explicit projections and login-session UI state fences are
present, but cannot compensate for the reproduced source permission race. Maker's
seven API and 28 web cases remain pending actual evidence and are not claimed green here.

ISSUES-WRITTEN: ISS-T007REVIEWSOURCE-001 in root-authorized unique shard
`qa/issues.T007REVIEWSOURCE.jsonl`; readers must include the union of all lane ledgers.

EXPLANATION: A repair must preserve and rerun both original recorded attacks verbatim,
prove their intended boundary fired, and retain the safe control. Establish coherent
permission/source/head state rather than shifting an endless last-await window. Record
the read/authorization consistency guarantee and any required real Mongo capability
honestly; no unsafe collection-only fallback or invented real persistence proof.
Resubmit a new matching cycle with actual API/UI/consumer evidence and current compiler
pins. Full C1–14, all trusted readers, live restart/persistence and browser/Ask gates remain.

Persistence existence/length/source hash confirmed at 2026-10-14T21:49:13.9710689Z
(4,955 bytes before adding this checkpoint); resumed review launch-to-confirmation
364.7685249 seconds. Exact broker approval phase times and draft/write start are unknown.
The measured runtime is separately 1,185.062 ms; no continuous CPU claim is made.
