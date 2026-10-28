# Ledger triage - governance critical/high (Mode B scoped sweep), 2026-10-26

Scope: 28 open critical/high rows. Verified against HEAD of D:/KnowledgeBase and D:/ai_os (hooks clean vs HEAD, blob hashes equal).
No product code, hooks, settings, DECISIONS, contracts, manifests or gates were edited. Only the 28 ledger rows (qa/issues.jsonl, qa/issues.a035913.jsonl) were annotated (`retriaged_2026-10-26`; status moved to verified/superseded where applicable).

Totals: FIXED-VERIFIED 14 | STILL-OPEN 4 | SUPERSEDED 4 | HUMAN-GATED 6.

| id | class | one-line evidence |
|---|---|---|
| ISS-A035913-001 | FIXED-VERIFIED | canonical-only `**Handshake status:**` manifest now pend=1 (probe); gate maker-predicate-... still OPEN for ratification |
| ISS-A035913-003 | HUMAN-GATED | prose-only seam still evades ROUNDCAP (cap=False vs backticked cap=True); needs Approved-by for delivery-gate-stop.ps1 |
| ISS-A035913-008 | FIXED-VERIFIED | D:/ai_os hooks committed (f159d8b, 607e8c9), `git diff HEAD` clean, blobs == HEAD |
| ISS-A035913-011 | HUMAN-GATED | repo mc-precommit.ps1:43 still silent on canonical-only manifest; no D-entry authorises it |
| ISS-054 | STILL-OPEN | no liveness/dead-chain mechanism; tick fresh only due to today's manual resume |
| ISS-130 | STILL-OPEN | lane/a-speakers still un-sharded (max ISS-103, 2 commits unmerged); no collision realised (0 dup ids in union) |
| ISS-178 | STILL-OPEN | dispatch-state.mjs consumed by nothing; reader half needs sweep check + Approved-by for mc-sessionstart |
| ISS-180 | FIXED-VERIFIED | verbatim `\?\D:\...\DECISIONS.md` probe -> permissionDecision deny; D-029 fixtures PASS |
| ISS-184 | FIXED-VERIFIED | bullet form read (0 pending); heading form dropped by C4 amendment (D-030), 0/660 verdicts heading-only |
| ISS-189 | FIXED-VERIFIED | D-043/D-049 (Approved-by: Umesh) ratify 4a71633/e5402d6; gate answered |
| ISS-190 | FIXED-VERIFIED | `git -C D:/ai_os diff --quiet HEAD -- .claude/hooks` clean; committed 2026-10-19 |
| ISS-200 | FIXED-VERIFIED | gate section 2 corrected (ISS-200 note) and gate ANSWERED 2026-09-28 |
| ISS-201 | SUPERSEDED | by ISS-219: edit-in-place-guard unregistered + committed/anchored (607e8c9) |
| ISS-205 | FIXED-VERIFIED | its 3 recorded repros (a)(b)(c) all stay pending = 3/3; fixtures PASS |
| ISS-215 | FIXED-VERIFIED | inbox entry in fold-in index (DEFERRED) and all 6 named gates ANSWERED |
| ISS-219 | HUMAN-GATED | aios-write-guard.ps1:195-198 still allowlists `\qa\`,`\.goal\` anywhere; needs Approved-by decision |
| ISS-220 | HUMAN-GATED | qa/gates/d015-generalisation-scope.md still unanswered; CLAUDE.md D-015 unchanged |
| ISS-221 | SUPERSEDED | by ISS-298: ledger-alloc.mjs lock, verdict PASS c1, 22/22 tests, ISS-298 replay 5/5, 0 dup ids |
| ISS-227 | FIXED-VERIFIED | `Cycle checked: `1` 9/9` at Fix cycle 3 -> pending (was silent); fixture PASS |
| ISS-228 | FIXED-VERIFIED | Fix-cycle code-span + next-line digit -> pending; C7 fixtures PASS |
| ISS-229 | FIXED-VERIFIED | ISS-205 recorded repros re-run verbatim: 3/3 (row measured 2/3) |
| ISS-250 | SUPERSEDED | by D-170 (T-007 explicitly directed) + built/PASSed T-007 units; no gate file needed |
| ISS-267 | HUMAN-GATED | repo mc-sessionstart still prints Checks pending: 0 on FAIL@current cycle; needs Approved-by |
| ISS-346 | FIXED-VERIFIED | ROUNDCAP predicate live (D-049), fixtures PASS, probe cap=True, verdict PASS c1 |
| ISS-350 | STILL-OPEN | repro 2 still fires (= ISS-267); canonical field in 475/700 manifests; repros 3-4 handled |
| ISS-362 | HUMAN-GATED | `uniq -d` still prints `## D-050`; append_decision.ps1 unchanged since genesis; needs Approved-by |
| ISS-365 | SUPERSEDED | by ISS-346 (row's own fix_direction); mechanical check now live |
| ISS-372 | FIXED-VERIFIED | hook committed and pinned (blob 45fab497 == HEAD); gate ai-os-enforcement-hooks-uncommitted is stale-OPEN |

## Decisions the Approver (Umesh) would need to give
- DECISIONS entry (Approved-by) for D:/ai_os/.claude/hooks/delivery-gate-stop.ps1: ROUNDCAP zero-seam branch (ISS-A035913-003) and ratification of the Handshake-status widening (ISS-A035913-001); gate qa/gates/maker-predicate-canonical-field-and-prose-seam.md.
- DECISIONS entry for .claude/hooks/mc-precommit.ps1 (ISS-A035913-011) and .claude/hooks/mc-sessionstart.ps1 owed-fix bucket (ISS-267, ISS-350 repro 2, ISS-178 reader half).
- DECISIONS entry for D:/ai_os/.claude/hooks/aios-write-guard.ps1 CHECK 3 allowDirSignals (ISS-219).
- Answer on qa/gates/d015-generalisation-scope.md: A | B | both | neither (ISS-220).
- DECISIONS entry for scripts/append_decision.ps1 lock + uniqueness (ISS-362).

## Observations for the maker (not acted on, out of scope)
- qa/gates/ai-os-enforcement-hooks-uncommitted.md is stale (hooks are committed); the checker should close it out.
- hook-fixtures.ps1 reports 4 FAILED, all SessionStart resume/compact marker-reset cases (run with cwd lacking a ledger); none touches an in-scope row. Output: hook-fixtures.out.txt.
- ISS-298 remains open in the ledger; it carries adoption of the allocator by all writers (ISS-221 points to it).

## Evidence files (this directory)
probe-delivery-gate.ps1 / .out.txt (A035913-001/003, 184, 205 a-c, 227, 228), probe-guard-and-repo-hooks.ps1 / .out.txt (180, A035913-011, 267), hook-fixtures.out.txt (D:/ai_os fixture run).
