# Maker packet — ollama-http-boundary, cycle 1

Root: `C:\Users\product\Desktop\KnowledgeBase`.
Authorized security prerequisite to cloud routing: HTTP redirects must never forward credentials; response consumption must have bounded bytes, time and cancellation. No live calls. CLI transport unchanged.

## Candidate identity

| Path | Base SHA256 | Candidate SHA256 |
|---|---|---|
| `apps/api/src/ai-transport.ts` | `1CC9FFDBD33239BAB6FEF2ADDBB1DFA26BFE95EFF7C36B449F2A4F630D66A0D7` | `AB266B7496F0B85C810A6C66CD3C5231598EA01E10ACAD741796E2C807E831F1` |
| `apps/api/src/ai-http-transport.test.ts` | New file, no base | `BDF4808D08F072185AEBE730ED0E7DC7095AB1D887F0C1D6E99C6838D1F73A3D` |

Source frozen at 2026-10-15T07:56:34.3707266Z. Shared composition/types/ledger changes belong to central integration and require their own pins.

## Behavior and boundaries

- Exported `createHttpTransport({timeoutMs?,outputBytes?,fetch?})`; default real HTTP path uses this factory. Existing CLI source remains unchanged.
- Every fetch receives `redirect: "manual"`; all 3xx responses are refused and cancelled. Never follow a `Location` or expose it in an error.
- Stream through a reader; count raw bytes before retaining a chunk. Default 16 MiB. Refuse oversized Content-Length early, but never trust it instead of counting actual bytes.
- Absolute 180-second default deadline covers headers and body, including noncooperative injected fetch. Caller AbortSignal is relayed; timeout/abort cancels body and aborts underlying request. Preserve `AbortError` name for existing HTTP caller cancellation compatibility.
- Invalid limits and non-HTTP factory requests fail closed. Exceptions do not echo credentials, source text, URL, headers, response bodies or arbitrary abort reasons. Normal non-redirect status/body semantics remain unchanged for provider adapters.
- Credentials/security: yes. Tenant/data/database behavior: unchanged. Public source interface: additive injectable factory. Immediate consumers: `realTransport`, existing cloud/local/Gemini provider requests.

## Required focused verification (broker only)

Working directory `apps/api`:

`node --test --import tsx src/ai-http-transport.test.ts`

Coverage/node IDs: manual-redirect auth semantics; 301/302/303/307/308 refusal and cancellation; streamed bytes without Content-Length; early length rejection/exact Unicode-byte boundary; stalled-header and stalled-body deadlines; caller abort before send/during body; secret-safe fetch/reader failures; limit/kind validation.

Existing `ai-transport.test.ts` HTTP AbortError compatibility check and CLI regression selection belong to broker's coherent batch. Existing cloud-provider test is the immediate downstream check. No browser, live network or subprocess is used by the new test file; importing transport creates no processes. Typecheck API after central integration source freeze. Full CI remains combined-release gate.

No tests run by maker under shared CPU restriction. Independent checker must inspect exact diff, derive its failure probe, and consume only matching broker receipts; missing evidence is HOLD.

## Prospective maker measurements

New source implementation phase measured with Windows monotonic QPC frequency 10000000:

- Start: 149964186218; UTC 2026-10-15T07:55:06.5463796Z.
- End: 150842431378; UTC 2026-10-15T07:56:34.3707266Z.
- Duration/active: 87.824516 seconds; waits/pauses: none.
- Earlier initial inspection before measurement: actual duration unknown (`null`), not claimed zero.
- Actual tokens/cost: unknown (`null`); no token-efficiency success claim.
- Packet preparation is subsequent maker work; excluded from the recorded source phase and not padded into its denominator. Checker must use explicit finite allocation when needed, preserving unknown earlier overhead and all retry budgets.

Related already-frozen provider unit: `qa/manifests/ollama-cloud-vectorless.md`; no cloud adapter/test edits in this HTTP hardening unit.
