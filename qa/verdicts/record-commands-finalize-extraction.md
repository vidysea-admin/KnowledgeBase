# Verdict: record-commands-finalize-extraction

VERDICT: PASS
Cycle checked: 0
Unit commit: c2fc9af (base 78d482b), lane/recfin

## Commands and results
- `git show --stat c2fc9af`: record-commands.ts (41 lines changed), record-finalize.ts (+33), the manifest. Nothing else.
- Moved bodies: 33 removed vs 33 added lines, sorted-line diff empty (IDENT); no indentation change at all. Zero non-identical lines. (Manifest says "CRLF preserved": record-finalize.ts is CRLF, record-commands.ts base had 0 CRs; the added block sits in the CRLF file and `file` reports uniform CRLF. Harmless wording imprecision.)
- Free identifiers: path, REPO_ROOT, createHash, spawnSync, readFileSync, writeFileSync, validateIndexProof (now same-module). record-finalize.ts defines `HERE = path.dirname(fileURLToPath(import.meta.url))` (line 17) and `REPO_ROOT = path.resolve(HERE,"..","..","..","..")` (line 18), character-identical to record-commands.ts lines 17-18; both files sit in the same directory, so the value is the same. All are immutable consts; no module-level mutable state touched. createHash/spawnSync/readFileSync/writeFileSync/path already imported in record-finalize.ts (lines 8-12).
- Removed imports createHash, spawnSync, writeFileSync, readFileSync: each has 0 remaining references in record-commands.ts; none were bare `import "x"`; all node builtins (no init-order or side-effect effect). tsconfig has no noUnusedLocals, so removal was opportunistic hygiene, not required; it is correct.
- Cycle: record-finalize.ts imports node builtins, ./reconnect-gaps.js, ./telegram-alerts.js; grep finds no "record-" import in either. dependency-cruiser stage: "no dependency violations found (619 modules)".
- Importers unchanged: scripts/webinar/run-pipeline.mjs (validateIndexProof) and record-commands.test.ts still resolve via the re-export.
- lint-loc --all: loc stage fails with 3 (speakers-llm.ts, sb_join.py, run-watch.mjs expected); record-commands.ts gone. Non-blank lines: record-commands.ts 271, record-finalize.ts 239.
- `node scripts/lint-dirsize.mjs`: OK (110 dir(s) within budget).
- `node scripts/lint-dupes.mjs`: OK (707 unique export(s), 27 unique schema $id(s)). The re-export is not counted as a second declaration.
- `node scripts/lint-root.mjs`: FAIL, 18 loose files vs 15. tracker: 6 G4 ambiguous-ref findings in old manifests/verdicts. Both unchanged by this unit; ISS-367 stays open.
- record-commands.test.ts: tests 19, pass 18, fail 0, skipped 1. audio-watchdog.test.ts: tests 18, pass 18, fail 0.
- record-backend.test.ts at HEAD: tests 5, pass 3, fail 2 ("null !== 0" ffmpeg missing; "EPERM ... symlink"). SAME file against BASE 78d482b (base record-commands/record-finalize/test extracted via `git show` to temporary *.base.* copies in the capture dir, run, then deleted): tests 5, pass 3, fail 2, same two messages. Pre-existing and environmental, not a regression.
- `tsc --noEmit -p tsconfig.json` (packages/meeting-bot): exit 0, no output.

ISSUES-WRITTEN: none

## EXPLANATION
Pure behaviour-preserving move; bodies byte-identical, every free identifier resolves to an equivalent immutable binding, no cycle, no budget or rule weakened, no new file in capture/. The manifest is accurate (loc/root/tracker status, line counts, test numbers), including that its record-backend failures are environmental, which is now confirmed on base.

Recommended status changes (not applied by checker): ISS-STRUCTFIX-001 -> resolved by c2fc9af without a new folder. ISS-367 stays open (loc: 3 files; root 18/15; tracker 6 findings).
