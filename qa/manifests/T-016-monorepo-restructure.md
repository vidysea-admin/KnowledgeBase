# Manifest — T-016-monorepo-restructure
**Contract:** qa/contracts/monorepo-restructure.md
**Goal task:** T-016
**Date:** 2026-09-03
**Fix cycle:** 1 of max 3
**Issues addressed:** ISS-006, ISS-008

## What changed
- `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json` (new, root) — pnpm workspace
  (`private: true`, `packageManager: pnpm@10.33.0`, members `packages/*`, `apps/*`, `workers/*`); base tsconfig
  mirrors `sources/whatsapp_msg/tsconfig.json` compiler options (ES2023, nodenext, strict) [C1, C2]
- `packages/{core,db,ai,ingest,index,ask,meeting-bot}`, `apps/api`, `workers/transcribe` (new) — each
  `package.json` named `@lkb/<name>`; TS packages have `tsconfig.json` extending the base; empty packages hold
  only `package.json` + `src/index.ts` (`export {}` placeholder) [C2]
- `scripts/gen-types.mjs` (new) + `packages/core/src/generated/*.ts` + `packages/core/src/index.ts` (GENERATED)
  — `pnpm gen:types` runs json-schema-to-typescript over `schema/*.schema.json` (custom `kb://` $ref resolver
  for the tree_index self-ref); `pnpm gen:types --check` exits 1 on drift. Schemas untouched [C5]
- `packages/index/src/tree/tree.test.ts` (4 cases) + `packages/ask/src/router.test.ts` (6 cases) — ported FIRST,
  run red (ERR_MODULE_NOT_FOUND), then the code; runner `node --test --import tsx` [C3]
- `packages/index/src/tree/{build,search}.ts` — port of `tree_index/{build_tree,tree_search}.py`: same node_id
  scheme (`tenant:<t>` / `<t>/year:Y` / `…/month:MM` / `…/session:<id>`), injectable `summarize`, same
  `page.summary` → `""` fallback; types from `@lkb/core` generated `Sessions`/`SessionPages`/`TreeIndexNode` [C3]
- `packages/ask/src/{evaluator,router}.ts` — port of `ask_router/{evaluator,router}.py`: thresholds 0.7/0.3 as
  trailing params, `[score, reason]`/bare-number normalisation, `good_docs`, `web_used`,
  `insufficient_coverage`, `sources.internal` / `sources.web` never merged; `RangeError` replaces `ValueError` [C3]
- `tree_index/*.py`, `ask_router/*.py` — `git rm` after the TS tests passed (history keeps them) [C4]
- `TOC/` → `raw/TOC/` via `git mv` (54 tracked files, `.env` + `.claude/` moved with the directory);
  `whatsapp_msg/` → `sources/whatsapp_msg/` via OS move (working copy incl. `.env`, `node_modules`, `.git`
  intact; the old dir was locked by another process so entries were moved one by one, then the empty dir
  removed) and `git submodule add <remote> sources/whatsapp_msg` at commit `7cdf1a1` (= origin/main) →
  `.gitmodules` [C6]
- `.gitignore` — `raw/TOC/...` media paths; removed the `whatsapp_msg/` ignore lines (submodule has its own);
  added `**/dist/` [C6]
- `.claude/CLAUDE.md:39,43` — sample-data path `raw/TOC/TOC-Materials/`; `sources/whatsapp_msg/` submodule [C6]
- `ARCHITECTURE.md` (128 lines) — header `as of: 2026-09-03, last change: D-008`; §3 +H8 (provided-first,
  D-008), +H9 (pluggable STT, D-004), +H10 (multi-provider chain + listModels, D-005/D-008); §4 replaced by the
  D-003 tree; §5 budgets + dependency rules + purge gate; §6 Q2/Q4/Q5 closed, Q6 (gated purge level) added [C8]
- Root loose files: 12 (≤15). Staged with a narrow pathspec (`git add package.json pnpm-workspace.yaml
  pnpm-lock.yaml tsconfig.base.json scripts/gen-types.mjs packages apps workers .gitignore .claude/CLAUDE.md
  ARCHITECTURE.md` + the `git mv`/`git rm`/submodule entries); NOT committed — orchestrator commits [C7]
- Not done (non-goals): no CI, no lint scripts, no migrations, no provider code, no routes, no Mongo.

## How to verify (commands + expected)
- `cd D:\KnowledgeBase && pnpm install --frozen-lockfile` → expected: exit 0 [C1]
- `for p in packages/core packages/db packages/ai packages/ingest packages/index packages/ask packages/meeting-bot apps/api workers/transcribe; do echo "$p: $(ls $p | tr '\n' ' ') | $(node -p "require('./$p/package.json').name")"; done`
  → expected: every dir exists with `package.json` + `src/`, name `@lkb/<name>`, TS ones have `tsconfig.json` [C2]
- `pnpm -r test` → expected: exit 0; `packages/index` "tests 4 / pass 4 / fail 0", `packages/ask` "tests 6 / pass 6 / fail 0" [C3, C9]
- `pnpm -r typecheck` → expected: exit 0 (bonus, not a criterion)
- `test ! -e tree_index && test ! -e ask_router && git log --oneline -1 -- tree_index/build_tree.py` → expected: dirs gone, history line printed [C4]
- `python schema/validate.py` → expected: exit 0, "PASS: 10 collection schema(s) validated correctly." [C4, C9]
- `pnpm gen:types --check` → expected: exit 0, "OK: 10 generated type file(s) + index.ts match schema/" [C5]
- `git grep -nE "^(export )?interface " -- packages | grep -v "src/generated/"` → expected: only `Scored`, `Evaluation`, `InternalSource`, `AskResult` (router/evaluator result shapes — not schema collections) [C5]
- `git submodule status && cat .gitmodules && ls -a raw/TOC sources/whatsapp_msg | grep -c "^.env$"` → expected: `7cdf1a1… sources/whatsapp_msg (heads/main)`, url = whatsapp-archiver.git, `.env` present in both [C6]
- `git grep -nE "(^|[^/[:alnum:]_])TOC/" -- . ':!docs/DECISIONS.md' ':!qa/verdicts' ':!qa/manifests' ':!goal.md' ':!raw/TOC' | grep -v "raw/TOC/"`
  → expected: only `qa/contracts/monorepo-restructure.md:42` (the contract's own grep text) and
  `brainstorms/…:64` ("TOC/webinar" — prose, not a path) [C6]
- `git grep -n "whatsapp_msg/" -- . ':!docs/DECISIONS.md' ':!qa/verdicts' ':!qa/manifests' ':!goal.md' | grep -v "sources/whatsapp_msg/"`
  → expected: only lines 39–43 of `qa/contracts/monorepo-restructure.md` (the contract itself) [C6]
- `ls -Ap | grep -v / | wc -l` → expected: ≤ 15 (actual 12; `ls | wc -l` without -A = 8) [C7]
- `wc -l ARCHITECTURE.md` → expected: ≤ 150 (actual 128); `head -1 ARCHITECTURE.md` contains `last change: D-008` [C8]
- `find packages apps workers -name "*.ts" -not -path "*/node_modules/*" | xargs wc -l | sort -n` → expected: max non-test 72, max test 99 (all ≤ 300 / 400) [C9]

## Actual outputs (from maker's own run)
```
$ pnpm install --frozen-lockfile
Done in 404ms using pnpm v10.33.0
install exit: 0

$ pnpm -r test
packages/index test: ✔ grouping and nesting
packages/index test: ✔ evidence on every session node
packages/index test: ✔ tree_search known and unknown
packages/index test: ✔ summarize injection and fallback
packages/ask test: ✔ correct verdict never calls web even if supplied
packages/ask test: ✔ incorrect verdict uses web fallback, sources kept separate
packages/ask test: ✔ ambiguous verdict merges good docs and web but keeps them separate
packages/ask test: ✔ no web fallback provided sets insufficient_coverage
packages/ask test: ✔ reason returned on every call including correct
packages/ask test: ✔ thresholds are tunable parameters
packages/index test: ℹ tests 4  ℹ pass 4  ℹ fail 0
packages/ask test:   ℹ tests 6  ℹ pass 6  ℹ fail 0
test exit: 0
(before the code existed, the same command printed ERR_MODULE_NOT_FOUND for build.js / evaluator.js — tests ported first)

$ pnpm -r typecheck
typecheck exit: 0

$ pnpm gen:types --check
OK: 10 generated type file(s) + index.ts match schema/
gen:types --check exit: 0

$ python schema/validate.py
OK: claims / decisions / orgs / session_pages / sessions / sources / speakers / topics / tree_index / turns
PASS: 10 collection schema(s) validated correctly.
validate exit: 0

$ git submodule status ; cat .gitmodules
 7cdf1a18ac542ada34113b291a5cac51079ae9af sources/whatsapp_msg (heads/main)
[submodule "sources/whatsapp_msg"]
	path = sources/whatsapp_msg
	url = https://github.com/umeshsugara-ai/whatsapp-archiver.git
$ ls .env raw/TOC/.env sources/whatsapp_msg/.env
.env  raw/TOC/.env  sources/whatsapp_msg/.env
$ git -C sources/whatsapp_msg status --short | wc -l
0
$ test ! -e TOC && test ! -e whatsapp_msg && test ! -e tree_index && test ! -e ask_router && echo "old dirs gone"
old dirs gone

$ git grep -nE "(^|[^/[:alnum:]_])TOC/" -- . ':!docs/DECISIONS.md' ':!qa/verdicts' ':!qa/manifests' ':!goal.md' ':!raw/TOC' | grep -v "raw/TOC/"
brainstorms/2026-09-03-lkb-counsellor-assumptions.md:64:- **Asked:** recommended (a) TOC/webinar Q&A segments, ...
qa/contracts/monorepo-restructure.md:42:   references `TOC/` or `whatsapp_msg/` at the old locations (grep-checkable: ...
$ git grep -n "whatsapp_msg/" -- . ':!docs/DECISIONS.md' ':!qa/verdicts' ':!qa/manifests' ':!goal.md' | grep -v "sources/whatsapp_msg/"
qa/contracts/monorepo-restructure.md:39: ... `TOC/` → `raw/TOC/` (git mv); `whatsapp_msg/` → `sources/
qa/contracts/monorepo-restructure.md:40:   whatsapp_msg/` as a **git submodule** ...
qa/contracts/monorepo-restructure.md:42: ...
qa/contracts/monorepo-restructure.md:43:   and `git grep -n "whatsapp_msg/"` ...

$ ls -Ap | grep -v / | wc -l
12
  (.env .env.example .gitignore .gitmodules ARCHITECTURE.md Living-Knowledge-Base-Architecture.html
   TASKS.md goal.md package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json)

$ wc -l ARCHITECTURE.md
128 ARCHITECTURE.md

$ find packages apps workers -name "*.ts" -not -path "*/node_modules/*" | xargs wc -l | sort -n
    2 apps/api/src/index.ts  … (placeholders 2–5 lines)
   12 packages/core/src/index.ts
   13–37 packages/core/src/generated/*.ts (10 files)
   27 packages/index/src/tree/search.ts
   62 packages/ask/src/router.ts
   70 packages/ask/src/evaluator.ts
   72 packages/index/src/tree/build.ts
   94 packages/index/src/tree/tree.test.ts
   99 packages/ask/src/router.test.ts
  707 total

$ layout
packages/core: package.json src/ tsconfig.json | @lkb/core
packages/db: package.json src/ tsconfig.json | @lkb/db
packages/ai: package.json src/ tsconfig.json | @lkb/ai
packages/ingest: package.json src/ tsconfig.json | @lkb/ingest
packages/index: package.json src/ tsconfig.json | @lkb/index
packages/ask: package.json src/ tsconfig.json | @lkb/ask
packages/meeting-bot: package.json src/ tsconfig.json | @lkb/meeting-bot
apps/api: package.json src/ tsconfig.json | @lkb/api
workers/transcribe: package.json src/ | @lkb/transcribe   (Python worker — no tsconfig by design)
```

## Notes for the checker
- `git grep -n "TOC/"` verbatim will also match every new `raw/TOC/` reference (the new path contains the old
  substring); the refined grep above excludes exactly those. The two residual hits are the contract's own text
  (checker-owned, not editable by maker) and one prose phrase "TOC/webinar" in the brainstorm log (not a path).
- `python schema/validate.py` reports 10/10 (contract text says 9/9 — the ISS-004 tree_index schema made it 10).
- Generated `tree_index.ts` contains a structurally identical `TreeIndexNode1` for the `kb://tree_index`
  self-`$ref` — that is json-schema-to-typescript's output for a self-reference by `$id`; schemas were not changed.
- Evidence keys stay `turn_id`/`session_id` in both schemas and generated types (rename is T-018).
- Everything is staged (narrow pathspec), not committed; `.goal/goal.json` and `qa/.last-tick` modifications
  are not mine and were left unstaged.

## Status: checked-PASS
Verdict: qa/verdicts/T-016-monorepo-restructure.md (Cycle checked: 1, commit 66f1372) — 9/9 criteria; ISS-006, ISS-008 fixed.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
