# Broker checkpoint

No checker verdict or product acceptance is issued.

- Deadline exact requested commands each exited 1 with Node worker `spawn EPERM` before test case collection. Requested 2+1+4 cases were not executed. Node reported one file-level failure for each command; the original receipt parser recognized TAP only and left counts empty, so these are setup failures, not zero-failure evidence. Historical rows were restored and byte-compared; all raw request pins remained unchanged. Full original logs and receipt preserved.
- Graph exact safe-register/isolation-none request exited 0: actual 11 tests, 11 pass, zero fail/skip. All frozen raw pins unchanged.
- Capture compatible existing Python import preflight passed; exact pytest command exited 1 with WinError 5 on pytest-created basetemp. No retry; inherited-ACL owned probe had passed before pytest. Complete raw log and before/after pins are preserved in capture-receipt.json. Packet source pins remain unchanged.
- Remaining exact profile API/client, T052 durable state, T053 watched and capture Node commands were not executed. The known default-worker spawn restriction and remaining bounded phase scope require a repaired/admitted command vector before further execution. No guessed counts or receipt reuse claims.
- Original contract validator, central typechecks, integration/release and independent checker gates remain open.

Artifacts: deadline-receipt.json, deadline-*.log, graph-receipt.json, graph.log, capture-receipt.json, capture-python.log. Runtime total tokens unknown; no efficiency-success claim.
