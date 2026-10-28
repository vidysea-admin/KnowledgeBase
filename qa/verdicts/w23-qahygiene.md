# Verdict - w23-qahygiene

VERDICT: PASS
Cycle checked: 1
Reviewed SHA: 0ecc02e4f341f24168db4fa26582c11478b1c66f
Base SHA: 3c99337fb64188bc5ed94b2f058ecf92c8823864
Ledger commit (cycle 0, unchanged): c17508853f4ef3a78bbae273ef5743b6a8e80f64
ISSUES-WRITTEN: none
Ledger rows may be flipped: already done in c1750885 (10 rows).

## Cycle 1 re-check (0ecc02e4 on 65a106d3)

Commands: git diff/show against base 3c99337f, byte greps. Results:
- numstat over qa/manifests: 58 files, each 1/1 (46 files) or 2/2 (12 files) changed lines; no other manifest paths changed.
- All changed lines are Status / Handshake status lines (non-status filter empty).
- EF BF BD count per file, base vs candidate: no file differs (none introduced).
- groundbudget.md vs base: single hunk, line 6 only (Status ready-for-check -> checked-PASS); line 24 still carries byte 0x97.
- No CR bytes in any candidate manifest (LF preserved).
- 65a106d3 is an ancestor of 0ecc02e4; cycle-0 verdict and ledger checks stand (same-slug PASS, cycle match, handshakeDisagreement null for all 58).
Not re-run: Part 2 ledger work (unchanged, commit c1750885). No mutation (manifest-only unit).

## Superseded history

### Cycle 0 verdict (FAIL, superseded)

VERDICT: FAIL
Cycle checked: 0
Reviewed SHA: 65a106d33a668fbd81ad2a690e63586f35305d76
Base SHA: 3c99337fb64188bc5ed94b2f058ecf92c8823864 (is origin/master)
Ledger commit (checker-made, separate): c17508853f4ef3a78bbae273ef5743b6a8e80f64
ISSUES-WRITTEN: none
Ledger rows may be flipped: the 10 listed in Part 2 were flipped by this checker in commit c1750885, independent of the Part 1 FAIL.

## Part 1 - manifest flips (65a106d3, 58 files)

I checked all 58 flips, not a sample of 12. Method: `git show` of base and candidate bytes for each file, a line-by-line comparison, then `scripts/qa/dispatch-state.mjs` functions run from the lane (script `scratchpad/qh-check1.mjs`, output `qh-check1.out`).

- All 58 verdict files exist under the same slug. The top (current-cycle) `VERDICT:` is PASS in all 58. Where older FAIL/HOLD sections sit lower in the file (goal-t060, t052-destination-exception-review, t059-read-head-deadlines, t035-finalizer-integration), they are marked historical and sit under the current PASS.
- `manifestCycle(manifest)` equals `verdictCycle(verdict)` for all 58.
- `handshakeDisagreement` is null for all 58. `stateOf` returns `not-pending` for all 58 and carries no `disagreement`.
- Line count unchanged and only Status / Handshake status lines differ in 57 of 58 files.
- EOL: every candidate and base blob has 0 CR bytes (index is LF, so CRLF preservation is trivially true; no mixed EOL).

### FAIL finding (one wrong flip): qa/manifests/groundbudget.md line 24

The flip touched a non-status line. The base blob has the single byte 0x97 (cp1252 em dash) in the text `... tests 874 / pass 873 / fail 1 <0x97> activity-health/router.test.ts ...`. The candidate has the three bytes EF BF BD (U+FFFD replacement character) there. The maker's tool decoded the file as UTF-8 with replacement and wrote it back, so the file was corrupted beyond the status line. The base blob contains 0 U+FFFD bytes. None of the other 57 files contain a U+FFFD byte.

Concrete fix (maker): restore groundbudget.md line 24 to the base bytes, keeping only the `**Status:** checked-PASS` change at line 6. For example `git show 3c99337f:qa/manifests/groundbudget.md`, apply the single status-line edit as raw bytes, then confirm `git diff 3c99337f -- qa/manifests/groundbudget.md` shows exactly one changed line. The status flip itself is correct (verdict PASS, cycle 0 = Fix cycle 0).

### Observations (not failures)

- speaker-knowledge-vectorless: base said `Status: building` (prose: "not ready-for-check ... pending"). The same-slug verdict is PASS, cycle 1, reviewed SHA 06619856, and the manifest Fix cycle is 1. Flipping building to checked-PASS is justified by that PASS. The stale "building" body prose remains.
- outputs-vectorless-integration had a non-bold `Handshake status: ready-for-check` line, and it was flipped consistently.

## Part 2 - per-issue evidence for 18 rows

All verdict SHAs below were confirmed as ancestors of origin/master (3c99337f). The maker's relaxed picks were wrong for several rows, so I chose the verdict independently.

Flipped to `verified` / `verified_date: 2026-10-18`, with `verified_note` ("closed by checker evidence review"):

| Row | Verdict file | Reviewed SHA | Why |
|---|---|---|---|
| ISS-091 | golden-set-regeneration (cycle 2 PASS) | cbedeb9 (named in prose as the cycle-2 commit; no header SHA field) | names the id; deleted provenance and re-ran eval-recall (class fix) |
| ISS-092 | golden-set-regeneration (cycle 2 PASS) | cbedeb9 | names the id; filterBias figures reproduced |
| ISS-093 | golden-set-pin-criterion (cycle 2 PASS) | 67527fa | names the id; `--refilter` gives 92 kept / 0 rejected |
| ISS-094 | golden-set-pin-criterion (cycle 2 PASS) | 67527fa | names the id; derived provenance proved by mutation |
| ISS-095 | golden-set-pin-criterion (cycle 2 PASS) | 67527fa | names the id; ReferenceError mutation replayed |
| ISS-158 | hybrid-merge (cycle 3 PASS) | 2abc1c9 | names the id; B1 reproduction re-derived and blocked; mutation G dies |
| ISS-159 | hybrid-merge (cycle 3 PASS) | 2abc1c9 | names the id; drop reporting pinned; mutation H dies |
| ISS-262 | iss-262-lint-loc-split (cycle 0 PASS) | 7da0a41 | recorded repro `node scripts/lint-loc.mjs` re-run verbatim; I also re-ran it at the lane tip: OK, exit 0 |
| ISS-C-UNRUN-WRITERS-001 | watched-sources-url-normalisation (cycle 1 PASS) | c8da5ee | dedicated section; both original probes re-run |
| ISS-SPKDATA-001 | iss-104-place-vs-person-signal (cycle 0 PASS) | 65fd4ad (stated as HEAD) | independent comment-aware count 422/421 |

Left untouched, with reasons:
- ISS-071: the golden-set-regeneration verdict never names ISS-071 and has no header SHA. The row's own fix_direction is the human-gated redesign (condition 4), which remains open.
- ISS-102, ISS-103, ISS-105, ISS-109: the maker's pick (speaker-resolution-llm cycle 1, 76009f8) predates these issues and reports `ISSUES-WRITTEN: none`. The real evidence sits in speaker-verbatim-token-boundary, which is FAIL at cycles 1-3 and cites the pre-renumbering ids ISS-091/092/094/098. The verdict that names ISS-102/103 literally (speaker-apply-write) concerns different findings (id collision). Row ISS-102 itself says "defect class not closed". The iss-104-closed-class-function-words PASS only mentions ISS-105/109 as "not reintroduced".
- ISS-242: no verdict names it. The note records a Mode B re-check only, and its fix is a doc correction.
- ISS-325: no verdict names it. It was a post-verdict close-out corruption fixed 2026-09-27 by the maker. The maker's pick (mc-hooks-bolded-status, 58cfaf0) predates the fix.
- ISS-C-UNRUN-WRITERS-002: only the cycle-2 guarded-fetcher verdict (26e283a) names it, and that verdict is FAIL. The cycle-3 PASS (948212e) re-derives a 50-address table but does not name the id or run its five recorded repros verbatim. Residual window ISS-C-UNRUN-WRITERS-011 is separate.

Mechanics: JSON.parse/stringify of target rows only. Other lines are byte-identical (verified by a script comparing HEAD and working tree). Line counts are unchanged and each id appears exactly once. The working tree uses CRLF (autocrlf) and was preserved. Re-parsed all three files: 379 / 22 / 1 rows, no duplicate ids; exactly 3 keys changed per flipped row (status, verified_date, verified_note).

## tracker-audit (`node scripts/tracker-audit.mjs`, exit 1 both times)

- G2 before: 155 issues "fixed" with no verified_date.
- G2 after: 145 (155 minus 10).
- G3 (stale sweep, 290 days) is unchanged and unrelated. G4 items are advisory.
- Evidence: scratchpad `qh-audit-before.txt`, `qh-audit-after.txt`.

## Not verified / limits

- No mutation run: this unit changes manifests and ledger rows only, with no source or test change.
- The fixes behind the flipped rows were not re-executed. Evidence is the cited verdicts, which I read, plus the ancestry check and a lint-loc re-run.
- Checker usage was not metered (host totals unknown).
