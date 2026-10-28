# Verdict: iss-t050graph-001-002-skip-screen-and-at-least-once

VERDICT: PASS
Cycle checked: 0
Commit checked: 13e0fe84 (lane/t050graphfix)

## EXPLANATION
1. Rule vs record-commands.ts:90. Source: `if (rest.includes("--index") && !rest.includes("--process-video")) throw new Error("--index requires --process-video");`. Graph: `for (const d of def.stages) { if (skip.has(d.name)) continue; for (const dep of d.deps) if (skip.has(dep)) return {ok:false,...} }`. Same semantics (a still-running stage may not depend on a skipped one), generalised from index->screen to any dependent. Not too broad for real code: only `screen` is optional in WEBINAR_PIPELINE and `index` is its sole dependent; a skipped stage whose dependents are also skipped is allowed. Note (not a defect of this unit): the real CLI allows "no --process-video and no --index" (stop after transcript); the graph cannot express that because index is non-optional. Pre-existing definition limit, relevant at wiring time.
2. "At most one dep" holds in WEBINAR_PIPELINE (each stage has 0 or 1 dep) but is ASSUMED, not enforced: pipeline-workflow.ts:72 only requires deps to name earlier stages, and the planner (line 136-137) explicitly supports multiple deps. The implementation loops over all deps, so the code is correct for multi-dep; the survivor is a test gap only (low).
3. At-least-once docs: accurate. Resume re-plans from persisted RunState; an interrupted (running, lease-expired) node is re-run with cause lease-expired (existing test "resume after a crash mid-graph"); a done node is not re-run. Wording "superseded lease leaves side effect done but unrecorded" matches the stale-lease refusal path. The graph-types.ts comment is placed above the NodeContext doc line (cosmetic, two stacked doc comments).
4. Replay ISS-T050GRAPH-001: 1/1 refused (`cannot skip stage screen: stage index requires it`, no handler ran), via the lane test. Screen-failed case: failed-terminal, index not run. ISS-T050GRAPH-002: documentation only, nothing to replay.
5. Mutations (harness in worktree, per-mutation byte backup, restore after each, timeout 120s, hash == HEAD blob a1f9fae3 after every run, harness deleted, tree clean): allow-skip KILLED; inverted condition KILLED; first-dep-only SURVIVED; last-dep-only SURVIVED (both equivalent on current single-dep definitions); drop `if (skip.has(d.name)) continue` SURVIVED (no test skips an optional stage together with its optional dependent). The last is a real, low test gap.
6. tsc exit 0. pipeline-graph tests 16/16 pass x5. pipeline-runner suite 22/22.

## ISSUES-WRITTEN
ISS-T050GRAPH-003 (low, file-don't-fix): no test for multi-dep stage with skip, nor for skipping an optional stage together with its optional dependent (mutants first-dep-only, last-dep-only, drop-continue survive). Add when a multi-dep or optional-chain definition appears; not a pulled unit.
Ledger status: ISS-T050GRAPH-001 verified fixed; ISS-T050GRAPH-002 verified fixed.
