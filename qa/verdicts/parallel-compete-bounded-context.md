# Verdict — parallel-compete-bounded-context

VERDICT: PASS
Cycle checked: 0
Manifest: qa/manifests/parallel-compete-bounded-context.md (Fix cycle: 0; ready-for-check)
Contract: qa/contracts/parallel-compete-bounded-context.md
Checked: 2026-10-09, after explicit root frozen READY.
ISSUES-WRITTEN: none
Scope: Minimal configured request-context bypass repair; no full-feature/release acceptance.

## Independent evidence

Exact commands, complete terminal outputs, source/harness hashes and initial sandbox EPERM
attempts are preserved in `qa/evidence/parallel-compete-bounded-context/checker-cycle0.json`.
Narrow escalation allowed only local esbuild transformation for offline checker probes;
EPERM occurred before assertions and is not behavioral failure evidence.

- Affected real compete suite: **10/10 passed**, exit0, duration1802.4182ms; existing start,
  score, HTML, missing question, owner-positive/scope and two-tenant score protections pass.
- API scoped TypeScript check: **exit0**, no diagnostics.
- **Original claim_24 corpus: 5/5** remeasured with every original fixture input unchanged,
  only expected postrepair assertions adapted in `checker-recorded-corpus.ts`. Sync refusing:
  factory1/hydrate1/503/eval0; async refusing:1/1/503/0; direct bounded refusal:0/1/503/0.
  All three record scoped refusal audit. No-factory legacy remains200/one internal owner eval;
  absent compete scope403/zero tree/factory/completion/eval work. No case omitted.
- Unchanged original reproducer also rerun with its original command; **exit1 expected** at
  original ignored-factory assertion actual1 versus expected0. It stops there, so that failure
  is not substituted for the complete five-case measurement above. Original bytes remain pinned
  SHA256 `1a2889e6025f5aec4e7c13f5c998ba9ed1c468280e5288b0dd5621cf7344977a`.
- Own factory edge probe: **10/10** null, undefined, empty, array, promised-null, throw, reject,
  missing sourceContext, nonfunction hydrate and nonfunction arms each return fixed sanitized503,
  exactly one verified-tenant factory call, zero shared completion rescue and zero eval writes.
- Own actual `createSourceRequestDepsFor -> askV2 -> createServer` mounted-route probe:
  **2/2 grounded owner positives**, reverse completion B-before-A, literal distinct source quotes
  and turn IDs preserved into response and identical internal eval aiAnswer; eight scoped reads,
  eight audit jobs, each distinct query embedding once. Async factory used per request, supplied
  foreign tenant and all caller tenant selectors cannot override final verified tenant. Giant
  untrusted summaries never reach dispatch. Maker's independently rerun actual-factory test also
  proves invalid generated source IDs and failed grounding refuse with zero new eval writes.
- Frozen verifier: `python contracts/verify_contracts.py`, exit0, literal no frozen contracts /
  PASS by vacuity. This does not itself certify product quality.

## Criteria and tested identity

C1 auth/tenant: baseline denied keys, scope and foreign-score tests plus own edge/concurrency
probes. C2 authoritative awaited factory: exact corpus, ten unusable factory cases and read-only
route inspection. C3 actual literal bounded grounding and C5 reverse-order tenant/query isolation:
own real factory probe. C4 zero generated eval persistence/refusal sanitization: original corpus,
independent edges and generation/grounding refusal regressions. C6 legacy/start/score preservation,
bounded tests/typecheck and matching frozen handshake: passed as above.

Owned source hashes match READY and remain unchanged after checks:

```text
apps/api/src/routes/compete.ts 86fb7a0ef5155a4472486044bb5270cad8f9043d7527c6a7eceef77b50e21558
apps/api/src/routes/compete.test.ts 354bd4b8dadaeaba88e3b9d62671a02fbb84339ad5f4cb4c9854c6f76d4610f6
```

Shared dependency hashes are recorded at check completion without claiming a before/after
freeze on separately owned shared modules. Async factory is a runtime robustness probe; shared
AskRouteDeps remains synchronous. Offline dispatch proves orchestration, not actual factual
support or human approval. New probes use offline actual mounted handlers; baseline tests include
ephemeral local HTTP. No live database/provider/browser/full-suite/deployment/production action,
source edit, ledger/task change or full Ask/Compete acceptance was performed. All bounded child
checks completed; no live handles. Maker may close only this matching cycle0 unit to checked-PASS.
