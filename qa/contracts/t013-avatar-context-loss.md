# Scoped contract — T-013 Avatar post-initialization context loss

Status: active; checker-owned; additive source-lifecycle scope.
Parent: qa/contracts/goal-t013.md F4 and F9; parent verdict remains HOLD.
Priority tier: 3, explicitly assigned task-derived acceptance coverage.

## Scope and attribution

Exercise the actual Avatar component after renderer initialization, then lose its WebGL context. This is distinct from the three already-green missing/blocked/null-allocation startup probes. The test may use a typed synthetic WebGL API and controlled animation-frame scheduler. It must declare that these are fixtures, without claiming successful real GPU rendering, actual microphone/speech/provider behavior or full T-013 completion.

Maker owns the matching manifest/packet and focused test candidate; checker owns this contract and matching verdict. Existing product source and shared composition stay frozen unless the coordinator explicitly grants a source/runtime lease. Only the ordinary execution coordinator may classify/execute the focused test; no inherited or local CPU grant exists.

## Acceptance

| ID | Required behavior / evidence |
|---|---|
| C1 | The focused test imports and mounts the actual Avatar component; it does not replace the component with a stub. Typed fake context and scheduler fixtures allow initialization through shader/program/buffer setup and scheduling of a render frame. Fixture initialization is explicitly distinguished from real GPU success. |
| C2 | Dispatch an actual cancelable webglcontextlost event on the initialized component's canvas. Assert preventDefault took effect, the honest rendering-unavailable fallback appears, and the lifecycle label remains accurate. |
| C3 | Context loss cancels the pending animation frame. Advancing/draining the controlled scheduler after loss produces no additional draw calls or new animation-loop work from this retired component. The fixture models cancellation semantics rather than pretending a canceled frame executed normally. |
| C4 | Unmount after context loss removes the context-loss listener and cancels animation work. Owned buffer/program/both shaders are deleted; no owned resource is omitted. Advancing/draining the scheduler after unmount causes no additional drawing or component activity. |
| C5 | At least one draw/lifecycle counter or scheduled render observation before loss makes the negative after-loss assertions nonvacuous. Fixture methods and scheduler behavior are typed without blanket any casts; assertions observe the actual component's calls/events. |
| C6 | Matching ready-for-check manifest/packet and Fix cycle identify exact candidate/test/runtime/dependency/contract hashes. Ordinary coordinator supplies exact bounded focused command, exit/output/count/duration and unchanged execution pins. Checker directly reviews those bytes and independently assesses evidence. No duplicate unchanged three-test startup floor, entire web suite or live/browser/provider action is required or implied by this scoped unit. |

## Verdict limits

A scoped PASS certifies only C1–C6. It does not change the parent contract/verdict or discharge successful real 3D/GPU rendering, microphone recognition, audible synthesis, actual provider/API answer, authorized source navigation or integrated full-product gates. Missing source identity/execution evidence means HOLD; proven criterion violation means FAIL. Do not add speculative issues or weaken criteria to match a test. No mutation run is authorized.
