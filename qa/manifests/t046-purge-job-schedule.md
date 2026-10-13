# t046-purge-job-schedule

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 3 (roadmap, T-046 wiring). Class: data delete path wiring, so FULL ceremony. Lane: lane/w046. No ledger issues filed.
Authority: D-145 (media purged 90 days after capture; transcripts kept forever; executor honours dry-run vetoes and logs deletions).

## Scope
Wires the merged purge executor (`packages/ingest/src/retention/retention-purge.ts`, unchanged) into a schedulable job, using the repo's existing periodic-job mechanism (pwsh launcher + Windows Scheduled Task, as `scripts/webinar/start-calendar-attendance.ps1`).
- `packages/ingest/src/retention/retention-purge-job.ts` + `-cli.ts`: runs one pass, captures log lines, atomically writes a last-run JSON report (`mode`, times, `exitCode`, parsed `summary`, bounded `lines`). DRY RUN unless `--execute`. `--report-file` required. All other options forwarded to the executor's strict parser.
- `scripts/retention/schedule-retention-purge.ps1`: default preview; `-Run` once; `-TaskPreview`; `-InstallTask` registers daily task `Vidysea-Retention-Purge` (03:30). Deleting needs `-Execute` AND `-ConfirmDeletion`, at run and install time; the installed action is a dry run unless both were given.
- Flag-off identity: no tracked file modified (`git diff --stat` empty; all new files). The executor and its CLI are byte-identical to main; nothing imports the job; no task is registered by this change.
- New dir `scripts/retention/` because `scripts/webinar` was at its 30-file dirsize budget.

## Not decided here (owner decision, ARCHITECTURE Q6)
`--min-age-days` and `--clip-padding-seconds` have no default in the executor. The scheduler script also has none: `-Run`/`-InstallTask` refuse without them. The owner must supply the values at install time.

## Acceptance criteria
Met in code: default dry run; explicit double flag for delete; job schedulable via existing mechanism (task definition built, not registered); last-run report file written atomically with no transcript/title text.
Needs a live run: registering the task (`-InstallTask`) and one observed scheduled firing on real state; `-Run` against real data in dry-run mode.
NOT done (contract does not ask): surfacing the last-run report on `/meeting-bot` or its API. The page contract/manifest states retention state is not shown until an endpoint exists; the report file `data/retention/last-run.json` is the source a later unit can serve. Live /meeting-bot browser check (D-146) not run.
Never run: `--execute` on real data; no task registered; no real Mongo/network.

## Evidence (Node 24, from the lane worktree)
- `retention-purge-job.test.ts`: 9/9 pass. `packages/ingest` full suite: 351/351 pass, 0 fail. `tsc --noEmit` (ingest): exit 0.
- `scripts/retention/schedule-retention-purge.test.mjs` (spawns pwsh, preview/refusal paths only): 7/7 pass.
- `node scripts/lint-loc.mjs --all`: `lint:structure: OK (10 stages, 0 failed)` (first run failed dirsize 31>30 in scripts/webinar; fixed by the new dir).
- Mutations, all killed and restored (`git hash-object` == original blob checked in-harness): M1 mode always dry-run; M2 job always adds --execute; M3 summary first match; M4 write failure swallowed; M5 report-file optional; M6 ps1 drops ConfirmDeletion check; M7 ps1 always --execute. 7/7 killed.
- Multi-process/timing tests: none (pwsh tests are deterministic spawns).
