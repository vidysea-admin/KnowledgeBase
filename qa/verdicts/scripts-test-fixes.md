# Verdict - scripts-test-fixes

VERDICT: PASS
Cycle checked: 0
Checked commit: 623c35d1 (lane/scriptsfix, base 3647a4a4). Checker: independent subagent, 2026-10-13. Main compared at c9fae49a in a fresh detached worktree (main tree untouched).

## EXPLANATION
1. Test diffs. No assertion removed or weakened.
   - packet-snapshot `fixture()`: one added `mkdir -p`. MUTATION: removing it in a fresh worktree (no .cache/coordination) gives tests 30, pass 1, fail 28, `ENOENT mkdtemp .cache/coordination/packet-fixture-XXXXXX`. With it: 29 pass, 1 skip, 0 fail. The mkdir is load-bearing.
   - packet-snapshot inventories test: skip only when any of the three real `.cache/coordination/*-cycle-0/inventory.json` is absent; the body is unchanged and runs when all exist. Legitimate: those are git-ignored, machine-local artifacts, so the test cannot pass on a fresh checkout or in CI. Weakness (note, not a blocker): it then never runs in CI, and a partial set also skips. The adapters are exercised by the fixture-based 'CI sources format' test only for the sources format; a fixture copy of the B7/D3 shapes would be the better long-term fix.
   - process-video ffmpeg: skip iff `ffmpeg` or `ffprobe -version` errors on spawn; with both present it runs unchanged. Narrow. The ffmpeg-present path was not run here (no ffmpeg on this machine).
2. G4_FROZEN. With the 14 additions removed, `auditIssueRefs` flags exactly those 14 files (all under qa/verdicts/, each a real bare-id collision, e.g. t046 cites ISS-001..008), and no other verdict or manifest. With them present, nothing under manifests/verdicts is flagged. Old verdict files are untouched (diff touches only tracker-audit.mjs, two tests, manifest). Consistent with D-019 and the existing use (per-file freeze of checker-owned records). A new or future verdict is not in the set so it is still judged; the known limitation (a new bare ref inside a frozen file goes unreported, ISS-162) applies to these 14 as it does to the original 4. Note: the doc comment still says "these four"; stale, cosmetic. Residual: ISS-SCRIPTSFIX-002 (qa/contracts/health-route.md, outside this lane).
3. Runs (node bin prepended to PATH).
   - Lane, all 49 scripts test files: tests 637, pass 629, fail 6, skipped 2. Reds: queue.test.mjs x4, send-now-host x2 (launcher 502 expectations), SNAPSHOT <=200 lines (see below).
   - Lane `test:lint`: tests 136, pass 135, fail 1 (SNAPSHOT line count). The Zoom-argv and trailing-backslash tests PASS when node is on PATH; the maker's reds there were PATH artefacts.
   - Main c9fae49a, same set (nested node_modules junctioned): tests 637, pass 602, fail 35. Breakdown: queue.test.mjs x4 RED on main (needs live Mongo, ECONNREFUSED 127.0.0.1:27017; filed ISS-SCRIPTSFIX-001). packet-snapshot 28 + inventories 1 + ffmpeg 1 + G4 "master's manifests and verdicts are clean" 1 = the 31 this lane fixes (red on main in a fresh worktree, as expected). SNAPSHOT line-count PASSES on main (snapflake merged; lane is just behind). send-now-host PASSES on main (12/12) and in the lane when run alone (12/12): its 2 reds are load-sensitive flakes under the parallel full run, not red on main. Zoom/backslash pass on main.
   - Not run: the lane branch rebased on c9fae49a; the SNAPSHOT red disappears on merge.

## Findings
- ISS-SCRIPTSFIX-001 (medium, red on main): scripts/upload/queue.test.mjs, 4 tests, need Mongo, fail instead of skipping.
- ISS-SCRIPTSFIX-002 (low, note): G4 still flags qa/contracts/health-route.md.
- Note: send-now-host launcher tests are flaky under full-suite load.

ISSUES-WRITTEN: ISS-SCRIPTSFIX-001, ISS-SCRIPTSFIX-002 (qa/issues.scriptsfix.jsonl)
