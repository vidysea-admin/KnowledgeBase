# Manifest - w19-sourcesweb
**Status:** ready-for-check
**Fix cycle:** 1
**Contract:** qa/contracts/goal-t055.md C6 (no local source.path leakage; web consumer follow-up of w17-sourcepath)
**Base SHA:** 121290ba
**Candidate SHA:** see `git log -1 lane/w19-sourcesweb`

## Changed paths
- apps/web/src/pages/SourcesPage.tsx: no read of `source.path`. Search covers kind, captureMode, url, hash, createdAt. Display = `sourceLabel()` (http(s) url host+path, else `kind (captureMode) YYYY-MM-DD`) plus `#<8-char hash>` and createdAt.
- apps/web/src/api/types.ts: `Source` drops `path`, adds `hash?`.
- apps/web/src/pages/SourcesPage.test.tsx: fixtures keep legacy `path` (cast); new test asserts no path-like string in DOM; search tests cover url/kind/hash and that a path no longer matches.
- apps/web/src/pages/knowledge/knowledgeDirectoryFixtures.ts: cast only (`as unknown as Source[]`) so its legacy-path fixture still typechecks.

## Checks a checker must run (from apps/web, node on PATH)
- node node_modules/vitest/vitest.mjs run src/pages/SourcesPage.test.tsx src/pages/knowledge/KnowledgeDirectoryPage.test.tsx src/pages/knowledge/KnowledgeDirectoryIntegration.test.tsx
- node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json
- node scripts/lint-loc.mjs --all (repo root)

## Evidence
- vitest: 3 files, 21 tests passed (SourcesPage.test.tsx 9/9).
- tsc apps/web: exit 0.
- lint-loc --all: loc, dirsize, root, dupes, migrations, codex-hooks, snapshot, lint-tests, tracker all exit 0. `dependencies` stage exit 899, all `no-unresolvable-workspace-import` in apps/api (express/mongodb/@lkb/db): lane junction environment gap (apps/api has no node_modules junction), unrelated to this change; not run against main tree.
- Mutation: display re-reads `path` (per-mutation backup + EXIT/INT/TERM/ERR trap, timeout 600): vitest 8 pass / 1 fail (killed); cmp restore ok; post-run hash-object SourcesPage.tsx = 72773f6f5ac5fcfe8880b90738c82c74dd6b3f46 (equals pre-mutation worktree).
