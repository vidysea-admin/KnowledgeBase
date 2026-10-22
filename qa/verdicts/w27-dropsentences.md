# Verdict - w27-dropsentences

**VERDICT: FAIL**
**Verdict:** FAIL
**Cycle checked:** 0
**Reviewed SHA:** daa55f6f8b3bd933791b454e49426ffaf0eaf166
**Base:** c7574a5e
**Class:** GROUNDING (full ceremony)

## Blocking finding (1)
F1 `packages/ask/src/answer.test.ts:27-29` - `tsc --noEmit` in packages/ask exits 2: TS2300 Duplicate identifier `contextStrips`, `ContextSource`, `CompleteFn` (lines 11-12 and 27-28). Line 27 is also a comment that swallowed the first duplicate import (`// D-191: ... refuse only if none remain.import { BoundedAskError } ...`). The manifest claims "tsc --noEmit: packages/ask ... clean"; that is false at this SHA. Evidence: .checker/tsc-ask.log (untracked, lane dir). Tests still run under tsx, which hides it.
Fix: delete lines 27-29's imports (keep the comment on its own line 26-27, no trailing import text). Cycle 1 should be test-file only; product code needs no change.

## What was verified (independent)
- Diff base..candidate read in full. Product logic is sound:
  - Alignment is by id (`sentence-<i>` assigned server-side, judge echoes the id), not by index. Reordered decisions map correctly; a duplicate id is set false on the second occurrence (drops, cannot flip to kept); unknown/ghost ids never match; string "true", null, non-object entries ignored. No decision for a sentence -> dropped. Zero kept -> same BoundedAskError (code source_context_unavailable, route 503, ask.ts catch unchanged).
  - Dropped sentence text and its sourceIds are not in the result (keys are only text, sources, removedSentences; asserted). Saved history: answer-workflow stores the JSON candidate, so kept text plus count; no dropped text.
- D-191: `git diff --numstat` docs/DECISIONS.md = 14 added / 0 deleted (additions-only), Approved-by Umesh with verbatim quote, Supersedes none.
- Golden baseline: ask-graph.ts adds the field only when count > 0 via conditional spread; ask-graph.baseline.json not in diff; ask-v2 + ask-graph tests (80/80, which byte-compare to the baseline) pass. Web type is optional, AskPage requires `typeof number && > 0`, so an absent field renders nothing. API route spreads the result, so absent passes through.
- Re-runs (exit codes in .checker/*.rc/log, lane dir): packages/ask answer+bounded-ask+ask-graph+source-context 96/96 rc0; ask-v2+ask-graph+answer 80/80 rc0; apps/api routes/ask/ask 7/7, ask-tenant-hostile 70/70, ask-tenant-isolation 16/16, source-context+source-exclusion with the rest of the batch pass; answer-workflow.test.ts 18/18 pass but under `--test-force-exit` the process dies with a libuv teardown assertion (UV_HANDLE_CLOSING, win/async.c) -> rc1; without force-exit rc0 18/18 (environment flake, not product); apps/web vitest AskPage 15/15 rc0; tsc apps/web rc0, apps/api rc0, packages/ask rc2 (F1).
- D-020 mutation (own script .checker/mut.sh, per-mutation byte backup, absolute-path trap INT/TERM/ERR/EXIT, timeout 300): `verdicts.get(s.id)` -> `verdicts.get("sentence-0")` KILLED (4 failures: mixed decisions, fail-closed, no-leak, askV2 integration). Restored; `git hash-object packages/ask/src/answer.ts` == `git rev-parse HEAD:packages/ask/src/answer.ts` (9c938888c0b6d1cbeaa178fdd51d052c52d80556).

## Notes (non-blocking, not issues)
- N1 Evidence leak scope: `sources` and evidence quotes are the retrieved-evidence lists, not per-sentence citations, so a source cited only by a dropped sentence can still be listed beside the kept text. Text and ids of the dropped sentence do not leak. Pre-existing semantics, matches the manifest; consider a later unit if per-sentence citation display is wanted.
- N2 Stitching: kept sentences are joined with newlines without context; a kept sentence with a pronoun or "however" whose antecedent was dropped could read misleadingly. The UI note mitigates it. Not severe.
- N3 The earlier "incomplete answer grounding judgment" message is now folded into "answer support or relevance refused" (same code/503) when the judge returns a malformed/short list. Acceptable under D-191.
- Not verified: live judge drop behaviour (manifest says unobserved), lint-loc/lint-tests, whole suites, browsers. Checker usage metrics not measured (tokens unknown).

## Ledger
No ledger rows to flip. ISSUES-WRITTEN: none. Maker closes only a PASS; this is FAIL cycle 0 -> repair F1 and request cycle 1.
