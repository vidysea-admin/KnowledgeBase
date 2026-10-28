import copy, json
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker
root = Path.cwd()
rows = json.loads((root / 'qa/evidence/goal-t059-maker/rows.json').read_text(encoding='utf-8'))
counts = {'valid': 0, 'invalid_refused': 0}
validators = {}
for name, schema in [('gap', 'gaps'), ('retest', 'eval_runs'), ('original', 'eval_runs')]:
    v = Draft202012Validator(json.loads((root / f'schema/{schema}.schema.json').read_text(encoding='utf-8')), format_checker=FormatChecker())
    v.validate(rows[name]); validators[name] = v; counts['valid'] += 1
for name, mutate in [('gap', lambda r: r['flywheel'].__setitem__('inputFingerprint', 'wrong')), ('retest', lambda r: r['flywheel'].__setitem__('comparison', 'won'))]:
    invalid = copy.deepcopy(rows[name]); mutate(invalid)
    assert list(validators[name].iter_errors(invalid)), f'{name} malformed metadata accepted'
    counts['invalid_refused'] += 1
assert rows['gap']['flywheel']['loss']['question'] == rows['original']['question'] == rows['retest']['question']
assert rows['gap']['flywheel']['loss']['score'] == rows['original']['score']
assert 'score' not in rows['retest'] and rows['retest']['credibility'] == 'internal'
assert rows['retest']['flywheel']['originalEvalRunId'] == rows['original']['_id']
assert rows['retest']['flywheel']['gapId'] == rows['gap']['_id']
print(json.dumps({'result': 'PASS', **counts, 'bound_produced_rows': 3}))
