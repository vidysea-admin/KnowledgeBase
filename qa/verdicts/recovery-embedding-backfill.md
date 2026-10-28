# Recovery embedding backfill — independent checker

VERDICT: PASS (scoped Cycle 2 owned helper grouping only)
Cycle checked: 2
ISSUES-WRITTEN: none

Cycle 2 covers only moving the embedding helper and its colocated test into `scripts/lib/toc`, plus the CLI import adjustment. It does not authorize or repeat an embedding job, seven-query diagnosis, DB mutation, service restart, source recovery, or semantic evaluation.

Current reviewed SHA256 identities:

- `scripts/lib/toc/toc-embedding-backfill.mjs`: `c1049ffa9a1a061312ae1afa53a44356eb3534f9e053548c8952157d1cce45c1`
- `scripts/lib/toc/toc-embedding-backfill.test.mjs`: `28a71e59fac87a4b51958f5a1c0ad65913aff977808f020068f73cffe6d19856`
- `scripts/backfill.mjs`: `7f743c7deae4b417ddd5edfcc54453de92f05137e7f4924eb379d2607cc90ab5`
- Maker request manifest at ready-for-check/Fix cycle 2: `f96c860ef8fd6f66bbc6f286fbd24997916e195ca4912265f63f12cf953bce85`

Independent reversal of exactly seven helper import substitutions reproduces the approved original helper hash `4ca19852fd7e8d4fb2dcef6c1873105c413c96b767fc00df150419851081bd8f`. Reversing the one CLI substitution reproduces `b127a049ff9eae480cf38c295d744df7e91f82f66496516f7d9ad32c97ee9dd5`. The moved test is byte-identical; all seven targets resolve to the original modules; old-path stubs are absent. The helper imports without invoking its runner. All 44 serving/runtime pins match the independently accepted diagnostic V2 inventory before and after checks; the Ask route test remains at its accepted path.

Independent affected-stage command: Node 24 `--test --test-concurrency=1 --import tsx packages/index/src/chunk/source-spans.test.ts packages/ai/src/providers/ollama-boundary.test.ts scripts/lib/toc/toc-embedding-backfill.test.mjs`. Result: 19/19 PASS, zero failures/skips, 961ms command wall. The actual downstream `scripts/backfill.mjs recovery-chunks --dry-run --packet` CLI resolves the relocated helper and refuses the missing value; injected counters record zero DB connection and fetch attempts. Attributed maker evidence adds three syntax checks, all-target resolution, and missing/nonexistent packet plus missing-resume-digest CLI refusals: eight checks PASS, zero connections/fetches, no receipt/lock. The first independent wrapper parsed Node's reporter incorrectly despite all 19 tests passing; only the checker parser changed, then the command completed successfully.

The actual `looseFiles` direct-file definition and unchanged structure configuration yield `scripts/lib` 30/30 and `scripts/lib/toc` 2/30. `apps/api/src/routes` remains 32/30, independently HOLD. No global structure or release PASS is inferred.

Historical Cycle 1 manifest `23bde7648df6ca852d4be37b0838bd9010c2df11cc5ee8fbc102d5ad759abea9` and verdict `be330f64a5103d54bdc3e6025ecef6b4f8cb67a988a7b7dd8f49dd62350899d6` are retained byte-exact under task `work/grouping-history-cycle1`. Existing 2905-vector terminal receipt `13943d346154a643c61adcad934c86c79f4ed95c94b19fae12615f9b2d445d31` and independent reconciliation `fbb383663b8fb09461d4f08f80569d86914e28a27e8d18d50c449e6d5ab5ef49` are unchanged historical evidence, not a new execution claim.

Current independent proof: task `work/embedding-grouping-cycle2-checker-proof.json`, SHA256 `cbf2b1d52b9e3752df599c1f063d56f8ad6ece42a0e30bdf39d87b4afa0f4374`. Maker proof `f668e24ba6d798424af2d471df7ea47a1ea9ef7b62dcf8ce6cf80f44d15cdd42`; maker CLI/syntax proof `26393cbd33b6bf14f5534828df27aec82d46982c40bedb026435f4ce2ce98923`.

Full Ask/hydration, web, human gold, global quality and release remain HOLD. This verdict changes only the matching Cycle 2 file handshake; historical claims, shared ledgers, runtime gates and other owners' files remain untouched.
