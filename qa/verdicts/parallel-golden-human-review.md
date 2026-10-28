# Parallel golden human review packet

VERDICT: PASS
Cycle checked: 0
ISSUES-WRITTEN: none

Scope: bounded human review packet only. Acceptance contract: qa/contracts/parallel-golden-human-review.md. Packet SHA-256: 44432ab2717ba807a4ed066d346280156f4a671d172524f1ab009b116811677e.

EXPLANATION: Independent downstream JSON consumption verifies exactly six recorded misses in report order, eighteen exact id/question/expected-session joins, three input-byte bindings, twelve current transcript-byte bindings, and twenty literal excerpts. Expected and best-rival IDs, historical scores/margins/ambiguous rivals and dates match source reports exactly. Offsets use UTF-16 code units; turn hashes bind serialized parsed turn metadata and text. All human adjudication, answerability, approval and gate fields remain unanswered. Candidate excerpts are explicitly incomplete; historical embedding evidence is explicitly separated from current transcript bytes. This PASS does not certify unique answers, approved golden labels, threshold changes, human gate closure, retrieval acceptance or full T-021 completion.

## Executed evidence

Working directory: C:\Users\product\Desktop\KnowledgeBase

```powershell
& 'C:\Users\product\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' qa/verdicts/parallel-golden-human-review-check.cjs
```

Exit code: 0. Wall time: 0.4302274 seconds. Checker code independently authored under qa/verdicts/parallel-golden-human-review-check.cjs; no builder generator imported, historical diagnostic rerun, DB/model/browser operation or source mutation.

Result fields emitted:

```json
{
  "result": "PASS",
  "cycle": 0,
  "packetSha256": "44432ab2717ba807a4ed066d346280156f4a671d172524f1ab009b116811677e",
  "cases": 6,
  "joins": 18,
  "inputBindings": 3,
  "sourceBindings": 12,
  "excerpts": 20,
  "humanFields": "unanswered",
  "historicalScores": "exactly preserved; not rerun"
}
```

Per-case output (id suffix; exact historical margin; verified excerpts): Atlas gq01 -0.0456 / 3; Atlas gq03 -0.0455 / 3; In Focus 2026-05-28 gq03 -0.0414 / 4; entrance exams 2026-06-19 gq01 -0.0849 / 3; CEPT 2026-07-22 gq01 -0.0551 / 4; Ashoka 2026-08-12 gq04 -0.0386 / 3.
