# Contract — structure-lint (T-017)

> Ground truth for the CI-enforced structure budgets decided in D-003 (plan §6a/§6c.1). Drafted by
> the maker from D-003 + ARCHITECTURE §5; /checker adopts or amends on first check (as with T-016).
> Purpose: make the ERP anti-patterns *impossible to commit*, not merely discouraged.

## Scope
One root command `pnpm lint:structure` that runs every structural check below and exits non-zero on
any violation, plus a GitHub Actions workflow that runs it (and the existing test/typecheck/gen:types
--check/validate.py gates) on every push and PR. No application code changes.

## Criteria (each machine-checkable)

1. **`scripts/lint-loc.mjs`** — fails if any `.ts`/`.py`/`.mjs` under `packages/`, `apps/`,
   `workers/`, `scripts/`, `schema/` exceeds **300 LOC** (400 for `*.test.ts` / `test_*.py`),
   counting non-blank lines; ignores `node_modules`, `dist`, `generated/`. Prints the offending
   file:count. Configurable via a small `structure.config.json` at root (budgets in one place).
2. **`scripts/lint-dirsize.mjs`** — fails if any directory under the same roots has **> 30
   files** (non-recursive count, ignoring `node_modules`/`dist`/`generated`).
3. **`scripts/lint-root.mjs`** — fails if the repo root has **> 15 loose files** (directories
   excluded, dotfiles included, `.gitignore`d files excluded), or if `ARCHITECTURE.md` > 150 lines,
   or any root `*.md` > 200 lines, or `README.md` (when present) > 80 lines.
4. **`scripts/lint-dupes.mjs`** — fails if two files under `packages/` export a symbol with the
   same name (`export function|const|class|type|interface <Name>`), excluding `generated/` and
   `index.ts` re-exports; and fails if two `schema/*.schema.json` share the same `$id`.
5. **`scripts/lint-migrations.mjs`** — fails if any file matching `migrate-*.{mjs,js,ts,py}` exists
   anywhere outside `migrations/` (the ERP dated-patch-script pattern).
6. **Dependency rules** — `.dependency-cruiser.cjs` at root encoding ARCHITECTURE §5 exactly:
   `apps → packages/{ask,ingest,index,ai,db,core}`; `ask|index|ingest → ai|db|core`; `ai|db → core`;
   `core → nothing (no workspace imports)`; `meeting-bot → ingest|core`; `workers → nothing`.
   `npx depcruise --validate packages apps workers` exits 0 on the current tree and **exits non-zero
   on a deliberately planted violation** (the manifest must show one planted-then-reverted failure,
   e.g. `packages/core` importing `@lkb/db`).
7. **Single entry point:** root `package.json` script `lint:structure` runs 1–6 in sequence and
   exits non-zero on the first failure; `pnpm lint:structure` exits 0 on the current tree.
8. **Negative tests:** `scripts/lint.test.mjs` (`node --test`) creates temp fixtures that violate
   each of 1–5 and asserts each linter fails on them and passes on a clean fixture — proving the
   linters are not vacuous. Runs under `pnpm -r test` or a root `pnpm test:lint`.
9. **CI workflow:** `.github/workflows/ci.yml` runs on `push` + `pull_request`: pnpm install
   (frozen lockfile) → `pnpm -r typecheck` → `pnpm -r test` → `pnpm gen:types --check` →
   `python schema/validate.py` → `pnpm lint:structure` → `pnpm test:lint`. The workflow file is
   valid YAML (`node -e` or `python -c` parse check in the manifest). Actual GitHub execution is
   not required for PASS (no remote yet); the manifest runs the same sequence locally.
10. **Budgets live in one place:** `structure.config.json` holds every number above; scripts read
    it; ARCHITECTURE §5 references the file rather than restating numbers that could drift.

## Non-goals for T-017
- No SNAPSHOT/FEATURES ledger (T-017b). No schema/migration changes (T-018). No ESLint/Prettier
  style rules — structure only.

## Invariants
- **[I1] Budgets live in one place.** `structure.config.json` holds every number the linters
  enforce; no linter script or doc may hardcode a number that could drift from it (C10).
- **[I2] Enforcement must be proven non-vacuous.** A linter that never fails on a planted
  violation is not enforcement — each of the five linters must be shown to fail on a deliberately
  broken fixture and pass on a clean one (C6, C8).
- **[I3] Enforcement is CI-blocking, not advisory.** `pnpm lint:structure` runs on every push/PR
  via the committed workflow and exits non-zero on any violation — a budget documented but not
  gated does not satisfy this contract (Scope; C9).

## Amendment log
- 2026-09-03 · routine · checker ADOPTS this contract as checker-owned (maker-drafted, as T-016/ISS-006): content re-read against D-003 Result ("300 LOC per file (tests 400), 30 files per dir, root <= 15 loose files, one exported symbol per concept, ARCHITECTURE.md <= 150 lines, migrations only via migrate-mongo") and ARCHITECTURE §5 dependency rules — faithful; START stands on D-003 (plan §6c.1). Maker never writes qa/contracts/ again · T-017 cycle-1 check
- 2026-09-03 · routine · C6 verify command: the literal `npx depcruise --validate packages apps workers` is mis-parsed by depcruise 18.2.0's CLI (commander takes `packages` as --validate's optional config-file argument; reproduced: "2 modules, 0 dependencies cruised"). The C6 command is now `depcruise --config .dependency-cruiser.cjs packages apps workers` (= the `lint:structure` script; `npx depcruise packages apps workers --validate` is an equivalent form). Intent unchanged: exits 0 on the current tree, non-zero on a planted violation · T-017 cycle-1 check
- 2026-09-08 · routine · added `## Invariants` section (I1-I3), derived from this contract's own
  already-stated Scope/Criteria text (single-source budgets, non-vacuous enforcement, CI-blocking
  not advisory) — no new requirement introduced, only structure per the checker SKILL's "Contract
  file shape" · ISS-007 housekeeping
- 2026-10-05 · routine · C7 strengthened/reconciled with Scope and ISS-367: the single entry point must execute every configured stage even after failures, collect each stage's exit/error/signal, and return non-zero after all outcomes when any failed. The former first-failure stop conflicts with the existing Scope requirement to run every structural check and the release-verification goal. Per-stage bounded execution may report a timeout as failure; it must never credit a timeout as green. All original budgets and the current-tree-zero release acceptance remain unchanged. C1/C8 test classification includes anchored `\.test\.mjs$` under the existing testMax 400; source .mjs remains max 300, per ISS-371. This amendment strengthens observation and corrects classification; it does not authorize budget increases or waive outstanding release failures.
