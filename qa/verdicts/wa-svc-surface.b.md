# wa-svc-surface (C3A) - independent coordinator B

**Cycle checked:** 0
**Policy-Version:** proportional-verification/2026-11-22.19
**Commit under check:** 548921c60fc20f0e72e6ab5ef731d10be0eadbca (branch `wave/c3a-svc-surface`, base 583750d, declaration commit c4bb66b3)
**Coordinator:** B (blind; own checkpoint `qa/checkpoints/wa-svc-surface.b.md`; no other coordinator file read)

**PASS - cycle 0, tier L (dual).** Every criterion C3A-C1..C9 and invariant I1..I6 holds on my own evidence at head 548921c6. No security-class or contract-breaking defect found. One mutant survived (M9, a test gap on an extra boot guard); it is a low PROPOSED-ISSUE, not a FAIL.

## Check plan
Floor recomputed with `tick.mjs --route`: L, dual true (`dual-trigger: auth src/api/svc.ts:128`). Own throwaway copy of head (`scratchpad/c3a-check-b/copy1`, never the worktree). One test process at a time. Own loopback `mongod` 7.0.24 on 127.0.0.1:28617 (PID 38296, started and stopped by me, dbpath removed). Scope per D-238 and D-239 item (4): "Known limits from review" items not failed on.

## Evidence (all re-run by me)
| Criterion | My independent evidence | Result |
|---|---|---|
| C3A-C1 token, compare, limiter, canaries | `svc.test.ts` full runs (below) plus my own probe: 538 assertions over identical 401 envelopes for every unauthenticated variant on all routes, a duplicate `Authorization` pair (bad then valid is 401, valid then bad is 200), limiter at 20 failures then 429 `rate_limited`, valid token never throttled, canary token absent from logs, bodies and headers | holds |
| C3A-C2 envelope, body bound | `C3A-C2a/b/b2/c/d` green; probe checks closed envelope and `X-Archiver-Api-Version: 1`; M7 killed | holds |
| C3A-C3 service-only, fail closed, names, index | my real-process probe (`tsx src/index.ts`): 8 bad settings each exit 1, name the setting, leak no value, nothing listens (token unset/short/blank, bad next token, `KEY_STORE=file`, enc key missing/short, `LEASE_TTL_MS` below twice renew); unreachable database: listens, health 200 degraded, owner route 503 with `Retry-After`, no token 401, UI routes and `/` 404; `C3A-C3c-index` green on my mongod | holds |
| C3A-C4 tenancy (security class) | probe: owner id only from the path (body, query, header carry-ons never reach a call), malformed ids refused before any store call, a password-user id is the same 404, unlinked owner as contract says; `C3A-R4a` real store sees only `kind:'service'`; M3 killed | holds |
| C3A-C5 QR slot | `C3A-C5a-e` green; QR in no log, store call, file or error body; M8 killed | holds |
| C3A-C6 route shapes | `C3A-C6a-e`, `C3A-C6a2` (20 parallel first calls, one owner, no email, no passwordHash) green on my mongod | holds |
| C3A-C7 unlink, health, KB client | `C3A-C7a-e` green; the KB's own `createArchiverClient` (`apps/api/src/whatsapp/archiver/client.ts`) driven through `ensureOwner` (idempotent), `startSession`, `getSession`, `getQr` (QR and data URL parsed), `getHealth`, `unlinkSession`, then `getSession` closed; wrong token throws `archiver_api_unavailable`; 10 assertions pass | holds |
| C3A-C8 single-owner lease (security-adjacent) | my lease probe on the real `mongoLeaseStore` and `WriterLease`: 40 in-process rounds x 4 contenders, exactly one winner each; expiry boundary and idempotent re-acquire; non-holder `renew`/`release` change nothing; 10 two-OS-process rounds started 20 ms apart, exactly one winner each; SIGKILL takeover 2552 ms (limit 4000); stolen lease reports `taken`; one failed renewal inside expiry is not a loss, past it is `unconfirmed`. Real process pair: standby stays `degraded` and its owner route 503 while the holder lives, becomes `ok` 3466 ms after SIGKILL of the holder (TTL 3000, renew 1000), then serves. Suite takeover 2021 ms. M4, M5, M6, M10 killed | holds |
| C3A-C9 declaration commit first | first commit changes exactly three files (declarations only) | holds |
| I1 | `git diff base..head -- src/wa/readOnlySocket.ts` empty; `readOnlySocket.test.ts` in the six existing suites green | holds |
| I2 | six existing suites 35 pass; test diff is `svc.test.ts` +1812/-0 only; `npm run typecheck` clean | holds |
| I3 | canaries (token, QR, key, Authorization) searched in logs, bodies and headers by suite (`C1e`, `C5c`) and by my probes and boot-probe logs | holds |
| I4 | `svc.ts` imports: node crypto/http/net, `mongodb`, `qrcode`, `db/mongo` only; no ingest, media, send, `restoreAuthState` or archived-key read (forbidden names appear only in comments); `C3A-I4` green | holds |
| I5 | diff lists exactly the nine owned files; `grep withTransaction\|startSession(\|.watch(` returns only the cookie-session function and its two callers in `auth.ts`/`server.ts`; `C3A-I5` green | holds |
| I6 | only my loopback mongod used (probes assert a `127.0.0.1` URI); the shared-database index drop was never run | holds |

Full runs: `svc.test.ts` without mongod 42 pass, 6 skipped, 0 fail; with my mongod 48 pass, 0 fail; six existing suites 35 pass; typecheck clean.

## Falsification (floor: one per changed criterion; cap L 10; own throwaway copy, per-mutation byte backup, timeout, restore on exit/interrupt/error, `git hash-object` equals the HEAD blob after every mutant)
Control with the same patterns on the unmutated copy: 10 green, 0 red.
| Mutant | Change | Criterion | Outcome |
|---|---|---|---|
| M1 | token compare accepts any bearer | C1 | killed (6 tests red: C1a, C1b, C1c, C1d, C5c, C3a2) |
| M2 | limiter 20 -> 1e9 | C1d | killed (C1d) |
| M3 | `kind:'service'` removed from `getOwner` | C4 | killed (R4a) |
| M4 | `tryAcquire` filter made unconditional | C8 | killed (C8b, R4b) |
| M5 | `renew` without the holder filter | C8 | killed (R4b) |
| M6 | `release` without the holder filter | C8 | killed (R4b) |
| M7 | streaming body bound x100000 | C2 | killed (C2d) |
| M8 | QR never expires | C5 | killed (C5a/b) |
| M9 | boot check `LEASE_TTL_MS < 2 * LEASE_RENEW_MS` removed | C3 | SURVIVED (C3b still green; see P1) |
| M10 | health ignores the lease | C7/C8 | killed (C8a) |
C6, C7 (unlink order) and C9 keep the manifest's recorded falsifications under the evidence-identity reuse rule (inputs unchanged since the record; I read them, did not re-mutate them). My own differentials for them are the KB client drive and the real-process probes above.
Harness note: my first mutation batch was stopped with TaskStop, which did not stop the script; two batches overlapped in the throwaway copy for about a minute. I discarded that data, killed my leftover processes, re-synced the copy from the HEAD blobs, verified every source hash, and reran control plus all mutants alone. The table above is the clean rerun (M1 ran alone before the overlap). The worktree was never touched.

## Findings
- PROPOSED-ISSUE: {"id":"P1","sev":"low","criterion":"C3A-C3","title":"No test pins the boot refusal when LEASE_TTL_MS is below twice LEASE_RENEW_MS","evidence":"mutant M9 removes `if (c.leaseTtlMs < 2 * c.leaseRenewMs) out.push('LEASE_TTL_MS')` in src/config.ts and `C3A-C3b` stays green (its 11 cases omit this setting); the guard itself works (my real-process probe: exit 1, names LEASE_TTL_MS, no listener)","fix_direction":"add a `LEASE_TTL_MS=30000, LEASE_RENEW_MS=20000` case to C3A-C3b; no product change","class":"coverage, not security"}
- Not failed, per D-238 and D-239 item (4): the six "Known limits from review" (misspelled `SERVICE_API_ONLY` falls through to dev mode, no lease clock-skew margin, partial store-error to 503 mapping, `isValidServiceToken` vs `BEARER_RE` whitespace, standby runs `ensureIndexes` before the lease, `checkDeadline` not re-arming). None breaks a contract criterion or is a security-class defect on my evidence; they stay candidates.
- Note, no row: `Expect: 100-continue` may be answered with a 100 before the 413; not measured, not a criterion.

## NOT-MEASURED
Graceful SIGTERM exit order on Windows (`C3A-C8e` runs on the stub; a real Windows `SIGTERM` is a hard kill); real WhatsApp or Baileys sockets and pairing; Cloud Run, DNS, load balancer and the vendor network; the real `email_1` index migration on the shared database (a production write, separate human gate); timing side channel of the token compare (code-checked only); multi-hour lease behaviour and clock skew between hosts; Linux behaviour.

VERDICT: PASS
SCOREBOARD: 9/9 criteria met, 6/6 invariants hold
TIER: L (auth bearer token `src/api/svc.ts:128`, single-writer lease concurrency, boot config; dual check)
FAILURES: none
CAPABILITY-COVERAGE: not-applicable (no UI or capability matrix in this unit)
LIVE-BROWSER: not-applicable (changed paths are server-side `src/**` only)
ISSUES-WRITTEN: none (PROPOSED-ISSUE P1 only; the maker mints ids after both coordinators PASS)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: Every criterion held on my own runs: 48 suite tests on a loopback mongod, a 538-assertion auth and tenancy probe, a 108-assertion lease probe with 10 two-process races and a SIGKILL takeover, and a real-process boot probe including a two-process failover. Nine of ten mutants were killed; the survivor is a missing test for an extra boot guard that works in the real process.
Metrics: start=2026-11-25T10:37:00Z end=2026-11-25T11:06:00Z wall_min=29 agent_min=unavailable blocked_min=0 suite_runs=3 repeat_runs=10 mutations=10 cycle=0 resumes=0 tokens=unavailable builder_min=unavailable check_min=29 maker_tokens=unavailable checker_tokens=unavailable policy=proportional-verification/2026-11-22.19 check_s=1740 mutants=10 defects_unit=0 defects_6c=0
