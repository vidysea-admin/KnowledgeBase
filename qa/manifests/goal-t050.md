# goal-t050

**Handshake status:** checked-PASS (CORE SLICE ONLY) — closed out 2026-10-26 (resume reconcile) citing qa/verdicts/goal-t050.md
Status: ready-for-check
Fix cycle: 0
Task: T-050
Priority: tier 3, owner-authorized full roadmap completion under D-170. Data-write/tenant/credential-handling boundaries require full ceremony.

## Authorized candidate

Official default-off Ask execution over the existing authoritative node functions; durable tenant-bound cancellation; real timer heartbeat/final cleanup; bounded child execution with classified retry codes; fresh and recovered capture graph seam; input media digests; atomic identity-bound index markers. Existing runner, queue, CAS store and completion validator remain authoritative. No QA contract, schema, lockfile, shared capture driver, approval mechanism or production data was changed by this maker.

Owned source/tests: `packages/core/src/pipeline-graph/{graph-types.ts,pipeline-graph.ts,session-run.ts,session-control.ts,session-control.test.ts,session-run-controls.test.ts,session-restart.fixture.ts,session-restart.real.test.ts}`; `packages/ask/src/{ask-graph.ts,ask-graph.test.ts}`; `scripts/webinar/graph/{graph-finalize.mjs,stage-process.mjs,stage-process.test.mjs,proof-marker.mjs,proof-marker.test.mjs,graph-retry.test.mjs,completed-session.mjs,completed-session.test.mjs}`; guide `docs/t050-pipeline-controls.md`. Building packet: `qa/packets/goal-t050.md`.

Contract: `qa/contracts/goal-t050.md`, plus existing queue/run-state contracts and D-139/D-142/D-161. Original ISS-W050-001 retry-code and ISS-W050-002 heartbeat reproductions remain verification requirements. Maker never edited contracts.

## Evidence state

The sole CPU broker executed core stage A: **33/33 PASS**, exit 0, 38.350 seconds, outer timeout 120 seconds. Actual receipt: `qa/evidence/goal-t051checker-broker-t050-core-A.json` (SHA256 `ea90b96285a745c4069d719f4441d6480b342d52ab36c0bf00bb7cfee1218feb`), with `.stdout.txt`/`.stderr.txt` beside it. All 20 candidate hashes matched before/after. This covers controlled real-file worker restart/replay, long synthetic handler heartbeats, stale-holder checkpoint refusal and durable controls. It proves neither live host/provider execution nor full-task completion. Bounded child/marker boundaries, wired consumer/recovery and official Ask checks remain queued after the shared compiler/route freeze. No duplicate A run is planned. This manifest must not become ready-for-check until actual affected-stage/downstream evidence and precise remaining gates are recorded.

Shared integrations are owned by `/root/docker_runtime` and its named source writer: Ask's exact `@langchain/langgraph` dependency/importer, default-off API configuration, fresh capture/recovery `run-pipeline.mjs` consumption, generation-bound capture stop, actual final proof and status consumers. Their evidence is not claimed here.

Provider availability is now actual rather than a presumed credential gate: see `qa/evidence/goal-live-toc/stage-status.md` and immutable one-call receipt SHA256 `548a0b1de6e380849028811658c42a127823741e981fdc40ea9e917d2e701d9d`. The approved five-turn non-strict summary/parser/tree check succeeded; it does not substitute for this contract's complete grounded graph/index/Ask sample.

## Remaining full-parent gates

Actual media/provider/KB sample, two real entry-point paths, real long-stage/host operational proof, current tenant/proof tests, official Ask frozen-baseline/API consumption, shared integration/type/build/validator receipts, independent same-cycle check, and explicit handling of legacy path/size fingerprint jobs. Synthetic process/child fixtures alone do not close T-050.

## Core-slice scope statement (lane w16-t050graph, cycle 0)

Scope: ONLY `packages/core/src/pipeline-graph/*`, base a9fac545. Core durable tenant-bound cancellation (`session-control.ts`), timer heartbeat/abort/cleanup (`session-run.ts`) and generation forwarding (`pipeline-graph.ts`, `graph-types.ts`) were already present at base. This cycle changed only the real-restart test timing (fixture self-expiry 22s->75s, checkpoint wait 20s->60s, test timeout 30s->150s) because child tsx startup under ~18-lane CPU load exceeded the old bounds; assertions are unchanged.
Evidence (lane, fresh): stage A `node --test --test-concurrency=1 --import tsx` over 5 core files: tests 33, pass 33, fail 0, 190.5s under load. Before the timing change the same set gave 31/33 (restart tests timed out under load). `tsc --noEmit -p packages/core/tsconfig.json`: no output (clean).
NOT in this slice (outside owned path; owned elsewhere): bounded child execution with classified retry codes (`scripts/webinar/graph/stage-process.mjs`), atomic index/proof markers (`proof-marker.mjs`), `completed-session.mjs`, `graph-finalize.mjs`, Ask official executor (`packages/ask`), `run-pipeline.mjs` fresh/recovery consumption. Those files exist at base with tests but were not re-run or changed here. Full-parent gates listed above remain open; this is not whole-task evidence.
