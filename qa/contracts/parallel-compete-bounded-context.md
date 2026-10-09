# Contract — parallel-compete-bounded-context

Independent checker, 2026-10-09. High security/data-write finding; never round-capped.
Root authorized the minimal active-unit repair after claim_24's five mounted-handler probes
confirmed configured request factories were ignored: synchronous refusing factory calls0,
hydration0, HTTP-shaped status200 and one ungrounded internal eval write. Asynchronous factory
is a dynamic robustness probe outside the existing synchronous TypeScript interface. Direct
bounded refusal produced no eval write; missing compete scope denied all work. Evidence:
`qa/evidence/parallel-compete-bounded-context/repro.ts`. This is offline mounted-handler evidence,
not deployed HTTP/provider/database proof or an acceptance verdict.

## Scope and compatibility

Maker owns only `apps/api/src/routes/compete.ts`, its tests and a matching unit manifest.
Checker owns this contract and later verdict/evidence. Existing Ask/shared server/production,
auth helpers, schemas, ledgers and frozen governance remain unchanged. Existing explicitly
offline callers without a request factory retain legacy behavior; this exception cannot be
used to ignore a configured production factory or rescue failed bounded hydration.

## Acceptance criteria

1. **Verified authorization and tenant.** Real mounted `/compete/start` requires verified key
   and compete scope before tree/factory/completion/eval dependencies. Missing/invalid/revoked
   keys and Ask-only keys perform zero work/writes. Body/header/query tenant selectors never
   alter the verified tenant. Tree loading, factory invocation, audit and eval persistence all
   receive that tenant; final tenant assignment cannot be overridden by factory-supplied data.
2. **Configured factory is authoritative.** Invoke the existing `requestDepsFor` exactly once
   per admitted request and await its result (including a dynamically injected Promise). Its
   request-local source hydration, completion/scorer and retrieval arms must reach actual
   `askV2`; legacy shared completion/arms cannot silently replace them. A configured factory
   that throws/rejects or returns unusable dependencies fails closed before generated eval
   persistence. Never mutate shared deps or cache a tenant-bound returned object across requests.
3. **Literal bounded positive grounding.** Exercise actual `createSourceRequestDepsFor` ->
   actual `askV2` -> actual mounted route with injected database-shaped, tenant-scoped source
   rows and offline dispatch. Assert prompts exclude unreviewed/large tree summaries, admitted
   literal source quotes/identities reach generation and grounding, supported answer citations
   and scored sources survive response and persisted aiAnswer, and credibility remains internal.
   Injected dispatch proves orchestration, not external factual correctness or human approval.
4. **Failure has no generated eval write.** Re-run claim_24's recorded cases as the floor:
   sync refusing factory, dynamically async refusing factory, no-factory legacy, direct bounded
   refusal and absent compete scope. Assert factory/hydration refusal returns explicit sanitized
   non-success without answer/evalRunId and zero eval create. Add factory throw/reject and
   grounded-generation/grounding refusal; preserve actual bounded refusal audit where askV2
   reaches it. Raw exception/source/provider/path/credential text never reaches response.
   No fallback from a configured bounded failure to ungrounded shared generation is permitted.
5. **Request-local concurrency.** Interleave two authenticated tenants/questions with deferred
   factories or dispatch and complete them in reverse order. Assert exact tenant on all factory,
   source/dispatch/audit/eval boundaries, correct corresponding quotes/answers and no cross-request
   query-embedding/context reuse. Each owner's positive response must succeed; deny-all cannot pass.
6. **Preserved behavior and evidence.** Existing compete start/score, tenant refusal, internal
   credibility and explicitly no-factory offline owner-positive tests remain green. Run affected
   bounded tests, independently adapted reproduction and scoped API typecheck only after root
   frozen READY with matching Fix cycle. Record command/output, exact tested source hashes and
   matching Cycle checked. Source/helper/refusal behavior is inspected independently; maker
   claims alone cannot PASS. Any source change requires a fresh matching READY/hash recheck.

## Gates

Builders never edit this contract. Only checker issues scoped PASS/FAIL; maker closes only a
matching PASS to checked-PASS. Security/data-write defects remain uncapped. No browser, live DB,
provider, full-suite, runtime/deployment or shared source mutation is authorized. Broader Ask,
production/live evidence, frontend and full-feature/release acceptance remain outside this unit.
