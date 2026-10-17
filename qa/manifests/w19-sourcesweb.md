# Manifest - w19-sourcesweb
**Status:** checked-PASS
**Fix cycle:** 2
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

## Fix cycle 2 (checker verdict 22a490b8 on 6fbc6b41)
- `sourceLabel()` now uses `safeHttpUrl` from `apps/web/src/safe-url.ts` (`safePublicResourceUrl` is not on this base), plus a credentials check (`user:pass@` falls back).
- New test.each: whitespace-padded, ftp:, file:, javascript:, credentials urls all fall back to `kind (captureMode) date`.
- Fixtures: single `as Source[]` (legacy row held in a non-fresh object).
- vitest 3 files, 26/26 pass; tsc apps/web exit 0.
- Mutation "remove protocol check" (`safeHttpUrl(s.url)` -> `s.url ?? null`, per-mutation backup + trap, timeout 600): 4 failed / 10 passed (killed); cmp restore ok; post-run hash 34c41fcf7cfb9c2976e8666a6a3c6a70ec981fe5.
