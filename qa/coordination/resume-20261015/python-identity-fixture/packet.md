# FROZEN — test-only invalid-instance fixture isolation

Owned edit: `packages/meeting-bot/py/test_sb_join_tiles.py`, only invalid-instance test block. Raw original bytes: `test_sb_join_tiles.py.before`. Hash receipts: `pins.json`.

The three invalid supplied sampler identities previously reused the same `_run` directory. `_run` creates `stop` once its fake clock reaches the requested duration. Later iterations see that leftover marker at `run_session`'s initial while guard, skip the hold loop, and leave the fresh clock at 1000. This is fixture cross-contamination, not an invalid-identity production refusal defect. `tile_clock` already returns the unchanged clock on invalid identity.

Each case now gets a fresh subdirectory, isolating its stop marker and output. Existing assertions are retained unchanged: wrapped clock identity, no evidence output, and clock advancement >1000. Added final `closed` event assertion. All three invalid inputs remain covered. No production source changed and no assertions weakened.

Frozen test SHA256: `1e1dd317beae7b78b782c6159de4c4c0fadc09cd1be47b03ea9e10124631bdde`.

No pytest/build/provider/browser/DB execution performed. Original broker receipt remains 13 passed / 1 failed, not converted to green. Return the broker's original 14-test `packages/meeting-bot/py/test_sb_join_tiles.py` request with its existing admitted interpreter, environment, timeout and fresh temp path; only this test pin changes. Independent checker and required combined gates remain open. Runtime total tokens unknown.
