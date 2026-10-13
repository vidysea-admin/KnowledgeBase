# Verdict - badturns-turn-timing-write-refusal

**Cycle checked:** 1
**Commit under check:** 1535fb83, lane/badturns
**Date:** 2026-10-13

## VERDICT: PASS

## EXPLANATION

Cycle 0 was FAIL (2076f1b5). All four issues replay as fixed.

1. **ISS-BADTURNS-001 (high): FIXED.** transcript-provenance.test.mjs 15/15 (was 10/15). The copy list is now the transitive closure of relative imports and copyFileSync throws on a missing file. Mutant "closure does not follow imports" is killed (5 failing).
2. **ISS-BADTURNS-002 (medium): FIXED.** Every chunk is tenant/sourceRef-checked before exclusion. Probes: foreign-tenant chunk, foreign-sourceRef chunk, and foreign chunk with spans over an excluded turn all refuse. Control: an own-tenant chunk over an excluded turn is dropped and the request answers with the warning.
3. **ISS-BADTURNS-003 (medium): FIXED.** Both cycle-0 survivors (NaN tStart in the scripts writer, negative tStart exclusion in /ask) are now killed.
4. **ISS-BADTURNS-004 (low): FIXED.** 0 NUL bytes; git diffs source-context.ts as text (+9 lines); excluded key is JSON.stringify([session, turn]).
5. **Security replay.** All 7 cycle-0 row probes (foreign tenant or session, also with tEnd<tStart / NaN / negative / empty id / non-string text / shared excluded id) still refuse. Scope beats timing.
6. **Baseline.** ask-graph.baseline.json blob 9c9fb691 equals the base blob, unchanged; excludedTurns appears only when non-empty; baseline test inside packages/ask 122/122.
7. **Mutations (6, harness untracked and deleted, per-mutation byte backup restored in finally, hashes equal HEAD blobs).** S1, S2, N1 chunk scope check removed, N2 closure disabled, N3 excluded-turn-cited check removed, N4 foreign-tenant row excluded: 6/6 killed.
8. **Suites.** packages/ask tsc clean and 122/122. apps/api tsc clean via a temporary tsconfig paths mapping (deleted; node_modules junctions untouched, verified still pointing at the main tree) and ask + routes/ask + compete + turn-timing-write + ingest tests 143/143. Scripts (turn-timing, legacy-unbound, session-rows, transcript-provenance, start-record-detached, script-db-guard) 51/51.

Carried owner notes from cycle 0: the warning is auditLog-only (API 200 body shows it; no jobs-ledger row, no UI, compete route omits it); merge packages/ask and apps/api together; merge conflict surface in transcript-provenance.mjs is lines 6 and 59 only. The four ISS-BADTURNS rows in qa/issues.badturns.jsonl are fixed and may be closed by the maker in close-out.

## ISSUES-WRITTEN
none
