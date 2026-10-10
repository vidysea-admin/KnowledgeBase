# Manifest — t046-retention-sweep-planner (T-046, retention half)

Lane: T046 (branch `lane/t046`, base 8c8429d). Tier: roadmap task T-046 (tier 3). Touches data-write
adjacent logic (decides purge candidates) so full ceremony applies; the code itself writes nothing.
Round cap: 1 prior PASSed verdict names this seam (`qa/verdicts/purge-retention-policy.md`, T-026); cap is 2, so proceeding.

## What changed

New files only:
- `packages/ingest/src/retention-sweep.ts` — `planRetentionSweep(input): RetentionPlanResult`.
  Pure, read-only, no I/O, no clock read (`now` is a parameter). Eligibility comes from
  `isPurgeEligible` in `@lkb/core` (single copy); windows from `deriveEvidenceClipWindows`.
- `packages/ingest/src/retention-sweep.test.ts` — 16 tests.

Signature: `planRetentionSweep({tenantId, media, claims, turns, now, params:{minAgeAfterProcessedMs, clipPaddingSeconds}})`
returns `{ok:false, errors}` or `{ok:true, plan:{tenantId, items:[{mediaId, decision:"keep"|"purge-eligible", reason, retainWindows}], purgeEligibleIds, tenancyViolations}}`.
Both thresholds are required, finite and > 0; no defaults. Media must carry `processedAt` (ISO string).

Fail-closed cases (all KEEP with a reason): non-object record; missing `_id`/`tenantId`/`kind`/`sourceRef`/`retention`/`turnRefs`;
unknown kind; evidence-clip; `purgedAt` already set; duplicate `_id`; missing/unparseable/future `processedAt`;
age under threshold; unreadable claim anywhere in the input (blocks all); malformed claim citing the media's turns;
a citing claim with an evidence turn not resolvable among this tenant's turns; policy says no; policy throws;
eligible but zero retainable windows. Other-tenant media goes to `tenancyViolations` only and is absent from `items` and `purgeEligibleIds`.
Other-tenant claims and turns are ignored (neither block nor satisfy).

## Evidence

Node: `C:\Users\product\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin` on PATH; lane `node_modules` junctions into main tree
(root, packages/ingest, packages/core), so `@lkb/core` resolves to the main tree source.

`cd packages/ingest; timeout 120 node --test --import tsx src/retention-sweep.test.ts` →
`ℹ tests 16 / ℹ pass 16 / ℹ fail 0` (includes the 300-iteration seeded property test: no item purge-eligible when `isPurgeEligible` says no; both outcomes exercised).

`cd packages/ingest; timeout 180 node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` → exit 0, no output.

`cd packages/core; timeout 120 node --test --import tsx src/domain/purge-policy.test.ts` → `ℹ tests 7 / ℹ pass 7 / ℹ fail 0`.

`node scripts/lint-dirsize.mjs` → `lint-dirsize: OK (109 dir(s) within budget)`.
Dependency rule: `.dependency-cruiser.cjs` allows `ingest → core`; `gap-tracking.ts` already imports `@lkb/core`. depcruise itself was not run (no npx on this machine).

## Not delivered

- No deletion, no purge job, no scheduler, no wiring to Mongo or the filesystem; the plan is data only.
- Not exported from `packages/ingest/src/index.ts` (left untouched on purpose; import by path).
- The concrete retention values remain undecided: ARCHITECTURE Q6 needs the owner's decision on `minAgeAfterProcessedMs` and what "processed" means. `processedAt` is a field this planner requires on media but the Media schema does not define it; a schema/contract decision is needed before any real caller exists.
- `retention.purgeAfterVerified` is validated for type only, not used as a gate.
- The "blocking malformed claim" heuristic is conservative and un-reviewed by a checker.
- Web UI half of T-046 is not touched.

Status: ready-for-check
Fix cycle: 0
