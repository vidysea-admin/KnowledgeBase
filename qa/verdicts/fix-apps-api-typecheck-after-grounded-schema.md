# Verdict: fix-apps-api-typecheck-after-grounded-schema

VERDICT: PASS
Cycle checked: 0
Commit checked: a448838 (lane/schemaapifix)
Scope: type-only repair of apps/api typecheck after c99c44d; no schema or generated-type change.

## EXPLANATION

- Diff: exactly apps/api/src/indexing/session.ts (+16/-1), apps/api/src/routes/brain.test.ts (+1/-1) and the manifest. No `as any` / `as unknown as` added. The new `toCitedItems(summary.citedItems!)` / `toQaEntries(summary.qa!)` call uses `!` on optional fields, the same pattern the next (pre-existing) line already uses on the same fields; it does not paper over the tuple mismatch, which is solved by `toEvidenceTuple`. Notes only.
- Reachability of the throw: `preparedPage` is built in exactly one place, inside the strict-webinar preflight try block, from the freshly produced `summary` after `Object.assign(summary, validateRuntimePage(...))`. Nothing is read from stored pages, so older stored data cannot reach it. Every item comes from `runtimeItem`/`runtimeQA`, whose evidence comes from `runtimeEvidence`, which throws on an empty or duplicate list; partially grounded LLM output is therefore rejected earlier by `validateRuntimePage`, as before. The only legitimately empty list is `answerEvidence` for an unanswered QA, which the generated type allows as `QuotedEvidence[]` and the code does not tuple. The existing aggregate `evidence: toEvidenceTuple(...)` line already throws in the same place on empty evidence, so no new failure class. Conclusion: unreachable; if it were reached, it would throw inside the grounded-preflight try/catch, set `status.index = failed` and raise `strict webinar index incomplete: grounded preflight failed: ...`, which is correct for a schema-invalid document. No previously successful run can start failing.
- Types: generated `CitedItem.evidence` and `QaEntry.questionEvidence` are `[QuotedEvidence, ...QuotedEvidence[]]`; `answerEvidence` is `QuotedEvidence[]`. The converters match this exactly. The runtime evidence is `{turnId, sessionId, quote}`, a subset of QuotedEvidence.
- tsc `--noEmit -p tsconfig.json`, own run in the worktree: packages/core 0, ai 0, ask 0, db 0, index 0, ingest 0, meeting-bot 0, apps/api 0, apps/web 0 (no output).
- Tests (no Mongo/network): apps/api src/indexing/session.test.ts 28/28; src/routes/brain.test.ts 11/11.
- Mutations (own harness, per-mutation byte backup restored in `finally`, SIGKILL timeouts, hash change verified): A emit item with empty evidence (`evidence: [] as never`) -> KILLED (session.test.ts 1 fail; hash 13400830 -> 5004a2d3); B drop the conversion (citedItems/qa line removed) -> KILLED by tsc (exit 2, TS2322 at session.ts(174), tests alone stay green: type-level guard). Note: A is caught only because the page is read back by a test; the tuple guard itself is exercised only by types, consistent with "unreachable".
- After: session.ts blob 6b7f1173 equals `git rev-parse HEAD:apps/api/src/indexing/session.ts`; harness deleted; worktree and main tree `git status --porcelain` clean before this verdict file.

ISSUES-WRITTEN: none
