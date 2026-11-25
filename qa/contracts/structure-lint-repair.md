# Contract — structure-lint-repair (unit `structure-lint-repair`, branch `release/kb-golive`, D-237)

> Status: adopted by /checker 2026-11-25. SOURCE: MAKER-DERIVED from KB decision D-237 ("the structure lint on branch `release/kb-golive` is repaired by moving code, not by raising limits") and a read-only diagnosis
> of head 6df8934c on 2026-11-25; not Umesh's words. Manifest: `qa/manifests/structure-lint-repair.md` on branch `release/kb-golive` (worktree `D:\KnowledgeBase\.worktrees\kb-golive`); the checker judges that tree's
> tip against the base 6df8934c. Tier M, one checker, no dual check: no auth, tenancy or data-write code changes (a rate-limit test file moves, with import-path edits only). (checker condition: if the diff holds
> any edit other than a move, an import/export line or a path string in a file that touches auth, tenancy or data writes, the tier is re-judged.)
> The four moves (D-237): (1) the publisher HTML helpers of `apps/api/src/answer-policy/answer-evidence.ts` to `apps/api/src/answer-policy/publisher/publisher-html.ts`; (2) the signed-in block of
> `scripts/live-verify.mjs` to `scripts/live-verify/signed-in.mjs`, with `scripts/live-verify.test.mjs` and `scripts/live-verify.pinned-question.json` moved into `scripts/live-verify/`; (3) the pairwise judge and its
> command line from `scripts/eval/llm-eval.mjs` to `scripts/eval/pairwise/pairwise-judge.mjs`, importing one way from `../llm-eval.mjs`; (4) `apps/api/src/rate-limit.test.ts` to
> `apps/api/src/rate-limit/rate-limit.test.ts`. Authorized only on `release/kb-golive`, with the import and path edits they need, the generated `docs/SNAPSHOT.md` if its generator changes it, and one line in
> `qa/feedback-inbox.md` for the contract path. Not authorized: `structure.config.json`, any behaviour change, ARCHITECTURE.md, contracts/, any enforcement path.

## Criteria
- **[SL-1]** `pnpm lint:structure` exits 0 at the new head, all 10 stages (it failed in the `loc` and `dirsize` stages at 6df8934c).
- **[SL-2]** `pnpm typecheck` exits 0.
- **[SL-3]** Same tests, same results. The live-verify test file, `scripts/eval/llm-eval.test.mjs`, the moved rate-limit test, and every test file that imports `answer-evidence` run with the same number of tests and
  the same number of passes as at 6df8934c. (checker-tightened: the manifest records, and the checker re-measures at 6df8934c in a separate checkout, the per-test NAME list with its pass/fail, and the two lists are
  equal once the moved files' paths are normalised; equal counts alone could hide a swapped or dropped test. The two known baseline reds, `apps/api/src/activity-health/router.test.ts` and `apps/web`
  `KnowledgeSpeakerProfilePage.test.tsx`, are measured the same way and must be red in the same way at both heads, never counted as a pass.)
- **[SL-4]** No behaviour change. The moved code is the same text apart from import/export lines and paths; the exports of `answer-evidence.ts` and the base exports of `llm-eval.mjs` are unchanged;
  `node scripts/live-verify.mjs` keeps its command and flags; `structure.config.json` is unchanged. (checker-clarified: "paths" includes the path strings D-237 itself lists, the usage text in `llm-eval.mjs` and
  `scripts/live-verify.mjs:81`; the moved pairwise command line keeps every flag and output the contract `pairwise-answer-judge.md` names (`--llm`, `--max-calls`, the output fields of D4J-C4), only its file changes;
  the check is `git diff --color-moved=zebra` or an equivalent read of each moved block.)
- **[SL-5]** `scripts/eval/extraction-authorized-import.mjs` is not moved, and every path a Dockerfile or `cloudbuild.yaml` copies still exists. (checker-extended: every path named by a `package.json` script or a
  `.github/workflows/*.yml` step that points at a moved file or folder (`live-verify.test.mjs`, `live-verify.pinned-question.json`, `rate-limit.test.ts`, `pairwise` command lines) is listed in the manifest and is
  either covered by a glob that still matches or fixed; an old path that is still named and no longer exists is a FAIL, and a fix that needs a file outside D-237's list is a STOP and a question.)
- **[SL-6] (checker-added)** The diff from 6df8934c to the unit's tip touches only: the four moves and the new files D-237 names, the import and path edits they need (`scripts/eval/llm-eval.test.mjs`, the usage
  text of `scripts/eval/llm-eval.mjs`, `scripts/live-verify.mjs`), `docs/SNAPSHOT.md` if regenerated, and the one inbox line. Reason: the maker's list checked the result but not the boundary; D-237 names the exact
  files, and "no limit changes and no behaviour change" is only as strong as the list of files that may differ.

## Out of scope / ignore
Not in this unit: any change of a limit, any behaviour change, the two known baseline reds named in SL-3, and the documents that still cite the old paths (the launch-prep manifest and verdict), which are records
of their own commit and are not edited.

## Stop rule
A finding outside these checks is filed and not built.

## Amendment log
- 2026-11-25 · routine · created from the maker-derived inbox entry "structure-lint repair on `release/kb-golive`" (D-237). Dispositions: SL-1, SL-2 accept; SL-3 tightened (per-test name list, baseline reds
  measured the same way); SL-4 clarified (path strings D-237 itself lists are allowed edits; the moved pairwise CLI keeps its flags); SL-5 extended (`package.json` scripts and workflow files); added SL-6 (diff boundary).
  The path change of item 1 of the entry is recorded in `pairwise-answer-judge.md` (path note, no owner quote reworded).
