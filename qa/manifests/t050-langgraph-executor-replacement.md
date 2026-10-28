# T-050 official LangGraph executor replacement

**Handshake status:** checked-PASS
Status: checked-PASS
Fix cycle: 0
Task: T-050
Priority: tier 3, new feature expressly authorized by D-161; root GO treats this as the requested library replacement, not a further capped polish finding.

## Authority and ownership

D-161, Approved-by Umesh, requires official JS LangGraph 1.x, exactly pinned, replacing the minimal executor with unchanged behavior/tests/flag. Root GO authorized MAIN packages/core/src/pipeline-graph source and corresponding tests, plus this packet; no git commits. Installed and declared @langchain/langgraph version1.4.18 remains unchanged. No Ask, shared drivers, dependency manifests, lockfiles, schema, QA contracts, queue policy or persistence edits.

Base HEAD: 4f449b27e8573a5fd0fb8d88bdbd2b260b1ecccd.
Changed source: packages/core/src/pipeline-graph/pipeline-graph.ts; graph-types.ts; pipeline-graph.test.ts.
Packet: qa/packets/t050-langgraph-executor-replacement.md.

## Behavior

Real StateGraph planner and stage nodes replace the loop. Conditional edges use the runner's selected stage; existing runner/store/queue own ordering, retry, lease, persistence and terminal disposition. Original public seam, GraphRun result, errors/warnings and at-least-once requirement remain. No second checkpoint store is added. Stage IDs are generated independently of workflow names. The existing iteration cap remains authoritative; the LangGraph recursion allowance accommodates planner/stage supersteps. Runner exceptions propagate; handler exceptions become node-threw as before.

New focused scenarios: zero/negative/NaN and completion cap boundaries; 30 media attempts through >25 library supersteps; workflow names colliding with library/internal reserved names. Existing graph regression cases remain intact.

## Evidence and remaining gates

Affected graph and immediate downstream suites PASS25/25; no provider, DB or browser run. Global structural/dependency checks are queued with final integration, not claimed PASS by this maker. Root coordinator reports repeated central contracts vacuousPASS receipts; exact fresh command/output requested in the independent checker slot to avoid attributing another lane's receipt. No graph-specific QA contract exists; maker has not authored one. D-161 and existing tests/ledger cases are the scoped acceptance source; checker owns any contract adoption. This ready packet asks for scoped library replacement judgment; checker may HOLD missing acceptance evidence and must not infer whole-task completion.

Typecheck command: python -c subprocess.run([C:/Program Files/nodejs/node.exe,node_modules/typescript/bin/tsc,--noEmit,-p,packages/core/tsconfig.json],timeout=120). Initial exit2 elapsed6.375s solely concurrent knowledge-outputs/evidence-builder.ts106..112 diagnostics; owning lane repaired those unrelated files. Scheduler-authorized repeat exit0 elapsed5.328s (TYPECHECK_EXIT0); no graph diagnostics in either run.

Exact test command (Python subprocess.run timeout120 wrapper, cwd repository): `C:/Program Files/nodejs/node.exe --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register.mjs packages/core/src/pipeline-graph/pipeline-graph.test.ts packages/core/src/pipeline-graph/session-run.test.ts`. Output tests25/pass25/fail0/cancelled0/skipped0/todo0, duration_ms13937.9675, TEST_EXIT0, ELAPSED_SEC14.062. Graph19 plus session6; original ISS-T050GRAPH-001 skip-screen1/1 refused and screen failure blocks index; ISS-T050GRAPH-002 at-least-once documentation plus both crash/resume tests PASS. No case intentionally omitted.

Initial tsx attempt failed before test bodies with esbuild spawn EPERM even under isolation-none (exit1 elapsed0.610). Escalation request was user-aborted while pending; no PID/session/output indicated execution. A later scheduler-approved safe synchronous TypeScript loader test produced the actual PASS above. The loader leaves resolution/transpilation in-process; no guard, product file, node_modules or provider changes. No failed attempt is counted as a test PASS.

Source SHA256 pins: pipeline-graph.ts EBFF696D0BD2359A030F8CF5B98208694A73DEBEC3091AB3E01B847FDE433830; graph-types.ts4DB7E804BD0AB45917FA48AF93A3C7D4D75E6179E2822388F5B67F11079C9115; pipeline-graph.test.ts1EECADC893F739E4C40AB88ABB4A33817D2A28D49F98EE1F38580CA03953AF58. `git diff --check -- packages/core/src/pipeline-graph` exit0. No commit.

Security flags: no new auth/credentials path; tenant lease/context handling preserved; executor invokes existing file-write runner, so full ceremony applies. Original ISS-T050GRAPH-001 skip-screen refusal and ISS-T050GRAPH-002 at-least-once crash/replay floor remain.

This unit does not close all T-050: default-off runner selection unchanged, recording path versus recovery wiring unchanged, live long-stage heartbeat/restart/provider/index acceptance pending. Ask LangGraph substitution is a later separate unit per D-161.

## Independent closeout

qa/verdicts/t050-langgraph-executor-replacement.md VERDICT: PASS, Cycle checked:0; maker read matching cycle and rechecked all three source SHA256 pins unchanged after verdict. Independent official compile/invoke/callback-routing proof6/6 (1.985s), exact ISS-T050GRAPH-001 replay1/1 refused/no handlers (1.750s), contracts verifier exit0 (0.125s) PASS by vacuity; no issues written. Maker graph19/session6 and typecheck0 evidence expressly attributed by checker. Global integration lint/dependency, graph-finalize driver campaign and broader live T-050 gates remain unclaimed. No commit, deployment, activation or flag promotion.
