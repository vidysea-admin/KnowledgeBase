# T-061 current dependency reconciliation (read-only prep)

Scope: cycle 0 fixture qualification only; no verdict. HEAD observed dbb719a5e0895f874aa4fb7cc9fcc23b460ec1c9. Working tree bytes remain the authoritative candidate; HEAD alone does not pin them. Parent owns final freeze/packet and release/live gates.

## Actual receipts

`qa/goal-vectorless-2026-10-15/verification-release-backend-and-pages-twenty-six.json` is the actual backend receipt, despite the historical filename: stdout is 29 tests, 29 pass, zero fail, EXIT0 (T06121/shared pages8). `verification-t061-backend-twenty-six.json` is not the located receipt. Seven T061 files include mounted.test.ts; the six-file command in packets/goal-t061.md:9 is obsolete.

`qa/goal-vectorless-2026-10-15/verification-t061-ui-four-20261015T1155.json` and adjacent stdout record UI4 PASS. All UI receipt pins still match current raw SHA256 bytes. Environment/runtime equality must still be checked at reuse time; do not turn a scoped file-pin SHA256 into a Git SHA.

`drift.json` records all 15 repair2 snapshot mismatches. Group attribution from current Git diffs against repair2's declared base (not a reconstructed exact old snapshot):

| Paths | Current change / T061 relevance |
|---|---|
| apps/api/src/composition/integrations/routes.ts | Additional review/native/speaker routers and answer authority; still mounts automation and form routers. Shared createServer import/mount perimeter is affected. |
| apps/api/src/composition/production.ts | Shared production integration/lazy composition changes; still builds automation with HostingService and spreads it into ServerDeps. Integration owner must qualify actual composition separately. |
| apps/web/src/App.tsx | Additional navigation/routes including extraction review; `/automation/forms` still mounted. UI4 does not prove App navigation. |
| packages/core/src/generated/{answer_runs,jobs,sessions,speaker_suggestions,tree_index}.ts | Generated answer persistence, usage fields, publication/session fence and native evidence shapes. Type changes outside automation operations; no T061 owned runtime/test bytes changed. |
| packages/core/src/index.ts | Expanded generated/domain export surface; type/barrel dependency rather than changed T061 behavior. |
| packages/db/src/collections/meeting-candidates.ts | Separate meeting accessor evolution; not used by automation factory directly, but reached through db barrel. |
| packages/db/src/collections/speaker-suggestions{,.test,.testdb}.ts | Deleted monolith/tests, moved to directory implementation/tests; not missing automation source. Barrel now exports speaker-suggestions/index.js. |
| packages/db/src/index.ts | Barrel retarget plus accessor/native publication exports; actual factory imports applicationOperations, automationRuns, scopedCollection through it. |
| packages/db/src/lib/tenantScope.ts | Db parameter narrows to Pick<Db,"collection">; diff is type-only. Security boundary remains relevant; factory probes actual collection accessor. |

The newer backend receipt is a better baseline than repair2: `receipt-drift.json` records 14 mismatches against its 389 pinned paths, including the speaker monolith removal and changed ask/answer/transcript/visibility/WhatsApp/connector consumers. These shared imports prevent claiming exact current receipt reuse for the whole backend union. All T061 owned implementation and standing backend test files in that receipt still match. Historical security cases remain intact: two tenants, revoked current role, scope/identity refusal, stale-owner/concurrency, failed writes, unsafe ambiguous effect/receipt forgery, source/approval generation invalidation; do not replace them with a new easier corpus. No T061/automation-specific matches were returned from root issues*.jsonl search; this is not a claim that unrelated security ledgers were fully audited.

## Minimal affected broker request

After parent's shared source freeze, run from repository root using receipt's exact Node executable v24.19.0 and bounded isolated environment (provider/DB/live opt-ins disabled):

```text
node --import tsx --test --test-concurrency=1 --test-timeout=20000 apps/api/src/automation/factory.test.ts apps/api/src/automation/mounted.test.ts
```

Outer timeout 90000ms. Expected 2 standing tests: factory covers current db barrel/accessors/canonical source authority/current HostingService permission and approval generations; mounted covers changed shared createServer import/mount/auth perimeter plus tenant refusal/revocation before effects and sanitized status. Capture complete stdout/stderr, own exit code, exact executable/version/hash, lock/import/environment fingerprints, before/after import-closure hashes. A shared matching current integration receipt containing these exact tests may satisfy this request instead of another execution. Do not rerun all 29 merely because repair2 snapshot drifted.

Requalify historical unchanged owned-unit evidence explicitly; it is attributed prior evidence, not same-candidate reuse. If governing packet requires an indivisible exact-candidate union, the independent checker must require its current seven-file T06121 run rather than silently waive it. Shared production composition, App navigation and final combined gates remain parent/integration-owned; UI4 remains attributable fixture evidence only. Real Mongo, target, deployment, live monitoring and whole T061 acceptance stay OPEN.

No tests/build/browser/DB/provider/external activation executed here. BOOTSTRAP_REVIEW bounded read-only prep gate is budget-input.json / budget-result.json; an initial invalid gate call was repaired before the attribution phase. Maker/checker runtime-total usage remains unknown, ratio unverified. This artifact is a request/checkpoint, not READY or PASS.
