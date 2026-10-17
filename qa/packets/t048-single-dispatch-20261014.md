# Checker packet — t048-single-dispatch-20261014

Cycle 0. Manifest: qa/manifests/t048-single-dispatch-20261014.md. Candidate READY after attributed
central maker execution below. Checker: /root/docker_dependency_review/checker_t048.
Paired scoped verdict path: qa/verdicts/t048-single-dispatch-20261014.md, Cycle checked 0.
Full-parent qa/verdicts/goal-t048.md HOLD must retain C1/C6/C7 gates regardless of this slice.

Authority D-170; D-162 default-OFF preserved. Task tier3. Ground truth qa/contracts/goal-t048.md
C2–C5 only. Writes and credential handling require full independent checking. No live provider,
database, browser, host activation, default promotion, human comparison or index acceptance.

## Exact candidate

Owned final source hashes and tracked base hashes are in the manifest table. Five owned source,
test and doc paths; new files have no prior base. Existing historical packets/verdicts untouched.
No QA contract writes by maker. Sources were rehashed on resumed run and remain unchanged.

Dependency pins at resumed preparation:

| Path | SHA256 |
|---|---|
| scripts/lib/transcription/transcript-qa-generation.mjs | A3C01DF4E602078E8C61E1744C7E75CFE3C39326A9A7C7798D8A1655E51530B5 |
| scripts/webinar/validate/transcript-qa-binding.mjs | 2384B5E2E355957D8097A46A15016BAF91CD1B7ED86ED3BE7588104CB79356D8 |
| scripts/webinar/validate/transcript-qa-binding.test.mjs | D4979907EC5583FB818F196590ED82256327873A527382FE5D9CF967BB64CEB3 |
| scripts/webinar/validate/validate-session.test.mjs | A8E86BBB59252C483CC213EE9BAA6D0C9C58BA661AAA2AB85ECFF7053E6C1AB1 |
| scripts/webinar/validate/validate-session.mjs | BD0D2EE2A44BC94867447C29B1409953D2C88F66BD0B1EB6A74F48096D24F6EE |
| scripts/lib/transcript-provenance.mjs | BD2570803FFBEA67DB375EFB16D02F7374533AD2B27C4F700F7543B60745B301 |
| packages/ai/src/stt/chunk-audio.ts | D85F0413BA027506BCC9D45A4499A365EC80DB64175DBE3D722EB042D453F997 |
| packages/ai/src/stt/transcription-plan.ts | 131E616B1C4237536E3DB7D30D6D73EED2C0C67BF0697D82E10830279F7159B4 |
| packages/ai/src/stt/transcript-qa.ts | 06CC4DDF32B2EC80899ED2E3ABC0F6CD179BAF240C485C47B93FDB542E17C9BC |
| scripts/lib/transcription-wiring.mjs | DB487E94F01993ECBBA94C8A313414A6489F1090DB2964A27F66F4A53D0A676B |

T044 helper/evaluator/validator are independently owned; central writer may change watcher
routing and validation callsites. Rehash dependency pins before execution/acceptance.
Pre-launch broker identified and paused for the legitimate T044 binding change. Maker reviewed
the exact committed timing check: even overshoot within clamp tolerance now refuses admission.
Binding/test pins above were refreshed; the five owned source pins remain unchanged. These two
T044 test files are dependency reference pins, not extra tests in the requested T048 batch.
Maker freezes this source/dependency set for the queued27-case run; no edits or duplicate local
execution until the broker releases that run or reports another dependency change.

## Review map

`scripts/lib/transcription/recording-dispatch.mjs` calls singleAttempt exactly once, accepts only
complete result, otherwise discards its turns and executes plan fallback chunks. Failure code is
fixed, not the provider payload. Bad/empty chunk boundaries refuse success.

`scripts/transcribe-long-session.mjs`: source audio -> owned snapshot -> snapshot hash and actual
duration -> initial whole-file transcribeSpanOnce (never transcribeSpan) OR bounded chunk
transcribeSpan -> mergeChunkedTurns -> source hash stability check -> timing/gap/tail checks ->
QA shape/count preflight -> pending failed validation -> existing transcript generation writer ->
actual committed bytes -> atomic QA/path artifacts. Snapshot/temp artifacts clean up in finally.
`countedTransport` counts actual upload/poll/generate protocol calls without recording URLs.

QA attempts use unique single/cN/tail attempt IDs. Only selected complete attempt, or selected
best prefix plus returned tail, is accepted. Rejected initial single never contributes to fallback
counts. buildTranscriptQaGeneration checks selected output count against merged input.
Input audio and committed turn hashes establish generation identity. Atomic sidecars preserve old
bytes on publication failure; explicit pending validation prevents old clean verdict reuse even if
writeTranscriptGeneration returns early for identical canonical turns.

## Focused execution

Cwd C:/Users/product/Desktop/KnowledgeBase. Fresh serial CPU broker /root/docker_checker owns
execution after runtime dependency/T051 checks. No old lease reuse; no independent parallel runs.

`node --test --test-concurrency=1 scripts/lib/transcription/recording-dispatch.test.mjs scripts/lib/transcription-wiring.test.mjs`

27 node:test cases:4 dispatch tests and23 shared/helper/fake CLI tests. Provider, dotenv,
ffmpeg/ffprobe and network transport are intercepted in CLI fixtures. Child commands timeout30s.
Outer focused batch requested timeout240s; actual broker execution timeout120s (receipt below).
Fixture tests use privately fabricated credentials, never a developer env file. Native TS loading
and root tsx dependency must be available. No current subprocess restriction is demonstrated for
this candidate; record actual environment outcome rather than assuming a prior unrelated result.

Meaningful driver probes: exactly1 initial request; 5400s inclusive; initial incomplete output gives
1+2 requests instead of hidden full-span retries; malformed/empty/gapped/leading/invalid result
fallback; chunk transient error retry bound; chosen prefix/recursive tail evidence; both-path
refusal preserves prior turns/QA/path/validation; source-change refusal before artifacts; identical
turns with newly suspicious QA invalidate previous validation; injected atomic QA rename failure
preserves prior sidecar and removes temp files.

Immediate consumer: actual evaluateTranscriptQaGeneration over committed fallback bytes and
selected reports passes clean output; same-count changed text bytes refuse hash mismatch.
This is a local exact-artifact consumer check, not full-parent actual Mongo indexing/citations.
Actual watcher short-QA routing, validate-before-seed, canonical durable privacy receipt locator
and trusted public-interval coverage remain central integration prerequisites.

No matching T048/single-call issue reproductions in union qa/issues*.jsonl; no mutation run.
Reviewer previously identified audio hash TOCTOU, now corrected by immutable snapshot + source
stability refusal; read-only follow-up found no further actionable reviewed boundary issue.

## Evidence

Actual central maker receipt: qa/evidence/goal-t051checker-broker-t048.json.
Program C:\Program Files\nodejs\node.exe; exact args shown above; cwd repository root;
timeoutMs120000. UTC2026-10-14T20:02:14.348Z→20:02:20.540Z. Exit0,27/27 pass,
0 fail/skip/cancel; TAP6083.083ms, wall6186.5432ms. All15 pins unchanged before/after
and rechecked after receipt. No maker-side duplicate run or real provider/media/DB operations.

Immutable evidence hashes:

| Path | SHA256 |
|---|---|
| qa/evidence/goal-t051checker-broker-t048.json | 587DFD9E917423B8951DD9FCCABDAE29CA28841057DB913905BB81AEF97361F9 |
| qa/evidence/goal-t051checker-broker-t048.stdout.txt | 07BA7D5EBCBB9B4A8132F80139F1DDD2A18C81E606589DCBD9A7945CDD08DF7B |
| qa/evidence/goal-t051checker-broker-t048.stderr.txt | E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855 |

stdout records27 tests/27 pass/0 fail/0 cancelled/0 skipped/0 todo; stderr empty. Consumer
probes passed over real committed fixture bytes: clean fallback generation admitted; same-count
changed bytes refused; suspicious accepted QA refused; selected prefix/tail output counts conserved.

Earlier independent frozen-contract receipt qa/evidence/t057-ops-health-key-boundary/contracts-receipt.json
records `python contracts/verify_contracts.py`, exit0,0.1467932s at2026-10-14T09:02:33Z.
Output records PASS by vacuity (no frozen stages). Current stages:{} confirmed read-only;
this does not certify any empirical stage and is not attributed to the T048 broker command.
Fresh global verifier remains central-owned. Independent checker verification remains pending;
no scoped PASS or full-parent T048 completion claimed by maker.
