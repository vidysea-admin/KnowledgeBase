# Manifest — parallel-compete-tenant-coverage

Status: checked-PASS
Fix cycle: 0
**Handshake status:** checked-PASS

Closed 2026-10-09 against independent `qa/verdicts/parallel-compete-tenant-coverage.md`:
`Cycle checked: 0`, `VERDICT: PASS`, `ISSUES-WRITTEN: none`. Maker re-read the verdict and
verified the test, route, fixture and auth SHA256 checkpoints match before this close-out.

## Scope and authority

2026-10-09: Umesh authorized maximum independent parallel work; orchestrator assigned this
narrow security coverage unit in NORMAL mode with an independent checker. This unit owns only
`apps/api/src/routes/compete.test.ts` and this manifest. Production, shared fixtures, contracts,
ledgers, goals and enforcement remain outside the edit grant.

Backlog selection: explicitly assigned security coverage, analogous to tier 2; no existing
issue is claimed fixed and no issue ID was allocated. This tenancy/data-write seam is uncapped
under D-014. `qa/QUEUE.md` begins with a held enforcement unit requiring its own owner decision;
this assignment does not change that gate.

Existing ground truth: `qa/contracts/compete-screen.md` C3/C5 (scoped score update and tests),
`qa/contracts/developer-api.md` C2 (auth/scope separation), and project tenant-isolation rules.
This is a bounded supplementary check; it does not claim the contracts' full regression criteria.

## Change and acceptance checks

One new route test seeds two actual existing evaluation rows through `fakeEvalRunStore.create`.
It drives the real Express auth/scope/compete handlers through a loopback ephemeral server.

1. Tenant B's authorized key targets tenant A's existing evaluation with a forged body tenant:
   404, exact not-found response, store receives tenant B, and both original rows stay unchanged.
2. Tenant A's ask-only key targets its own existing evaluation: 403 and no store attempt;
   neither row changes.
3. Tenant A scores its own row while forging body tenant B: 200, correct store tenant/id,
   exact expected updated row and tenant B unchanged.
4. Tenant B scores its own row while forging body tenant A: 200 with the correct tenant/id.
   There remain exactly two rows and three authorized store attempts.

Both positive controls prevent a deny-everyone implementation from passing. Whole-row snapshots
cover write side effects; recorded store arguments cover auth-derived targeting. Each new fetch
has a 3-second abort deadline and the new test has a 10-second deadline. The file is 205 lines,
below `structure.config.json`'s 400-line test budget.

## Exact source checkpoint

HEAD at inspection and verification: `87858c734f4928df7a141e8f17691f170719c76b`.
The test file had no pre-existing edits when assigned. SHA256 at the passing run checkpoint:

| File | SHA256 |
| --- | --- |
| `apps/api/src/routes/compete.test.ts` | `14B990E45B8A76805BFC16161B338CF5FD10C6BC14CBC7D05C491156C2C5C86A` |
| `apps/api/src/routes/compete.ts` | `723197F27A38B099300535B0E7EFA829EA67429A8DEA1752DFD69916179E7423` |
| `apps/api/src/fixtures.ts` | `ED27B9E9E25F5E1FE4D3CF9F707399DF2CBC80D78CFBECB9F045374425E524E5` |
| `apps/api/src/auth.ts` | `532380D18856D0D00BF8DB879E8C0F5CFEE50C46FB2B7898074F748EB1FA9C37` |

## Evidence

Cwd: `C:\Users\product\Desktop\KnowledgeBase\apps\api`.
Exact PowerShell command (one file, test concurrency 1, 45-second suite deadline):

```powershell
& 'C:\Users\product\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test --test-concurrency=1 --test-timeout=45000 --experimental-test-isolation=none --import tsx src/routes/compete.test.ts
```

Sandboxed execution failed before tests: esbuild helper `spawn EPERM`. The same command passed
after tool-approved sandbox escalation. No browser, provider, database or full suite was run.

```text
✔ POST /compete/start produces an eval_runs row with credibility 'internal'
✔ POST /compete/start with a missing question returns 400
✔ POST /compete/:id/score updates the existing row, not a new one
✔ POST /compete/start without the compete scope returns 403
✔ POST /compete/:id/score with a nonexistent id returns 404
✔ GET /compete serves the plain HTML form
✔ POST /compete/:id/score confines an existing evaluation to its authenticated owner
ℹ tests 7
ℹ pass 7
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1310.5652
Exit code: 0
```

## Verification limits and checker request

This checks the real route and auth middleware against an existing tenant-aware in-memory store.
It does not exercise Mongo `recordScore`, production store composition or real provider wiring.
No claim of a production exploit, live data repair, mutation proof, typecheck or full regression
PASS is made. No source file was mutated for falsification in this unit.

Independent checker reviewed the positive controls and refused-write assertions, reran the
exact bounded command (7/7 passed), and returned `qa/verdicts/parallel-compete-tenant-coverage.md`
with `Cycle checked: 0` and `VERDICT: PASS`. Maker close-out records that narrow verdict above.
