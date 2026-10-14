# Verdict — mbdirsize-meeting-bot-relocation

**Cycle checked:** 0
**Date:** 2026-10-13
**Commit under check:** 74416c0b

## VERDICT: PASS

## EXPLANATION
1. Diff (`git diff -M -U0 HEAD~1`): 38 renames, 94 files, 178/178. Import/export lines: after
   masking the quoted specifier, removed and added line multisets are identical (101 vs 101), so
   only specifiers moved. All other changed lines are comments/docs or path literals (extra `..`
   segments for `qa/`, `apps/`, `scripts/` reads; `import(".../state/schedule-state.js")`;
   fixture join paths). The 4 test-side edits (optout-identity regex now `./state/skip-describe.js`
   with the read target `../schedule-tick.ts`; obs-windows fixture paths; sched-state child/cwd;
   join-rules-store-lock-guards `join-rules` segment) change paths only, no expectation changed.
2. Stale-path grep over tracked files (imports, dynamic imports, spawn paths, scripts, docs, CI,
   package.json): no runtime-breaking old path. Residual old paths are comments (health.ts,
   audio-watchdog.ts, apps/api deps.ts, schedule-tick.ts), append-only docs/DECISIONS.md, and
   .handoffs snapshots. Notes only. Comment paths naming a `join-rules-lock/` dir are accurate.
3. Public API: `src/index.ts` differs only in 4 `export * from` specifiers (notify/*); same export set.
4. Suite (package cwd, 851 tests): 840 pass / 9 fail. Four ISS-324 obs-windows failures were CPU-load
   timing flakes (live Chrome worker on host); the file re-run twice alone in lane and base is 8/8
   both times. The 5 persistent failures reproduce identically on an export of the parent commit
   (git archive, no main-tree access): (a) "actual login/tab/OBS spawn interfaces" - ENOENT copyfile
   of py/tab-capture/manifest.json, cwd-doubled path; (b) "live WebM stream is remuxed" - ffmpeg
   missing (status null); (c) "interrupted recovery binds owned sidecars" and (d) "owned status
   retains deduplicated durable control gaps" - EPERM symlink (Windows, no privilege);
   (e) "registration actual child timeout" - ENOENT, untracked packages/meeting-bot/data dir absent.
   None relate to the relocation.
5. tsc --noEmit clean in packages/meeting-bot, packages/core, packages/ingest, apps/api.
   lint-dirsize: packages/meeting-bot has no violation; 5 remaining violations (packages/index/src/pipeline,
   apps/api/src, apps/api/src/routes, scripts, scripts/lib) are outside this diff, which adds no files there.
   Fixtures read before running: all browser/OBS/network paths are faked (fake-join fixtures, loopback only).

## ISSUES-WRITTEN: none
