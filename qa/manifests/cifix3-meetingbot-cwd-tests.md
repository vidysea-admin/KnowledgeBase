# Manifest: cifix3-meetingbot-cwd-tests

**Handshake status:** ready-for-check
**Fix cycle:** 1
**Lane:** lane/cifix3

## Scope
ISS-CIFIX-003: two @lkb/meeting-bot tests assumed cwd = repo root; CI (`pnpm -r test`) runs from packages/meeting-bot. Test-only; no assertion changed.

## Files
- packages/meeting-bot/src/capture/browser/browser-profile.test.ts: joinScript path from import.meta.url.
- packages/meeting-bot/src/joiners/joiners.test.ts: paths from import.meta.url; python = D2_FIXTURE_PYTHON else platform .venv path, resolved to an absolute sys.executable; test skips (t.skip with reason) when that python cannot import psutil+seleniumbase (CI installs neither; sb_join.py needs seleniumbase, so a requirements change was not made); profile dir is an OS-temp mkdtemp removed in finally (no data/ leak).

## Criteria
1. Both tests pass from package dir and repo root. 2. No untracked files left after a run. 3. With D2_FIXTURE_PYTHON=python (CI) the test passes or skips, never ENOENT. 4. No assertion changed.

## Evidence (cycle 1)
- joiners.test.ts: package dir 7/7 (3 runs); repo root 7/7; D2_FIXTURE_PYTHON=python 7/7 (python on this PATH has the deps); D2_FIXTURE_PYTHON=<node.exe> (no deps) 6 pass, 1 skipped, 0 fail.
- browser-profile.test.ts: package dir 2/2, repo root 2/2.
- `git status --short` after runs: only the intended modified file; no data/registration-timeout-*.
- Full-suite result appended below.
- Full meeting-bot suite from package dir: 804 tests, 800 pass, 3 fail (WebM remux, 2 symlink EPERM; Windows-only, untouched), 1 skipped.
