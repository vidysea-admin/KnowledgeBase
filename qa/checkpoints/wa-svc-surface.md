# Checkpoint: wa-svc-surface (C3A), coordinator A, cycle 0 - COMPLETE (no checks remaining)

## Identity
- Code: archiver repo worktree `D:/KnowledgeBase/.worktrees/wa-c3a`, head `548921c60fc20f0e72e6ab5ef731d10be0eadbca`, base 583750d, declaration c4bb66b33f9370fb34b7dbae86dfb07039f8f92d.
- Blobs: `src/api/svc.ts` 4803a04e85050a085708cb49ab26459ae4ff7fce; `src/wa/sessionManager.ts` f294bae28c1372f852a2720b5a6f61b5daa4e747; `src/config.ts` 228ca0e6b86f7d9172fd97c797b7906de3d05020; `src/api/svc.test.ts` 645ab0fe8f1b7658628d2594377f9ae4834d0bda.
- Manifest final code SHA d6935956 vs head 548921c6: `svc.ts` and `config.ts` unchanged between them; `sessionManager.ts` and `svc.test.ts` changed (review repairs R1-R4), so every sessionManager mutant was re-run by me, not reused.
- Runtime: node v24.13.1, tsx v4.23.12, mongod 7.0.24 loopback 127.0.0.1:27431 (PID 15636, stopped), policy proportional-verification/2026-11-22.19, tier L, dual blind (coordinator A).
- Floor recompute: `tick.mjs --route 583750d..548921c6 --root D:/KnowledgeBase` -> floor L, dual true, `unchecked: cannot resolve 583750d` (separate repo), consistent with the manifest.

## Commands and results
| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `C3A_TEST_MONGO_URI=mongodb://127.0.0.1:27431/c3a_chk_a npx tsx --test src/api/svc.test.ts` | 48 pass, 0 fail, 0 skipped, 66.6 s, exit 0 |
| six existing suites (`tsx --test` on media-safety, web-assets, authState, identity, readOnlySocket, resilience) | 35 pass, 0 fail |
| `C3A_HARNESS=1 npx tsx src/api/svc.test.ts` + KB `createArchiverClient` probe | ensureOwner/getHealth/getSession/startSession/getQr/unlinkSession/getSession all OK |
| raw-socket auth probe (15 variants x 10 routes) | one 401 signature, one 429 signature, valid token never limited |
| lease probe on the real `mongoLeaseStore` (`lease-probe.mts`) | 40x8 in-process and 6x4 multi-process rounds: exactly 1 winner each; holder semantics as specified |
| dev-mode boot (PORT 58777, no token, then with token), scratch SESSIONS_DIR | I2 unchanged; `/svc/v1` mounted only with a valid token |
| `git show --stat c4bb66b`; `tsc --noEmit` on a c4bb66b copy | 3 declaration files; exit 0 |

## Mutants (scratch copy, per-mutation backup, hash == HEAD blob after each)
M1 accept-all (C1a, C1b) | M2 limiter x100000 (C1d) | M3 id regex no `$` (C4b) | M4 getOwner without kind (R4a) | M5 acquire while live (R4b) | M6 renew without holder (R4b) | M7 release without holder (R4b) | M8 QR TTL 60 s (C5a/b) | M9 token floor 1 (C3b) | M10 no confirm (C7a) | M11 lost-lease exit 0 (C8d) | M12 no lease release (C8e). All 12 green before, red after, restored.

## Not measured
SIGTERM across a real signal on Windows; replica set or Atlas; timing; real Baileys socket.

## Cleanup
mongod PID 15636 stopped (listener on 27431 gone); scratch dbpath, `cp-c9`, `cp-mut`, dev sessions/media removed (no junctions present); worktree `git status` clean.
