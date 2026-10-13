# Verdict: t034next
VERDICT: PASS
Cycle checked: 0
Checker: independent (Sonnet 5.5). Note: no qa/contracts/t034* exists; checked against the manifest's stated behaviour and the brief.

EXPLANATION:
- Flag-off identity: with guard undefined, chunkCap = MAX_CHUNK, catch returns 400 as before, launch skips the id/path checks, and record-commands spreads {} (an empty object). Only `guard &&` conditions were added. Env table (unset, "", "0", "true") gives no guard.
- 413 path: an oversize chunk throws from body() before any write, so nothing lands (test asserts size 0). Total-cap breach returns 413 before writeSync, so no partial chunk is written. capture-error sets status failed (tab-browser.ts:192), and the final status is derived from run.failure, which throws, so a capped capture is never marked stopped or complete. A later in-cap chunk can still be written after a total-cap 413, but the run is already failed and failure is sticky.
- Byte counting: counted from the streamed body (`for await`), not from Content-Length, so chunked uploads and a missing Content-Length cannot bypass it. The exact cap boundary is tested.
- Auth and bind: the 403 origin and token check, `listen(0,"127.0.0.1")` and the timeouts are untouched in the diff.
- Path containment: the output name is generated (tab-<ts>-<hex>.webm), so only recordDir is operator-supplied. The helpers reject `..`, absolute paths, drive letters, ADS colons, UNC and backslash separators; assertInsideDir rejects siblings with the same prefix. Symlinked recordDir is not realpath'd. This is a low observation (the dir is operator-chosen) and is not filed. Symlink tests EPERM on this Windows host.
- Gaps (notes only): the guard is not exercised through runRecord end to end; no real Chrome run.
- Evidence: `node --test --import tsx "src/**/*.test.ts" "py/tab-capture/*.test.mjs"` gives tests 869, pass 865, fail 2, todo 1. The 2 failures are the known symlink EPERM tests (record-backend and tab-browser; re-run in isolation, same EPERM). tsc --noEmit exit 0. lint-loc --all: OK (10 stages, 0 failed).
- Mutations (hash-verified, per-mutation restore, run on tab-receiver-guard.test.ts): 6 of 6 killed (>= total cap, total check disabled, chunk cap loosened, 413 changed to 400, startsWith(root) without sep, session-id check removed). End hashes of tab-browser.ts and tab-receiver-guard.ts equal HEAD blobs.

ISSUES-WRITTEN: none
