# Capture Python setup repair — HOLD

Candidate observed: `5c4cbade2d1a8aa4815de13d587db8de3b01cc4a`.

Original failure is pytest's Windows 0700 directory creation: `_pytest/tmpdir.py` getbasetemp and mktemp both explicitly request mode 0700. Capture parent ACL has inherited sandbox SID Modify; `icacls capture/broker-pytest-fresh` itself reports Access denied. The repository's existing `scripts/qa/test_scoped_check_runner.py` documents this same sandbox token incompatibility and uses ordinary mkdir to inherit parent ACLs.

Prepared evidence-only `run_pytest.py` adapter. It preserves pytest's factory and all plugins and assertions, replacing only the Path binding in `_pytest.tmpdir` with a scoped subclass that inherits the repository ACL when pytest requests 0700. It refuses other operating systems, preexisting/symlink basetemp, basetemp outside its immediate owned evidence directory, and escaped sb_join_tiles import. Binding restored finally. No original source/test/dependency/global ACL/enforcement files edited.

SETUPPROBE only attempted under existing `.venv/Scripts/python.exe -B`, PYTHONPATH `packages/meeting-bot/py`, PYTHONDONTWRITEBYTECODE=1. Command: `python -B qa/coordination/resume-20261015/capture-python-setup/run_pytest.py -q qa/coordination/resume-20261015/capture-python-setup/test_setup_probe.py --basetemp <absolute setup directory>/probe-temp-1`.

Own wrapper exit: **1**. Child hit explicit **15-second subprocess timeout**; no returned pytest result. The wrapper's receipt write was after subprocess completion, so receipt/pins were not persisted on this exception. This is an evidence gap, not green setup evidence. No retry or full capture suite was run; tokens unknown. No PASS issued. Adapter remains unverified pending broker-admitted setup execution and robust timeout receipt capture.

Proposed broker command after a successful setup probe: existing Python `-B <absolute setup directory>/run_pytest.py -q packages/meeting-bot/py/test_sb_join_tiles.py --basetemp <absolute setup directory>/capture-temp-unique`, with same existing request environment and 45-second outer limit. Use a fresh nonexistent child; do not reuse or delete probe-temp-1. Full command is not yet admitted as verified setup.
