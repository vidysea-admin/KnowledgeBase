# Checkpoint iss390-packet-crlf-drift (checker, cycle 0, 2026-10-26)
Candidate: head f17cfda6 (code commit c89d7268), base 0573214e. Blobs: .gitattributes 39c37220, scripts/eval/extraction-review.mjs 2fbdcf26 (identical at base), scripts/eval/extraction-review.test.mjs c78aeb02, data/eval/extraction-draft-review/index.json 1428cc10 (unchanged).
Environment: node v24.13.1, win32, bound tree core.autocrlf=true (global); clones set core.autocrlf explicitly per clone. Scratch: scratchpad c390/{head,base}-{true,false}, s-batch, s-packet, s-turns, fal/c3.
- Harness run.mjs: extraction-review.mjs copy with only the `loadManifest` import stubbed; `loadBundle(root)` unmodified.
- loadBundle: bound tree OK 72; head autocrlf=true OK; head autocrlf=false OK; base autocrlf=true packet-drift; base autocrlf=false batch-drift.
- node --test --import tsx --test-name-pattern=ISS-390 scripts/eval/extraction-review.test.mjs (bound tree): 2/2 pass.
- Full file run (bound tree): 13 tests, 12 pass, 1 fail (line 77:58, stageGaps raw stage). extraction-stage-receipts.test.mjs: 3 tests, 2 pass, 1 fail (undeclaredDirectories 0 vs 2).
- Falsification: CRLF packet in copy -> packet-drift; batch-01 rule removed (autocrlf=false) -> batch-drift; packet rule removed (autocrlf=true) -> packet-drift; in-focus-4 turns rule removed (autocrlf=false) -> source-drift. Each green before.
- bridge() under autocrlf=false at head: corpus-drift (data/eval/extraction-corpus.json has no eol rule) -> ISS-399.
Result: PASS (scoped, tier L, one checker). Original checker: this session.
