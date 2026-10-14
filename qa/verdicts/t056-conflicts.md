# Verdict: t056-conflicts

**Verdict:** FAIL
**Cycle checked:** 0
**Checker:** independent, lane/t056-conflicts at c85e8fcd (commits 4f0a4ae0, c85e8fc)
**Ceremony:** full (tenancy and data-write area)

## Why FAIL
ISS-T056CONFLICTS-001 (security class, never capped): the revision `_id` `tenant|policy|version` is ambiguous because `assertValidTenantId` allows `|`. Probe: tenant `t|a` policy `1` v1 appended; tenant `t` policy `a|1` v1 then returns false (E11000), so one tenant can block another's version. HTTP blocks `|` in policyId, but the service and store do not and tenant ids are unconstrained. Fix is small.

## Attack results
1. Atomicity: no version gap possible (probe: v3 with expected 2 or 1 refused, v2 accepted once, history [1,2]); no separate "current" pointer exists, so it cannot diverge. Crash between revision and change-item writes leaves a revision with no review item (ISS-T056CONFLICTS-002, medium).
2. Tenancy: service and HTTP cross-tenant tests pass; tenant filters on getItem, history, items, latest are killed by mutations. `closeItem` tenant filter mutation SURVIVES (ISS-T056CONFLICTS-003). `{ $ne: null }` tenant rejected; object item id returns null.
3. Evidence: 16 key names x 4 values (citations, Sources, evidence, grounding, references, attribution, __proto__, nested objects) all refused, allowlist-based. onInsufficient only review/refuse. Brute force of 1024 policy/result combinations: 0 cases where a policy loosens a decision or allows with no sources or insufficient coverage.
4. DB guard: `lkb_staging` is refused unless LKB_ALLOW_STAGING=lkb_staging (existing isRefusedWorkDb), so staging tests remain possible with that env opt-in. `production: true` is a code-level argument only; nothing reads it from env or config, and nothing wires the store yet. Bypasses every refusal including empty names; needs a decision at wiring time.
5. Full apps/api suite x3: run 1 955/955, run 2 955/955, run 3 955 tests, 954 pass, 1 fail: `src/usage/usage.test.ts:135` "a hanging write does not delay the response" (50 ms wall-clock bound). Isolated 16/20 pass. Unrelated to the lane (ISS-T056CONFLICTS-005, low).
6. Conflict detector: correct on exact class matches (mode high; style and onInsufficient medium; retired ignored; 3-way gives pairs). Misses `course_selection` vs `course selection`, hyphen variants, plurals, broad vs narrow class; acknowledged conflicts reopen on any version bump (ISS-T056CONFLICTS-004, low).

## Mutation run (15 mutations, per-mutation backup, finally-restore, timeout 240 s, HEAD-fidelity checked, no mismatch)
Killed 12: M2-M7, M10-M15. SURVIVED 3: M1 closeItem without tenantId, M8 drop prior-version existence check, M9 drop expected+1 check (no store-level tests for cross-tenant close or version gaps).

## Commands
- `node --test --import tsx src/answer-policy/*.test.ts`: tests 27, pass 27, fail 0.
- tsc with temporary paths tsconfig (deleted): exit 0, 0 errors.
- `node scripts/lint-loc.mjs --all`: 1 violation (the known pre-existing meeting-bot Python budget); snapshot stage stale, not this lane's.
- Not done: real MongoDB, contracts/verify_contracts.py (contract does not cover this slice; criteria adopted from the manifest claims).

## Required for cycle 1
Fix 001; add store-level tests for 003 (cross-tenant closeItem, version gap); decide 002.
