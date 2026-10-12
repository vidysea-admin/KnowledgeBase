# Manifest: iss-webfixture-001-ci-python-for-api-tests

**Handshake status:** checked-PASS (cycle 0)
**Fix cycle:** 0
**Lane:** cipython
**Issue:** ISS-WEBFIXTURE-001 (qa/issues.webfixture.jsonl)

## Change
`.github/workflows/ci.yml` only (+9 lines, no test or source change):
1. New step "Python deps for the D2 queue fixture test": `python -m pip install --quiet -r workers/transcribe/requirements.txt`. The requirements file already exists (pymongo==4.18.3, jsonschema==4.26.0, python-dotenv==1.2.4, pinned); no new file added. The fixture imports `job_queue` (pymongo) and `schema_check` (jsonschema). `actions/setup-python@v5` with 3.12 was already in the workflow and matches the local .venv (3.12.10).
2. `Unit tests` step gets `env: D2_FIXTURE_PYTHON: python`.

Why env, not a test fallback: the test already honours D2_FIXTURE_PYTHON; setting it in CI is a 2-line change that leaves the Windows default (.venv/Scripts/python.exe) untouched and avoids a platform-guessing fallback in test code.

## Evidence
- YAML parsed with js-yaml 4.3.2: 16 steps; Unit tests step = `{"env":{"D2_FIXTURE_PYTHON":"python"},"run":"pnpm -r test"}`.
- Local, same mechanism (bare `python` on PATH via D2_FIXTURE_PYTHON=python): `node --test --import tsx src/activity-health/router.test.ts` in apps/api -> tests 3, pass 3, fail 0 (drift-guard line after `assert.equal(child.status, 0)` is reached).
- Also pass with absolute venv path. One earlier run hit status null (5 s spawn timeout under machine load, cold import); rerun passed -> filed ISS-CIPYTHON-001.
- Not runnable here: GitHub Actions itself (ubuntu). The pip install step was not executed locally (no installs on this machine); the packages and versions are those already in the local .venv's source requirements file.

## Other CI-red scan
See qa/issues.cipython.jsonl (ISS-CIPYTHON-001..003): no other test found that fails on a clean ubuntu runner with the existing ffmpeg/jsonschema steps; python/ffmpeg tests skip cleanly.
