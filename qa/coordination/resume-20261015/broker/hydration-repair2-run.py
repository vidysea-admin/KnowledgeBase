import pathlib,hashlib,json,sys,os,time,subprocess,importlib.util,uuid,re,shutil
OUT=pathlib.Path(__file__).resolve().parent;ROOT=OUT.parents[3];os.chdir(ROOT);start=time.monotonic();sha=lambda p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest();base=ROOT/'qa/coordination/resume-20261015/eval-pilot/offline-hydration-audit';load=lambda p:json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'));requestPath=base/'admitted-snapshot-repair2/broker-request.json';req=load(requestPath);assert req['candidate']=='a666f51df7ed8b49d54e5e9b6076468ac7f430eb6ec45cb8a06673e5911b5a3e';manifest=load(base/'pins.json');assert sha(base/'pins.json')==req['pinsSha256'];pins={str(ROOT/p['path']):p['sha256'] for p in manifest['files']+manifest['dataFiles']+manifest['ledgerFiles']};assert len(manifest['dataFiles'])==119 and len(manifest['ledgerFiles'])==4
assert sha(OUT/'broker_lib.py')=='580ee50c6203c1bac2245ad3fa630cc7692292d7017ec72c9745a35ed84f5e9f'
from broker_lib import closure
inventory={p['path']:p['sha256'] for p in manifest['sourceInventory']+manifest['files']};e=req['staticClosureEvidence'];cp=pathlib.Path(e['closurePath']);assert sha(cp)==e['closureSha256'];selected={p['path']:p['sha256'] for p in load(cp)['files']};selected.update({p['path']:p['sha256'] for p in req['changedFiles']});assert all(inventory.get(p)==v for p,v in selected.items()),'runtime closure drift';pins.update({str(ROOT/p):v for p,v in selected.items()});pins[str(cp)]=e['closureSha256']
node=req['commands'][0]['argv'][0];auth=ROOT/'qa/coordination/resume-20261015/eval-pilot/complete-answer/authorization.pending.json';authorization=load(auth);assert 'awaiting_human' in json.dumps(authorization);reservationIds=[]
for p in manifest['ledgerFiles']:
 if p['path'].endswith('.jsonl'):
  reservationIds += [r['id'] for r in map(json.loads,(ROOT/p['path']).read_text().splitlines()) if r.get('event')=='reserved']
assert sorted(reservationIds)==[1,2,3,4,5]
for p in [base/'pins.json',requestPath,base/'admitted-snapshot-repair2/expected-population-dataquality.json',base/'result.json',auth,pathlib.Path(node),pathlib.Path(sys.executable),pathlib.Path(__file__),OUT/'broker_lib.py',ROOT/'qa/coordination/resume-20261015/runtime-alias-repair/register.mjs',ROOT/'.cache/coordination/safe-test-runtime/register.mjs'] : pins[str(p)]=sha(p)
assert all(sha(p)==v for p,v in pins.items()),'initial pin mismatch';raw=json.dumps({'format':'hydration-narrow-pins-v1','files':pins,'sourceInventoryReference':{'path':str(base/'pins.json'),'sha256':req['pinsSha256']},'actualImportsEnforcedByAdapter':True},sort_keys=True,separators=(',',':')).encode();digest=hashlib.sha256(raw).hexdigest();cas=OUT/'pin-manifests'/(digest+'.json');cas.write_bytes(raw);ref={'path':str(cas),'sha256':digest,'count':len(pins)}
spec=importlib.util.spec_from_file_location('tree',ROOT/'scripts/qa/scoped-check-runner.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h);temp=OUT/('hydration-'+uuid.uuid4().hex);temp.mkdir();(temp/'probe').write_bytes(b'owned');(temp/'probe').unlink();os.environ.update(TEMP=str(temp),TMP=str(temp),PYTHONDONTWRITEBYTECODE='1');results=[];failure=None

def run(label,argv,budget):
 assert time.monotonic()-start+budget<=120,'phase insufficient';assert all(sha(p)==v for p,v in pins.items());t=time.monotonic();log=OUT/('hydration-repair2-'+label+'.log');r={'argv':argv,'cwd':str(ROOT),'pins':ref,'beforeMatch':True,'maxJobSeconds':budget,'accounting':'MAKER ACCEPTANCE offline hydration'};tree=None
 with log.open('xb') as f:
  try:
   tree=h.Tree(argv,str(ROOT),f);r['pid']=tree.process.pid
   try:tree.process.wait(timeout=budget-5)
   except subprocess.TimeoutExpired:r['timeout']=True
  finally:
   if tree:tree.close();tree.process.wait(timeout=5);r['exit']=tree.process.returncode;r['treeClosed']=True
 r.update(active_s=time.monotonic()-t,afterMatch=all(sha(p)==v for p,v in pins.items()),log={'path':str(log),'sha256':sha(log)});text=log.read_text(encoding='utf8',errors='replace');r['counts']={k:int(v) for k,v in re.findall(r'(?:#|ℹ) (tests|pass|fail|cancelled|skipped|todo) (\d+)',text)};p=OUT/('hydration-repair2-'+label+'-receipt.json');p.write_text(json.dumps(r,indent=2));results.append({'path':str(p),'sha256':sha(p),'exit':r['exit'],'active_s':r['active_s'],'counts':r['counts'],'log':r['log']});print(label,r['exit'],r['counts'],flush=True);assert r['exit']==0 and r['afterMatch'],'command failure/drift';return r
try:
 r=run('synthetic2',req['commands'][0]['argv'],10);assert r['counts'].get('tests')==2 and r['counts'].get('pass')==2 and r['counts'].get('skipped')==0
 run('focused4',req['commands'][1]['argv'],60);f=load(base/'result.focus-repair2.json');assert f['questions']==4 and f['coverage']=={'hydrated':4,'noExcerpts':0,'refused':0} and all(x['snapshotSHA256']==x['expectedSnapshotSHA256'] for x in f['rows']) and f['rawTurnCount']==3427 and f['admittedTurnCount']==3424 and len(f['dataQualityOpen'])==3 and all(v==0 for v in f['tripwires'].values()),'focused gate refused'
 # Focused immutable output bound by atomic artifact reference below; adapter verifies before full run
 run('all92',req['commands'][2]['argv'],min(60,119-(time.monotonic()-start)))
except BaseException as e:failure=type(e).__name__+': '+str(e);print(failure,flush=True)
artifacts=[{'path':str(p),'sha256':sha(p)} for p in [base/'result.focus-repair2.json',base/'result.all92-repair2.json',base/'refusal.focus-repair2.json',base/'refusal.all92-repair2.json'] if p.exists()];result=load(base/'result.all92-repair2.json') if (base/'result.all92-repair2.json').exists() else None
summary={'pins':ref,'atomicReceipts':results,'artifacts':artifacts,'failure':failure,'allPinsFinalMatch':all(sha(p)==v for p,v in pins.items()),'reservedRequestIds':reservationIds,'authorizationStatus':'awaiting_human','completeAnswerIds6to17NotSpentByThisUnit':True,'elapsed_s':time.monotonic()-start,'actual_total_tokens':None,'independentVerdict':None}
if result:summary['audit']={k:result[k] for k in ['status','questions','candidates','expectedSessions','candidatesWithoutAcceptedQuestion','coverage','tripwires','wallMs','rawTurnCount','admittedTurnCount','dataQualityOpen']};summary['actualImportedSources']=len(result['importedSourcePins'])
p=OUT/'hydration-repair2-final-seal.json';p.write_text(json.dumps(summary,indent=2));print(json.dumps({'seal':str(p),'sha256':sha(p),'failure':failure,'audit':summary.get('audit'),'elapsed_s':summary['elapsed_s']}),flush=True)
shutil.rmtree(temp)
