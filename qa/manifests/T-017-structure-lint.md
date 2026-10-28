# Manifest — T-017-structure-lint
**Contract:** qa/contracts/structure-lint.md
**Goal task:** T-017
**Date:** 2026-09-03
**Fix cycle:** 1 of max 3
**Issues addressed:** none

## What changed
- `structure.config.json` (new, root) — the ONE home for every budget: roots, ignoreDirs, loc {300 / tests 400,
  extensions, testPatterns}, dirsize {30}, root {15 loose, ARCHITECTURE 150, md 200, README 80}, dupes
  {export regex, index.ts exclusion, schema $id}, migrations {dir, pattern}. Scripts read it; nothing restates it [C1, C10]
- `scripts/lib/walk.mjs` (new, 104 LOC) — single shared helper: `loadConfig`, `rootFromArgv` (`--root <dir>` for
  fixtures), `walk` (recursive, ignoreDirs by basename, POSIX rel paths → Windows-safe), `looseFiles`, `countLoc`
  (non-blank), `countLines`, `gitIgnored` (`git check-ignore --stdin`; non-repo → nothing ignored), `report` [DRY]
- `scripts/lint-loc.mjs` (29 LOC) [C1] · `lint-dirsize.mjs` (33) [C2] · `lint-root.mjs` (32) [C3] · `lint-dupes.mjs`
  (59) [C4] · `lint-migrations.mjs` (27) [C5] — each exports `check(root, cfg)` and, when run directly, prints
  `name: OK (...)` or one `file:count (budget N)` line per violation and exits 1
- `.dependency-cruiser.cjs` (new, root) — 6 §5 rules on REAL paths (`@lkb/*` resolves through pnpm symlinks to
  `packages/<name>/src/index.ts`, verified via JSON output): `apps-only-ask-ingest-index-ai-db-core`,
  `ask-index-ingest-only-ai-db-core`, `ai-db-only-core`, `core-imports-nothing`, `meeting-bot-only-ingest-core`,
  `workers-import-nothing`; plus `no-circular` and `no-unresolvable-workspace-import` (an `@lkb/*` import that
  pnpm strict node_modules cannot resolve is still a violation, never silently ok). `tsPreCompilationDeps: true`
  so `import type` edges count [C6]
- `package.json` — devDependency `dependency-cruiser` **18.2.0** (exact); scripts `lint:structure` (five linters
  `&&` `depcruise --config .dependency-cruiser.cjs packages apps workers` — first failure stops the chain) and
  `test:lint` (`node --test scripts/lint.test.mjs`); `pnpm-lock.yaml` updated [C7, C8]
- `scripts/lint.test.mjs` (new, 130 LOC, `node --test`) — for each of C1–C5: temp fixture (copy of the real
  `structure.config.json`) that is exactly AT budget → exit 0, then one over budget → exit 1 with the expected
  message; also proves ignoreDirs (node_modules/generated), index.ts re-export exclusion, `.md`-specific caps [C8]
- `.github/workflows/ci.yml` (new) — `push` + `pull_request`: checkout → pnpm 10.33.0 → node 24 → python 3.12 →
  `pnpm install --frozen-lockfile` → `pip install jsonschema` (validate.py import) → `pnpm -r typecheck` →
  `pnpm -r test` → `pnpm gen:types --check` → `python schema/validate.py` → `pnpm lint:structure` → `pnpm test:lint` [C9]
- `ARCHITECTURE.md` (130 lines) §5 — budgets bullet now REFERENCES `structure.config.json` instead of restating
  numbers; "Structure holds iff" replaces `ls | wc -l ≤ 15` / `wc -l ARCHITECTURE.md ≤ 150` with
  `pnpm lint:structure · pnpm test:lint` (D-003 §5 grant) [C10]
- **Budget violation found and fixed (not loosened):** `goal.md` at root was **322 lines** (> 200 root-`.md`
  cap). It is an immutable CEO-call transcript, so it was NOT split: `git mv goal.md docs/goal.md` (content
  byte-identical; `git log --follow` keeps history). ARCHITECTURE §4 updated accordingly (row `docs/goal.md`;
  tree lines list `docs/goal.md`, `structure.config.json`, `.dependency-cruiser.cjs`, `scripts/lint-*.mjs`) —
  §4 is within D-003's grant ("directory map"). Only other reference was the T-016 contract's own text (left as is) [C3]
- Not done (non-goals): no SNAPSHOT/FEATURES ledger, no migrations dir/content, no ESLint/Prettier.
- ⚠️ Contract wording hazard for the checker: the literal `npx depcruise --validate packages apps workers` makes
  commander treat `packages` as `--validate`'s optional config-file argument, so it cruises only `apps` + `workers`
  ("2 modules, 0 dependencies"). The equivalent unambiguous forms are `depcruise --config .dependency-cruiser.cjs
  packages apps workers` (used in `lint:structure`) or `npx depcruise packages apps workers --validate`
  (27 modules, 32 dependencies). Suggest the contract text adopt one of these.

## How to verify (commands + expected)
- `node scripts/lint-loc.mjs` → `lint-loc: OK (24 file(s) within budget)`, exit 0 [C1]
- `node scripts/lint-dirsize.mjs` → `lint-dirsize: OK (26 dir(s) within budget)`, exit 0 [C2]
- `node scripts/lint-root.mjs` → `lint-root: OK (12 loose root file(s), 1 gitignored excluded)`, exit 0;
  `ls -Ap | grep -v / | wc -l` → 13 (the 13th is `.env`, gitignored → `git check-ignore -v .env` prints the rule) [C3]
- `node scripts/lint-dupes.mjs` → `lint-dupes: OK (17 unique export(s), 10 unique schema $id(s))`, exit 0 [C4]
- `node scripts/lint-migrations.mjs` → `lint-migrations: OK (381 file(s) scanned)`, exit 0 [C5]
- `npx depcruise packages apps workers --validate` → `✔ no dependency violations found (27 modules, 32 dependencies cruised)`, exit 0;
  planted violation (below) → exit 1 [C6]
- `pnpm lint:structure` → all five OK lines + depcruise ✔, exit 0 [C7]
- `pnpm test:lint` → `tests 10 / pass 10 / fail 0`, exit 0 [C8]
- `python -c "import yaml; d=yaml.safe_load(open('.github/workflows/ci.yml')); print(len(d['jobs']['ci']['steps']), list(d[True].keys()))"`
  → `12 ['push', 'pull_request']`; local run of the same sequence → every step exit 0 [C9]
- `grep -c "structure.config.json" ARCHITECTURE.md` → ≥ 1; `grep -nE "300 LOC|≤ 15 loose|≤ 150 lines" ARCHITECTURE.md` → no §5 hits;
  `node -e "console.log(Object.keys(require('./structure.config.json')))"` → `roots, ignoreDirs, loc, dirsize, root, dupes, migrations` [C10]
- `wc -l ARCHITECTURE.md` → 130; `git diff --cached --stat -M -- goal.md docs/goal.md` → rename 100% [C3 fix]
- Each script ≤ 300 LOC: `for f in scripts/lint-*.mjs scripts/lib/walk.mjs; do grep -cve '^\s*$' $f; done` → 33 59 29 27 32 104

## Actual outputs (verbatim, 2026-09-03, D:\KnowledgeBase, node v24 / pnpm 10.33.0)

### C1–C5 individually
```
$ for s in loc dirsize root dupes migrations; do node scripts/lint-$s.mjs; echo "exit=$?"; done
lint-loc: OK (23 file(s) within budget)        <- before lint.test.mjs was added; 24 after
exit=0
lint-dirsize: OK (26 dir(s) within budget)
exit=0
lint-root: FAIL — 1 violation(s)
  goal.md: 322 lines (budget 200)              <- REAL violation on the current tree; fixed by git mv (see above)
exit=1
lint-dupes: OK (17 unique export(s), 10 unique schema $id(s))
exit=0
lint-migrations: OK (378 file(s) scanned)
exit=0

$ git mv goal.md docs/goal.md && node scripts/lint-root.mjs
lint-root: OK (11 loose root file(s), 1 gitignored excluded)   <- 12 once structure.config.json + .dependency-cruiser.cjs both counted
exit=0
```

### C6 — planted-then-reverted violations (two kinds)
```
$ npx depcruise packages apps workers --validate
✔ no dependency violations found (27 modules, 32 dependencies cruised)
exit=0

### PLANT 1: packages/core/src/index.ts  +  import "@lkb/db";   (the contract's example)
$ npx depcruise --config .dependency-cruiser.cjs packages apps workers
  error no-unresolvable-workspace-import: packages/core/src/index.ts → @lkb/db
x 1 dependency violations (1 errors, 0 warnings). 28 modules, 33 dependencies cruised.
exit=1
### REVERT (cp backup back; git status clean)
✔ no dependency violations found (27 modules, 32 dependencies cruised)
exit=0

### PLANT 2: packages/ai/src/index.ts  +  import "../../db/src/index.js";   (resolvable → proves the path rule)
$ npx depcruise --config .dependency-cruiser.cjs packages apps workers
  error ai-db-only-core: packages/ai/src/index.ts → packages/db/src/index.ts
x 1 dependency violations (1 errors, 0 warnings). 27 modules, 33 dependencies cruised.
exit=1
### REVERT
✔ no dependency violations found (27 modules, 32 dependencies cruised)
exit=0
```
Resolution proof (JSON reporter): `packages/ask/src/router.ts -> packages/core/src/index.ts undetermined,type-only,import`
— `@lkb/core` lands on the real `packages/core/` path, so §5 rules on real paths are exact.

### C6 contract-literal form (hazard, see What changed)
```
$ npx depcruise --validate packages apps workers
✔ no dependency violations found (2 modules, 0 dependencies cruised)
exit=0
```

### C7 / C9 — full CI sequence run locally
```
### pnpm install --frozen-lockfile
Lockfile is up to date, resolution step is skipped / Already up to date / Done in 404ms using pnpm v10.33.0
exit=0
### pnpm -r typecheck
packages/{db,ai,ask,meeting-bot,ingest,index} typecheck: Done · apps/api typecheck: Done
exit=0
### pnpm -r test
packages/index test: tests 4 pass 4 fail 0 · packages/ask test: tests 6 pass 6 fail 0
exit=0
### pnpm gen:types --check
OK: 10 generated type file(s) + index.ts match schema/
exit=0
### python schema/validate.py
PASS: 10 collection schema(s) validated correctly.
exit=0
### pnpm lint:structure
> node scripts/lint-loc.mjs && node scripts/lint-dirsize.mjs && node scripts/lint-root.mjs && node scripts/lint-dupes.mjs && node scripts/lint-migrations.mjs && depcruise --config .dependency-cruiser.cjs packages apps workers
lint-loc: OK (24 file(s) within budget)
lint-dirsize: OK (26 dir(s) within budget)
lint-root: OK (12 loose root file(s), 1 gitignored excluded)
lint-dupes: OK (17 unique export(s), 10 unique schema $id(s))
lint-migrations: OK (381 file(s) scanned)
✔ no dependency violations found (27 modules, 32 dependencies cruised)
exit=0
### pnpm test:lint
✔ lint-loc: passes on a clean fixture / ✔ lint-loc: fails on a violating fixture
✔ lint-dirsize: passes on a clean fixture / ✔ lint-dirsize: fails on a violating fixture
✔ lint-root: passes on a clean fixture / ✔ lint-root: fails on a violating fixture
✔ lint-dupes: passes on a clean fixture / ✔ lint-dupes: fails on a violating fixture
✔ lint-migrations: passes on a clean fixture / ✔ lint-migrations: fails on a violating fixture
ℹ tests 10  ℹ pass 10  ℹ fail 0
exit=0
```

### C8 — evidence the negative tests bite (first run caught two fixture mistakes before the fix)
```
✖ lint-migrations: fails on a violating fixture — actual output listed packages/a/src/migrate-fix.py BEFORE
  scripts/migrate-2026-09-03-patch.mjs (walk sorts alphabetically); regex order corrected
✖ lint-root: passes on a clean fixture — "root has 16 loose files (budget 15)": fixture forgot that
  structure.config.json itself is a loose file; fixture now = config + 3 md + 11 txt = 15 exactly
```
Violating-fixture messages asserted: `packages/a/src/big.ts:301` · `packages/a/src: 31 files` ·
`root has 16 loose files … ARCHITECTURE.md: 151 lines … NOTES.md: 201 lines … README.md: 81 lines` ·
`export 'alpha' … export 'Gamma' … schema $id 'kb://x'` · both stray migrate-* files.

### C9 — YAML parse
```
$ python -c "import yaml; d=yaml.safe_load(open('.github/workflows/ci.yml')); print('valid YAML; steps:', len(d['jobs']['ci']['steps']), '| on:', list(d[True].keys()))"
valid YAML; steps: 12 | on: ['push', 'pull_request']
exit=0
```

### C3 / C10 — root + ARCHITECTURE
```
$ ls -Ap | grep -v / | wc -l        → 13
$ git check-ignore -v .env          → .gitignore:2:**/.env	.env      (so 12 counted, matches lint-root)
$ wc -l ARCHITECTURE.md             → 130 ARCHITECTURE.md
$ scripts LOC: 33 lint-dirsize · 59 lint-dupes · 29 lint-loc · 27 lint-migrations · 32 lint-root · 104 lib/walk · 129 lint.test
```

## Staged (narrow pathspec; NOT committed — orchestrator commits)
`structure.config.json .dependency-cruiser.cjs scripts/lib/walk.mjs scripts/lint-loc.mjs scripts/lint-dirsize.mjs
scripts/lint-root.mjs scripts/lint-dupes.mjs scripts/lint-migrations.mjs scripts/lint.test.mjs
.github/workflows/ci.yml package.json pnpm-lock.yaml ARCHITECTURE.md docs/goal.md (rename from goal.md)
qa/manifests/T-017-structure-lint.md`. `.goal/` and `qa/.last-tick` deliberately left unstaged.

## Status: checked-PASS
Verdict: qa/verdicts/T-017-structure-lint.md (Cycle checked: 1, commit 4ccfcfd) — 10/10 criteria met.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
