# Manifest — session-loading verification + runtime landing (2026-09-21)

Status: checked-PASS (see qa/verdicts/session-loading-verification.md)
Fix cycle: 0

**Unit:** land the dead trust-check session's verified work + close its recorded auth gap
**Scope:** apps/web auth/session-loading fixes (5 commits fd1a5b3, 2ad648d, dd6a3b2, 026a5a6,
91d7ed2), one gap fix (late-401 localStorage deletion), the dirty runtime files
(production.ts CORS sync, Dockerfile 3300, docker-compose env rename, .env.example), AGENTS.md
line-budget compaction, .gitignore .pnpm-store entry, gate-answer records.

## Authorization trail
- 2026-09-19 HUMAN_GATE (qa/.last-tick) proposed the auth-only four-file repair: answered by
  Umesh 2026-09-21 "Dead — verify, test, and land its work" (parallel session confirmation).
- github-export-internal-qa gate: ANSWERED A 2026-09-21 (push scope approved).
- external-eval-data-egress gate: ANSWERED A 2026-09-21 (recorded by the trust-check session).
- speaker-segment-identity gate: ANSWERED A + persona end-state 2026-09-21.

## What the 5 commits contain (diff-reviewed)
- fd1a5b3: AUTH_INVALIDATED_EVENT event + AuthContext listener (stale-key recovery).
- 2ad648d: normalizeSessionPathParam (sessions.ts) — decode-then-encode with malformed fallback.
- dd6a3b2: invalidateAuth() helper; 401-only trigger; AuthContext guards replacement key in
  React state via detail.apiKey comparison.
- 026a5a6: resolveApiBaseUrl() — VITE_API_BASE_URL trim/slash-normalize, localhost:3300 dev
  default, network-error wrapping in ApiError(0).
- 91d7ed2: vite server.host=127.0.0.1 (IPv4 loopback).

## Gap found and fixed in this unit
The recorded reproduction "a late 401 for the old key deletes its replacement key" was only
half-closed: invalidateAuth (apps/web/src/api/client.ts) removed localStorage unconditionally,
so old-key-A 401 deleted stored key B (the event handler guarded React state, not storage).
Fix: storage is cleared only when the failed key IS the stored key (or storage is empty); the
event still always fires. Tests added verbatim against the ledger reproduction (D-015):
- "a late 401 for the old key does not delete its replacement key" (new)
- "a 401 still clears storage when the failed key IS the stored key" (new)
- ISS corpus: the 2026-09-19 gate named client.ts:43/AuthContext.tsx:42 + sessions.ts:8 —
  both files' recorded cases are covered (client.test.ts 4 tests; LoginGate stale-key test;
  sessions.test.ts encoding tests).

## Evidence (commands run 2026-09-21)
- apps/web vitest: 13 files, 53/53 PASS (pre-fix) -> 55/55 PASS (post-fix, 2 new tests).
- apps/web typecheck: exit 0. apps/web build: exit 0 (1087 modules).
- pnpm -r test: all packages pass (apps/api 173/173; no failures anywhere).
- pnpm -r typecheck: all Done. pnpm gen:types --check: OK 24 files.
- python schema/validate.py: PASS 24 schemas.
- pnpm lint:structure: lint-loc OK 290, lint-dirsize OK 78, lint-dupes OK 311, lint-migrations
  OK 1401, snapshot --check OK, tracker-audit G1,G4 OK, lint.test 12/12 pass, depcruise
  no violations (307 modules, 940 deps).
- lint-root: AGENTS.md compacted 224 -> 138 lines (mdMaxLines 200, now within budget);
  one REMAINING violation: 16 loose root files vs budget 15 — AGENTS.md is a new governance
  file never before committed; budget change is an enforcement-path change requiring a
  DECISIONS entry with Approved-by: Umesh. NOT self-authorized; flagged for /landplane.
- Remote Mongo TCP 13.202.206.101:27017: True (fresh probe 2026-09-21).
- qa/evidence/docker-runtime-probe*.txt: empty 0-byte files from the dead session; kept as
  recorded runtime evidence placeholders.

## Honest scope statement
No checker verdict exists yet for this manifest. Live-browser re-verification of the IPv4
session flow was NOT re-run in this unit (the trust-check session's own browser evidence from
2026-09-15 stands; Mongo was reachable but a fresh authenticated browser pass is Phase 5 U3.1
work). The lint-root over-budget state is declared, not hidden.


**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
