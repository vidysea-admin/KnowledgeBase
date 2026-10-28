# Correction paid-work replay fix — candidate, not PASS

Parent: T054 remains in progress. Maker priority: tier 2, high data-write/paid-work boundary. Root authorized this narrow repair after independent `qa/verdicts/vectorless-publication.md` cycle 6 F1. Canonical FAIL and historical receipts are preserved.

## Exact changed source lease

- `apps/api/src/transcript-review/refresh-executor.ts`: replace convenient transaction callback with one explicit snapshot/majority transaction body. Retry only `commitTransaction`, at most three attempts, only for `UnknownTransactionCommitResult`. Transient body/commit errors abort and propagate without invoking indexing again. Uncertain exhausted commit propagates without speculative abort. End session in all paths.
- `apps/api/src/transcript-review/refresh-testkit.ts`: explicit manual transaction methods, idempotent commit, rollback and existing head conflict check. Retain convenient callback interface with a bounded driver-shaped transient replay so the old implementation would reproduce the checker finding.
- `apps/api/src/transcript-review/refresh-executor.test.ts`: original issue reproduction floor for transient body and transient commit, actual indexer with counted complete calls and throwing embedder; require one indexing invocation and preserved old derived rows. Unknown-commit acknowledgement lost after actual fixture commit tests commit-only retry/success and three-attempt exhaustion; no repeated providers or duplicate lexical chunks.

Root subsequently authorized two immediate-consumer files: `service.ts` failure handling uses a guarded CAS, then reads back only the same revision when the CAS loses; `store.ts` implements the optional `unlessComplete` filter atomically. An acknowledged-lost commit can no longer have its complete targets downgraded by stale failure bookkeeping; newer-revision state returns null rather than leaking through an older run. Original source-reconciliation failures retain their unguarded explicit path.

`retry-fix-pins.json` pins these five files. Existing transaction adapter, indexer, composition, schemas/contracts and providers are unchanged by this repair. `qa/issues.T054-PERSIST.jsonl` contains open high `ISS-T054-PERSIST-003` with the checker's original reproduction and regression names. No claim that it is closed.

## Broker selection

Use existing safe Node runner, no native DB/provider/browser and no private source opt-in. Select these exact top-level nodes from `apps/api/src/transcript-review/refresh-executor.test.ts`:

1. `correction publication never replays paid work on transient body or commit errors` (two original floor cases).
2. `correction unknown commit retries only commit with bounded uncertainty and paid work once` (success/exhaustion variants).
3. `real indexer refresh consumes corrections and atomically publishes all targets, preserves reviewed claims/originals`.
4. `superseding review before publication aborts every derived write and leaves newer refresh pending`.
5. `unsupported Mongo and disappeared reviewed ids fail closed with durable correction truth`.
6. `runRefresh reconciles unknown committed head without downgrade or superseded revision leakage` (same-revision completion and concurrently superseded head).

The root broker runs these; maker launched no test, mutation harness, live service, provider or database command. Required before ready-for-check: authentic broker receipt with stable source/dependency pins and exact node identity, plus independent checker. Source/test ready but verification pending.

Historical broker receipt `qa/goal-vectorless-2026-10-15/verification-t054-retry-six-20261015T1040.json` records 6/6 PASS before the following type-only fixture repair. `verification-api-types-t054-20261015T1042.json` reports one error: `ReadConcernLike` permits a string and `.level` was read without narrowing. Root authorized a narrow correction: assert a truthy object read concern before the unchanged `level === snapshot` assertion. No cast, runtime contract weakening or product logic change. Current direct-test SHA is `8254C8796C42AF3B0596035C653493F20E4AD9961CEDB164ECFF43EBE9FB72EF`; broker will rerun the affected six nodes and API types/build. Prior green receipt is historical, not claimed exact-current-test proof.

## Limits and accounting

Native replica-set semantics, live Mongo restart and mounted HTTP/browser are still HOLD. The repair guarantees no replay within this executor call and preserves a complete committed head during service failure bookkeeping; it does not manufacture global exactly-once billing for explicit later human retries when no committed proof is available.

First recorded maker checkpoint after initial source read: host `2026-10-15T09:03:55.6128835+00:00`. Earlier read time unmeasured. No token/cost totals available. Actual end/pin time is recorded in retry-fix-metrics.json; elapsed interval is wall time, not asserted active CPU/reviewer time. No checker budget or outcome invented.
