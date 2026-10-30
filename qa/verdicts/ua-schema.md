# Verdict - ua-schema (coordinator A, blind dual check)

**Cycle checked:** 0
**VERDICT:** PASS
**Checked HEAD:** 3f7b3f29 (code commit e71d5625; HEAD adds only qa/manifests/ua-schema.md, verified by `git diff --stat e71d5625..HEAD`). Base 1c864477.
**Policy-Version:** proportional-verification/2026-10-19.17

## Check plan
Re-run every criterion's affected tests myself (no reuse of maker output), read all five schemas, five stores, the migration, `lib/tenantScope.ts`; one falsification per criterion in a COPY (scratchpad `fals/`, node_modules junctions removed afterwards, bound tree untouched and clean); adversarial read of tenancy, TTL and audit paths.

## Evidence (own runs, HEAD 3f7b3f29)
- C1: `python schema/validate.py` PASS 51 collections; `node scripts/gen-types.mjs --check` OK. Live validator: real-Mongo test "users validator accepts every status and rejects the invalid shapes" + "sessions validator rejects a session without familyId ..." pass (error 121 for missing tenantId, unknown field, role outside enum, active without role, active null role, no familyId, plaintext password, partial revocation, string purgeAt).
- C2: real mongod 127.0.0.1:27018 throwaway DB, `node --test --import tsx src/collections/user-accounts.mongo.test.ts` -> 9 pass 0 fail. Case / NFKC / spaces / other-tenant variants raise E11000; tokenHash unique across sessions, tokens and tenants.
- C3: `user-accounts.test.ts` 12 pass 0 fail (tenant guard on all 5 accessors incl. `{$ne:null}`, " toc", "a\nb"; cross-tenant findOne null for all 5); same on real Mongo.
- C4: handle keys exactly [find, insert]; no mutating auth-event export on `@lkb/db`; read of auth-events.ts confirms no update/delete path through the module.
- C5: TTL test passes on real mongod (about 25 s): past-purgeAt revoked session, token, throttle, event removed; 400-day-old active session and future-purgeAt revoked session remain. Read of schema: `dependentRequired` makes purgeAt impossible without revokedAt+reason, so an active row cannot be given a purgeAt (live validator rejects it, x5).
- C6: `node --test migrations/user-accounts.migration.test.mjs` 5 pass; `node scripts/lint-migrations.mjs` OK (11602 files); real-Mongo apply twice then `down` rejected: pass.
- Extra: `npx tsc --noEmit` in packages/db exit 0. Fixtures contain only dummy PHC strings and example.com addresses.

## Falsifications (copy, per-mutation byte backup, timeout, restore verified `git hash-object` == `git rev-parse HEAD:<file>`; all six EQUAL)
| Crit | Mutant (one each) | Observed |
|---|---|---|
| C1 | user_sessions.schema.json: drop `familyId` from `required` | validate.py exit 1: `user_sessions/invalid.json unexpectedly PASSED` |
| C2 | index.json: users unique key `{emailNormalized}` -> `{tenantId,emailNormalized}` (per-tenant form) | mongo test 3 fail incl. "unique email ... different tenant collide" |
| C3 | tenantScope.ts `withTenant` stops merging tenantId | store test 4 fail incl. cross-tenant findOne |
| C4 | auth-events.ts handle gains `deleteMany` | store test 1 fail (handle keys) |
| C5 | index.json: user_sessions TTL `expireAfterSeconds` removed | mongo test fails: "user_sessions TTL index" and TTL removal test (to the 150 s ceiling) |
| C6 | migration: createIndex call removed | migration test 2 fail |
(An earlier C5 attempt produced invalid JSON because the file is CRLF; it was discarded and redone with a valid mutant. Failures above are from the valid one only.)

## Adversarial hunt (findings are non-blocking)
Cross-tenant read: every read goes through `scopedCollection` + `assertValidTenantId`; `listAuthEvents` cursor/targetUserId are type-checked and tenantId is merged last. No path found. Active-session purge: not reachable (schema + validator). Plaintext password, raw token, raw email or full IP: builders accept only PHC, sha256 hex, truncated /24-/48 and closed vocabularies, and the live validator enforces the same patterns. Residual design points are listed as proposals.

PROPOSED-ISSUE: {"severity":"low","type":"design-gap","unit":"ua-schema","summary":"user_sessions/tokens/events carry tenantId and userId with no store- or schema-level check that the user row belongs to that tenant; A3 must enforce user.tenantId == session.tenantId on every lookup (UA-27).","fix_direction":"A3 acceptance test for a session whose tenantId differs from its user's."}
PROPOSED-ISSUE: {"severity":"low","type":"design-gap","unit":"ua-schema","summary":"Session lookup by tokenHash needs the tenant first but all store functions are tenant-scoped, and tokenHash is globally unique; the manifest's own open question (how a cookie request learns its tenant) is unresolved.","fix_direction":"Decide in A3 (single configured tenant or a tenant hint) before building the cookie lookup."}
PROPOSED-ISSUE: {"severity":"low","type":"info-disclosure","unit":"ua-schema","summary":"Global unique emailNormalized means a signup in tenant B with an email already in tenant A fails E11000 and could reveal cross-tenant email existence if A2/A3 surface it differently from a same-tenant duplicate.","fix_direction":"A2/A3: map every duplicate-key outcome to one generic response."}
PROPOSED-ISSUE: {"severity":"low","type":"design-gap","unit":"ua-schema","summary":"auth_throttles purgeAt >= lockedUntil and the idle-expired session purgeAt are enforced only by builders/API convention, not by the validator; a later writer (A4) updating lockedUntil without recomputing purgeAt could let TTL drop a live lock.","fix_direction":"A4 test that every throttle update recomputes purgeAt via throttlePurgeAt."}

CAPABILITY-COVERAGE: not-applicable (data model, no screen)
LIVE-BROWSER: not-applicable (no UI paths changed)
ISSUES-WRITTEN: none (dual check: proposals only)
EXECUTOR: claude-sonnet-subagent (maker-builder; checker: claude-sonnet-subagent)
SCOREBOARD: 6/6 criteria met, floor met
TIER: L (dual-trigger tenancy: packages/db/src/collections/users.ts:28)
EXPLANATION: Every criterion was independently re-run green on a real mongod and each falsifying mutant was killed with the bound tree untouched. No defect found in tenancy, TTL or append-only handling; remaining notes are downstream-unit proposals.
Metrics: start=2026-10-29T10:00:00Z end=2026-10-29T10:50:00Z wall_min=50 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=6 cycle=0 resumes=0 tokens=unavailable builder_min=70 check_min=40 maker_tokens=unavailable checker_tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=2400 mutants=6 defects_unit=0 defects_6c=0
