# Ledger stale-row sync - 2026-10-11

VERDICT: PASS (13 rows flipped to `verified`, 7 candidates left `open`)
Checked on: lane/ledgersync from 87c9c83. Checker re-read every verdict, manifest and ledger row itself; the audit was a lead only. No source, contract, manifest or decision file touched; no tests run (rows are flipped on the existing PASS verdicts).

Rule applied to each flip: (1) latest cycle of the verdict is PASS and names the id as fixed / verified / closed / N of N; (2) manifest `checked-PASS`; (3) fix commit is an ancestor of HEAD (`git merge-base --is-ancestor`, all true); (4) no later verdict, commit message or ledger row reopens it (`git log --all --grep`, grep across qa/verdicts and qa/issues*.jsonl).

| id | result | evidence read (qa/verdicts/...) | reason |
|---|---|---|---|
| ISS-RUNSTORE-001 | flipped | t050-run-state-stale-lock-recovery.md:24 "may be marked verified (recorded repro 1/1)"; BEFORE-WIRING B1 DONE (line 36) | fix c0c4408 |
| ISS-RUNSTORE-002 | flipped | same :19,24 "3/3 runs at 180, zero io-error" | fix c0c4408 |
| ISS-RUNSTORE-003 | flipped | same :24 two recorded mutants killed; third (lstat->stat) named as not a hole | fix c0c4408 |
| ISS-TESTGAPS-001 | flipped | auth-require-scope-exact-match.md:13 "2/2 refused" (PASS cycle 0) | fix 5350f68 |
| ISS-T037API-003 | flipped | test-gaps-t046-004-t037api-003.md:17,33 mutation killed by new tests; checker recommends flip | fix 0b929aa |
| ISS-T046-004 | flipped | same :16,33 | fix 4882391 |
| ISS-JRLOCK-001 | flipped | t037-join-rules-busy-status.md:44 "recorded reproductions 4/4 pass ... ISS-JRLOCK-001 is verified" | fix 5717bc0; live concurrent holder at default wait was not exercised, said so in note |
| ISS-T034FIX-003 | flipped | t034-capture-failure-not-success.md cycle 1 (a) "VERIFIED", cycle 2 PASS (line 94 "Verified (logic with fakes)") | fix dbe3938; scope is logic with fakes, not a real browser |
| ISS-T034FIX-004 | flipped | same line 94 | fix dbe3938 |
| ISS-T034FIX-006 | flipped | same line 94 "ten green runs, no clock assertion" | fix 8ce1ad4 |
| ISS-ALERTID-004 | flipped | r1-alert-id-resolver.md:47 (cycle 1 PASS, section 6 "ISS-ALERTID-004: closed, measurement non-circular") | fix ef8d1f8 |
| ISS-T037LOCK-001 | flipped | t037-join-rules-stale-lock-takeover.md:51 "ISS-T037LOCK-001 6/6" (cycle 1 PASS); manifest notes merge condition LOCKTAKE-009 met | fix 5a764db |
| ISS-STRUCTFIX-001 | flipped | record-commands-finalize-extraction.md:27 "resolved by c2fc9af without a new folder"; record-commands.ts 279 lines at HEAD (budget 300 non-blank) | fix c2fc9af; row has no recorded reproduction, resolution is an explicit checker statement |
| ISS-227 | left open | delivery-gate-stamp-adoption.md:15,52 | fix lives in D:/ai_os hook (not in this repo, no ancestor commit; D:/ai_os is not readable on this machine, cannot re-confirm); verdict only reproduced ISS-205's repros, not ISS-227's own; commit 67850f6 already left it open for the same reason; hook change is unauthorized/uncommitted per gates note |
| ISS-228 | left open | same :16,62 | same: read from source line 372 of an out-of-repo file; unverifiable here |
| ISS-230 | left open | same :72 | verdict says "ISS-230 stays open until the Approver answers ... and the diff actually lands"; diff unlanded |
| ISS-298 | left open | iss-298-ledger-id-allocator.md:96 "5/5" but :178 | checker says "I would not close ISS-298": allocator delivers C1,C2,C4,C5, triage-only C3 nothing calls; contract unratified; wiring needs Approved-by: Umesh |
| ISS-T037VETO-003 | left open | t037-scheduler-wiring-behind-flag.md:35 "2/2" | verdict gives only a D-015 count, no "fixed"; row is a wiring precondition and section B(1) requires the Approver's W3 ruling in DECISIONS before enabling |

Anomaly (not fixed): `qa/issues.104cc.jsonl` line 3 is a blank line containing only `\r` (an empty CRLF line between ISS-104CC-2 and ISS-104CC-3), so it fails JSON.parse with "Unexpected end of JSON input"; there is no BOM and no truncated or merged row, and ISS-104CC-3 on line 4 parses. Readers must skip blank lines.

Counts of rows with status exactly `open` on this branch (union of qa/issues.jsonl and qa/issues.*.jsonl, blank lines skipped, 0 other unparseable lines): critical 4, high 49, medium 103, low 82.

ISSUES-WRITTEN: none
