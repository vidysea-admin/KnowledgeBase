# Verdict: machine-migration-hardcoded-paths

VERDICT: PASS
Cycle checked: 0
Commit checked: 05dc2ad (lane/migpath)

## Commands (node v24.19.0, each under `timeout`)
- `git show --stat 05dc2ad`: 4 files only: manifest, scripts/watch/lib/main-tree.mjs, main-tree.test.mjs, scripts/watch/run-watch.mjs (+10/-6). No enforcement path, qa/contracts, or other-lane file.
- `node --test scripts/watch/lib/main-tree.test.mjs`: tests 4, pass 4, fail 0.
- `node --check scripts/watch/run-watch.mjs`: CHECK_OK.
- Non-blank lines of run-watch.mjs: 05dc2ad^ = 558, 05dc2ad = 556 (already over the 300 budget, shrank by 2).
- Edge probe of resolveWatchRoot/mainTreeCandidates (ad-hoc script, deleted): env "" -> script's checkout (counts as unset); "C:/x y/kb/" -> `C:\x y\kb` (space and trailing separator fine); "rel/dir" -> resolved against cwd (same as before); "C:/nonexistent" -> returned verbatim, no existence check (same as before; loadIngestedDriveIds does existsSync). Script URL containing `%20` decodes to a path with a space.
- Tests use `import.meta.url` and `mkdtempSync(tmpdir())`; the only absolute-path regex is a negative check. They do not depend on this machine's path.

## Point 2: worktree vs primary
`ROOT` was already `process.env.LKB_MAIN_TREE_ROOT ? resolve(env) : resolve(dirname(fileURLToPath(import.meta.url)),"..","..")` before the commit (diff shows these three lines moved verbatim into resolveWatchRoot). So ROOT resolves to the RUNNING checkout (the worktree when launched from one), exactly as before; no ROOT behaviour change. ROOT is used for Recordings, Audio, calendar CSV, qa/watch, data/.watch.lock and data/toc-migrated. The old hard-coded "D:/KnowledgeBase" was only the second read-only candidate for `_drive-manifest.json` (a best-effort dedupe read of the primary tree). The service never addressed the primary tree by default; the env var is the explicit mechanism for that. Ruling: resolving from import.meta.url is correct and is not a behaviour change for ROOT.

## Point 3: behaviour delta besides paths
Before: candidates = [ROOT/rel, (env || "D:/KnowledgeBase")/rel]. After: [ROOT/rel] plus [env/rel] only when env is set. Env set: identical. Env unset: the second candidate (D:/..., nonexistent here, skipped by existsSync anyway) is gone. On the old machine, a worktree run would also have read the primary tree's manifest for dedupe; now it does not unless the env var is set (set it for worktree runs). The import cleanup (dropped resolve/fileURLToPath imports) is inert. Nothing else changed. Low, noted only.

## Point 4: completeness grep
Tight regex over scripts, packages, apps, workers, tools, skills, .codex, .github and *.mjs/ts/py/ps1/json/yml/cmd/bat (excluding node_modules, qa, docs, .handoffs, raw, data): hits are .codex/hooks.json (5x `d:\KnowledgeBase\.codex\hooks\...`), .goal/goal.json project_path, packages/meeting-bot task-scheduler.test.ts:182 and user-profile.test.ts:10 (string fixtures, harmless), and comments. No `ai_os` or `Users\Lenovo` hit in runnable code. start-calendar-attendance.ps1:10 `$NodePath` default is a machine-specific `C:\Program Files\WindowsApps\OpenAI.Codex_...cua_node` path (the maker left it for the owner; it would misbehave if that package version differs). No missed class (a) hit beyond the three the maker listed. Not a defect of this unit (owner-reserved, enforcement/out of scope).

## Mutation table (main-tree.mjs; per-mutation byte backup, restore in trap plus explicit copy, cmp verified)
| # | Mutation | Result |
|---|---|---|
| 1 | env check forced false, env branch returns hard-coded `C:/KnowledgeBase` | KILLED (3 pass, 1 fail) |
| 2 | root resolved one directory too high (`"..","..",".."`) | KILLED (3 pass, 1 fail) |
| 3 | second candidate added unconditionally (`if (true)`) | KILLED (3 pass, 1 fail) |

HEAD-fidelity: main-tree.mjs `git hash-object` = `rev-parse HEAD:` = 6a645bc41ad060139afc9154c57e25d8aa6930a8; main-tree.test.mjs both 7e578ff179e39a2807bca22c2de6c51c892d11a4.

ISSUES-WRITTEN: none

EXPLANATION: Resolver is correct, env takes precedence, empty string counts as unset, edge inputs behave as before. Notes (low, not backlog): worktree runs no longer consult the primary manifest unless LKB_MAIN_TREE_ROOT is set; run-watch.mjs is 556 non-blank lines against a 300 budget but was 558 before this unit. No qa/contracts file written: the checker skill's contract requirement concerns feature ground truth, and this is a path-resolution fix whose behaviour is pinned by the unit test.
