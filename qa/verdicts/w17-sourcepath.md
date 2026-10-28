# Verdict - w17-sourcepath

VERDICT: PASS
Cycle checked: 1
Reviewed SHA: 121290ba20a169e425725c1245369f99d62595a7
Base SHA: a0391420
Contract: qa/contracts/goal-t055.md C6 (no local source.path leakage)
ISSUES-WRITTEN: none
Ledger rows may be flipped: yes (the row(s) tied to goal-t055 C6 / w17-sourcepath).

## Independent checks
1. Path grep (apps/api/src, non-test): no route response maps path/filePath/localPath/absolutePath/storagePath from source or capture
   records. Remaining hits are server-side only: brain.ts:77-85,166,199 (media confinement + sendFile, not serialised),
   whatsapp/review (internal group jid), ui-shell NAV_ITEMS, request-log. The only route returning Sources rows was `/sources`
   (brain.ts:218), now projected. Internal `artifacts()`/`mediaAsset` use `deps.listSources` unprojected, so media serving is unaffected.
   trusted-readers.ts listSources already strips tokens/proofs but did not strip `path`; the new projection sits after it. POST /ingest and
   WhatsApp ingest return only {sessionId, sourceId, turnCount}. `/knowledge/resources` allowlist already excluded path (tested).
2. tenantId / consent.recordedBy: tenantId is the caller's own tenant (auth-scoped); not sensitive. recordedBy is an attribution label
   (e.g. "ops"), and base already returned it (trusted-readers projects the same two consent fields). No new exposure versus base: the
   output is a strict subset of base (also drops sourceMeta, consent.note, extra keys). `given` is coerced to a boolean.
3. SourcesPage.tsx: line 28 `[kind,url,path].some(v => v?.toLowerCase()...)` is optional-chained, so undefined is safe. Line 71
   `s.url ?? s.path ?? "(no location recorded)"` shows the fallback label. types.ts has `path?: string`. Degrades gracefully, no crash.
   Web follow-up (remove path reads) remains optional.
4. Commands (outputs in session scratchpad w17sp/):
   - brain.test.ts (--test-force-exit): 11/11 pass, rc 0.
   - privacy + brain together, no --test-force-exit (repo `pnpm test` form): 13/13 pass, rc 0.
   - tsc --noEmit -p apps/api/tsconfig.json: rc 0.
   - privacy test alone with --test-force-exit: both tests pass, but the process dies with a Windows libuv teardown assertion
     (`UV_HANDLE_CLOSING`, async.c:94) and node reports the file as failed (rc 1; reproduced 3/3 and in the combined run). Without
     --test-force-exit it is green. The repo's own test script does not use the flag. Treated as a harness artifact, not a product fault.
5. D-020 mutation: added `path: (row as any).path` to publicSourceView with byte backup, timeout 600 and a trap. Test failed 1/1 with
   "response contains a planted path" (killed). Checker harness defect: the function `cd`-ed and the restore used a relative path, so the
   automatic restore failed. I restored manually from the backup with absolute paths. cmp OK, and
   git hash-object brain.ts = 54042d2c5b57477e9e70365b70724b08d1de1878 = HEAD blob; git status clean.

## Notes (not issues)
- `url` is kept whenever credential-free http(s), so a token in the query string would still be echoed. This is not a path and was also
  exposed at base.
- /sessions/:id turns carry relative `screenEvidence.file` ("screen-frames/<id>/frame-N.jpg") - relative artifact names, out of scope.
- Not verified: apps/web tests (static read only), real Mongo, lint-loc.
