# Verdict: cifix3-meetingbot-cwd-tests

VERDICT: FAIL
Cycle checked: 0
Commit checked: 02e85700 (lane/cifix3)

EXPLANATION:
1. Assertions: none changed. Only path resolution (import.meta.url), a mkdir of data/, and a platform-picked python path changed.
2. CI reality (FAIL): ci.yml uses setup-python 3.12 and sets D2_FIXTURE_PYTHON=python on the unit-test step. It creates no repo-root .venv, so .venv/bin/python does not exist on Ubuntu. The joiners test spawns that path (and runs psutil via it), so it would fail with ENOENT instead of browser_timeout. ci.yml installs only jsonschema and workers/transcribe/requirements.txt, so psutil and the sb_join dependencies are probably absent from system python as well. The test must use process.env.D2_FIXTURE_PYTHON ?? the .venv path, or skip with a stated reason when the interpreter or psutil is unavailable. The local pass relies on the worktree .venv junction.
3. Leak (FAIL): each run leaves data/registration-timeout-XXXXXX behind. I saw one after a package-dir run and one after a root run. It is untracked and not gitignored. Needs rmSync in a finally block, or a tmpdir.
4. Runs: both tests pass (7/7 and 2/2) from the package dir and from the repo root. Full meeting-bot suite from the package dir: 851 tests, 842 pass, 7 fail. All 7 fail in tests unrelated to the changed files:
   - WebM live remux (known).
   - Two control-gap/recovery tests (probably the known symlink EPERM; not individually confirmed).
   - Three obs-windows ISS-324 tests (known, load-related).
   - getProcessStartTime live-pid test (load-related timing; not individually confirmed).

ISSUES-WRITTEN: ISS-CIFIX-003 stays open (fix not sufficient). Needed: (a) D2_FIXTURE_PYTHON or skip-with-reason in joiners.test.ts, (b) cleanup of data/registration-timeout-*.
