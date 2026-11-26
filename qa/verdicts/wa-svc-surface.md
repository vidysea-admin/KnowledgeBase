# wa-svc-surface (C3A) - checker coordinator A (blind half of a dual check)

**Cycle checked:** 0
**Policy-Version:** proportional-verification/2026-11-22.19
**Commit (archiver repo):** 548921c60fc20f0e72e6ab5ef731d10be0eadbca on `wave/c3a-svc-surface` (base 583750d, declaration c4bb66b3), worktree `D:/KnowledgeBase/.worktrees/wa-c3a`

## Check plan (written first)
Floor recompute (.19-2): `tick.mjs --route 583750d..548921c6` -> `unchecked: cannot resolve 583750d in D:\KnowledgeBase`, i.e. floor L + dual (archiver is a separate repo). TIER L, dual-trigger `auth src/api/svc.ts:128` cited. Plan: baseline suites, own raw auth probes, KB client against the real handlers, own lease probe on a loopback mongod, own mutants for auth/tenancy/lease/QR/fail-closed/unlink, reuse of manifest mutants only where the blob is unchanged. Blind: B's verdict, checkpoint and evidence were not read.

**VERDICT: PASS** (coordinator A; no side effects, findings below are PROPOSED-ISSUE lines)
**TIER: L**
**SCOREBOARD:** criteria C1-C9 9/9 MET, invariants I1-I6 6/6 held, own mutants 12/12 killed, reused mutants 15 (svc.ts blob unchanged), baseline reds 0, NOT-MEASURED 4.

## Evidence (all my own runs, head 548921c6, worktree git status clean before and after)
- `npm run typecheck` exit 0. Full `svc.test.ts` with loopback store (`C3A_TEST_MONGO_URI=mongodb://127.0.0.1:27431/...`): 48 tests, 48 pass, 0 fail, 0 skipped, 66.6 s. Existing six suites: 35 pass, 0 fail. All 7 test files in the repo were run.
- C1 auth: 20 raw-socket variants (none, Basic, empty bearer, wrong, 1-char-off, 1 B, 4096 B, 9000 B, `Token`, `X-Api-Key`, `Bearer undefined`, lowercase scheme, double space) x 6 routes + unknown path + wrong method gave one identical 401 `{"error":{"code":"unauthorized"}}` (only requestId/Date/Connection differ); after 20 failures all further bad tokens gave one identical 429 `rate_limited` + `Retry-After`; the valid token still got 200/404/400 on all six routes while tripped. Compare is `timingSafeEqual` over two SHA-256 digests (only use, svc.ts:128; no `==`/`startsWith` on the token). Mutants M1 accept-all (killed C1a, C1b), M2 limiter 20->2000000 (killed C1d).
- C2 envelope: version header, request id, no-store, closed error body seen on 200/401/429/404/400 in my probes; "C3A-C2a-d" green. Reused (svc.ts blob 4803a04e unchanged since d693595): version '1'->'2', body cap 64 KiB->64 MiB, 500 handler logging message.
- C3 fail closed: M9 token floor 32->1 killed by "C3A-C3b" (spawns the real entry point); dev run with no token: `/svc/v1/health` 404, with token set: 401 without it, 200 with it; `SERVICE_API_ONLY` boot refuses on bad settings naming the setting only. Service-only handler serves nothing but /svc/v1 (test C3A-C3a, C3a2 green).
- C4 tenancy: M3 `OWNER_ID_RE` without `$` killed by "C3A-C4b"; M4 `getOwner` without `kind:'service'` killed by "C3A-R4a" (real store; "C3A-C4c" alone does not kill it, R4a does); "C3A-C4d" (50 interleavings) and "C3A-C4e" (service owner cannot cookie-login; my dev run: email "" login -> 401) green.
- C5 QR: M8 TTL 20 s->60 s killed by "C3A-C5a/b"; "C3A-C5c/d/e" green (canary in no log/store/file, slot map bounded, no session -> 409). My KB-client run: `getQr` -> `awaiting_qr`, qr + qrDataUrl, `expiresAt` = receipt + 20 s.
- C6/C7 routes: real `createArchiverClient` from the KB repo against the real handlers: ensureOwner (created true, then false), getHealth, getSession (`not_started`), startSession (`connecting`), getQr, unlinkSession (`unlinked`, captureDisabled true), getSession (`closed`): no ArchiverError. M10 no `confirm` check killed by "C3A-C7a". Reused: `untrackGroups` removed (C7b), rehydrate filter (C7c), health name (C7d), onlyKeys (C6a).
- C8 lease (own evidence, loopback mongod 7.0.24 on 127.0.0.1:27431): my probe against the real `mongoLeaseStore`: 40 in-process rounds x 8 contenders and 6 barrier-synced rounds x 4 OS processes, every round exactly 1 winner; non-holder renew false, non-holder release leaves the lease, live lease not acquirable, acquirable at `expiresAt <= now`, old holder's renew false after takeover, holder release removes it. Suite: C8b (2 processes, 10 rounds) and C8c-sigkill (standby held it 3055 ms after SIGKILL, limit 4000) green. Mutants M5 acquire-while-live, M6 renew without holder, M7 release without holder killed by "C3A-R4b"; M11 lost-lease exit 1->0 killed by "C3A-C8d"; M12 no lease release at shutdown killed by "C3A-C8e".
- C9: `git show --stat c4bb66b` = `src/config.ts`, `src/db/mongo.ts`, `src/db/types.ts` only (3 files, +90/-3); `tsc --noEmit` on a copy of c4bb66b exit 0.
- I1 `readOnlySocket.ts` diff vs 583750d empty. I2 dev mode unchanged on my own dev boot (no token: `/svc/v1` 404, signup/login/me/groups cookie flow, `/` serves HTML, 401 unauthenticated; with token: both coexist; nothing written to `sessions/`). I3 leak mutants covered by C1e/C5c (reused) plus canary sweep green. I4 `svc.ts` imports only node built-ins, mongodb, qrcode, `db/mongo.js` (users, groups, pingDb, StoreUnavailableError). I5 no `withTransaction`/`.watch(`; only the cookie `startSession` in auth.ts. I6 all Mongo runs on one loopback mongod I started; tests refuse a non-loopback URI.
- Mutation safety: all 12 mutants in a scratch copy (HEAD archive + own node_modules), per-mutation byte backup, restore on exit/int/term, `cmp` ok and `git hash-object` equal to `git rev-parse HEAD:<file>` for svc.ts, sessionManager.ts, config.ts after every run.

mutant-cap-raise: 12 own mutants at tier L (cap 10); M11 and M12 are the shutdown and lost-lease exit mutants, because C8d/C8e had no recorded falsification in the manifest.

## Known limits from the manifest (judged, none fails a criterion)
PROPOSED-ISSUE: low - lease deadline has no clock-skew margin (local deadline equals stored `expiresAt`); not measurable on one host; concurrency class, file-don't-fix unless C8 is reopened.
PROPOSED-ISSUE: medium - a misspelled `SERVICE_API_ONLY` boots dev mode (cookie UI, plus `/svc/v1` if a token is set) instead of failing closed; contract C3 lists the named settings, so this is a deployment-hardening item, not a criterion break.
PROPOSED-ISSUE: low - `isStoreError` (svc.ts:166) misses several Mongo error names, so some store outages return 500 instead of 503 `store_unavailable`; envelope still closed, no leak.
PROPOSED-ISSUE: low - `ensureIndexes` (email_1 drop and recreate) runs at boot before the lease is held; safe on a private database, must never run against a shared one (I6).

## NOT-MEASURED
- A real SIGTERM across a process boundary on Windows (`child.kill()` is a hard kill); the order is proven in-process by "C3A-C8e" and mutant M12.
- Replica set / Atlas behaviour of the lease (standalone loopback only).
- Timing (contract excludes it); behaviour under a real Baileys socket (stub factory only; no network).
- Mutants reused from the manifest were validated by blob identity of `svc.ts` only, not re-run.

CAPABILITY-COVERAGE: no new capability beyond the nine claims above; each has a test and a named falsification (own or reused).
LIVE-BROWSER: not applicable (no UI in this unit; `web/` untouched).
EXECUTOR: checker coordinator A, Claude Sonnet 5.5, read-only toward the worktree; mongod PID 15636 started and stopped by me (PID 5984 was not mine and was left alone); no `.env`, no `sessions/`, no network, no consent work, no issue rows written.
Metrics: start=2026-11-25T10:29:34Z end=2026-11-25T10:51:00Z wall_min=22 agent_min=22 blocked_min=0 suite_runs=2 repeat_runs=0 mutations=12 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-11-22.19 check_s=0 mutants=12 defects_unit=0 defects_6c=0
