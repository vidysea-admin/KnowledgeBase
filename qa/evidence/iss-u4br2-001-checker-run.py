import datetime
import json
import os
from pathlib import Path
import subprocess
import time

root = Path(__file__).resolve().parents[2]
node = r'C:\Users\product\AppData\Local\OpenAI\Codex\runtimes\cua_node\3dd31cfff853001c\bin\node.exe'
args = [node, '--test', '--test-concurrency=1', '--test-timeout=15000', '--import', 'tsx',
        'packages/core/src/alerts/alert-sink.test.ts',
        'apps/api/src/routes/health-alert-sink.test.ts',
        'apps/api/src/routes/health.test.ts',
        'qa/evidence/iss-u4br2-001-checker.test.ts']
env = dict(os.environ)
env['PATH'] = str(Path(node).parent) + os.pathsep + env.get('PATH', '')
env.pop('TELEGRAM_BOT_TOKEN', None)
env.pop('TELEGRAM_CHAT_ID', None)
start = datetime.datetime.now(datetime.timezone.utc).isoformat()
timer = time.perf_counter()
try:
    completed = subprocess.run(args, cwd=root, env=env, capture_output=True, text=True,
                               encoding='utf-8', errors='replace', timeout=60)
    code, output = completed.returncode, completed.stdout + completed.stderr
except subprocess.TimeoutExpired as error:
    code, output = 124, 'TIMEOUT after 60s\n' + str(error)
duration = time.perf_counter() - timer
end = datetime.datetime.now(datetime.timezone.utc).isoformat()
report = {'command': args, 'cwd': str(root), 'started': start, 'ended': end,
          'duration_s': duration, 'exit_code': code}
(root/'qa/evidence/iss-u4br2-001-checker-run.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
(root/'qa/evidence/iss-u4br2-001-checker-run.log').write_text(output, encoding='utf-8')
print(json.dumps(report))
print(output.encode('ascii', errors='backslashreplace').decode('ascii'))
raise SystemExit(code)
