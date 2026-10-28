import pathlib,json,hashlib,sys,os,time,subprocess,importlib.util,shutil,re
OUT=pathlib.Path(__file__).resolve().parent;ROOT=OUT.parents[3];sha=lambda p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest();load=lambda p:json.loads((ROOT/p).read_text(encoding='utf-8-sig'));start=time.monotonic();request='qa/coordination/resume-20261015/native-next-maker/native-guard-phases/broker-request.json';assert sha(ROOT/request)=='3fdb35142ed7ae533642de3075a64af6d34d1dac545fe5983c460ecc99a6e6d6';req=load(request);assert sha(ROOT/req['candidate_manifest'])==req['candidate_manifest_sha256'];unit=load(req['candidate_manifest']);assert len(unit)==74
pins={str(ROOT/p['path']):p['sha256'] for p in unit};helpers={'qa/coordination/resume-20261015/broker/broker_lib.py':'580ee50c6203c1bac2245ad3fa630cc7692292d7017ec72c9745a35ed84f5e9f','scripts/qa/scoped-check-runner.py':'d99983ba54d43ecf22bae2e2bad0dad7a57156d9bb16c36cc38d05d3cce3fc6a','qa/coordination/resume-20261015/runtime-alias-repair/register.mjs':req['prerequisites']['adapter_sha256']};pins.update({str(ROOT/p):h for p,h in helpers.items()});node=req['sequence'][0]['argv'][0];pins[node]=req['prerequisites']['runtime_sha256'];pins[str(ROOT/'pnpm-lock.yaml')]=req['prerequisites']['lock_sha256'];helper=ROOT/'packages/meeting-bot/src/capture/record-consent/native-acl-fixture.ps1';powershell=pathlib.Path(os.environ.get('SystemRoot','C:/Windows'))/'System32/WindowsPowerShell/v1.0/powershell.exe';git=shutil.which('git');assert git
for p in [pathlib.Path(__file__),ROOT/request,ROOT/req['candidate_manifest'],helper,powershell,pathlib.Path(git),pathlib.Path(sys.executable),ROOT/'.cache/coordination/safe-test-runtime/register.mjs']:pins[str(p)]=sha(p)
bins={p['Name']:p['Source'] for p in load('qa/coordination/resume-20261015/broker/native-binaries.json')};known=load('qa/coordination/resume-20261015/broker/native-binary-hashes.json')
for k,p in bins.items():pins[p]=known[k]['sha256']
assert all(sha(p)==h for p,h in pins.items());raw=json.dumps({'format':'native-bot-compiler60-pins-v1','files':pins},sort_keys=True,separators=(',',':')).encode();digest=hashlib.sha256(raw).hexdigest();cas=OUT/'pin-manifests'/(digest+'.json');cas.write_bytes(raw);ref={'path':str(cas),'sha256':digest,'count':len(pins)}
spec=importlib.util.spec_from_file_location('verified_tree',ROOT/'scripts/qa/scoped-check-runner.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h);fixture=None;results=[];failure=None
def run(label,argv,budget,cwd=ROOT):
 assert all(sha(p)==v for p,v in pins.items()),'source/runtime/helper drift';t=time.monotonic();log=OUT/('native-bot-compiler60-'+label+'.log');r={'argv':argv,'cwd':str(cwd),'pins':ref,'beforeMatch':True,'maxJobSeconds':budget,'accounting':'SHARED INTEGRATION, not watched checker'};tree=None
 with log.open('wb') as stream:
  try:
   tree=h.Tree(argv,str(cwd),stream);r['pid']=tree.process.pid
   try:r['exit']=tree.process.wait(timeout=max(.1,budget-5))
   except subprocess.TimeoutExpired:r['timeout']=True
  finally:
   if tree:tree.close();tree.process.wait(timeout=5);r['exit']=tree.process.returncode;r['ownedTreeClosed']=True
 r['afterMatch']=all(sha(p)==v for p,v in pins.items());r['active_s']=time.monotonic()-t;r['log']={'path':str(log),'sha256':sha(log)};text=log.read_text(encoding='utf8',errors='replace');r['counts']={k:int(v) for k,v in re.findall(r'(?:#|ℹ) (tests|pass|fail|cancelled|skipped|todo) (\d+)',text)};receipt=OUT/('native-bot-compiler60-'+label+'-receipt.json');receipt.write_text(json.dumps(r,indent=2));results.append({'path':str(receipt),'sha256':sha(receipt),'exit':r['exit'],'counts':r['counts'],'active_s':r['active_s'],'log':r['log']});print(label,r['exit'],r['counts'],flush=True);return r,text
try:
 r,text=run('head-before',[git,'rev-parse','HEAD'],7);assert r['exit']==0 and text.strip()=='d0f6f2eff242f98a85ba4ccde483db08030ba3c8','GitHEAD mismatch'
 step=req['sequence'][0];r,text=run('bot-types',step['argv'],60,pathlib.Path(step['cwd']));assert r['exit']==0 and r['afterMatch'],'compiler failure/timeout; no guards admitted'
except BaseException as e:failure=type(e).__name__+': '+str(e);print(failure,flush=True)
finally:
 trace={'status':'NOT_REQUESTED_COMPILER_ONLY'}
 r,text=run('head-after',[git,'rev-parse','HEAD'],7);headAfter=text.strip();failure=failure or (None if r['exit']==0 and headAfter=='d0f6f2eff242f98a85ba4ccde483db08030ba3c8' else 'GitHEAD changed/unavailable')
summary={'request':{'path':request,'sha256':sha(ROOT/request)},'candidate':'d0f6f2eff242f98a85ba4ccde483db08030ba3c8','pins':ref,'trace':trace,'atomicReceipts':results,'failure':failure,'selectedTitles':req['sequence'][2]['argv'][-2],'elapsed_s':time.monotonic()-start,'allPinsFinalMatch':all(sha(p)==v for p,v in pins.items()),'headAfter':headAfter,'ownedFixtureRemoved':fixture is not None and not fixture.exists(),'accounting':'SHARED INTEGRATION only; not watched checker','actual_total_tokens':None,'independentVerdict':None};seal=OUT/'native-bot-compiler60-final-seal.json';seal.write_text(json.dumps(summary,indent=2));print(json.dumps({'seal':str(seal),'sha256':sha(seal),'elapsed_s':summary['elapsed_s'],'failure':failure}))
