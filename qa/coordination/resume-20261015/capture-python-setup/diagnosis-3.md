# Process lifecycle resolved; bounded instrumentation prepared

The single escalated read-only CIM query succeeded. See `process-identity.json`.
PID 19420 is now `C:/Program Files/PowerShell/7/pwsh.exe`, creation time
2026-10-15T20:25:14.787097+00:00, exact owned-script match false. Its bounded
children are conhost/node, also match false. This is a reused PID, distinct from
the earlier Python process at 20:21:39. The earlier possible Python descendant
has therefore terminated. No process was killed and no arbitrary worker is held
as owned. Historical missing stdout/stderr and PID remain unrecoverable.

Prepared `run_bounded.py` without executing it: Windows Job Object with
KILL_ON_JOB_CLOSE, child created suspended, PID ledger persisted before assignment,
job assignment required before resume, inherited raw stdout/stderr files,
timeout/error/interrupt finally closes the job and records direct-child terminal
state/exit plus output hashes. It refuses an existing/outside receipt directory.
If job assignment fails (including incompatible containing job), child is never
resumed and is terminated directly; this is a setup refusal, not a bypass.

Added unbuffered import/main phase markers and observational pytest hooks to
`run_pytest.py`; all existing plugin autoload and pytest behavior remain enabled.
Neither new runner nor updated adapter has been executed or independently checked.
No pytest/probe/full capture run was started in this follow-up.

Proposed broker-only next vector (not verified): existing .venv Python -B
`run_bounded.py 15 <setup-root>/probe-receipt-2 <absolute-.venv-python> -u -B
<setup-root>/run_pytest.py -q <setup-root>/test_setup_probe.py --basetemp
<setup-root>/probe-temp-2`, with PYTHONPATH pointing to the existing meeting-bot
Python source. Both designated children must be fresh/nonexistent. Root broker
must own the CPU slot before execution. First inspect Job assignment and phase
markers on any failure. Setup still HOLD until an attributable successful probe.
