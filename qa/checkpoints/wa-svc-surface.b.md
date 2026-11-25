# Checkpoint: wa-svc-surface, coordinator B

Status: COMPLETE (no resume needed)
Cycle: 0
Policy-Version: proportional-verification/2026-11-22.19
Commit checked: 548921c60fc20f0e72e6ab5ef731d10be0eadbca
Tier: L (dual; trigger `src/api/svc.ts:128`)
Started: 2026-11-25T10:37:00Z   Finished: 2026-11-25T11:06:00Z   wall_min=29 (limit 45)   resumes=0

## Done
- Manifest, contract, D-238, D-239 item (4) read; floor recomputed (L, dual).
- Throwaway copy of head with own node_modules; own loopback mongod 7.0.24 (PID 38296, 127.0.0.1:28617), stopped and dbpath removed at the end. Other mongod processes untouched.
- svc.test.ts: 42 pass / 6 skipped without mongod; 48 pass with mongod; typecheck clean; six existing suites 35 pass.
- Own probes (scratchpad `c3a-check-b/probes/`): `probe-auth.mts` 538 assertions, `probe-lease.mts` 108, `probe-boot.mts` 78, `drive-kb-client.mts` 10; all pass.
- Static: C9 first commit three files; I1 diff empty; I2 test diff +1812/-0; I4 imports; I5 nine files and transaction grep.
- Falsification: control green 10/10; M1-M10, nine killed, M9 survived (P1, low).

## Remaining
none

## Notes for the maker
- P1 (low) is in the verdict as a PROPOSED-ISSUE line; no ledger row written by me.
- Mutation harness incident: my first batch overlapped a second one in the throwaway copy; discarded and rerun clean; all sources re-verified against HEAD blobs. Worktree never touched.
