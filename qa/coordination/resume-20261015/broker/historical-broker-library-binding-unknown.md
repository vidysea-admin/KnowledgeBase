# Historical helper-binding clarification

For historical command runners that imported broker_lib.py without recording its byte hash in that execution's before/after environment pins, same-byte binding of that helper is UNKNOWN. Historical green process/test results and raw artifacts remain unchanged; the currently observed580ee50c... helper bytes are not retroactively attributed to earlier executions. Standalone runners that never imported this library are outside this specific finding.

Root authorized one fresh watched epoch rather than retrospective forensics. watched-current-helper-final-seal.json and watched-current-helper-checkpoint.md bind current executing runner, broker library, tested supervisor, adapters, source, runtime and lock before/after; all28tests plus types/graph/LOC actually rerun. No historical receipt reuse. This new evidence closes only that current watched epoch's helper-binding gap; independent verdict and other units' evidence admission remain separate.
