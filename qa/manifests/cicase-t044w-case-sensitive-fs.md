# cicase: transcript-qa-report alias test portable to case-sensitive filesystems

**Handshake status:** ready-for-check
Fix cycle: 0
Lane: cicase (lane/cicase). Issue: none new; repairs CI run 38368689367 (Linux) failure of the ISS-T044W-001 test.

## Scope
Test-only. `packages/ai/src/stt/transcript-qa-report.test.ts`, test "alias variants through the library". Production `isSameFile` is already platform-gated (case-folds and strips trailing dot/space only on win32) and is correct on Linux; unchanged.

## Change
The test probes the temp dir (create file, check uppercased path exists). "upper case" expects refusal only on a case-insensitive fs; on a case-sensitive fs it is a distinct file: write must succeed to that path and the input stays byte-identical. "trailing dot"/"trailing space" are likewise distinct files off win32 (same latent Linux failure, would have failed next). All other cases unchanged.

## Criteria / evidence
- File: 15/15 pass on Windows (`node --test --import tsx src/stt/transcript-qa-report.test.ts`).
- Full packages/ai: 217 tests, 217 pass, 0 fail.
- Mutation (isSameFile -> `a === b`, backup restored in finally, hash == HEAD blob 6ad07635): 2 tests fail, caught.
- Linux not run locally; CI re-run is the confirmation.
