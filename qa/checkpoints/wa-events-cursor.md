# Checkpoint wa-events-cursor (single checker, cycle 0)
Policy-Version: proportional-verification/2026-10-19.17
Head checked: 78f92092 (base d0416a8e). Status: complete, verdict written at qa/verdicts/wa-events-cursor.md (PASS, 3/3).
Done: affected tests re-run on a D: copy with the copy's own @lkb junctions (db 11/11 with the real-Mongo test run on a throwaway mongod 7.0.24, PID 33640 stopped and port-free verified; api events 10, router 9, isolation pass; sync-links 28; tsc db exit 0), 8 per-mutation falsifications (7 killed, 1 doc-test survivor), two-process residual-window probe (naive 2.9-3.7% missed, settled 0), generator probes. All junctions removed link-only with cmd rmdir, scratch deleted, main-tree node_modules intact.
Remaining: none.
PROPOSED-ISSUE P1-P4 are in the verdict (all low); no ledger rows written.
