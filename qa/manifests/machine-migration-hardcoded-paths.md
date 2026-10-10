# machine-migration-hardcoded-paths

Priority tier: 3 — roadmap (repo migrated 2026-10-09 from D:\KnowledgeBase to C:\Users\product\Desktop\KnowledgeBase).
Security class: none (path resolution only; no auth/tenancy/data-write change).

## Scope
Search of scripts/, packages/, apps/, workers/, skills/, config, .codex, .github, package.json files, ps1/mjs/ts/py/json/yml for `D:\`, `D:/`, `ai_os`, `Lenovo`, `/Users/`, `/mnt/`, other absolute drive paths. Excluded: node_modules, qa/, docs/, .handoffs/, .cache/, raw/, data/, brainstorms/. `ai_os`: zero hits anywhere in runnable code.

## Hit table
Class (a) runnable, wrong here; (b) fixture literal, harmless; (c) comment/message text.

| file:line | class | action |
|---|---|---|
| scripts/watch/run-watch.mjs:141 `LKB_MAIN_TREE_ROOT \|\| "D:/KnowledgeBase"` | a | FIXED: second candidate only exists when the env var is set; unset => this tree only (was a dead D: path). ROOT (line 51) now via same resolver; env override still wins. |
| .codex/hooks.json:9,20,29,40,49 `d:\KnowledgeBase\.codex\hooks\*.ps1` (5 hooks) | a | NOT FIXED (owner): hook-enforcement config, analogous to `.claude/settings.json`; Codex cwd semantics unverified. Compare `.claude/settings.json`, which uses relative `.claude/hooks/...`. |
| scripts/webinar/start-calendar-attendance.ps1:10 `$NodePath` default = version-pinned `C:\Program Files\WindowsApps\OpenAI.Codex_26.1002...\cua_node\bin\node.exe` | a | NOT FIXED (owner): path does not exist here; no node on PATH, so any default is an invented location, and the launcher test dot-sources the file (a throwing default would break it). Caller must pass `-NodePath`. |
| .goal/goal.json:3 `project_path: "D:\KnowledgeBase"` | a? | NOT FIXED: .goal/ out of scope; no reader found in runnable code (grep). Owner. |
| packages/meeting-bot/src/calendar/task-scheduler.test.ts:182 `LAUNCHER = "D:\KnowledgeBase\scripts\..."` | b | none (other lane's dir; data literal) |
| packages/meeting-bot/src/profile/user-profile.test.ts:10 `D:\vault\profiles` | b | none |
| scripts/webinar/start-calendar-attendance.test.mjs:10,38,49,71,72; start-record-detached.test.mjs:123; scripts/lib/find-audio-file.test.mjs:94; apps/api brain.test.ts:177,182; capture/*.test.ts `C:\raw\webinars`; join-rules-store.test.ts:75; browser-profile.test.ts:23; obs-guard.test.ts:166; py/test_sb_join_profile.py:21 | b | none |
| packages/meeting-bot/src/capture/record-commands.ts:23 `OBS_EXE = C:\Program Files\obs-studio\...` | n/a | standard install location, not an old-machine path; in capture/ (other lane), reported only |
| apps/api/src/ai-transport.ts:71 `SystemRoot ?? "C:\Windows"` | n/a | standard fallback |
| apps/api/src/index.ts:31-32, health.test.ts:240, obs-windows.ts:43 | c | none |
| .claude/CLAUDE.md:46,65,68; AGENTS.md:46,65,68; TASKS.md:5; ARCHITECTURE.md:62; Living-Knowledge-Base-Architecture.html:198,392,481; brainstorms/*.md | c | none (docs/enforcement text; see owner list) |

Counts: (a) 4 hit groups (1 fixed, 3 owner), (b) fixtures ~14 sites, (c) ~10 sites.

## Change
- New `scripts/watch/lib/main-tree.mjs` (`resolveWatchRoot`, `mainTreeCandidates`), pure, in the existing lib dir (no file added to scripts/ root).
- `scripts/watch/run-watch.mjs`: imports them; unused `resolve`/`fileURLToPath` imports removed. No other behaviour change.
- New `scripts/watch/lib/main-tree.test.mjs` (4 tests, no machine-specific path).

## Evidence
Toolchain: node v24.19.0 (codex runtime). Worktree has no node_modules junction; the new test imports only node built-ins, so none was needed.
- `node scripts/lint-dirsize.mjs` before: `lint-dirsize: OK (109 dir(s) within budget)`; after: same.
- `node --check scripts/watch/run-watch.mjs` -> syntax ok.
- `node --test scripts/watch/lib/main-tree.test.mjs`:
  ```
  ✔ env unset: root is the checkout the script lives in
  ✔ env set: LKB_MAIN_TREE_ROOT wins
  ✔ candidates: env unset yields only this tree, no hard-coded fallback
  ✔ candidates: env set adds the configured main tree second
  ℹ tests 4 / pass 4 / fail 0
  ```
- Not verified: run-watch.mjs itself was NOT executed (no --help/--print-config flag; --dry-run calls Drive/Gmail and needs tsx/node_modules, which this worktree lacks). Only the resolver functions were tested.

## For the owner (class (a) not fixed)
1. `.codex/hooks.json` x5 `d:\KnowledgeBase\.codex\hooks\...` — enforcement-path-like; needs Approver edit (relative paths as in `.claude/settings.json`, if Codex runs hooks from the repo root).
2. `.claude/CLAUDE.md` lines 46 (`C:\Users\Lenovo\.claude\plans\...`), 65, 68 (`D:\KnowledgeBase`); same in AGENTS.md — enforcement paths, /compound + Approver only.
3. `scripts/webinar/start-calendar-attendance.ps1:10` NodePath default (Codex WindowsApps pinned). Needs a decision on where node lives; pass `-NodePath`.
4. `.goal/goal.json` `project_path`.
5. No `D:\ai_os` dependency exists in runnable code (nothing to list).
6. Scheduled task `Vidysea-Umesh-Calendar-Attendance` (and any task registered via start-record-detached / start-calendar-attendance `-InstallTask`) was registered on the old machine and must be re-registered here (its action embeds the old NodePath and launcher path). Not inspected on this machine; not changed.

Status: checked-PASS
Checked: qa/verdicts/machine-migration-hardcoded-paths.md (cycle 0, 3519f27)
Fix cycle: 0
