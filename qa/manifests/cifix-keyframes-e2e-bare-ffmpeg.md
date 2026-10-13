# Manifest: cifix-keyframes-e2e-bare-ffmpeg

**Handshake status:** checked-PASS
**Fix cycle:** 0
**Lane:** lane/cifix

## Scope
CI (`.github/workflows/ci.yml`, step "Unit tests", `pnpm -r test`) fails on runs 38350801646 and 38351914534 (same HEAD lineage) in `@lkb/core`:
`end-to-end on a generated 8 s video (real ffmpeg)` -> `KeyframeExtractError: LKB_FFMPEG_PATH must be an absolute path` (ffmpeg-args.ts:31).

Root cause is the TEST, not the product: on CI ffmpeg is found on PATH, so `REAL` is the bare string `ffmpeg`; the test then sets `LKB_FFMPEG_PATH=ffmpeg`, which `resolveFfmpeg` correctly refuses (relative -> bad-config; asserted by another test in the same file). Locally REAL is an absolute path, so it passed. The workflow is fine; no test weakened, product code untouched.

Earlier runs (2026-10-10, 38081827789 / 38074530779) failed at `@lkb/web` vitest; logs expired of detail (UNKNOWN STEP) and web did not fail in the 2026-10-13 runs.

## Files
- packages/core/src/keyframes/keyframes.test.ts: set LKB_FFMPEG_PATH only when REAL is absolute; otherwise remove it from env so resolveFfmpeg falls back to PATH `ffmpeg`. All assertions unchanged.

## Criteria
1. Test passes on a runner where ffmpeg is bare-PATH. 2. bad-config assertion (relative path refused) still present and passing. 3. No workflow/secret changes.

## Evidence
- `node --test --import tsx src/keyframes/keyframes.test.ts` (packages/core, local): tests 10, pass 9, fail 0, skipped 1 (e2e skips: no local ffmpeg, so the fixed branch is NOT exercised locally; checker should confirm on CI).
- `tsc --noEmit -p tsconfig.json` (packages/core): clean.
- Caveat: pnpm -r stopped at the core failure, so other packages' CI results after it are unseen.
