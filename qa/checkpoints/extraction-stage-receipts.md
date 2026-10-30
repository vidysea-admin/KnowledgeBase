# Checkpoint: extraction-stage-receipts (checker, cycle 0, 2026-10-26)

Commands and scope: `node --test --import tsx scripts/eval/extraction-stage-receipts.test.mjs` (3 tests, 0 skipped); `node --import tsx scripts/eval/extraction-stage-receipts.mjs`; `python -B contracts/verify_contracts.py`.
Code hashes (LF-normalised, equal HEAD blobs): extraction-stage-receipts.mjs 6465571a1d52cb2ba3babf187ca4884913d3e005ea89dcee27ccec451b39d17c; extraction-stage-receipts.test.mjs 1808871b284d4bc852ea0a666994f7a0257cbc0f3f4844a7fa70eae46ff58c31 (git blobs 231f6107..., 95f44455...).
Environment: node v24.13.1 win32, tsx from workspace node_modules, git core.autocrlf=true, HEAD a8d3c0f4.
Data identity: pins matched raw only with per-file EOLs (packet LF; batches, index, corpus, toc-migrated turns and claims CRLF). The bound tree packet is CRLF -> packet-drift.
Results: bound tree 2/3 pass (test 1 packet-drift); faithful copy receipt as in the verdict; 8 floor falsifications each red on the intended assertion (test lines 7, 13, 18, 9, 20, 20, 27, 36); validator exit 0 by vacuity.
Attribution: checker agent, verdict qa/verdicts/extraction-stage-receipts.md.
