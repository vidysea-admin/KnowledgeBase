# Verdict: t049-ai-call-tracer
VERDICT: PASS
Cycle checked: 0
Commit checked: b7c5fde. Checker: independent, lane/t049.

## Commands (node v24.19.0, all under timeout)
- `git show --stat b7c5fde`: index.ts +1, trace.test.ts, trace.ts, manifest. No stt/, no package.json.
- `node --test --import tsx src/trace.test.ts src/provider.test.ts src/providers.test.ts src/router.test.ts` (packages/ai): tests 42 / pass 42 / fail 0.
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` (packages/ai): exit 0.
- Throwaway probes in scratchpad t049check (src probe files removed afterwards).

## Leak table (unique sentinel per field; sink records JSON-dumped with Error/non-enumerable walker)
| Input carrying sentinel | In sink? |
|---|---|
| prompt, system prompt, message list, tools, schema, embed texts, Buffer in texts | no |
| completion text, result.json | no |
| thrown Error message, Error cause, custom error property, plain-object throw, string throw | no |
| Error subclass whose constructor `name` was set dynamically (`errorClass`) | YES, by design caller-controlled: class name is code, not request data; low |
| provider.name, job.kind | yes, verbatim, category labels (caller code) |
| correlationId, tenantId | yes, verbatim BY DESIGN (caller metadata). Risk only if a caller puts PII or content in them; low |
| model | opts.model or result.model only |

## Other points
3. Transparency: same result object and error identity (tests + probe). `complete`/`embed` run with this=provider. Unknown methods and props are inherited via Object.create(provider). Real adapters use TS `private` (public at runtime), so safe. Residual (low): a provider using JS `#private` fields breaks on `listModels` or custom methods because they run with this=wrapper (probe: "Cannot read private member"). No adapter in packages/ai/src/providers does this. Interface has no streaming.
4. Sink isolation: sync throw, rejection, never-settling, 3 s slow, throwing-thenable, rejecting-thenable: result returned identically in 0-1 ms, no unhandledRejection. Sink is not awaited (emit is fire-and-forget).
5. Guard: unset, "false", "1" return the original object. "true" wraps. " true " and "TRUE" also WRAP (case-insensitive, trimmed; the manifest declares this). Brief asked for exactly "true"; TASKS.md:138 and docs/plan.md:43 say only "TELEMETRY_ENABLED=false" / default off, so the looser match is consistent with them, and opt-in default-off holds. Low observation.
6. Context: AsyncLocalStorage. Concurrent calls keep own ids; outside context null; nested inner context replaces the outer (tenantId not inherited): `a/o/T b/i/ c/o/T d//`. Sensible.
7. Accounting: latency measured around the awaited call, excludes a 200 ms busy sink (149 vs 80 ms timer under load; re-run 98 vs 99). Chars and tokens match hand-built responses; swapped counts killed by tests. Residual (low): a type-violating result (usage `{}` or NaN) yields undefined or NaN instead of null in a field, because the spread overrides the null default; real adapters always return numbers. Real adapters return costUsd 0 and tokens 0 when absent; the tracer records the provider's own value and cannot tell absent from zero. costUsd is null on error/embed.
9. Manifest Evidence and "not delivered" match observation (not wired, no Langfuse, no deps, stt untouched, retries best-effort).

## Mutation table (per-mutation byte backup, restore in finally)
| Mutation | Result |
|---|---|
| errorClass returns e.message | KILLED |
| jobKind set to prompt text | KILLED |
| sink awaited on the call path | KILLED |
| wrap when flag unset (guard removed) | KILLED |
| input/output token counts swapped | KILLED |
(First attempt at the error-message mutation was dead code and was redone.)

HEAD fidelity: trace.ts 2097fa9786ba31cae397b9dfd14b72aba4e6ac4c, trace.test.ts 5f3ca2ee16669a9aa87609441f9883c72b4de539, index.ts f660f36e07ccce2924aca2ce7a9fdabdb4766707, each equal to `git rev-parse HEAD:<file>`.

ISSUES-WRITTEN: none
EXPLANATION: No content leak: only sizes, counts, labels and caller-supplied ids reach the sink; error messages, causes and custom error fields are never read. The low observations above (dynamic class name, verbatim ids, looser flag match, `#private` this-rebind, undefined/NaN on malformed results) are notes, not backlog. No contract file added: new internal seam with no contract clause in qa/contracts.
