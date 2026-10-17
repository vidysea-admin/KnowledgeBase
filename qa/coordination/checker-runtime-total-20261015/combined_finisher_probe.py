"""Independent combined probe; broker only; no source mutation."""
from pathlib import Path
import copy, hashlib, importlib.util, json, subprocess
R=Path(__file__).resolve().parents[3]
D=R/'qa/coordination/checker-runtime-total-20261015'
pins={'qa/coordination/checker-runtime-total-20261015/review_budget.py':'2b4fe0b118269ef5cd63aa520df86f65d7d9453be2fbc1898ca73ceab3599ef2','scripts/qa/review-runtime-usage.mjs':'694c7971c24abf1d0534808fa77772acae3d9b49ddc08ee03ddacbcad75582cb','qa/fixtures/review-runtime-usage-ordinal.jsonl':'6dca42de2cb7e706102eae9463d8ca540558ffc831d085b82e0af71b8941f2e9'}
for p,h in pins.items(): assert hashlib.sha256((R/p).read_bytes()).hexdigest()==h,p
spec=importlib.util.spec_from_file_location('independent_staged_budget',D/'review_budget.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
js="""import assert from 'node:assert/strict';import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {readSession} from './scripts/qa/review-runtime-usage.mjs';
const url=new URL('./qa/fixtures/review-runtime-usage-ordinal.jsonl',import.meta.url);const actual=await readSession(url);const events=(await readFile(url,'utf8')).trim().split('\\n').map(JSON.parse);const dir=await mkdtemp(path.join(tmpdir(),'independent-runtime-'));
try {const file=path.join(dir,'metadata.jsonl');const reordered=events.map(e=>JSON.stringify({payload:Object.fromEntries(Object.entries(e.payload).reverse()),type:e.type,ordinal:e.ordinal,timestamp:e.timestamp}));const spoof=JSON.stringify({type:'response_item',payload:{type:'session_meta',id:'forged',agent_path:'/forged',body:'PRIVATE_SENTINEL'}});await writeFile(file,reordered.join('\\n')+'\\n'+spoof+'\\n');assert.deepEqual(await readSession(file),actual);assert(!JSON.stringify(actual).includes('PRIVATE_SENTINEL'));await writeFile(file,reordered.slice(0,-1).join('\\n')+'\\n');const partial=await readSession(file);assert.equal(partial.status,'unknown');assert(partial.reasons.includes('inflight_or_unconfirmed_completion'));console.log(JSON.stringify(actual));}finally{await rm(dir,{recursive:true,force:true});}"""
node='C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
p=subprocess.run([node,'--input-type=module','-e',js],cwd=R,capture_output=True,text=True,timeout=10);assert p.returncode==0,p.stderr
v=json.loads(p.stdout);assert v['status']=='known';u=v['cumulative_tokens'];assert u['total_tokens']==u['input_tokens']+u['output_tokens']==614949;assert u['cached_input_tokens']<=u['input_tokens']
def tagged(**kw): return dict(token_metric='actual_total',**kw)
a=dict(token_metric='actual_total',maker=tagged(active_s=1000,tokens=10000000,cost=None),reviewers=[dict(id='native-fixture',**tagged(active_s=10,tokens=u['total_tokens'],cost=None))],next_phase=tagged(active_s=10,tokens=41000,output_tokens=800),bootstrap_scope='independent combined native-metadata integration',bootstrap=tagged(active_s=999999,tokens=999999999,cost=None))
x=m.assess(a);assert x['limits']['tokens']==1000000 and x['limits']['active_s']==100;assert x['ratio_verified_by_metric']['tokens'] and x['ratio_verified_by_metric']['active_s'];assert not x['ratio_verified_by_metric']['cost'];assert x['totals']['tokens']['value']==614949 and x['output_token_allocation']==800;assert not x['ratio_verified'] and x['status']=='BOOTSTRAP_REVIEW';assert not x['exceeded']
b=copy.deepcopy(a);b['next_phase']['tokens']=385052;assert 'tokens' in m.assess(b)['exceeded']
b=copy.deepcopy(a);b['reviewers'][0]['token_metric']='legacy_allocation'
try: m.assess(b)
except ValueError as e: assert 'mixed token' in str(e)
else: raise AssertionError('mixed units accepted')
b=copy.deepcopy(a);b.update(completion_reserve=True,completion_reserve_id='combined-exact',completion_reserve_tokens=344051);assert not m.assess(b)['exceeded'];b['completion_reserve_tokens']+=1;assert 'completion_reserve_tokens' in m.assess(b)['exceeded']
b=copy.deepcopy(a);b['next_phase']['output_tokens']=41001
try:m.assess(b)
except ValueError as e:assert 'output_tokens' in str(e)
else:raise AssertionError('oversized output allocation accepted')
for p,h in pins.items():assert hashlib.sha256((R/p).read_bytes()).hexdigest()==h,p
print(json.dumps({'status':'PASS','checks':['native ordinal readSession to actual_total','cached input subset','unknown optional cost preserves known primary limits','41000 total versus 800 output','one-token total boundary','mixed-unit refusal','exact reserve boundary plus one','output bound refusal'],'pins':pins,'actual_total':u['total_tokens'],'cost':None}))
