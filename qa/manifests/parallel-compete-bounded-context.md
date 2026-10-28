# Manifest — parallel-compete-bounded-context

**Contract:** qa/contracts/parallel-compete-bounded-context.md
**Tier:** 2 — confirmed security/data-write request-context bypass; uncapped class
**Mode:** NORMAL explicitly approved by root; no further human approval required
**Fix cycle:** 0
**Status:** checked-PASS
**Handshake status:** checked-PASS
**Date:** 2026-10-09

## Confirmed problem and authorized scope

claim_24's real-server-mounted offline reproduction in
qa/evidence/parallel-compete-bounded-context/repro.ts confirmed five cases: configured synchronous
and dynamically asynchronous request factories were ignored, so refusing hydration calls0 and
factorycalls0 nevertheless returned an ungrounded answer and persisted an internal evaluation.
Direct bounded refusal wrote no evaluation but provided no explicit route refusal response.
The original reproduction file is preserved unchanged; checker adapts its success expectations.

Only apps/api/src/routes/compete.ts, compete.test.ts and this manifest were edited. No shared
Ask interface/factory/server/production/fixtures, schema, contract, ledger or governance edits.

## Implementation

An admitted /compete/start invokes configured requestDepsFor exactly once with the verified
tenant and awaits its result. Configured request dependencies are authoritative; shared legacy
completion/arms cannot fill missing fields. Factory dependency shape requires completion,
scorer, tree search, audit writer and bounded source hydration functions. Returned tenantId
cannot override the final verified tenant. The shared dependency object remains untouched.
Factory throw/rejection/unusable shape and bounded generation/refusal return a fixed sanitized
503 without answer/evalRunId and before eval create. Explicit no-factory offline behavior stays
unchanged; its optional legacy arms factory remains unused exactly as before this repair.
Async await robustness is tested dynamically; existing synchronous AskRouteDeps type unchanged.

## Recorded reproduction floor

The standing test replays claim_24's five exact behavior cases with the original guaranteed-grant
summary, missing cited turn, synthetic verified tenant, body foreign selector, injected offline
completion and real mounted route/askV2:

- sync-refusing factory: calls1, hydrate1,503, evalwrites0, bounded refusal audit present.
- async-refusing factory: calls1, hydrate1,503, evalwrites0, bounded refusal audit present.
- no-factory legacy: calls0, hydrate0,200, original grant fixture answer, one internal owner eval.
- direct bounded refusal: calls0, hydrate1,503, evalwrites0, bounded refusal audit present.
- absent compete scope:403, factory/tree/completion/eval work0.

Floor measurement: **claim_24 corpus5/5**, no recorded case omitted. Additional factory
throw/reject/unusable cases, unauthorized-key refusals and unknown generated source/failed
grounding cases also refuse before evaluation persistence.

## Actual final checks

Bundled executable: C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe

Command: bundled-node --test --test-concurrency=1 --test-timeout=20000 --experimental-test-isolation=none --import tsx apps/api/src/routes/compete.test.ts

Final output: tests10, pass10, fail0, cancelled0, skipped0, todo0, duration1743.7036ms; exit0.
All preceding start/score/owner/HTML/scope tests remain green. New tests also exercise actual
createSourceRequestDepsFor→askV2→real createServer-mounted route with injected database-shaped
tenant-filtered turns/chunks and offline dispatch. Prompts exclude unreviewed large summaries;
literal quotes/turn IDs/grounding reach generation, response and identical persisted aiAnswer.
Two tenant/query requests interleave and complete B before A; every dispatch/read/audit/eval
uses its owner, each query embedding runs once across arms/hydration, and both positives pass.

Command: bundled-node node_modules/typescript/bin/tsc --noEmit -p apps/api/tsconfig.json

Final output: no diagnostics; exit0. Initial tsc found union narrowing for extraCandidateArmsFn;
an explicit existing AskV2Deps dependency type annotation fixed it. Final tests were rerun at
the corrected source identity. Initial10/10 preceded this annotation; not substituted for final.

## Tested identity and limits

- compete.ts: 86fb7a0ef5155a4472486044bb5270cad8f9043d7527c6a7eceef77b50e21558
- compete.test.ts: 354bd4b8dadaeaba88e3b9d62671a02fbb84339ad5f4cb4c9854c6f76d4610f6

Scoped nonblank LOC137/300 and307/400; no new application files. No DB/provider/browser,
full suite, service/runtime/deployment, source mutation harness, commit or push. Existing HTTP
tests use ephemeral local test server; new composition tests use actual mounted offline handlers
without sockets. No deployed/provider or human factual-approval proof. Independent checker
cycle0 scoped PASS verified; no full Ask/Compete release or task closure claimed.

## Matching checker close-out

Canonical qa/verdicts/parallel-compete-bounded-context.md records PASS, Cycle checked0,
matching this manifest Fix cycle0. Rehashed both owned files before close-out; exact hashes
above match canonical verdict and checker evidence. Independent checker reran affected10/10,
API typecheck0, all original5/5 recorded corpus inputs,10/10 unusable factory edge probes and
actual-factory2/2 reverse-order tenant positives. The unchanged baseline exploit/reproduction
and its historical failure outputs remain preserved; only expected postrepair assertions were
adapted in checker's separate corpus harness. This manifest alone flipped checked-PASS; no
application/runtime/staging/ledger/provider/DB changes. Parent/full-feature acceptance remains open.
