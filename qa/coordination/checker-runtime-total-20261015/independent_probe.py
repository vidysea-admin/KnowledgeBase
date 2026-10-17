import copy, hashlib, importlib.util, json, subprocess, sys, tempfile, time
from pathlib import Path
root=Path('C:/Users/product/Desktop/KnowledgeBase'); p=root/'qa/coordination/checker-runtime-total-20261015/review_budget.py'
assert hashlib.sha256(p.read_bytes()).hexdigest()=='2b4fe0b118269ef5cd63aa520df86f65d7d9453be2fbc1898ca73ceab3599ef2'
s=importlib.util.spec_from_file_location('independent_budget',p); m=importlib.util.module_from_spec(s); s.loader.exec_module(m)
def case():
 return {'token_metric':'actual_total','maker':{'active_s':10000,'tokens':1000000,'cost':None,'token_metric':'actual_total'},'reviewers':[{'id':'independent','active_s':10,'tokens':41000,'cost':None,'token_metric':'actual_total'}],'next_phase':{'active_s':10,'tokens':1000,'output_tokens':800,'cost':None,'token_metric':'actual_total'},'bootstrap_scope':'independent boundary probe'}
d=case(); r=m.assess(d); assert r['totals']['tokens']['value']==41000 and r['output_token_allocation']==800 and r['ratio_verified_by_metric']['tokens'] and not r['ratio_verified']
d.update(completion_reserve=True,completion_reserve_id='independent/3/candidate',completion_reserve_tokens=58000); assert not m.assess(d)['exceeded']; d['completion_reserve_tokens']=58001; assert 'completion_reserve_tokens' in m.assess(d)['exceeded']
d=case(); d['maker'].update(active_s=100,tokens=100000); d['next_phase'].update(active_s=40,tokens=20000); d['bootstrap']={'active_s':1000,'tokens':200000,'token_metric':'actual_total'}; r=m.assess(d); assert r['limits']['active_s']==10 and r['limits']['tokens']==10000 and {'active_s','tokens'}<=set(r['exceeded'])
d=case(); d['reviewers'][0]['budget_debit']={'tokens':6000,'token_metric':'legacy_allocation'}
try: m.assess(d)
except ValueError: pass
else: raise AssertionError('mixed units admitted')
with tempfile.TemporaryDirectory() as t:
 q=Path(t)/'input.json'; q.write_text(json.dumps(d)); run=subprocess.run([sys.executable,'-B',str(p),'assess','--input',str(q)],capture_output=True,text=True,timeout=10); assert run.returncode==2 and json.loads(run.stdout)['status']=='INVALID_OR_BLOCKED'
e=root/'qa/goal-vectorless-2026-10-15'
for name,code in [('verification-staged-token-metric-eleven',1),('verification-token-metric-bootstrap-one',0),('verification-token-metric-legacy-twenty',0),('verification-token-metric-reserve-fourteen',0)]:
 receipt=json.loads((e/(name+'.json')).read_text(encoding='utf-8-sig')); assert receipt['exitCode']==code and receipt['hashesUnchanged']; assert receipt['runtime_executable_sha256']=='4d6f5f81a4bca11191c4c7c6b43632694d0a4ce74e068619d8fdc161d469859a'; assert receipt['environment_hash']=='536475920c6b56ea68847561b44e5b98ab84c903e1eeedcf66d0a42ef95d3277'
base=root/'qa/coordination/checker-runtime-total-20261015'; current=(base/'test_review_budget.py').read_bytes(); old=current.replace(b'"tokens": 41000, "cost": 10,',b'"tokens": 41000, "cost": None,'); assert old!=current; assert hashlib.sha256(old).hexdigest()=='4ae3a5fa1fc7d8867520481cd88a67bc764179f2eba06e7cca0e3a33c12c1996'
orig=(root/'qa/coordination/checker-completion-reserve-20261015/broker-canonical20/test_review_budget.py').read_bytes(); amended=(base/'broker-legacy/test_review_budget.py').read_bytes(); print('PROVENANCE_DIFF_20'); import difflib; print(''.join(difflib.unified_diff(orig.decode().splitlines(True),amended.decode().splitlines(True)))); assert hashlib.sha256(orig).hexdigest()=='19b32f7fde950f692621aeb76565ee0a6dd5dc6bb6853ba7e86bebea2e59478f'; assert hashlib.sha256(amended).hexdigest()=='55164fe3aeb6127ef3740cac92a1fdfe060da65849a3e82711ef728d5cd96512'
for name in ['verification-staged-token-metric-eleven','verification-token-metric-bootstrap-one','verification-token-metric-legacy-twenty','verification-token-metric-reserve-fourteen']:
 print(name); print((e/(name+'.stderr.txt')).read_text())
print('INDEPENDENT_BOUNDARIES_AND_PROVENANCE_OK')
