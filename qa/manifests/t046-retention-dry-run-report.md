# Manifest - t046-retention-dry-run-report (T-046, retention half, operator report)

Status: ready-for-check
Fix cycle: 3
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

## Fix cycle 1

What failed (verdict cycle 0, FAIL): ISS-T046DRY-001 (high) a recording whose media mtime was 5 s ago or in the future was ELIGIBLE (the command never read mtime); ISS-T046DRY-002 (medium) a recording whose media file was missing, absolute, escaping, or with no `--media-root` was ELIGIBLE and counted; note: the no-write scan's regex missed an open flag of `"r+"`.

Planner and policy untouched: `git diff 8520fa8 -- packages/ingest/src/retention-sweep.ts packages/core/src/domain/purge-policy.ts` is empty. All fixes are in the command (`packages/ingest/src/` only).

### Guards (`retention-report-guards.ts`, pure, `now` injected) - all DOWNGRADE-ONLY
`guard(planned, input, now)` returns null for ANY planner verdict other than the exact string `purge-eligible`; `finalEligible` is `planned === "purge-eligible" && hit === null`. So a guard can only turn the planner's eligible into KEEP, never the reverse. Checked in this order, first hit wins:

| reason code | fires when |
|---|---|
| `media-root-not-given` | no media root (cannot occur from the CLI now; kept for the pure function) |
| `media-not-found` | no stored path, or the file does not exist under the root |
| `media-path-outside-root` | stored path absolute / drive / UNC / NUL / `..` escape, or the REAL path (realpath) is outside the real root (symlink or junction out) |
| `media-unreadable` | root or file cannot be resolved or stat'd, the target is not a regular file, or size/mtime missing |
| `clock-skew` | media mtime more than 5 min after the injected `now` (`CLOCK_SKEW_MS`) |
| `recently-modified` | `now - mtime` under the 24 h quiet period (includes an mtime up to 5 min ahead) |
| `media-modified-after-processed` | mtime later than `processedAt` by more than 1 h (`AFTER_PROCESSED_MS`): the file changed after the state says it was processed (re-recorded, replaced, copied). This is the "recorded time disagrees wildly with mtime" check; the only recorded time in the state is `processedAt` |
| `size-mismatch` | `source.json` carries `sizeBytes` and it differs from the stat'd size by more than 1% (`SIZE_TOLERANCE`); printed in the guard line, recording KEPT, stat'd size used in totals |

Media evidence (`retention-report-media.ts`) uses `realpathSync`, `lstatSync`, `statSync` only (reads).

Quiet period: `QUIET_PERIOD_MS` = 24 h, a constant, not an option. Justification: the pipeline's finalise -> transcribe -> process-video -> index steps (`scripts/webinar/run-pipeline.mjs` runs `finalize --transcribe --process-video --index`) can rewrite or remux the artifact and have no time bound in code, so a day (not seconds) is the conservative window. The planner's inputs have no such notion, so no option was added (a flag would let one argument lower the safety margin). Interaction: with `--min-age-days` >= 1 the `media-modified-after-processed` guard also covers recent files; the quiet period protects a short min-age or a state whose `processedAt` was written late.

`--media-root` is now REQUIRED (parser: exit 2, "--media-root is required: a report that cannot see the media files cannot say anything is purgeable"); it must be an existing directory (else exit 3, no report).

### Totals format
`TOTALS eligible: E recording(s), B B | kept: K recording(s), B B | size unknown for U (not counted in bytes)` and a separate line `not assessable: N recording(s), B B known (policy says eligible, but the media file was not found, not trusted or not readable; ...)`. Not assessable = guard-downgraded for `media-root-not-given`, `media-not-found`, `media-path-outside-root`, `media-unreadable`, `clock-skew`, `size-mismatch`; they are in neither the eligible nor the kept count. `recently-modified` and `media-modified-after-processed` (media seen and judged) count under kept. A guard line names the code and states "the planner alone said purge-eligible"; the planner's own reason is then printed as `planner reason:`.

### No-write scan (`retention-report.scan.ts`, tests in `retention-report.nowrite.test.ts`)
Now reads the flags argument: `open`/`openSync`/`fs.promises.open` must pass a LITERAL `"r"` (any quote) or `O_RDONLY`; `r+`, `w`, `a`, `x`, `wx`, `a+`, numbers, variables, ternaries, concatenations, a missing flag, `flag:`/`flags:` options other than read-only, and any `createWriteStream` are violations. Whole transitive import graph as before (now including the media and guards modules; the `node:fs` allow-list adds `statSync`, `realpathSync`). The `r+` case and the non-literal case are tests of the scanner itself on small fixture sources (`scanner: only a literal read-only open flag passes ...`).

### D-015 (ledger fixtures verbatim through the command)
- ISS-T046DRY-001: 2/2 KEEP (`justwritten` mtime now-5000 ms -> `recently-modified`; `future-mtime` mtime now+9 d -> `clock-skew`). Test `ISS-T046DRY-001 recorded fixtures`. (The ledger used the real clock; the test injects `now`.)
- ISS-T046DRY-002: 4/4 refused: `e-nomedia` -> `media-not-found`; `..\..\outside.webm` -> `media-path-outside-root`; `C:\Windows\win.ini` -> `media-path-outside-root`; no `--media-root` -> usage error exit 2, no report (so no ELIGIBLE line). Test `ISS-T046DRY-002 recorded fixtures`. None left open.
- The two cycle-0 planner inputs (ISS-T046-001 prototype tenantId; ISS-T046-002/004, 9 processedAt values) still KEEP through the command (existing tests, now with valid media present): 1/1 and 9/9.
- Additional (mine, not substituting): mtime exactly at the quiet period ELIGIBLE, 1 s inside KEEP, 1 s past ELIGIBLE; future +1 min and exactly 5 min `recently-modified`, +5 min 1 s and +1 y `clock-skew`; `../`, `a/../../`, `/etc/passwd`, UNC, `D:rel`, NUL, junction out of the root, a directory in place of the file, no stored path; size edge (1010 vs 1000 ok, 1011 vs 1000 KEEP); trees byte-identical (mtimes included) after guard runs. A genuinely ACL-unreadable file was not tested (a directory stands in for `media-unreadable`).

### Downgrade-only property (`retention-report.property.test.ts`)
(a) 1,000 seeded (mulberry32) random guard inputs including planner verdicts `keep`, empty, `PURGE-ELIGIBLE`, `purge-eligible `: whenever the final result is eligible the planner verdict was exactly `purge-eligible`, and for any other verdict the guard returns null; non-vacuous (>20 stayed eligible, >100 downgraded). (b) 150 random sessions through the real command: the reported-ELIGIBLE set is a subset of what `planRetentionSweep` alone says (computed from the same gathered inputs); non-vacuous. Result: holds.

### Mutations
Own harness `mut-t046dry-fix1-harness.mjs` (untracked, deleted before commit; absolute paths inside the worktree; byte backup per mutation; restore in `finally`; 240 s SIGKILL timeout; `cmp` and `git hash-object` equal to the committed blob after each: all 13 restores matched). 13/13 killed, 0 survived: M1 mtime/quiet guard removed (3 tests); M2 future mtime treated as old (2); M3 missing media treated as present (2); M4a lexical path-escape check removed (path evidence test); M4b realpath/junction containment removed (path evidence test); M5 media root optional again (2); M6 guard can upgrade keep to eligible (9, including both downgrade-only tests); M7 not-assessable merged into kept (totals test); M8 scanner accepts `r+` (scanner test); M9 scanner accepts non-literal flag (scanner test); M10 size-mismatch guard removed (2); M11 modified-after-processed removed (1); M12 quiet period lowered to 5 s (2). Run on commit 60e7ccc; the only later source change relabels the planner reason line as `planner reason:` when a guard fired.

### Evidence
PATH has the codex node dir. From `packages/ingest`:
- `node --test --import tsx src/retention-report.test.ts src/retention-report.safety.test.ts src/retention-report.nowrite.test.ts src/retention-report.guards.test.ts src/retention-report.property.test.ts` -> `tests 30 / pass 30 / fail 0`.
- Planner unchanged: `src/retention-sweep.test.ts src/retention-sweep.strict.test.ts` -> `tests 31 / pass 31`; `packages/core` `src/domain/purge-policy.test.ts` -> `tests 7 / pass 7`.
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0 (ingest).
- `git diff 8520fa8 -- packages/ingest/src/retention-sweep.ts packages/core/src/domain/purge-policy.ts` -> empty.
- Budgets (non-blank lines): sources max 138 (state), tests max 167 (guards). `node scripts/lint-dirsize.mjs`: only the known `packages/index/src/pipeline: 34 files (budget 30)`; `packages/ingest/src` has 28 entries (budget 30).
- Sample on a temp fixture (injected now, 5 sessions), exit 0, excerpt:

```
RECORDING badsize-src => KEEP
  guard: size-mismatch (not assessable) - state records 500 B but the file is 20 B (tolerance 1%); the planner alone said purge-eligible
RECORDING e-nomedia-src => KEEP
  guard: media-not-found (not assessable) - media file evidence: not-found; the planner alone said purge-eligible
RECORDING justwritten-src => KEEP
  guard: recently-modified - media modified 0.00 h ago, under the 24.00 h quiet period; the planner alone said purge-eligible
RECORDING ok-src => ELIGIBLE        (size 100 B, media-mtime-age 720.00 h)
RECORDING outside-src => KEEP
  guard: media-path-outside-root (not assessable) - media file evidence: outside-root; the planner alone said purge-eligible
TOTALS eligible: 1 recording(s), 100 B | kept: 1 recording(s), 10 B | size unknown for 2 (not counted in bytes)
not assessable: 3 recording(s), 20 B known (policy says eligible, but the media file was not found, not trusted or not readable; ...)
```

Not done / unverified: no ACL-denied unreadable-file case; depcruise not run; only a directory junction is tested for link-out (file symlinks need privileges on Windows).

## Fix cycle 2

Cycle-1 verdict FAIL (`qa/verdicts/t046-retention-dry-run-report.md`, second block): ISS-T046DRY-003 (high: two state rows can reference one media file, so a file was printed ELIGIBLE on the strength of one row while another row for it was KEEP, and three spellings of one path counted as three files, 300 B for a 100 B file), ISS-T046DRY-004 (medium: no as-of instant, no `now` check), ISS-T046DRY-005 (medium: ACL-denied file still ELIGIBLE, no read-open probe, pipeline state ignored). Low notes: exactly 24 h was ELIGIBLE; the size guard never fires on real state. The planner (`retention-sweep.ts`) and policy (`purge-policy.ts`) are byte-identical to base 8520fa8. Every new guard is DOWNGRADE-ONLY.

### What ELIGIBLE means (also printed in the report header)
ELIGIBLE = the existing planner said purge-eligible for the given thresholds, AND every media/clock/pipeline guard passed, AND every session record that references the same physical file is also ELIGIBLE. It does NOT mean safe to delete: no shipped writer records `processedAt` or `sizeBytes`, a writer holding a file open can be invisible to the OS, and no executor exists. It is a shortlist for human review.

### 1. ISS-T046DRY-003: per physical file, ALL rule
- Identity (`retention-report-media.ts` `fileKeys`): for each located file, after realpath and the containment check, the keys are `ino:<dev>:<file index>` (from `statSync(p, {bigint: true})`, used when the index is non-zero) and `path:<real path>`, lower-cased on win32 (case-insensitive file system). Records sharing ANY key are one file (union-find in `retention-report/assess.ts`). So `m/shared.webm`, `m/./shared.webm`, `M/SHARED.WEBM` and a hardlink are one file.
- Rule: a file is ELIGIBLE only if EVERY record that references it is eligible after all guards. Otherwise every eligible member becomes KEEP `shared-media-not-all-eligible` (naming "N session record(s) reference this one physical file"). Members are the printed records PLUS session records the planner did not report as their own (other-tenant copies planted in the tenant dir, duplicate source ids); those are never eligible, so they veto the file. Records with no located file have no identity, are not assessable and never make a group eligible.
- Unreadable session directories (no parseable source.json) cannot be matched to a file; the header counts them and warns that their paths are unknown. This is not blocked (a stated gap).

### 2. ISS-T046DRY-005: three in-progress signals (each downgrade-only)
(i) Readability probe: after stat, `openSync(real, "r")`, read the first 4 KiB and, for files over 4 KiB, the last 4 KiB, close in a finally. Failure (EACCES, EPERM, EBUSY, sharing violation) -> KEEP `media-unreadable` (not assessable). A read-only open cannot create, truncate or change the file or its mtime (atime may move on volumes that track it; not compared). The no-write scanner accepts exactly this literal `"r"` open: a new test asserts it is the only open in the whole import graph and that `r+`, `w`, `a`, `wx`, `w+`, `a+`, `rs+` substituted into it are rejected; the graph test allows `openSync/readSync/closeSync` from `node:fs` and nothing wider. Cannot see: a writer that holds the file open WITHOUT exclusive sharing, and an idle-looking file that is about to be written.
(ii) Pipeline state: new optional `--operations-state <operations.json>` (the poller's `data/webinar-release/operations.json`, written by `scripts/webinar/run-pipeline.mjs`). Read-only, 5 MiB cap, 20,000-row cap (no shared safe reader exists; same lstat/size/parse pattern as `readJson`). Vocabulary found in that code: queued, recording, processing, ready, failed, action_required, cancelled. Only `ready` and `cancelled` are TERMINAL. `failed` is not terminal because the poller's recovery loop re-finalises `recording|processing|failed` rows from their artifact; `action_required` can be reconsidered. Every other status, including unknown strings, "READY" (case differs), empty, numbers and a missing status, means in progress: unknown means keep (`operation-in-progress`). A row matches a recording by session directory name or source id (case-insensitive) or by its `artifact` path resolving to the same file identity; rows of any tenant count (conservative). Cannot see: a recording the poller has not yet written a row for; a stale row that was never updated (it keeps, the safe direction).
   If the file is not given, missing, unreadable, oversized or malformed, in-progress is UNKNOWN: the header carries `!! PIPELINE STATE UNAVAILABLE (<why>)` and every recording whose media mtime is within 30 days (inclusive) is KEEP `operation-state-unavailable` (not assessable). Justification: without the pipeline's rows the quiet period alone is the only evidence, so recent media is held; media untouched for over 30 days is not blocked, because a stalled row on a file nobody has touched for a month is implausible against the poller's retry limit, and blocking everything forever would make the report useless. The constant (`OPS_UNKNOWN_WINDOW_MS`) is a stated choice for the owner to revisit.
(iii) mtime quiet period kept, boundary fixed: `now - mtime <= 24 h` is KEEP (strictly older required).

### 3. ISS-T046DRY-004: clock rule (`retention-report/clock.ts`)
The header prints `as of: <ISO, UTC>` (and the operator-confirmed value when given). A single clock set far AHEAD cannot be disproved by state alone, so: if `now` is more than 90 days after the newest recorded activity (a media mtime or processedAt not itself in the future), the clock is UNCONFIRMED and no recording is ELIGIBLE (each becomes KEEP `clock-unconfirmed`, not assessable) unless the operator passes `--as-of <ISO instant>` (strict `YYYY-MM-DDTHH:MM:SSZ`) within 24 h of the system clock. A `--as-of` that differs from the system clock by more than 24 h refuses verdicts even inside the horizon (`!! CLOCK MISMATCH`). A quiet system older than 90 days therefore also needs `--as-of`: refusal is the default when in doubt. A clock BEHIND the data stays caught per record (`clock-skew`, mtime more than 5 minutes ahead). It cannot see: a clock ahead by less than 90 days (the quiet period and min-age are the only margin), or an operator who confirms the wrong date.

### 4. Totals and wording (sample, temp fixture: a and b spell one 100 B file, both eligible; c and d share one 50 B file and d is not indexed)
```
as of: 2026-10-11T12:00:00.000Z (UTC, the system clock)
RECORDING a-src => ELIGIBLE
RECORDING c-src => KEEP
  guard: shared-media-not-all-eligible - 2 session record(s) reference this one physical file and not every one of them is eligible ...
TOTALS eligible: 2 recording(s) = 1 file(s), 100 B (each physical file's bytes counted once)
TOTALS kept by policy: 1 recording(s) = 0 file(s), 0 B
TOTALS kept by guard: 1 recording(s) = 1 file(s), 50 B
TOTALS not assessable: 0 recording(s) = 0 file(s), 0 B (policy says eligible or the file/clock/pipeline state could not be trusted; NOT counted as eligible)
files referenced by more than one session record: 2; recordings with no located file (size unknown, bytes not counted): 0
```
Records are counted by their own verdict; each physical file's bytes are attributed ONCE to one bucket (eligible if all its records are; else the most restrictive of not assessable > kept by guard > kept by policy), so byte columns never double count a file and a shared file's records may appear in a different bucket than its bytes (above: d's record is "kept by policy", its file's 50 B sit under "kept by guard").

### Size guard is inert on today's state
No shipped writer records `sizeBytes` in source.json (grep `scripts/upload`, `scripts/webinar`), so the size-mismatch guard never fires on real state. It is not a protection today; it only helps once a writer records sizes.

### D-015 against the ledger's recorded reproductions (`qa/issues.t046dry.jsonl`, verbatim)
- ISS-T046DRY-003: 2/2 (fixture 1 dupA+dupB: both KEEP, 0 eligible file(s); fixture 2 A,B,C three spellings: one file, 100 B once, run with and without the file index).
- ISS-T046DRY-004: 2/2 (as-of instant printed; clock +5 years: no ELIGIBLE, `CLOCK UNCONFIRMED`).
- ISS-T046DRY-005: 2/2 (icacls deny on the file -> KEEP media-unreadable; deny on the parent directory -> KEEP media-unreadable; ACLs restored with `/remove:d` and `/reset` in a finally, trees deleted afterwards). Additional corpus (not a substitute): operation rows in 12 statuses incl. unknown, source-id and artifact-path matching, state missing/unreadable/malformed (5 variants), boundary at exactly 24 h.
- Left out of the measurement, with reason: the ledger's pipeline-row suggestion (status recording|processing plus artifact path) has no recorded fixture in the ledger; it is covered by the additional corpus only.

### Downgrade-only property
`retention-report/property.test.ts`: 2,000 seeded sessions (5 batches x 400, plus the helper sessions that create hardlink targets) over a pool of 260 media files so files are shared, with `./`, `//` and upper-case spellings, hardlinks, mixed policy verdicts, young/future mtimes, malformed processedAt and pipeline rows (recording, processing, failed, unknown, ready). The oracle is independent of the command's identity code (device:index straight from `statSync`). Results: reported-ELIGIBLE is a subset of the planner's eligible set (0 violations); at FILE level no file is ELIGIBLE unless all its records are (0 violations); the eligible totals line equals the oracle's file count and byte sum for every batch. Non-vacuous (diagnostic line): eligible files 81, shared-media vetoes 174, multi-record files with none eligible 599, operation-in-progress 19.

### Mutations: 19/19 killed
Hand-built harness, untracked in the worktree and deleted before commit; per-mutation byte backup, restore in a finally, `git hash-object` before == after, 240 s hard kill; all 19 restores matched. Killed: group eligibility ANY instead of ALL; identity by raw path string; case-sensitive identity on Windows (killed by the file-index-hidden case test); bytes counted per row; readability probe removed; probe opened `r+` (scanner + seam flag assertion); unknown operation status treated as terminal; missing operations state treated as nothing in progress; quiet boundary back to exclusive; clock sanity check removed; as-of omitted from the header; a pipeline guard returning eligible; `--as-of` tolerance disabled; unmatched/other-tenant records not counted as group members; clock refusal ignored; file index ignored (hardlink); artifact-path matching removed; probe never closes the handle; shared veto made to keep eligible.

### Evidence (from `packages/ingest`, node 24.19.0 direct)
- `node --test --import tsx src/retention-report.test.ts src/retention-report.guards.test.ts src/retention-report.property.test.ts src/retention-report.safety.test.ts src/retention-report.nowrite.test.ts src/retention-report/*.test.ts` -> `tests 46 / pass 46 / fail 0`.
- `node --test --import tsx src/retention-sweep.test.ts src/retention-sweep.strict.test.ts` -> `tests 31 / pass 31`; in `packages/core`: `node --test --import tsx src/domain/purge-policy.test.ts` -> `tests 7 / pass 7`.
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0.
- `git diff 8520fa8 -- packages/ingest/src/retention-sweep.ts packages/core/src/domain/purge-policy.ts` -> empty.
- Budgets (non-blank lines): sources max 148 (`retention-report.ts`), tests max 175. `node scripts/lint-dirsize.mjs`: only the known `packages/index/src/pipeline: 34 files (budget 30)`; the new modules and tests live in the new directory `packages/ingest/src/retention-report/` (7 files), so `packages/ingest/src` stays at 28.
- Existing tests changed by the new behaviour: the 24 h boundary expectation (now KEEP), the TOTALS regexes, the argv option list pinned by the nowrite test, one vacuity threshold in the old property test (eligible > 10, was > 20, because exactly-at-boundary cases are now KEEP); `baseArgs` now passes an empty operations file by default so other guards are not masked by the unknown-state guard.

### Unverified
- A real Windows sharing violation (another process holding the file exclusively): Node cannot take a deny-sharing handle, so the EBUSY/EPERM/EACCES path is tested through the injected fs seam only. The real ACL-deny path IS exercised with icacls.
- File symlinks: no symlink privilege on this machine (directory junctions only, as in cycle 1).
- The command has not been run against real data directories; dependency-cruiser was not re-run for the new subdirectory (imports are relative into `../`).
- Unreadable session records (no parseable source.json) could reference any file; they are counted in the header, not used as vetoes.

## Fix cycle 3

Cycle-2 verdict FAIL: ISS-T046DRY-006 (HIGH: an unreadable or skipped record did not veto a readable sibling that shares its file; a bad-named directory was dropped with no count), ISS-T046DRY-008 (medium: omitted/unreadable pipeline state still allowed ELIGIBLE for media older than 30 days), ISS-T046DRY-007 (medium: another tenant's reference to the same file was invisible), plus the surviving cycle-2 mutant (future-evidence filter untested). Planner and policy files remain byte-identical to base 8520fa8. All three rulings are "doubt means no ELIGIBLE".

### 1. ISS-T046DRY-006: scope-incomplete (implemented)
The scan now accounts for every entry in the tenant directory: it is a parsed record, or it is counted and listed as NOT UNDERSTOOD. Not understood = a directory whose name fails the session pattern, a file/link/junction where a session directory is expected, or a session whose source.json/session.json is unreadable, unparseable or of the wrong shape. If the list is non-empty, or the cross-tenant pass (3) could not complete, then NOTHING is ELIGIBLE: every recording that would have been eligible is KEEP `scope-incomplete` (not assessable). The header shows `!! SCOPE INCOMPLETE: N entr(y|ies) ...` and up to 20 lines `not understood: <path relative to the data root> - <why>` (sanitised, then "... and K more"); the recordings line carries `entries not understood: N`. Strict on purpose: a stray file such as `desktop.ini` in a tenant directory also refuses the report until the operator removes it or investigates; that is the price of "no silent skips".

### 2. ISS-T046DRY-008: `--operations-state` is now REQUIRED (option a)
Omitting it is a usage error (exit 2, empty stdout). A missing, unreadable, oversized or malformed file leaves nothing ELIGIBLE at any age (`operation-state-unavailable` for every otherwise-eligible row) with `!! PIPELINE STATE UNAVAILABLE (<why>)` in the header. The 30-day fallback is deleted. No opt-out flag was added: nothing in the code or docs shows a deployment without the poller's operations.json that also runs retention (the poller is the only capture path found; `scripts/webinar/run-pipeline.mjs` always writes it).

### 3. ISS-T046DRY-007: cross-tenant key-only veto (implemented)
`retention-report/crosstenant.ts` scans the SIBLING tenant directories (64-hex segments under `--data-root`, excluding this tenant's), reads from each `source.json` ONLY the media path field, resolves it through the same probe to physical-file identity keys, and keeps the keys in a set; nothing else of those records (ids, tenant, title, claims, turns) is parsed or retained. A file in this tenant's eligible set whose key is in the set becomes KEEP `shared-across-tenants` with the detail text exactly `shared` (no tenant id, path, title or count; the test asserts none of the other tenant's title, id or segment appears anywhere in the output). If a sibling tenant or record cannot be read (unparseable source.json, unreadable referenced file, too many tenants or sessions) the scan is incomplete and nothing is ELIGIBLE (`scope-incomplete`, header line "a sibling tenant directory could not be scanned"). Why a boolean is acceptable: this is an operator command run on the operator's machine over the whole data root; `--data-root` and `--tenant` are free arguments, the CLI has no per-tenant access control (no auth, no tenant-scoped user; the tenant is just a string hashed into a directory name), and the operator can already list the root. If the command is ever exposed to a tenant-scoped user, the cross-tenant pass must become a header caveat only. Not scanned: directories under the data root that are not 64-hex tenant segments (legacy flat dirs such as `data/toc-migrated`); the header says so.

### 4. Future-evidence filter test
`scope.test.ts` "future-evidence filter": a record whose media mtime is 2099 must not hide a clock 5 years ahead (`CLOCK UNCONFIRMED` still printed, nothing ELIGIBLE). Removing the filter now fails it (mutation 7).

### 5. Limit added (low note)
If files are written while the system clock is wrong (the live worker keeps writing), the newest evidence sits near the wrong `now`, so a far-future clock looks fine and `--as-of` is not demanded. The clock rule cannot see this; the as-of line printed at the top of every report is the only defence. No code change.

### Sample reports (temp fixture, excerpt)
Incomplete scope (good + a truncated sibling sharing its file):
```
!! SCOPE INCOMPLETE: 1 entry in this tenant's directory could not be read or understood. No recording is reported ELIGIBLE (scope-incomplete).
  not understood: 4ebde790877e2f92305cfb30ed1c0e2943dc00dfc24b49e3dc2a47889ca44151/trunc - unreadable record (source.json: not valid JSON; session.jso...
RECORDING good-src => KEEP
  guard: scope-incomplete (not assessable) - some record or directory in scope could not be read or understood, so no file can be proven unreferenced ...
TOTALS eligible: 0 recording(s) = 0 file(s), 0 B (each physical file's bytes counted once)
```
Clean scope (same fixture without the broken sibling, operations state present):
```
RECORDING good-src => ELIGIBLE
TOTALS eligible: 1 recording(s) = 1 file(s), 100 B (each physical file's bytes counted once)
```

### D-015 against the ledger's recorded reproductions (verbatim; tests named in `retention-report/scope.test.ts`, `shared.test.ts`, `signals.test.ts`, the cycle-1 guards test)
ISS-T046DRY-001: 2/2. -002: 4/4. -003: 2/2. -004: 2/2. -005: 2/2. -006: 2/2 (truncated source.json beside a sharing sibling; sibling directory named "bad name"). -007: 1/1. -008: 3/3 (option omitted -> exit 2; missing file; malformed JSON; plus the stuck row supplied -> KEEP operation-in-progress). Additional corpus (not a substitute): stray file, dot-directory and bidi-named directory listed and sanitised; real icacls deny on a session's source.json (restored in a finally) -> nothing ELIGIBLE; sibling tenant with an unreadable record; different-file other tenant does not veto.

### Positive control
A clean scope with the operations state present and everything terminal (three sessions over two files, plus a sibling tenant with its own file) gives ELIGIBLE x3 = 2 files, 300 B; no incomplete/unavailable/clock banner; the temp tree is byte-identical after the run. The cycle-2 fixtures (15-recording hand totals, shared groups, hardlinks) pass unchanged.

### Downgrade-only property re-run
`retention-report/property.test.ts`: 2,000 seeded sessions (5 x 400 plus hardlink helper sessions); batches 22 and 44 carry truncated source.json records at about 1%: in both, the eligible set is EMPTY and the SCOPE INCOMPLETE banner is present (2/2 dirty batches); the three clean batches again show 0 record-level and 0 file-level violations and totals equal to the inode oracle. Diagnostic: eligible files 50, shared-media vetoes 117, multi-record files with none eligible 349, operation-in-progress 6.

### Mutations: 14/14 killed (hand-built harness untracked in the worktree, deleted before commit; per-mutation byte backup, restore in finally, hash before == after, all restores matched)
unreadable record only warned (cycle-2 behaviour); bad-name directory skipped silently; scope-incomplete only for files sharing media with the unreadable record; operations state optional again; 30-day fallback restored (emulated by name for the 29/30/31-day and stuck fixtures; an earlier equivalent variant was discarded); missing state treated as nothing in progress; cross-tenant veto leaking detail; future-evidence filter removed (the cycle-2 survivor); header list omitted; over-refusal on a clean scope (positive control); cross-tenant keys ignored; unreadable sibling tenant ignored; stray files skipped silently; own tenant not excluded from the cross-tenant pass.

### Evidence (from `packages/ingest`)
- `node --test --import tsx src/retention-report.test.ts src/retention-report.guards.test.ts src/retention-report.property.test.ts src/retention-report.safety.test.ts src/retention-report.nowrite.test.ts src/retention-report/*.test.ts` -> `tests 54 / pass 54 / fail 0`.
- Planner `src/retention-sweep.test.ts src/retention-sweep.strict.test.ts` -> 31/31; core `src/domain/purge-policy.test.ts` -> 7/7.
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0.
- `git diff 8520fa8 -- packages/ingest/src/retention-sweep.ts packages/core/src/domain/purge-policy.ts` -> empty.
- No-write scanner (in `retention-report.nowrite.test.ts`, graph now includes `crosstenant.ts`): passes; the only open in the graph is still the media probe's literal `"r"`; crosstenant.ts uses only lstatSync/readFileSync/readdirSync.
- Budgets (non-blank lines): sources max 148-ish, tests max 175. `node scripts/lint-dirsize.mjs`: only the known `packages/index/src/pipeline: 34 files (budget 30)`; `packages/ingest/src/retention-report/` now holds 9 files.
- Existing tests changed: `baseArgs` was already passing an operations file; the unreadable-records test now expects `scope-incomplete` for the readable sibling; the 30-day-window test was rewritten to the new rule; the safety test's explicit run now passes `--operations-state`; the old property test passes `operationsState` to `gatherState`.

### Unverified
- Real Windows sharing violation (seam only); file symlinks (no privilege); never run on real data directories; dependency-cruiser not re-run for the new module (relative imports only).
- A pipeline row not yet written for a recording that is being captured; a stale row never updated keeps (safe direction).
- The cross-tenant pass does not see legacy flat directories or other deployments' data roots, and does not see a sibling tenant's record whose media path is not under the same `--media-root`.
