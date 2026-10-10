# Bounded Ask budget refusal diagnostics

Status: checked-PASS
Fix cycle: 1
Checker verdict: qa/verdicts/bounded-ask-budget-diagnostics.md; VERDICT PASS, Cycle checked 1 (scoped diagnostics only)
Proposed repository path: qa/manifests/bounded-ask-budget-diagnostics.md
Scope: two runtime source files and one existing focused test file; safe refusal diagnostics and durable Job error persistence only.
Tier: 3, phase-one Ask implementation under the current user's full build request.
Authorization: root agent authorized the exact work-only draft and a separate sole integrator adopted the independently reviewed bytes on 2026-10-09. This records agent scope coordination, not human gold, threshold, canonical-schema or full-release approval.

## Behavior and compatibility

BoundedAskError retains its original code, reason and human-readable message. It additionally carries a frozen diagnostic object with an allowlisted reason and phase, safe known stage (unknown job kinds become `other`), numeric limit, attempted serialized UTF8 job bytes, dispatched call count, accepted input bytes and elapsed time from request start. Output refusal also records serialized output bytes. No raw prompt, query, completion, provider detail, stack, API key or environment value enters that object.

askV2 records a bounded refusal with diagnostics in the existing Job `error: string` field as a deterministic JSON envelope: `format: lkb.budget_refusal.v1`, the unchanged human-readable `message`, and `budgetRefusal`. Ordinary errors without diagnostic metadata retain the original error-string format. It then rethrows the same failure object. The public Ask route still exposes the same failure code/message. Actual Jobs API and frontend summaries omit ledger error payloads, so this does not replace visible UI error text with raw JSON. An operator reading the ledger uses the versioned envelope's `message` field; no schema, Job store interface or UI changes are introduced.

Existing admission priority and counters remain: dispatch ceiling, individual job byte ceiling, aggregate input ceiling, then START deadline. A refused input does not advance counters or invoke the provider; a refused output retains the already dispatched count. A sticky refusal rethrows the same failure on later attempts. Existing limits remain 12 completion dispatches, at most 24 visible two-chain adapter attempts, 64 KiB per complete serialized job, 256 KiB aggregate input and four-minute START deadline only. In-flight timeout is separate. Source admission, router/evaluator/thresholds, citations, packed evidence and public output contract are unchanged.

## Exact source adoption

- packages/ask/src/source-context.ts: dcade272158e42c726237cad99ffc1872f3bfe630657cf1ba46e7b849d709591; prior 27402b3e0f23aa74e79afd2a296a6a9f4c88e43c210b52375f2603f46a8267dc
- packages/ask/src/source-context.test.ts: 8585c402efad1ef0102c718f5f2b87f6aa0bb3c46e0d6154de3827c678c48a29; prior 731a933b2a8909f046e490040240938f40ee0fac7b02f58a7f7f6c706f6a9ab9
- packages/ask/src/ask-v2.ts: a9050358895705b604b0e7e303c30e087263671428d6136aae0a16eb631b9e26; prior 2a795cf8b0cb45ac6f3c5cc7298c66cf14a7b3db2f89af31080d8ec896b56629

Work draft freeze: work/ask-budget-refusal-diagnostics-draft/candidate-freeze-v2.json SHA256 1aca107811c7d7f8580d1c8fe36f28c3c3560d7dc9faab95f7c5eecd835c8e48.
Reviewed patch: work/ask-budget-refusal-diagnostics-draft/budget-refusal-diagnostics.patch SHA256 3c2a66aaab79cffedadbeff723196de11aa70911a7db625a0729ebf877b8a9f8.
Independent pre-adoption review: work/ask-budget-refusal-diagnostics-review/independent-checker-proof.json SHA256 24827d3695caeefb3c56773fafda25870d6c55f37f3ce648c8364af0972b4496.
Actual source adoption: work/ask-budget-refusal-diagnostics-review/adoption-receipt.json SHA256 59103817a189aab66015f555b993cd5b5d6755b259148eff1fba78a5f67cba5d.

## Executed evidence

Maker focused draft: 18/18 PASS, zero failures/skips; actual askV2 with injected fake Job store persists the safe envelope, retains the original thrown message/reason, and invokes zero completion calls for oversized input. Actual Ask compiler overlay: 23 roots, zero diagnostics, no emit. Candidate resolution was recorded against the exact three draft files; unchanged dependencies came from the installed repository.

Independent pre-adoption focused suite: 18/18 PASS, 574.7658 ms. Actual API compiler graph: 87 roots, zero diagnostics. Real route/client error consumers were inspected; no live HTTP compatibility claim is made.

Actual adopted source command: `node --import tsx --test --test-concurrency=1 packages/ask/src/source-context.test.ts`: 18/18 PASS, zero failures/skips, 723.0473 ms, tool chunk 4632c6. Actual adopted API typecheck: `node node_modules/typescript/bin/tsc --noEmit -p apps/api/tsconfig.json`: exit 0, tool chunk 233ff1, no emit.

Focused cases cover UTF8 byte admission, unknown-stage redaction, frozen metadata, unchanged dispatch/aggregate/deadline counters, sticky refusal identity, output refusal after one real fake dispatch, and actual fake Job-store failure persistence. Existing dense 384-strip refinement still judges all strips in three jobs with unchanged 18,486 / 18,398 / 9,165 byte payloads. Original Unicode fixtures and line endings are preserved.

## Limits and open acceptance

This unit records safe future failure details; it cannot reconstruct missing historical case25/Grade8V1 rejected phase or byte counts. No passage-selection change, seven-query inference, native Ask replay, real database write, runtime compilation/restart, browser or provider call occurred in this validation. Existing historical 44-pin serving proofs remain historical; a new source pin map is not serving-runtime acceptance.

Full Ask, six admitted-session passage gaps, full23/29 semantic quality, human gold/thresholds, web/off-corpus acceptance, Ubuntu/live-source acceptance, master merge, production and global95 completion remain open. No roadmap counts or original corpus bytes changed.

Maker requests a matching dedicated Cycle1 checker verdict on the actual adopted hashes. This work-only proposal remains unchecked and must not be copied or closed as checked-PASS by the maker without root-authorized integration and independent verdict.

## Independent adopted-source close-out

Independent checker /root/goal_checker rehashed the actual three adopted source/test files and their retained preimages. Matching Cycle1 scoped verdict is prepared at qa/verdicts/bounded-ask-budget-diagnostics.md. Exact postcopy/source-pin proof: work/budget-source-and-readonly-v5-checker-proof.json SHA256 76a618cce8b0050aeb37e02d085f3d2a2b3aed86570f830cba4dc7c928a40073. It verifies all44 current sources: only the separately accepted production integration and these three budget files differ from historical serving pins; the other40 remain byte-identical. Existing accepted 18-case and API87-root evidence was attributed rather than repeated.

This source close-out is separate from the V5 offline launcher review in that proof. V5 has not been started, historical API14192 remains old compiled, and root must independently authorize any controlled owned restart. No additional native/model/query/database/web action or full Ask/gold/global acceptance follows from this close-out. The original maker ready-for-check proposal is preserved byte-exact in the task work area (SHA256 4cfb06281efb17dca8905246e2335f524ad76fec52a6addd82bc225a83951a18). The sole integrator copies this pair serially; this checker has not changed Desktop QA or source files.
