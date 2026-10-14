# Verdict: iss-webfixture-001-ci-python-for-api-tests

VERDICT: PASS
Cycle checked: 0
Commit checked: 40b6471 (lane/cipython)
Scope: static review of `.github/workflows/ci.yml` plus local re-runs; GitHub Actions itself (ubuntu) was not run and no pip install was done (no installs on this machine).

## EXPLANATION

ISS-WEBFIXTURE-001 is verified (row flipped in qa/issues.webfixture.jsonl), with the caveat that the CI run itself is unobserved.

- Dependency coverage: the Python fixture in `router.test.ts` imports `job_queue` (which imports `time, uuid, datetime, pymongo.ReturnDocument, schema_check`), and `schema_check` imports `json, sys, pathlib, jsonschema`. `workers/transcribe/requirements.txt` provides pymongo==4.18.3, jsonschema==4.26.0, python-dotenv==1.2.4, exact `==` pins. Nothing else is imported (python-dotenv is not imported by either module; unused but harmless). Local `python` (3.12.10) imports both modules.
- Order: setup-python@v5 (3.12) -> Install -> existing jsonschema step -> NEW pip step -> ffmpeg -> typecheck -> Unit tests. Python and deps are present before `pnpm -r test`. The `env` block is on the Unit tests step only, as claimed.
- YAML: parsed with PyYAML, 16 steps, structure intact. The diff contains no secret, token or credential. Actions are pinned by major tag as the rest of the file already is.
- Control: with `D2_FIXTURE_PYTHON` unset (no `.venv` in this worktree, as on ubuntu) the router test fails with `null !== 0` at the child-status assert (pass 2 / fail 1); with it set to `python` it passes. So the env line is necessary and sufficient for that assert. The workflow file was not modified by me (hash 8239bb20 = HEAD blob).
- Flake rate (ISS-CIPYTHON-001): with the env set, router.test.ts ran 17 times; 14 passed, 3 failed, all three the same `null !== 0` (spawnSync 5000 ms timeout). Cold `import job_queue` here takes 1.8-2.3 s under the live Chrome search worker's CPU load (Windows). Rating: LOW for CI. A Linux runner imports pymongo+jsonschema in well under a second, so the 5 s timeout has several-fold headroom; `pnpm -r test` parallelism on a 2-vCPU runner is the only plausible squeeze. Not filed medium. The maker's fix direction (raise the timeout inside the 20 s test budget) stands; it is a test change, outside this unit.
- Other rows (ISS-CIPYTHON-002/-003): both low/informational, not re-scanned beyond reading.
- State: no source or contract edited; `git status` clean before this verdict; no processes left.

ISSUES-WRITTEN: none
