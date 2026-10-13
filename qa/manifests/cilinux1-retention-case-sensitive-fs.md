# cilinux1: retention report tests portable to case-sensitive filesystems; outside-root guard made separator-independent

**Handshake status:** ready-for-check
Fix cycle: 0
Lane: cilinux1 (lane/cilinux1). Issue: none new; repairs GitHub CI run 38369705993 (Ubuntu), packages/ingest retention tests.

## Scope
Files (all under packages/ingest/src/retention/):
- `retention-report-media.ts` (PRODUCTION, +14): new exported `climbsOut(rel)`; `probeMedia` calls it before any filesystem call.
- `retention-report.fixtures.ts`: `fsCaseInsensitive()` probes the real temp dir (write file, test upper-cased name).
- `retention-report/shared.test.ts`, `retention-report/signals.test.ts`: expectations follow the probed filesystem.
- `retention-report.media-escape.test.ts` (new): `climbsOut` table and a probe test with a trapping io.

## Findings
1. CI guards.test:53 (`..\..\outside.webm` -> expected media-path-outside-root, got media-not-found). PRODUCTION GAP, fixed. The outside-root check was already before the existence check, but it used `path.relative` with the platform separator. On Linux `\` is a filename character, so the stored Windows-style path resolved inside the root and was reported "not found". Security ordering requires outside-root be refused whether or not the file exists, and stored paths come from Windows-origin data. `climbsOut` splits on both `/` and `\`. Behaviour on Windows is unchanged.
2. CI shared.test:38, :71 and signals.test:91: test-only. Production is correct: off win32 `pathKey` is exact-case and the inode key distinguishes files, so on a case-sensitive fs `k/Case.webm` and `K/CASE.WEBM` are two genuinely different files, each needing its own decision (k1 ELIGIBLE, k2 KEEP). Tests now expect that when the probe says case-sensitive, and the merged result when it is case-insensitive. signals gained a `case-only` row proving a different-case artifact does not veto another file on a case-sensitive fs.

## Evidence
- Full packages/ingest: 342 tests, 342 pass, 0 fail; tsc --noEmit clean (exit 0).
- Retention files, Windows (case-insensitive branch): 25/25 pass.
- Case-sensitive branch NOT run on real Linux. A case-sensitive NTFS dir (fsutil setCaseSensitiveInfo) was tried: probe returned case-sensitive, but production gates folding on `process.platform === "win32"`, so Windows still merges there (conservative direction, safe); that setup cannot emulate Linux. CI re-run is the confirmation.
- Mutations (per-mutation byte backup, restored in finally, hash == final blob 0aadb65a): `depth <= 0` -> `depth < 0`: caught (1 fail). Backslash split broken: caught. Drop the `climbsOut` call in probeMedia: NOT caught on Windows, because `path.relative` already catches `\` there; only a Linux run exercises it (stated honestly).
