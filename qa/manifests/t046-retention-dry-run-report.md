# Manifest - t046-retention-dry-run-report (T-046, retention half, operator report)

Status: ready-for-check
Fix cycle: 0
Lane: t046dry (branch `lane/t046dry`, base 8520fa8). Code commit a0d18a8.
Tier: 3 (next roadmap task, T-046); a new feature slice, not a ledger finding.
Round cap: PASSed verdicts naming the retention seam: `t046-retention-sweep-planner` (cycle 1 PASS), `test-gaps-t046-004-t037api-003` (PASS), and the T-026 `purge-retention-policy` verdict (no `VERDICT:` line in the usual form; counted as a third). The class-based cap (D-014) limits non-security FINDINGS on a seam to 2 PASSes; it does not bar a new roadmap feature (tier 3 "is not optional"). A new operator command with new code, new tests and no change to the planner or policy is a different unit; the seam of THIS unit is "gather local state and print" and has 0 PASSes. This is also destructive-adjacent (security class), which is never capped. Classification: new feature slice of T-046, proceeding. No issue filed (`qa/issues.t046dry.jsonl` not created: nothing found).

## Scope

`packages/ingest/src/` only (one package, so the lane's `@lkb/*` junctions resolve correctly):
- `retention-report.ts` - `runRetentionReport(argv, deps)`: gathers, calls `planRetentionSweep`, prints. Exit 0 report produced; 2 usage error / planner refused the input; 3 unreadable state.
- `retention-report-args.ts` - strict argv parser. `retention-report-state.ts` - read-only gatherer. `retention-report-text.ts` - terminal sanitiser. `retention-report-cli.ts` - entry point.
- Tests: `retention-report.test.ts` (12), `retention-report.safety.test.ts` (6); `retention-report.fixtures.ts` is a test helper.

Where it lives and why: the planner is in `ingest`; `ingest -> core` is allowed, `meeting-bot -> ingest` is allowed, but the planner is not exported from `packages/ingest/src/index.ts` and lane junctions would resolve a changed index from the MAIN tree, so a `lkb` subcommand would need two packages. The command is therefore standalone in `ingest`:
`node --import tsx packages/ingest/src/retention-report-cli.ts --tenant <id> --data-root <dir> --min-age-days N --clip-padding-seconds N [--media-root <dir>]`.
NOT done: wiring into the `lkb` dispatcher (`meeting-bot/src/cli.ts`), which needs an index export plus a cli.ts edit after merge.

## Where the inputs come from, and what proves each precondition

Layout read: `<data-root>/<sha256(tenantId)>/<sessionId>/{source.json, session.json, claims.json, turns.json}` (what `scripts/upload/submit.mjs` writes: `tenantSegment = sha256(tenant)`).
- There is NO media-collection file on disk (media docs live in Mongo). A media record is DERIVED from `source.json` (`_id`, `tenantId`, `kind` in recording/audio/video, `path`/`audioPath`); `turnRefs` = the `_id`s in `turns.json`.
- transcribed / indexed = `session.json` `status.transcribe` / `status.index` equal `"done"`. `processedAt` is handed to the planner ONLY when both are done AND `session.json` carries a `processedAt` field. FINDING: no shipped writer writes `processedAt` (the manifest of the planner unit already said the Media schema does not define it), so on real state every recording reports "not processed" and is KEPT. The report prints that note. What proves "processed" is the owner's Q6 decision.
- verified = `claims.json` `status` (planner + `isPurgeEligible`); `retention.purgedAt` is read from `session.json` `retention.purgedAt` if present; media size/presence from `--media-root` + the relative `path` (lstat only; absolute or escaping paths show "(not located)" and size unknown, not counted in bytes).
- Verdicts come ONLY from `planRetentionSweep` (no eligibility rule is re-implemented). The per-recording precondition line (transcribed, indexed, processedAt, age, claims-verified, file) is an informational view of the same gathered data and cannot change a verdict.
- Bounds: max 500 session dirs (else exit 3), 5 MiB per file, 64 MiB total read; missing/corrupt/oversized `source.json` or `session.json` lists that session as KEEP "unreadable state"; corrupt `claims.json` pushes the planner's fail-closed `null` claim, so ALL recordings are kept with a warning.

## No default thresholds (and why)

`--min-age-days` and `--clip-padding-seconds` are REQUIRED and strictly parsed (positive, finite, bounded). Without them: exit 2, no report, message names ARCHITECTURE Q6 and shows an example. Q6 says the purge values are not decided and the owner must set them; a default would be a de facto decision, and this command's purpose is for the owner to try candidate values on real state. The report header prints the values used.

## Cannot delete: guarantee and test

By construction: the modules import only `lstatSync`, `readdirSync`, `readFileSync` (node:fs), `node:path`, `node:crypto`, `node:util` and the two pure functions of `@lkb/core`; no `--apply`/`--force`/`--yes` option exists and any unknown option or stray argument is a usage error (exit 2, no report).
Test `...contain no delete, write, rename or spawn API` follows the relative-import graph of all five modules plus `retention-sweep.ts`, `strict-record.ts` and core `purge-policy.ts`, strips comments and string literals, and fails on `unlink rm rmdir rename writeFile appendFile truncate copyFile mkdir symlink chmod utimes createWriteStream open(Sync) child_process spawn exec* fork eval`, on `require()`/dynamic import, on any bare import outside the allow-list, on any non-read `node:fs` name, and pins the names imported from the `@lkb/core` barrel. Note: the barrel also re-exports an alert sink that imports `node:https`; the report does not call it, and the test pins the barrel names to the two pure functions instead of following the barrel. A second test pins the option list. A third snapshots (content hash, size, mtime of every file and directory) the temp data root and media root before and after 7 runs (success, other tenant, missing tenant, `--apply`, missing thresholds, other thresholds, missing root): identical.

## Tenant-tagging finding

Established by reading: the upload layout IS tenant-segmented by directory (`sha256(tenantId)`) AND every file carries `tenantId`; the legacy flat layout (`data/toc-migrated/<session>/`) has tenantId inside files but no tenant directory, and holds `kind: document` sources with no media. The command reads ONLY `<data-root>/<sha256(requested tenant)>/`; it never lists the data root, so another tenant's directory is never opened. A record inside that directory whose `source.json` tenantId differs is a planner tenancy violation: excluded and COUNTED ("other-tenant records excluded: N"), its id/title never printed. The report states the scoping rule in its header. Not covered: scheduler state files (operations.json etc.) are not read at all by this command.

## Output safety

All data-derived strings (titles, ids, planner reasons, paths, argv echoes) pass `cleanText`: join URLs (scheme URLs and bare meet/zoom/teams/webex/whereby links) and their queries replaced with `[url omitted]`; control, format (bidi, zero-width, isolates), line/paragraph separators, surrogates, private-use, unassigned become visible `\u{hex}`; bounded length. Paths print relative to `--media-root`; neither root's absolute path appears in output (tested).

## Not done

- The destructive sweep EXECUTOR: a separate future unit that needs the owner's thresholds (Q6) and Umesh's approval. This slice cannot be extended into it without adding forbidden imports that the scan test rejects.
- Q6 values are undecided; what proves "processed" (a `processedAt` writer / schema field) is undecided.
- The meeting-bot web page half of T-046; the `lkb` dispatcher wiring; export from `ingest/src/index.ts`.
- No real data directory of this machine was read; temp fixtures only. depcruise not run (no npx); imports checked by reading the rule (`ingest -> core` allowed) and by the import-graph test.

## Evidence

PATH has the codex node dir. From `packages/ingest`:
- `timeout 300 node --test --import tsx src/retention-report.test.ts src/retention-report.safety.test.ts` -> `ℹ tests 18 / ℹ pass 18 / ℹ fail 0`.
- `timeout 300 node --test --import tsx src/retention-sweep.test.ts src/retention-sweep.strict.test.ts` (planner, unchanged) -> `ℹ tests 31 / ℹ pass 31 / ℹ fail 0`. From `packages/core`: `src/domain/purge-policy.test.ts` -> `ℹ tests 7 / ℹ pass 7 / ℹ fail 0`.
- `timeout 300 node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0.
- Budgets (non-blank lines): args 62, cli 12, state 146, text 20, report 121, fixtures 93, tests 165 and 145. `node scripts/lint-dirsize.mjs` reports only the pre-existing `packages/index/src/pipeline: 34 files (budget 30)`; `packages/ingest/src` is within budget; `lint-loc` reports only the pre-existing `sb_join.py`.
- The checker's two wrongly-eligible inputs through the COMMAND (D-015, ISS-T046-001/002/004): (1) source.json `{"_id":"m1","kind":"recording","__proto__":{"tenantId":"toc"}}` -> `RECORDING m1 => KEEP`, reason `malformed record: missing or invalid own tenantId`, 0 eligible: 1/1 refused. (2) session.json `processedAt` in `"1","0","12","2020"` plus the trailing-NUL instant, `"2026-09-26x"`, `"tomorrow"`, `1`, `null`: 9/9 `=> KEEP`, `processedAt=FAIL(malformed)`, reason `malformed processedAt`.
- Run on a temp fixture (3 sessions), `exit=0`; with no thresholds `exit=2`; with `--apply` `exit=2` ("unknown option or argument: --apply"). Report:

```
RETENTION DRY RUN - report only. Nothing is deleted, moved or written; this command cannot delete.
thresholds used (owner decision, ARCHITECTURE Q6, no default): min-age-days=7 (604800000 ms)  clip-padding-seconds=15
recordings: 3  non-recording sessions skipped: 0  other-tenant records excluded: 0

RECORDING 2026-09-01-webinar-a-src => ELIGIBLE
  file: rec/a.webm  size: 2048 B  age: 19.7 d since processedAt
  preconditions: transcribed=PASS indexed=PASS processedAt=PASS age=PASS(19.7d vs 7.0d) claims-verified=PASS(1/1 verified) file=PASS(present)
  reason: all 1 citing claim(s) are verified
RECORDING 2026-09-20-webinar-b-src => KEEP
  preconditions: ... age=FAIL(1.7d vs 7.0d) ...
  reason: processed 146970083 ms ago, under the 604800000 ms minimum
RECORDING 2026-10-01-webinar-c-src => KEEP
  preconditions: ... claims-verified=FAIL(0/1 verified) ...
  reason: 1 claim(s) citing this media are not yet verified

TOTALS eligible: 1 recording(s), 2048 B | kept: 2 recording(s), 5096 B | size unknown for 0 (not counted in bytes)
```
(header lines for tenant/state/scoping omitted here for length; the state path prints as `<data-root>/<sha256>/`.)

## Mutations

Hand-written lane-unique harness (`mut-t046dry-harness.mjs`, untracked, deleted before this commit): absolute paths inside the worktree, byte backup PER mutation, 240 s hard timeout with SIGKILL, restore in `finally`, then `Buffer.compare` with the backup and `git hash-object <file>` equal to `git rev-parse HEAD:<file>` (all 11 restores matched). Both test files run together.

| Mutation | Result (killed by) |
|---|---|
| M1 default `--min-age-days` of 30 | killed: thresholds are required |
| M2 claims forced to `verified` in gathered inputs | killed: eligible and kept recordings reported |
| M3 `processedAt` passed though not transcribed/indexed (`done = true`) | killed: every precondition at its boundary |
| M4 `--apply` added to the option list | killed (2): no apply-like option; unknown option rejected |
| M5 `unlinkSync` imported in the state module | killed: no delete/write/rename/spawn API scan |
| M6 eligible bytes not summed | killed: eligible and kept recordings reported (totals) |
| M7 another tenant's directory read | killed (10), including two-tenant test |
| M8 title printed unsanitised | killed: hostile titles inert |
| M9 URL stripping removed | killed (2): hostile titles; cleanText |
| M10 age threshold halved | killed (2) |
| M11 file read opened with write flag | killed (10), including the byte-identical tree test |

11/11 killed, 0 survived.
