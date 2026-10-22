# Verdict - w27-dropsentences

**VERDICT: PASS**
**Verdict:** PASS
**Cycle checked:** 1
**Reviewed SHA:** 2bd194794b472636858ab5c7e8ef69c175ad11f1
**Base:** c7574a5e
**Class:** GROUNDING (full ceremony)
**History:** cycle 0 = FAIL at daa55f6f (verdict commit 1423c4d2, preserved below as prior record only); cycle 1 = PASS at 2bd19479.

## Cycle 1 re-check (authoritative)
- Diff daa55f6f..2bd19479 (excluding my cycle 0 verdict commit) touches only `packages/ask/src/answer.test.ts` (duplicate imports removed, comment repaired) and `qa/manifests/w27-dropsentences.md` (cycle counter and tsc line). No product code changed: `packages/ask/src/answer.ts` blob 9c938888c0b6d1cbeaa178fdd51d052c52d80556 equals HEAD.
- tsc --noEmit run independently: packages/ask rc 0, apps/web rc 0, apps/api rc 0 (F1 closed).
- ask tests (answer, bounded-ask, ask-graph, ask-v2, source-context): 110/110 rc 0, including the byte-exact ask-graph baseline.
- Cycle 0 product review, API/web re-runs and the alignment mutation (KILLED) stand, because product code is unchanged.
- Notes N1-N3 below remain non-blocking. Ledger: no rows to flip. ISSUES-WRITTEN: none.

## Cycle 0 record (superseded; was VERDICT: FAIL, Cycle checked: 0, Reviewed SHA daa55f6f8b3bd933791b454e49426ffaf0eaf166)

### Blocking finding F1 (fixed in cycle 1)
`packages/ask/src/answer.test.ts:27-29` - `tsc --noEmit` in packages/ask exited 2: TS2300 Duplicate identifier `contextStrips`, `ContextSource`, `CompleteFn`. A comment line also swallowed one duplicate import. The manifest's "tsc clean" claim was false at daa55f6f.

### What was verified (independent)
- Alignment is by id (`sentence-<i>` assigned server-side, judge echoes the id), not by index. Reordered decisions map correctly; a duplicate id is set false on the second occurrence (drops, cannot flip to kept); unknown/ghost ids never match; string "true", null, non-object entries ignored. No decision for a sentence -> dropped. Zero kept -> same BoundedAskError (code source_context_unavailable, route 503, ask.ts catch unchanged).
- Dropped sentence text and its sourceIds are not in the result (keys are only text, sources, removedSentences; asserted). Saved history: answer-workflow stores the JSON candidate, so kept text plus count; no dropped text.
- D-191: `git diff --numstat` docs/DECISIONS.md = 14 added / 0 deleted (additions-only), Approved-by Umesh with verbatim quote, Supersedes none.
- Golden baseline: ask-graph.ts adds the field only when count > 0 via conditional spread; ask-graph.baseline.json not in diff; ask-v2 + ask-graph tests (80/80, byte-compare to the baseline) pass. Web type is optional, AskPage requires `typeof number && > 0`, so an absent field renders nothing. API route spreads the result, so absent passes through.
- Re-runs: packages/ask 96/96 and 80/80 rc0; apps/api routes/ask/ask 7/7, ask-tenant-hostile 70/70, ask-tenant-isolation 16/16 rc0; answer-workflow.test.ts 18/18 pass but under `--test-force-exit` the process dies with a libuv teardown assertion (UV_HANDLE_CLOSING) -> rc1; without force-exit rc0 18/18 (environment flake); apps/web vitest AskPage 15/15 rc0.
- D-020 mutation (own script in lane .checker/, per-mutation byte backup, absolute-path trap INT/TERM/ERR/EXIT, timeout 300): `verdicts.get(s.id)` -> `verdicts.get("sentence-0")` KILLED (4 failures). Restored; `git hash-object` == `git rev-parse HEAD:` for answer.ts (9c938888c0b6d1cbeaa178fdd51d052c52d80556).

## Notes (non-blocking, not issues)
- N1 Evidence leak scope: `sources` and evidence quotes are the retrieved-evidence lists, not per-sentence citations, so a source cited only by a dropped sentence can still be listed beside the kept text. Text and ids of the dropped sentence do not leak. Pre-existing semantics.
- N2 Stitching: kept sentences are joined with newlines without context; a kept sentence whose antecedent was dropped could read misleadingly. The UI note mitigates it. Not severe.
- N3 The earlier "incomplete answer grounding judgment" message is now folded into "answer support or relevance refused" (same code/503) when the judge returns a malformed or short list. Acceptable under D-191.
- Not verified: live judge drop behaviour (unobserved per manifest), lint-loc/lint-tests, whole suites, browsers. Checker usage metrics not measured (tokens unknown).
