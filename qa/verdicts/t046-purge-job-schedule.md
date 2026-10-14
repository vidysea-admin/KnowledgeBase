# Verdict: t046-purge-job-schedule

**VERDICT:** PASS
**Cycle checked:** 0

## EXPLANATION
Reviewed diff vs merge-base (6 files, all new; executor retention-purge.ts byte-identical to base). Checked against D-145 (media 90 days, transcripts forever, dry-run vetoes honoured, deletions logged) and D-159 (tombstones; not touched by this unit).
- 90-day floor: PURGE_AFTER_DAYS = 90 is hard-coded in the executor's mediaVeto (strictly older than 90 d), independent of the required --min-age-days (processed-age planner param, no default). The job/scheduler add no way to lower it.
- Transcripts never purged: only the one file named by source.json inside --media-root, and only media extensions; json/txt/md/vtt/srt and everything under the data root are never unlinked.
- Dry-run default: --execute needed (executor); job adds none; ps1 needs -Execute AND -ConfirmDeletion at run and install.
- Tenant-scoped: --tenant required, other-tenant files vetoed (cross-tenant scan).
- Mid-purge failure: per-item try/catch, only unlink touches disk, records never modified; failure counted, exit 4, remaining items continue. Report written atomically (tmp+rename); write failure returns exit 5 without hiding a deletion exit code.
- Evidence rerun: tsx is missing from node_modules (environment gap), so tests ran via node native type stripping plus a scratchpad resolve hook (.js->.ts, @lkb/core). packages/ingest/src/retention/*.test.ts and retention-report/*.test.ts: 107/107 pass, 0 fail. scripts/retention/schedule-retention-purge.test.mjs: 7/7 pass.
- Mutations on retention-purge.ts (sha1 applied-check, restore in finally, git hash-object == HEAD blob afterwards): M1 `<=`->`<` boundary KILLED; M2 90->30 KILLED; M3 extension allowlist removed KILLED; M4 always-execute KILLED (3 failures); M5 failure not counted KILLED; M6 future-capture check removed SURVIVED but is an equivalent mutant (a future capture gives negative age, still vetoed as younger-than-90-days).
- Not verified: tsc --noEmit and lint-loc (typescript unresolved in this lane); no --execute run on any data; no live task registration (manifest says so too).
- Note: owner must still supply --min-age-days / --clip-padding-seconds at install (ARCHITECTURE Q6); not a defect.

ISSUES-WRITTEN: ISS-W046-001 (low, doc-only; stays in ledger, not a unit)
