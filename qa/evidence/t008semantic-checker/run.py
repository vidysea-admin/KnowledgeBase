import json, pathlib, subprocess, time, datetime
root = pathlib.Path(__file__).resolve().parents[3]
out = pathlib.Path(__file__).resolve().parent
argv = ['node', '--test', '--test-isolation=none', '--test-timeout=30000', '--import', './.cache/coordination/safe-test-runtime/register-react.mjs', 'qa/evidence/t008semantic-checker/semantic-boundaries.node.test.tsx']
start = datetime.datetime.now(datetime.timezone.utc).isoformat()
clock = time.monotonic()
try:
    result = subprocess.run(argv, cwd=root, timeout=120, capture_output=True, encoding='utf-8', errors='replace')
    output = result.stdout + result.stderr
    exit_code = result.returncode
except subprocess.TimeoutExpired as error:
    output = str(error.stdout or '') + str(error.stderr or '')
    exit_code = 'TIMEOUT'
elapsed = time.monotonic() - clock
(out / 'node-probes.log').write_text(output, encoding='utf-8')
receipt = {'argv': argv, 'cwd': str(root), 'startedAt': start, 'finishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'durationSeconds': elapsed, 'exitCode': exit_code, 'output': str(out / 'node-probes.log'), 'candidateStatus': 'provisional-in_progress'}
(out / 'node-probes.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
print(json.dumps(receipt))
print(output[-4500:].encode('ascii', errors='backslashreplace').decode('ascii'))
