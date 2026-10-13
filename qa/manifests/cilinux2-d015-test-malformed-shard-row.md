# cilinux2-d015-test-malformed-shard-row

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: CI break (main red on GitHub run 38369705993). Class: test-only change, no auth/tenancy/data write. Lane: lane/cilinux2, shard `qa/issues.cilinux2.jsonl`.

## Root cause (not CRLF, not platform)
`speaker-name-rules.test.ts` "D-015 ... byte-faithful" (line 200) read EVERY line of every `qa/issues*.jsonl` shard and `JSON.parse`d it. `qa/issues.webhigh.jsonl` line 2 has an invalid escape (`SyntaxError: Bad escaped character in JSON at position 670`), so the test threw before it reached the ISS-104 row. It fails identically on Windows main tree (`ℹ pass 109 ℹ fail 1` before the fix), and in a fresh `core.autocrlf=false` LF checkout. Index blobs of the ledgers are already LF; `.gitattributes` unchanged, no renormalization needed, no diff beyond the test.

## Fix
Test only parses lines matching `"id"\s*:\s*"ISS-104"`. A malformed ISS-104 row still throws. The guarantee is unchanged: the 20 recorded reproductions are extracted from ISS-104's evidence and `deepEqual`led, in order, to the in-file corpus (ISS-104: 20/20). The malformed webhigh row is filed as ISS-CILINUX2-001 (not edited).

## Files
- packages/index/src/pipeline/speaker-name-rules.test.ts
- qa/issues.cilinux2.jsonl, this manifest

## Evidence
`cd packages/index; node --test --import tsx src/pipeline/speaker-name-rules.test.ts`: before ℹ pass 109 ℹ fail 1; after ℹ pass 110 ℹ fail 0.
Full packages/index (`src/**/*.test.ts`): ℹ tests 635 ℹ pass 635 ℹ fail 0.
