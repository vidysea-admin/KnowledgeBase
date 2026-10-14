# Verdict: t056-conflicts

**Verdict:** FAIL (cycle 0, superseded by the cycle 1 section below)
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

---

# Cycle 1 (commit 6fa28951)

**Verdict:** PASS
**Cycle checked:** 1

- D-015 reproductions: the t|a / 1 vs t / a|1 collision now yields invalid-id rejection (no false version_conflict); all valid neighbours (t/a-1, t|a|1/1, t|a/1b, t/1) write independently. Crash between revision and change item: queue() repairs it from history, idempotent on repeat, and a resolved item is not reopened.
- Mutants against the new code: M1, M8, M9 all KILLED (previously survived). Extra: _id back to delimited string, store policy-id validation removed, class folding removed, checkIds tenant check removed: all KILLED. M18/M19 (repair removal) NOT APPLIED by the harness (pattern mismatch), not claimed. No restore or HEAD-fidelity mismatch.
- Object _id: built in one fixed key order everywhere (same literal for insert and lookup), the fake compares by ordered JSON so order-sensitivity is exercised; a partial-key lookup cannot match an exact embedded-document _id. Untested on real MongoDB.
- repairChangeItems: 10 concurrent queue() calls plus concurrent saves gave 4 items, 4 unique keys, 0 items for another tenant; it only reads one tenant's history and inserts with that tenantId.
- Class folding: "visa" vs "visas-policy" distinct (correct); "visa"/"visas", "loans"/"loan", separators merge as intended; only trivial odd merges (status/statu, analysis/analysi). Broad vs narrow remains a documented limitation.
- Tests: answer-policy 32/32; full apps/api x2: 960/960 both runs; tsc (temporary paths tsconfig, deleted) exit 0; lint-loc: only the known meeting-bot violation.
- New findings, filed not fixed (non-security): ISS-T056CONFLICTS-006 (medium: a recurring conflict stays out of the open queue after its item was superseded) and -007 (low: GET queue writes under read scope). ISS-005 (usage.test.ts timing flake, unrelated) remains open. ISS-001..004 closed.
