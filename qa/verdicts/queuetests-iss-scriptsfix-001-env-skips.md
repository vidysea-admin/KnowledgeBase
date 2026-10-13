# Verdict: queuetests-iss-scriptsfix-001-env-skips

VERDICT: PASS
Cycle checked: 0
Commit checked: 808c4a22

EXPLANATION:
- Diff: only skip options, constants and the MONGODB_URL source changed. No assertion removed or weakened. Skips are narrow: test 1 skips only if python or ffprobe is absent, test 2 only if python is absent, test 3 only if Mongo or python is unavailable, test 4 only if Mongo is unavailable.
- Mongo isolation: connectQueue is reached only in tests 3 and 4, and both pass MONGODB_URL: testMongo. Test 1 stubs the queue, so it never reaches Mongo, and test 2 never uses Mongo. Dotenv still loads .env, but it is overridden in the env passed to the tests and the worker. The loopback regex accepted 127.0.0.1, localhost and user:pass@127.0.0.1. It refused 127.0.0.1.evil.com, localhost@evil.com, a multi-host URL, mongodb+srv and a query-string trick.
- Runs (queue.test.mjs): tools absent: pass 3, skip 4, fail 0. Python and ffprobe present: pass 5, skip 2. Python only: pass 4, skip 3. TEST_MONGO_URL=mongodb://example.com/x: pass 3, skip 4. Lint set (11 files): 117/117 pass.
- Mutation: with noPython and noFfprobe forced to a constant, the tools-present run gave pass 3 and skip 4, versus pass 5 and skip 2 unmutated, so the skip conditions do govern running. Restored; git hash-object equals HEAD blob 0c1f384e.
- Not verified: tests 3 and 4 against a live Mongo (none available, none contacted). Their assertions are unchanged.

ISSUES-WRITTEN: none
