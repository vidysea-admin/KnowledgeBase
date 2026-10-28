# T-059 storage-read and accepted-child promotion deadlines

Root: `C:/Users/product/Desktop/KnowledgeBase`
Slug: `t059-read-head-deadlines`; fix cycle: 0; priority: tier 3, centrally authorized T-059 roadmap slice. Auth/tenancy/data-write boundary: full independent handshake required. Maker: `/root/product_delivery_coordinator/product_api_inventory`.

## Identity and authorization

Base/candidate HEAD at start: `5c4cbade2d1a8aa4815de13d587db8de3b01cc4a`. Candidate is the working-tree patch, not an invented commit SHA. Only two source paths leased and edited:

| Path relative to root | Before SHA256 | Candidate SHA256 |
|---|---|---|
| apps/api/src/evaluation-flywheel/workflow.ts | d480ccc350e9fad85f7541f4fab6b03c1a2669bdf814d42842c7c5741ccef7e7 | 487ebc2b08d128f17b27b9c6b6a8df21a6fb85dd1db1517e32281f7865af3fe2 |
| apps/api/src/evaluation-flywheel/workflow.test.ts | 7fc46d1257e46579d85e985e70858623e2b43720adffecffdaa2419abd3496b7 | 94563bffce039a5158c834899ec4db17e28e24164536c4182d7429aaa47700d8 |

QA additions: this packet and `qa/manifests/t059-read-head-deadlines.md`; no source files added. Other working-tree changes belong to independent lanes. Preserve them. Exact diff: `git diff -- apps/api/src/evaluation-flywheel/workflow.ts apps/api/src/evaluation-flywheel/workflow.test.ts`, with candidate byte hashes authoritative.

Central coordinator explicitly narrowed the initial write-timeout proposal: bounded reads and final-head CAS after immutable child persistence only. No createRetest deadline, schema expansion, sentinel expiry, or failure-field semantic overload. Existing goal-t059 cycle1 PASS remains historical and is not edited.

## Changed behavior and consumers

`workflow.ts:28–34` distinguishes storage deadlines using existing operationTimeoutMs (default 120000ms, unchanged limits). Evaluation/gap/source/index reads use it at lines39,46,79,83,95,131,157,181. A timed-out read has no continuation into paid provider/index/Ask work. `verifyIndex`'s freshness fallback rethrows StorageTimeout at147, preventing a read timeout from rebuilding a potentially current index.

`save` at59–67 bounds only the terminal promotion call at187. By then the deterministic immutable child has been persisted and read back, or independently loaded as an owned existing child. The CAS still uses the exact original expected revision. A late terminal commit can succeed before recovery or lose to recovery's newer revision; it cannot replace a newer head. On storage timeout the catch at190–193 starts no recovery write and releases no lease. A committed terminal head remains complete; otherwise the durable lease remains for ordinary expiry. After expiry, retry validates the existing child/index and promotes without repeating Ask.

Immediate consumer: `router.ts:8–12,28–31` maps FlywheelError to sanitized503 on authenticated retest. `router.test.ts` exercises auth/tenant and HTTP lifecycle. `composition.test.ts` exercises actual intake/index/Ask composition plus child and gap read consumers. `store.ts:27–30` supplies revision CAS; `:41–44` immutable deterministic child insertion; both unchanged. No authorization, tenancy, shape or credential behavior changed. Original evaluation stays immutable.

Applicable contract: `qa/contracts/goal-t059.md` S3 tenancy, S5 idempotent failure-safe transition, S7 honest lifecycle, S10 immutable child, S12 bounded failure/recovery, S13 immediate consumer, S15 evidence/handshake. These are scoped clauses; all live L1–L5 remain HOLD. No claim of whole-parent acceptance.

## Focused verification requested through sole CPU broker

No tests, builds, browser, network, DB or provider calls were run by this maker. Broker must use its existing compatible Node/tsx environment and external process timeout, retaining runtime/hash/duration/exit/count evidence:

1. From root: `node --test --import tsx apps/api/src/evaluation-flywheel/workflow.test.ts apps/api/src/evaluation-flywheel/router.test.ts` (workflow18 tests, including original ISS-T059REPLAY-001 historical replay floor; HTTP consumer cases in router tests).
2. From root: `node --test --import tsx apps/api/src/evaluation-flywheel/composition.test.ts` for genuine injected production composition and downstream consumers. This existing fixture writes only its own historical `qa/evidence/goal-t059-maker/rows.json`; attribute that artifact to the broker and preserve historical evidence as required.
3. `python contracts/verify_contracts.py`, recording whether registry is vacuous. Broker owns interpreter readiness/preflight; no new environment is requested.
4. Central targeted API typecheck if required for current combined-source integration; source changes do not alter public types or schemas. Do not use a pre-change typecheck to certify this patch.

New fault tests: initial evaluation/gap read never settles (no writes/dispatch); source/index freshness read never settles (lease preserved, index/Ask counts unchanged); child readback never settles after durable insertion (expiry/retry preserves one Ask/child); terminal CAS commits then never settles versus delayed CAS after recovery (committed completion preserved; stale revision returns false). Each new test has a2000ms harness timeout and operationTimeoutMs10. Fixture uses injected time to expire lease without real waiting. Existing failure, foreign source, concurrent replay, immutable original and manual-child-score cases remain.

Required current receipts: pending broker. Manifest must stay building until they exist; no independent verdict requested yet. Review identity must include these source hashes plus actual current dependencies/runtime/evidence receipts.

### Minimal executable workflow/mock entry points

Current baseline broker receipts remain pending. From the repository root, the exact filtered command is:

```powershell
node --test --import tsx --test-name-pattern="source and index read deadlines|child readback deadline|terminal CAS deadline" apps/api/src/evaluation-flywheel/workflow.test.ts
```

Expected selected count:3 tests (source/index read2 variants, child-readback1, terminal-CAS2 =5 fault scenarios);15 other workflow tests are filtered out. Test names are the full names beginning `source and index read deadlines keep the lease and never trigger index rebuild`, `child readback deadline preserves the persisted child and retry never repeats Ask`, and `terminal CAS deadline preserves committed completion or fences a late CAS after recovery`. Their injected workflow/mock harness is `rig()` in `apps/api/src/evaluation-flywheel/test-fixture.ts`: the actual `createEvaluationFlywheel`, actual Mongo-store scoped/CAS methods against mutable in-memory collections, injected clock and counted intake/index/Ask seams. The consumer assertions are current index count unchanged, one accepted child, original unchanged and Ask count1; these fixtures establish no live Mongo or provider acceptance.

For an explicit runnable demonstration of the deliberately **unbounded child-write** exclusion, this standalone fixture holds child insertion beyond operationTimeoutMs, observes the pending state, then releases the same insertion and consumes the resulting child. This is a documented broker-only proposed probe, NOT executed maker evidence:

```powershell
@'
import assert from "node:assert/strict";
import { rig } from "./apps/api/src/evaluation-flywheel/test-fixture.ts";
const r = rig(); r.deps.operationTimeoutMs = 10;
const w = r.workflow(); await w.open("t", "loss");
const insert = r.deps.store.createRetest;
let entered; const atInsert = new Promise(resolve => { entered = resolve; });
let release; const held = new Promise(resolve => { release = resolve; });
r.deps.store.createRetest = async (...args) => { entered(); await held; return insert(...args); };
const pending = w.retest("t", "loss", { sourceUrl: "https://example.org/session", requestId: "unbounded-child" });
await atInsert;
try {
  const observed = await Promise.race([pending.then(() => "settled", () => "rejected"),
    new Promise(resolve => setTimeout(() => resolve("pending"), 40))]);
  assert.equal(observed, "pending");
  assert.equal(r.tables.eval_runs.length, 1); assert.equal(r.calls.ask, 1);
} finally { release(); }
const child = await pending;
assert.equal((await w.inspect("t", "loss")).flywheel.lastRetestId, child._id);
assert.equal(r.tables.eval_runs.length, 2); assert.equal(r.calls.ask, 1);
console.log("unbounded child-write exclusion: observed pending, released original insert, one child/Ask");
'@ | node --import tsx --input-type=module
```

Use the broker's external30-second process ceiling, existing runtime/import preflight and current source pins for either entry point. The reviewer independently chooses/authors its own minimal failure probe; these navigation/run instructions do not constrain its verdict or substitute for independent source review. No unrelated rescan or new acceptance gate is introduced.

## Dependency fingerprints (SHA256, read-only snapshot)

| Relative path | SHA256 |
|---|---|
| apps/api/src/evaluation-flywheel/types.ts | c1b031c9964dc26a835c410b3034760f6f2a307a73938015bc091e9c41b7003f |
| apps/api/src/evaluation-flywheel/store.ts | bc5896226b0dab2f27d2e808a3153d7fd8bd62109abd93ab575b25115104ea8a |
| apps/api/src/evaluation-flywheel/receipts.ts | a6eb0492e8382288cf142c3848726d01bc3a3fc1ab93d90817c36e8d30ff38f3 |
| apps/api/src/evaluation-flywheel/router.ts | 3556ffbcb10d11cd1be60199027fbad41d002123d2369d851eda35117041b279 |
| apps/api/src/evaluation-flywheel/router.test.ts | 1c894b6f4090b6158e0ce405bec831ddaab64546bcc02c55bd3e339871d311d5 |
| apps/api/src/evaluation-flywheel/test-fixture.ts | 6bd2229d3499ccb532a585a7325dcb8052250b22931978768e45f5608ffbd13f |
| apps/api/src/evaluation-flywheel/composition.test.ts | c58aff9cc1706df18bc9b2c8d2386a2cfb5fa77a57c3ea1001b5fbf8ead58c5d |
| schema/gaps.schema.json | dc5792e0f1778d2da7724592c14fa1f702b58cd816cf74d9b52b4d3b4fc80563 |
| schema/eval_runs.schema.json | 0401d26c2e7d0f68c9b998769d40bfd25b6728af36416b0f0438fa82866e9742 |
| pnpm-lock.yaml | 2af3aada247f31436a28f46f4803dc8b4294956c21825f7421ca37faf07d83dd |
| contracts/verify_contracts.py | 1240059fc2abc63cde58472ef8f7964978e74ba5bc2f5156a30379ddae391db3 |
| qa/contracts/goal-t059.md | aa2cbf36698158f5a92dad3386ad9a8c41e0b31420f38f27968c5e11c17ae1bd |

Observed node path: `C:/Program Files/nodejs/node.exe`. Runtime version, executable hash, Python resolution, node_modules/import fingerprints and broker environment remain unmeasured by maker. No secrets/environment values inspected.

## Explicit remaining gates and accounting

This does NOT bound the entire operation. createGap, createRetest, intermediate/lease CAS, ordinary-error failure recording writes remain unbounded. Timing these out safely across restart needs a dedicated durable uncertainty protocol; no timeout-and-blind-retry was added. Provider cancellation remains unsupported; timeout does not cancel in-flight work. Native Mongo/transactions/restart, live HTTP/browser/provider, genuine calibrated human scoring and all full T059 prerequisites remain unproved. Independent source verdict and broker evidence remain required.

Maker actual active seconds/tokens/cost are unknown; no fabricated measured-efficiency claim. Tool waits were substantial and not measured as active time. Checker skill explicitly loaded from `C:/Users/product/.agents/skills/checker/SKILL.md`; coordinator must run its admission helper before dispatch, use fresh context and an explicit bounded BOOTSTRAP_REVIEW (ratios unverified), reserving completion as required. Maker issues no checker verdict and starts no reviewer children.
