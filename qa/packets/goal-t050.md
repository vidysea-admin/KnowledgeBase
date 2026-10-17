# T-050 maker packet — cycle 0, building

Candidate: source prepared, **not ready-for-check**. Manifest `qa/manifests/goal-t050.md`; checker `/root/qa_status/checker_t050`; verdict `qa/verdicts/goal-t050.md`. Full contract `qa/contracts/goal-t050.md` and existing queue/run-state contracts remain authoritative. Core stage A now has an attributed actual broker receipt; downstream B/C/Ask evidence remains pending.

## Consumer/change map

- `session-run.ts` wraps the original runner: optional tenant-bound persistent cancellation, cooperative handler signal, timer heartbeat refusal/abort, unconditional timer/listener cleanup. It also refuses an incompatible retained checkpoint when queue retention has forgotten an ID; a fresh enqueue must not certify changed input using old complete state. Original job IDs, checkpoint CAS, retry and generation policy remain in the runner.
- `session-control.ts` derives cancellation IDs from validated tenant + runKey and uses the existing CAS store. Reopen survives; explicit resume clears only the latch. Unknown/corrupt controls refuse and preserve stored bytes.
- `graph-types.ts` adds optional AbortSignal and numeric pipeline generation; `pipeline-graph.ts` forwards its already fenced lease generation. Official pipeline invocation remains the checked implementation.
- `ask-graph.ts` adds the official default-off executor (`LKB_ASK_GRAPH=1`). It calls the exact same `ASK_GRAPH` node functions; no second answer/grounding/audit implementation. Tests compare results/writes/provider calls to the pre-refactor frozen baseline and refusal cases.
- `graph-finalize.mjs` exposes `runFreshSessionGraph`, retains recovery, validates identity before directory creation, hashes media bytes, and passes signals. It binds media finalization to the run tenant, rechecks source identity before downstream children, and invokes the sanctioned validator after STT invalidates transcript approval. Shared fresh capture/recovery driver integration is owned by `/root/docker_context_review`, central dependencies/runtime by `/root/docker_runtime`. The mechanical fresh-to-acknowledged-recovery fixture requires the same durable artifact/request fingerprint and proves mismatched media identity refuses without modifying queue bytes.
- `stage-process.mjs` classifies bounded private child stderr into established retry codes, returns fixed safe errors, bounds direct children and handles cooperative abort. Capture descendants remain under the existing host generation-bound controller.
- `proof-marker.mjs` refuses redirected directories/foreign proof identity and atomically writes the validated marker with tenant + pipeline generation. Capture-controller generation is a distinct existing field.
- `completed-session.mjs` repairs only `nothing-to-claim` for acknowledged completion: own queue job must be done with exact derived identity, matching complete run state, input fingerprint, current media digest and validated index digest. A marker alone or live lease is insufficient.

## Focused evidence and remaining prepared commands

The sole CPU broker executed the first command below on 2026-10-14 21:32:32–21:33:11 UTC: **33 tests PASS, 0 failures**, exit 0, 38.350 seconds, timeout 120 seconds, all 20 candidate hashes unchanged. Receipt `qa/evidence/goal-t051checker-broker-t050-core-A.json`, SHA256 `ea90b96285a745c4069d719f4441d6480b342d52ab36c0bf00bb7cfee1218feb`; exact stdout/stderr paths are recorded in the receipt. Controlled real temporary process termination/restart and at-least-once replay completed; synthetic >lease and stale-holder/control checks passed. These are mechanical proofs and do not establish live provider/media/DB acceptance. Do not rerun A without a new material source change or failure. The remaining three commands need fresh serialized broker execution after the compiler/route freeze.

A separate authorized real-provider first-stage check now exists in `qa/evidence/goal-live-toc/stage-status.md`: actual five approved recovered TOC turns, one Gemini 2.5 Flash call, HTTP 200/STOP, 534 input and 193 output tokens; production non-strict summary/parser output was consumed by `buildTree`, with twelve source pins unchanged. Receipt `qa/evidence/goal-live-toc/one-call-receipt.json` SHA256 `548a0b1de6e380849028811658c42a127823741e981fdc40ea9e917d2e701d9d`. This establishes current provider availability and that narrow actual function/consumer stage. It is not evidence of graph entry-point capture, strict grounding, index persistence, resolving cited Ask or human semantic acceptance. Prepared strict two-call extraction and staging read-only source/visibility proof are separately pending; there is no repeat merely to reconfirm provider status.

Run from repository root. Known Windows subprocess/CIM restrictions require approved escalation for controlled fixture processes. All created process/file fixtures are synthetic in temporary owned directories; no browser, provider or DB connection. Real restart children self-expire in 22 seconds and parent cleanup kills only its child handles. No source mutation is part of these commands.

```powershell
node --test --test-concurrency=1 --test-timeout=60000 --import tsx packages/core/src/pipeline-graph/session-run.test.ts packages/core/src/pipeline-graph/session-run-controls.test.ts packages/core/src/pipeline-graph/session-control.test.ts packages/core/src/pipeline-graph/session-restart.real.test.ts packages/core/src/pipeline-graph/pipeline-graph.test.ts
node --test --test-concurrency=1 --test-timeout=30000 scripts/webinar/graph/stage-process.test.mjs scripts/webinar/graph/proof-marker.test.mjs scripts/webinar/graph/completed-session.test.mjs
node --test --test-concurrency=1 --test-timeout=60000 --import tsx scripts/webinar/graph/graph-retry.test.mjs scripts/webinar/graph/graph-finalize.test.mjs
node --test --test-concurrency=1 --test-timeout=60000 --import tsx packages/ask/src/ask-graph.test.ts packages/ask/src/ask-v2.test.ts packages/ask/src/bounded-ask.test.ts
```

The Ask command additionally requires central installation/importers for exactly pinned `@langchain/langgraph` 1.4.18 in Ask. The API bundler externalizes npm imports; production flag-on requires the package resolvable from `apps/api/dist/server.js`, so central API importer/runtime packaging must be verified too. Static `git diff --check` on owned source passed; this is not runtime evidence. Outer command bounds/evidence paths will be recorded at execution.

## Issue reproduction floor and full-task gates

ISS-W050-001: original wired guards made every child error `stage-failed`; prepared mechanical real-child status/diagnostic classification and wired retry count probes cover the same seam. ISS-W050-002: original heartbeat disabling mutant survived the short suite; the new >lease handler/competing claim proof must discriminate it. Any source mutation requires timeout, byte backup/trap restoration and comparison under repository rules; no mutation result is claimed here.

Full C2 still needs actual captured media/transcript/extraction/index and resolving retrieval/Ask in the authorized staging target. C3/C4 core mechanical process/lease probes passed in A; wired fresh/recovery continuity remains pending and A does not prove power loss or real long host/provider stages. C6 requires current child/tenant/proof/source integration evidence. C7 needs official Ask parity and API caller/packaged-runtime consumption. Legacy path/size fingerprint in-flight jobs need explicit safe operator repair, never silent replacement. Shared CI/type/build/validator and actual live/user prerequisites remain named until evidence exists.

Candidate source hashes captured before runtime:

Base HEAD: ed542fd01c870e5d5b64e1d72b413062d595f675. Full receipt: `qa/evidence/goal-t050/candidate-hashes.json`. New files have no tracked base; final candidate remains the shared working tree, not an isolated commit.

| Path | SHA256 |
|---|---|
| packages/core/src/pipeline-graph/graph-types.ts | 445dae35195a3b4aea4ba1397b8ac8a2ee7ed0459b8a6f639578ee742dca7280 |
| packages/core/src/pipeline-graph/pipeline-graph.ts | 8330db5a4884c4b90e26ec55c98a602e1e5acb90fd30021cf4f369dd14eaf347 |
| packages/core/src/pipeline-graph/session-run.ts | ec581415be5057e25ed8f85e56c0179894ba5222872361e98f696d946297aaa2 |
| packages/core/src/pipeline-graph/session-control.ts | e2939678063e2b355e35a9a1b78ba5e3566f864ba00637febc58920313ab97f7 |
| packages/core/src/pipeline-graph/session-control.test.ts | f8ac66149a90853de4e971c727e3da88197f51ed817a0251167492323bddeb35 |
| packages/core/src/pipeline-graph/session-run-controls.test.ts | 06fed45a3849df504f57d41e50ef2b4f977d198c114d359787fbbfe635e2487e |
| packages/core/src/pipeline-graph/session-restart.fixture.ts | 524d1d0a38803d4a46db492130416202a776b658a01e59096321c158f18c6b4d |
| packages/core/src/pipeline-graph/session-restart.real.test.ts | 2671d0b9a64b07bf80eac0c75a55fdcb4fd24e049c5d0662ce6535f1ba43b248 |
| packages/ask/src/ask-graph.ts | f9518a330fdf0324ef4952511187768adc4f48f6d856c6b1836a22e4562c1082 |
| packages/ask/src/ask-graph.test.ts | 2bf6f23420d54dfb1114b8a736d7a48fe4bbd58cb79dec0f8e73db88aa7c0116 |
| scripts/webinar/graph/graph-finalize.mjs | b1c73fc1747b59daf981ac0f0cb800fe54d0f68f56f5fba35bf11f8286b32607 |
| scripts/webinar/graph/graph-finalize.test.mjs | 44a8a1e13608ed4f55f4107dec79d59c3a07a8cf99da88f4f057a530c88cba2d |
| scripts/webinar/graph/stage-process.mjs | 74b751026d3e8b4f6928329682c254aae17ae39d2ef3b16315e3b944f93bb503 |
| scripts/webinar/graph/stage-process.test.mjs | 93573ba424e6bcb801e9cc9548b75e7bb98314c92991dd5b2b42d73acf828f07 |
| scripts/webinar/graph/proof-marker.mjs | ac185d1114b3199d945fd4038b7e6772f0dee7f4dbf4ec3244d73577565eccd6 |
| scripts/webinar/graph/proof-marker.test.mjs | f8af328f197fcb11320c2c68f7e30eaa79d41611ed3aba8e5776c59541d38baa |
| scripts/webinar/graph/graph-retry.test.mjs | 1957fb00143a046462f108f8b2319d49eacf0716d15ef6ec1154c52d54531b24 |
| scripts/webinar/graph/completed-session.mjs | 4226e4b701425a69a4865dafb0c08a394d7965151a9fbe9a067e80a9fcd123b3 |
| scripts/webinar/graph/completed-session.test.mjs | e823424def07ff0cb5900f5cba6606a57f388c5267bb5d0ba7d3d7edb42ec450 |
| docs/t050-pipeline-controls.md | 2cc4d8bcb3c03ca59663cac6fd7e5d9bbec9d5488c3f1bc6870722e986364b17 |
