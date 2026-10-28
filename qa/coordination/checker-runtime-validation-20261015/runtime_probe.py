"""Offline canonical runtime boundary probes. Never launches a provider."""
import copy, hashlib, json, os, pathlib, subprocess, sys, time, traceback
START=time.monotonic()
ROOT=pathlib.Path(__file__).resolve().parent
SKILL=pathlib.Path(r'C:\Users\product\.agents\skills\checker')
sys.dont_write_bytecode=True
sys.path.insert(0,str(SKILL/'scripts'))
import review_budget as b, review_contract as c, managed_review as m
def dump(name,obj):
    p=ROOT/name
    with p.open('x',encoding='utf-8') as f: json.dump(obj,f,indent=2)
    return p
def bind(p): return {'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
protected=[SKILL/'SKILL.md',*sorted((SKILL/'scripts').glob('*.py'))]
before={str(p):bind(p)['sha256'] for p in protected}
dump('canonical-before.json',before)
results=[]
def case(name,fn):
    t=time.monotonic()
    try: fn(); results.append({'name':name,'outcome':'PASS','duration_s':time.monotonic()-t})
    except Exception: results.append({'name':name,'outcome':'FAIL','duration_s':time.monotonic()-t,'error':traceback.format_exc()})
def eq(a,z): assert a==z,(a,z)
def refuse(fn,text):
    try: fn()
    except (ValueError,KeyError) as e: assert text in str(e),str(e); return
    raise AssertionError('accepted prohibited input')
metric=json.loads((SKILL/'references/metrics.json').read_text())
prompt=ROOT/'prompt.txt'; prompt.write_bytes(b'Review sealed offline evidence only. No provider execution authorized.\n')
env=dump('environment.json',{'python':sys.executable,'version':sys.version,'import_origins':{x:str(pathlib.Path(y.__file__).resolve()) for x,y in [('budget',b),('contract',c),('launcher',m)]},'provider_execution':False,'temp_parent_writable':True})
head=subprocess.run(['git','rev-parse','HEAD'],capture_output=True,cwd=ROOT,text=True,timeout=10)
sha=head.stdout.strip(); assert head.returncode==0
identity='checker-runtime-validation-20261015/0/'+sha
metric['completion_reserve_id']=identity
worker={'provider':'claude','executable':sys.executable,'runtime_identity':{'model':'offline-fixture','policy':'fixture'},'timeout_s':60,'max_turns':1,'phase_id':'offline-phase','prompt':bind(prompt)}
packet={'policy_version':'managed-review/1','unit':{'root':str(ROOT),'slug':'checker-runtime-validation-20261015','cycle':0,'base_sha':sha,'candidate_sha':sha,'files':[bind(pathlib.Path(__file__))]},'metrics':metric,'worker':worker,'readiness':{'complete':True,'mutation_required':False,'receipts':[dict(role='environment',**bind(env))]},'selected_checks':[{'node':'runtime_probe.py','reason':'offline boundary checks against canonical installed helpers','boundary':'admission, accounting, reserve, reuse, fail-closed launcher'}],'previous_receipt':None}
case('managed-review/1 admission',lambda:eq(c.validate(packet)['status'],'READY'))
def unsupported():
    x=copy.deepcopy(packet); x['worker']['provider']='unsupported'; refuse(lambda:c.validate(x),'unsupported worker provider')
case('unsupported provider refuses before invocation',unsupported)
def mixed():
    for obj in ('maker','next_phase'):
        x=copy.deepcopy(metric); x[obj]['token_metric']='legacy_allocation'; refuse(lambda:b.assess(x),'mixed token units')
case('actual_total mixed units refuse',mixed)
def cumulative():
    x=copy.deepcopy(metric); x['reviewers']=[{'id':'retry-1','token_metric':'actual_total','active_s':70,'tokens':1800,'cost':None},{'id':'retry-2','token_metric':'actual_total','active_s':20,'tokens':400,'cost':None}]
    r=b.assess(x); eq(r['totals']['tokens']['value'],2200); eq(r['totals']['active_s']['value'],90)
case('cumulative retry accounting',cumulative)
def reserve():
    x=copy.deepcopy(metric); x['next_phase']['tokens']=5000; assert 'completion_reserve_tokens' in b.assess(x)['exceeded']
case('protected completion reserve refuses review overdraw',reserve)
def exhaustion():
    x=copy.deepcopy(metric); x['reviewers'][0].update(active_s=180,tokens=6000); eq(b.assess(x)['status'],'NEEDS_EXTRA_REVIEW')
case('exhaustion refuses further admission',exhaustion)
def finalized():
    x=copy.deepcopy(metric); x['reviewers'][0].update(phase_kind='finalization',completion_reserve_id=identity); assert 'finalization_already_committed_tokens' in b.assess(x)['exceeded']
case('committed finalization refuses new allocation',finalized)
def reuse():
    old={k:'same' for k in b.IDENTITY}; old['exit_code']=0; new=dict(old); new['candidate_sha']='different'; eq(b.reuse({'existing':old,'requested':new})['status'],'DO_NOT_REUSE')
case('reuse candidate mismatch refuses',reuse)
def startup():
    baseline=dump('fixture-startup.json',{'provider':'claude','executable_sha256':c.sha(sys.executable),'runtime_identity':worker['runtime_identity'],'fingerprints':[],'observed_input_tokens_floor':3000})
    x=copy.deepcopy(packet); x['worker']['startup_receipt']=bind(baseline); refuse(lambda:m.prepare(x),'allocation below observed')
case('launcher startup allowance refuses offline',startup)
def missingcontrol():
    x=copy.deepcopy(packet); x['worker']['profile']='readonly-review'; refuse(lambda:m.prepare(x),'separate native-control receipt')
case('launcher missing native control fails closed',missingcontrol)
def history():
    previous=dump('prior-fixture.json',{'unit_slug':packet['unit']['slug'],'reviewers':[{'id':'historical','active_s':None,'tokens':None}]})
    x=copy.deepcopy(packet); x['previous_receipt']=bind(previous); refuse(lambda:c.validate(x),'history removed/relabelled')
case('managed admission refuses history reset',history)
after={str(p):bind(p)['sha256'] for p in protected}; dump('canonical-after.json',after)
case('canonical raw bytes unchanged',lambda:eq(before,after))
dump('results.json',{'outcomes':results,'passed':sum(r['outcome']=='PASS' for r in results),'failed':sum(r['outcome']=='FAIL' for r in results),'command_active_s':time.monotonic()-START,'maker_full_active_s':None,'maker_actual_total_tokens':None,'ratio_status':'UNVERIFIED; synthetic fixtures prove arithmetic only','git_head':sha,'git_exit':head.returncode,'canonical_unchanged':before==after,'missing':['Live provider/control/startup validation excluded by authorization','Full maker and checker comparable runtime token telemetry unavailable','Independent checker verdict remaining','Repository-wide integration and pipeline sample checks not applicable to offline global helper validation']})
dump('managed-review-input.json',packet)
print(json.dumps({'passed':sum(r['outcome']=='PASS' for r in results),'failed':sum(r['outcome']=='FAIL' for r in results),'canonical_unchanged':before==after,'phase_s':time.monotonic()-START}))
sys.exit(any(r['outcome']=='FAIL' for r in results))
