# iss-t050graph-001-002-skip-screen-and-at-least-once

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 2/4 (ledger issues ISS-T050GRAPH-001 medium, -002 low; data-write class module, unwired).
Lane: lane/t050graphfix (from b8baec4c). Touches only packages/core/src/pipeline-graph (+ this manifest).

## Scope
- ISS-T050GRAPH-001: buildGraph now refuses a skip when a non-skipped stage depends on the skipped one. This mirrors `packages/meeting-bot/src/capture/record-commands.ts:90`: `if (rest.includes("--index") && !rest.includes("--process-video")) throw new Error("--index requires --process-video");` (index requires screen). A failed screen already ended failed-terminal with index not run (record-finalize.ts:246-262); now tested explicitly.
- ISS-T050GRAPH-002: at-least-once re-run documented in pipeline-graph.ts header and graph-types.ts. A crash or lost lease after a handler's side effect but before succeed() leaves the node unrecorded and the next worker re-runs it (cause lease-expired). ALL node handlers (capture, media, transcript, screen, index) must be idempotent: same inputFingerprint => safe re-run and same outputFingerprint. index (DB writes) and capture/media (file writes) need particular care.
- The old first test (skip screen -> complete) asserted the now-forbidden behaviour; replaced. A leaf-optional-skip test keeps the runtime skip path covered.

## Evidence (packages/core)
- `node --test --import tsx src/pipeline-graph/pipeline-graph.test.ts`: tests 16, pass 16, fail 0. `tsc --noEmit -p tsconfig.json`: exit 0.
- Replay ISS-T050GRAPH-001 (recorded repro: skip screen then index runs): 1/1 now refused (`cannot skip stage screen: stage index requires it`), no handler ran. Screen-failed case: 1/1 failed-terminal, calls = capture, media, transcript, screen.
- ISS-T050GRAPH-002: documentation only; no reproduction to replay.
- Mutations on pipeline-graph.ts (per-mutation byte backup, restore in finally, timeout 120s): guard removed KILLED; condition inverted KILLED; skip loop disabled KILLED; guard checks only first dep SURVIVED (equivalent: every stage in WEBINAR_PIPELINE has at most one dep). File bytes identical to pre-run after.

## NOT done
No wiring; job-queue and pipeline-runner untouched; ledger statuses left for the checker.
