# Verdict — parallel-jobs-integration

Cycle checked: 0
VERDICT: PASS
ISSUES-WRITTEN: none

Scope: independent local integration against `qa/contracts/parallel-jobs-read.md`; parent
provider-audit Jobs slice only. This is not T-057 completion, runtime activation or release PASS.

## Independent verification

Actual `createServer` -> verified auth/jobs-only scope -> real scoped accessor -> Mongo adapter
-> ephemeral HTTP: **3/3 passed**, exit0. Missing/invalid/sessions/keys-only denials occur before
database reads; owner A/B controls pass; forged tenant header cannot change filter; projection,
descending sort, limit+1, sanitized whitelist and private/no-store are asserted. Missing jobs
dependency gives fixed503. Actual production composition binds a lazy real store without opening
Mongo. Standard provider audit data only; no dedicated upload queue interaction.

Actual Settings/App/sidebar -> Jobs page -> typed client/Bearer -> endpoint-shaped fixture:
**6/6 passed**, exit0. Jobs permission defaults unchecked; explicit choice submits only selected
scope. Existing key-management tests remain green. API, DB and Web scoped TypeScript checks
each exit0/no diagnostics. Frozen-contract verifier exit0 is explicitly PASS by vacuity.

Accepted independent leaves inspected: DB cycle0 PASS (12/12), API cycle1 PASS (9/9 plus
boundary harness), Web cycle1 PASS (56/56). Current source identities match their frozen pins.
These supply refusal/date/query/status/truncation and API-key switch/logout/late-result evidence;
the Web cycle0 record is historical and does not authorize current close-out.

## Source preservation and exact evidence

`qa/evidence/parallel-jobs-read/integration-check-cycle0.json` preserves literal commands,
arguments, cwd, 60-second child deadlines, complete stdout/stderr, exit codes and before/after
source hashes. All15 inspected source pins remain stable through checks. Initial child spawn
EPERM is retained separately in `integration-check-cycle0-sandbox.json`; exact scoped retry was
auto-approved. React Router future-version warnings were non-fatal.

Server SHA256: `fa4129a968966c6cceb1c9adc6443f42bc9f584ac7cb2feb698c07da2218bef5`.
Production SHA256: `ff65725758a0ed858dda585f8ef469ffb32bf2a7afea375d0e650396b448ac1e`.
In-memory removal of four server lines recovers exact accepted preimage `2a77e71e...`.
Production has mixed newlines: removal of the two exact inserted CRLF+line prefixes, retaining
original LF suffixes, recovers exact preimage `7e155585...`. Initial whole-line removal mismatch
was a checker-harness assumption; no source was modified. Fixtures retain exact SHA256
`a99dd8a2c9abf1864d9af6f26741e1d890da46fb9a4a1c0dbb2e0d762781639f`, **300 nonblank lines**.
Thus accepted Ask composition and shared fixtures were preserved.

## Limits and close-out

HTTP checks use injected fake database data; frontend checks use fixture HTTP responses with
the real client. No live Mongo, browser, providers, key mint, broad suite, source mutation or
runtime restart. Existing runtime remains older until separately owner-reviewed restart.
Matching integration Fix cycle0 manifest may close to checked-PASS. Broader operational and
release verification remains outstanding; no task/ledger/governance completion authorized.
