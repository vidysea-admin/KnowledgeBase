import hashlib
import json
import pathlib
import time

started = time.perf_counter()
packet = json.loads(pathlib.Path('data/eval/extraction-adjudication-packet.json').read_text(encoding='utf-8'))
checked = []
for session in packet['sessions']:
    binding = session['sourceBinding']
    canonical = json.dumps(binding, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    assert hashlib.sha256(canonical).hexdigest() == session['sourceBindingSha256']
    for kind, artifact in binding['artifacts'].items():
        content = pathlib.Path(artifact['path']).read_bytes()
        digest = hashlib.sha256(content).hexdigest()
        assert digest == artifact['sha256'], artifact['path']
        assert len(content) == artifact['bytes'], artifact['path']
        assert hashlib.sha256(content.replace(b'\r\n', b'\n')).hexdigest() == artifact['normalizedLfSha256'], artifact['path']
        checked.append({'path': artifact['path'], 'kind': kind, 'bytes': len(content), 'sha256': digest})
assert len(checked) == 58
result = {'passed': True, 'artifacts': len(checked), 'sessions': len(packet['sessions']), 'seconds': time.perf_counter() - started, 'hashes': checked}
pathlib.Path('qa/evidence/goal-u22/source-artifact-hashes.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps({key: value for key, value in result.items() if key != 'hashes'}))
