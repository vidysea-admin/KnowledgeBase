# Verdict — parallel-compete-tenant-coverage

Cycle checked: 0
VERDICT: PASS
ISSUES-WRITTEN: none

EXPLANATION: PASS applies only to the supplementary coverage contract. Inspected real route,
auth, server wiring, fake, Mongo store adapter, evaluation accessor and tenantScope. The fake's
tenant+ID match and existing-row update mirror production's scoped updateOne and matchedCount.
The regression uses seeded existing rows, proves foreign refusal and unchanged full rows,
scope refusal before store, ignored forged body tenants, two owner positives and final row count.
New test source is the only runtime-related edit in the inspected diff.

## Independent evidence

Cwd: `C:\Users\product\Desktop\KnowledgeBase\apps\api`

```powershell
& 'C:\Users\product\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test --test-concurrency=1 --test-timeout=45000 --experimental-test-isolation=none --import tsx src/routes/compete.test.ts
```

```text
✔ POST /compete/start produces an eval_runs row with credibility 'internal' (135.8819ms)
✔ POST /compete/start with a missing question returns 400 (19.2393ms)
✔ POST /compete/:id/score updates the existing row, not a new one (19.711ms)
✔ POST /compete/start without the compete scope returns 403 (13.359ms)
✔ POST /compete/:id/score with a nonexistent id returns 404 (13.208ms)
✔ GET /compete serves the plain HTML form (13.5524ms)
✔ POST /compete/:id/score confines an existing evaluation to its authenticated owner (29.035ms)
ℹ tests 7
ℹ suites 0
ℹ pass 7
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 904.6301
Exit code: 0
```

SHA256 checkpoints, read independently before/after successful execution (test unchanged):

```text
apps/api/src/routes/compete.test.ts 14B990E45B8A76805BFC16161B338CF5FD10C6BC14CBC7D05C491156C2C5C86A
apps/api/src/routes/compete.ts 723197F27A38B099300535B0E7EFA829EA67429A8DEA1752DFD69916179E7423
apps/api/src/fixtures.ts ED27B9E9E25F5E1FE4D3CF9F707399DF2CBC80D78CFBECB9F045374425E524E5
apps/api/src/auth.ts 532380D18856D0D00BF8DB879E8C0F5CFEE50C46FB2B7898074F748EB1FA9C37
packages/db/src/collections/eval-runs.ts CCB9524A6C19A3619C4EB5BAA640D7CBA0178876FACE1E316BC1E77741A5B0B1
```

No live Mongo/providers, full suite, typecheck or mutation proof. Production persistence remains
an integration-validation obligation; this verdict is not a release PASS or live exploit claim.
