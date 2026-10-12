# Verdict: t034-tab-capture-tests-in-suite-and-receiver

VERDICT: PASS
Cycle checked: 0
Commit checked: 6c9bafe (lane/tabcapture)
ISSUES-WRITTEN: none (maker's ISS-TABCAPTURE-001/-002 are low and stay open)

## EXPLANATION

- Claim 1 verified: commit 709038c (an ancestor of HEAD) changed packages/meeting-bot `test` to `node --test --import tsx "src/**/*.test.ts" "py/tab-capture/*.test.mjs"`; `.github/workflows/ci.yml` line 77 runs `pnpm -r test`, and root `test` is `pnpm -r test`. The earlier extension verdict's "not discovered" line is stale, as the maker says. The guard test is real: removing the `py/tab-capture` glob from package.json (hash-verified, restored) fails it (11 pass / 1 fail).
- Run 15 times in sequence: 15/15 green, each 12 pass 0 fail. tsc in packages/meeting-bot exit 0. The tests start only the in-process receiver and child `node` processes as fake extensions; no browser, OBS, Python or Mongo. The one network-flavoured test connects to this machine's own non-loopback address.
- Loopback only: `server.listen(0, "127.0.0.1")` in tab-browser.ts. Mutation to `0.0.0.0` is killed by the loopback test because this host has a non-loopback IPv4 (10.210.0.2). Note: on a host with no such interface that test loops zero times and would pass vacuously; the endpoint regex is then its only check. Low, not filed.
- Failure never reported as success, 5 mutations of tab-browser.ts (hash-verified, byte backup in `finally`, restored): `failed:true` stop treated as clean KILLED; capture-error not propagated to the run KILLED (2 tests); missing final ack not a failure KILLED; status file always "stopped" KILLED (3 tests); listen on 0.0.0.0 KILLED. Source equals HEAD blob; package.json restored to its blob; both trees clean.
- Scope honesty: manifest states fakes only, no real Chrome/tabCapture, no 60-minute run; the claims match what the tests do. Existing tab-browser.test.ts Windows symlink EPERM (ISS-TABCAPTURE-002) is pre-existing.
