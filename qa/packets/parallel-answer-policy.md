# Checker packet: parallel-answer-policy, cycle 0

Root: C:/Users/product/Desktop/KnowledgeBase. Base HEAD: 4f449b27e8573a5fd0fb8d88bdbd2b260b1ecccd. All seven lane files are new, with no tracked base.

## Authorized scope and ground truth

T-056 scoped versioned draft simulator, GO from root. Pure module rejects foreign tenant before inspecting result, preserves immutable versions and separates internal/web counts. Insufficient coverage or missing session/URL provenance produces review; internal-only refuses any web answer; no sources/invalid result refuses. A simulator allow checks metadata coverage/provenance availability, never asserts factual truth or verified citations.

Existing qa/contracts/ask-router-v2.md criterion 3 source preservation/separation, criterion 4 Ask composition and audit; qa/contracts/web-ask-page.md C4-C8 and I3 for separated sources, coverage, errors, safe links and no browser package coupling. No dedicated policy contract exists. Maker has not edited contracts. C5 catalogue requires YAML, persistence and versions, which remain unfinished. No parent task completion claimed.

## Files / SHA256

| File | SHA256 |
|---|---|
| packages/ask/src/answer-policy.ts | C32796FF37A63D154FDB3D2537C5467914BE0932BDC3CE0FACEE23C0960070C2 |
| packages/ask/src/answer-policy.test.ts | 70A4575CFC380903AD402F646E7E9E377098FBA6095B57ABB30A53E7FDFC40C3 |
| apps/api/src/answer-policy/routes.ts | 9B8066A3D10A0AF3CCAFC0DC9397229D338C71AFE62BA7288E057146B6BF4956 |
| apps/api/src/answer-policy/routes.test.ts | 7B2E08244D659772CDB8C42A36FF376F5DAFA41B2023B0B54B732BC2DE33DEB6 |
| apps/web/src/pages/answer-policy/client.ts | 1604FBBF5359F0D373AB2C3CA20F2E3BD6C57EFBFC1D68CB2B4CC278C4E7A142 |
| apps/web/src/pages/answer-policy/AnswerPolicySimulator.tsx | B77B4355C6E7336F392D8418E1AB8E2C2FC62C91E12036F285497E72B245B24B |
| apps/web/src/pages/answer-policy/AnswerPolicySimulator.test.tsx | 1644938B82932B4A9A579E5FD13261F62425916950A8BB79D83659933E98A3DC |

## Caller and boundaries

- Pure createAnswerPolicyVersion validates identifiers, mode and sequential safe versions; returns detached Object.freeze value. simulateAnswerPolicy checks policy/result envelope ownership first, then metadata consistency and provenance. Counts remain separate; answer text is never rewritten or returned by this function.
- API createAnswerPolicyRouter uses requireScope("ask"); shared server requireAuth/rate-limit precede mount. Body accepts query<=4000 chars and draft id/mode/local version; ignores supplied tenant/results. TreeStore.load/auth tenant and the same AskRouteDeps factory precedence as existing routes/ask/ask.ts produce actual askV2 result. Client never supplies the result envelope. BoundedAskError becomes 503. Unknown failures use next(error), no raw error reply.
- Draft versions submitted by the browser are local revision labels, not server-authenticated stored history. Route intentionally does not claim persistence. Existing Ask job bookkeeping/provider calls occur through the established Ask path, with explicit button submission.
- Browser uses shared apiFetch/auth context, never imports packages. Candidate answer and policy decision are separate, source classes have separate panels, missing session refs remain inert, safeHttpUrl rejects unsafe schemes. Auth changes/unmount invalidate pending replies. Draft selector changes increment local version and clear old results. No localStorage content persistence.
- Integrator-owned apps/api/src/server.ts mounts createAnswerPolicyRouter(deps.ask); apps/web/src/App.tsx and navigation expose /answer-policy. Shared glue separately checked, but owned API test exercises actual createServer mounting.
- Security flags: auth YES, tenancy YES, cross-tenant access prevention YES, database schema writes NO, policy persistence NO, credentials handling NO new; provider/job writes inherited via explicit existing Ask invocation. No original issue corpus because this is a new capability, not an issue fix.

## Verification packet

1. Focused Node runner: packages/ask/src/answer-policy.test.ts (9 tests) and apps/api/src/answer-policy/routes.test.ts (5 HTTP tests). Pure tests include immutable history, owner/version rejection, foreign envelope refusal before getter access, source-free/malformed/insufficient refusal, unsafe URL review, web separation and actual existing answer() downstream consumption without extra provider calls. HTTP tests use actual Ask graph with fake providers and real localhost HTTP; enforce auth/scope/tenant factory binding, ignore forged body, missing tree/bounded errors, invalid drafts/query budget and createServer mounted endpoint.
2. Focused web: apps/web/src/pages/answer-policy/AnswerPolicySimulator.test.tsx (3 tests): trimmed fresh request, decision/source separation, unsafe URL inertness, coverage display, local version change/result reset, genuine API error and blank question.
3. node node_modules/typescript/bin/tsc --noEmit -p packages/ask/tsconfig.json: exit0, wall2.70s. Same web command: exit0, approx10s. Same API command: exit1, wall9.03s, all errors in unrelated active apps/api/src/gws/gws-calendar.ts and youtube-calendar.test.ts. No answers-file diagnostics.
4. Reused checker current receipt `python contracts/verify_contracts.py`: exit0 wall0.3452815s, completion2026-10-14T09:08:26Z. Output: `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`.

Actual focused evidence is complete in qa/evidence/parallel-answer-policy/summary.md: safe Node14/14 and actual React/client3/3 pass, exact commands/durations and initial test-only header expectation correction retained. Actual React probe file qa/evidence/parallel-answer-policy/actual-react.test.mjs SHA256 E6D7775CB957094C4EBB5B7AED4D0703977AF3347BB20A8B395E6A5D07721794; standing Vitest3 remain unexecuted. Seven lane source hashes above unchanged. Manifest ready-for-check cycle0.

All test execution coordinated by /root/runtime_inventory, which prescribes the safe runner and slot; do not launch competing suites. No browser/provider/DB jobs authorized here. UI interactive proof remains blocked pending live resource clearance. Checker preparation requested explicit truthful web_used display; component now says whether Ask used web sources, never inferring fallback configuration from false. This is a new simulator scope; full AskPage acceptance is not claimed.
