# T059 fixture authority repair — frozen broker request

Root `C:/Users/product/Desktop/KnowledgeBase`. Authorized by root through product_delivery_coordinator after the read-only cause audit; central types-freeze owner notified before edit. TESTONLY exact paths: `apps/api/src/evaluation-flywheel/test-fixture.ts`, `apps/api/src/evaluation-flywheel/composition.test.ts`. No production code, DB, schema, dependencies, guard or success expectation changed. No local test/build/provider/browser or checker dispatch occurred. Source now frozen pending sole broker receipts.

| Path | Previous SHA256 | Final SHA256 |
|---|---|---|
| apps/api/src/evaluation-flywheel/test-fixture.ts | 6bd2229d3499ccb532a585a7325dcb8052250b22931978768e45f5608ffbd13f | 4fd0bcbdd3f054c20e5e444f87900609ffb63d306c68b5a5fdaf5c84c4379cee |
| apps/api/src/evaluation-flywheel/composition.test.ts | c58aff9cc1706df18bc9b2c8d2386a2cfb5fa77a57c3ea1001b5fbf8ead58c5d | 6e5ccb6396f8f75d89687650558e263283ecb4711ef44ff7aa5be6ed1d1138d1 |

Unchanged deadline source pins: workflow.ts487ebc2b08d128f17b27b9c6b6a8df21a6fb85dd1db1517e32281f7865af3fe2; workflow.test.ts94563bffce039a5158c834899ec4db17e28e24164536c4182d7429aaa47700d8. Working-tree patch, not a commit. Prior downstream503 receipt remains immutable at `qa/goal-vectorless-2026-10-15/verification-deadline-composition-one.json`/`.stdout.txt`; historical rows before/after/restoration remain in `verification-deadline-composition-sideeffect.json`.

Fixture changes: own-property traversal distinguishes absent dotted fields from present undefined/null for `$exists`; supported operators are conjunctive and unsupported operators fail closed. Insert/delete/replace/update report acknowledged results. matchedCount1 requires an actual filter match; modifiedCount1 requires a matched row to change. Stale revision, foreign tenant and missing-field CAS races remain matched0/modified0. Existing production `generation.ts` acknowledged-CAS guard is unchanged. One new helper regression (composition.test.ts:15) covers absent/present undefined/null dotted fields, successful authority CAS, no-op update and stale/foreign/already-present refusal. Existing composition test assertions remain unchanged, now starting at42.

## Exact sole-broker request

Use the broker's existing pinned runtime, import preflight, serial execution and30-second test ceiling. Do not infer success before receipts.

1. **Original failed composition1 replay, unchanged selected test identity:**

`node --test --test-concurrency=1 --test-timeout=30000 --test-name-pattern="^actual source intake -> grounded indexSession -> request-bound source hydration/askV2 -> immutable child$" --import tsx apps/api/src/evaluation-flywheel/composition.test.ts`

Expected selected1 test; new helper test filtered. Preserve/restore historical rows exactly as original broker side-effect handling; fresh separately attributable receipt required. No existing503 receipt overwritten.

2. **Smallest direct helper positive/negative regression:**

`node --test --test-concurrency=1 --test-timeout=30000 --test-name-pattern="^memory fixture distinguishes missing dotted fields and acknowledges only matched CAS writes$" --import tsx apps/api/src/evaluation-flywheel/composition.test.ts`

Expected selected1 test; composition filtered. This covers the two concrete previously missing mock behaviors without exercising unrelated source.

3. **Smallest immediate existing fixture consumers for affected result/filter semantics:**

`node --test --test-concurrency=1 --test-timeout=30000 --test-name-pattern="^stored loss creates stable tenant-linked gap; separate unscored retest preserves original and consumers$|^concurrent attempt CAS and expired restart lock preserve exactly one accepted child$|^terminal CAS deadline preserves committed completion or fences a late CAS after recovery$" --import tsx apps/api/src/evaluation-flywheel/workflow.test.ts`

Expected selected3 tests. These cover natural-key upsert/readback and idempotent retry, same-store stale/competing CAS and terminal delayed CAS/no-paid-replay. They directly consume modified helper semantics; no full suite requested. Current combined types are centrally owned and not run here.

These are proposed commands/counts, not executed evidence. This repair establishes neither native Mongo behavior nor full T059 acceptance. Any additional incompatibility exposed by the original replay remains a named failure requiring a new narrow decision; no production guard weakening or further speculative fixture expansion is authorized. Actual maker active seconds/tokens/cost unknown; no efficiency claim.
