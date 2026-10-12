# ingestdirsize-retention-relocation

**Handshake status:** checked-PASS
Fix cycle: 0
Tier: 3-adjacent (lint-dirsize regression after t046purge merge). Class: move-only refactor, no data write/auth/tenancy. Lane: lane/ingestdirsize.

## Scope
Move all `retention-*` modules and tests (including the `retention-report/` dir) from `packages/ingest/src/` to `packages/ingest/src/retention/`. Public API unchanged: `index.ts` exports none of them, and a repo-wide grep finds no importer outside the moved files (apps, scripts, other packages, package.json, ARCHITECTURE.md: none).

## Changes besides the renames
- `../strict-record.js` (was `./`) in 8 top-level moved files; `../../strict-record.js` in 3 files under retention-report/.
- `retention-report.nowrite.test.ts` line 13: `CORE_PURGE_POLICY` path gains one `..` (file location, not an expectation).
- Header-comment paths updated.

## Evidence
- `git diff --cached -M --stat`: 29 files changed, 27 insertions, 27 deletions (renames + import/path lines only).
- lint-dirsize: packages/ingest/src 31 -> 14 files; total violations 7 -> 6 (remaining 6 unchanged, none new).
- tsc packages/ingest: exit 0. No dependant imports the moved files, so no paths mapping was needed.
- `node --test --import tsx "src/**/*.test.ts"` in packages/ingest: before tests 340 pass 340 fail 0; after tests 340 pass 340 fail 0.
- CLI entry points (`retention-purge-cli.ts`, `retention-report-cli.ts`) are referenced by no package.json script or doc outside TASKS.md prose; header usage comment updated.
