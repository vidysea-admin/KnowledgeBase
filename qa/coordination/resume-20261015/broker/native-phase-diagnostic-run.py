import pathlib,json,hashlib,sys,os,time,subprocess,importlib.util,shutil,re
OUT=pathlib.Path(__file__).resolve().parent;ROOT=OUT.parents[3];sha=lambda p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest();load=lambda p:json.loads((ROOT/p).read_text(encoding='utf-8-sig'));start=time.monotonic();request='qa/coordination/resume-20261015/native-next-maker/native-guard-phases/broker-request.json';assert sha(ROOT/request)=='3fdb35142ed7ae533642de3075a64af6d34d1dac545fe5983c460ecc99a6e6d6';req=load(request);assert sha(ROOT/req['candidate_manifest'])==req['candidate_manifest_sha256'];unit=load(req['candidate_manifest']);assert len(unit)==74
pins={str(ROOT/p['path']):p['sha256'] for p in unit};helpers={'qa/coordination/resume-20261015/broker/broker_lib.py':'580ee50c6203c1bac2245ad3fa630cc7692292d7017ec72c9745a35ed84f5e9f','scripts/qa/scoped-check-runner.py':'d99983ba54d43ecf22bae2e2bad0dad7a57156d9bb16c36cc38d05d3cce3fc6a','qa/coordination/resume-20261015/runtime-alias-repair/register.mjs':req['prerequisites']['adapter_sha256']};pins.update({str(ROOT/p):h for p,h in helpers.items()});node=req['sequence'][0]['argv'][0];pins[node]=req['prerequisites']['runtime_sha256'];pins[str(ROOT/'pnpm-lock.yaml')]=req['prerequisites']['lock_sha256'];helper=ROOT/'packages/meeting-bot/src/capture/record-consent/native-acl-fixture.ps1';powershell=pathlib.Path(os.environ.get('SystemRoot','C:/Windows'))/'System32/WindowsPowerShell/v1.0/powershell.exe';git=shutil.which('git');assert git
for p in [pathlib.Path(__file__),ROOT/request,ROOT/req['candidate_manifest'],helper,powershell,pathlib.Path(git),pathlib.Path(sys.executable),ROOT/'.cache/coordination/safe-test-runtime/register.mjs']:pins[str(p)]=sha(p)
bins={p['Name']:p['Source'] for p in load('qa/coordination/resume-20261015/broker/native-binaries.json')};known=load('qa/coordination/resume-20261015/broker/native-binary-hashes.json')
for k,p in bins.items():pins[p]=known[k]['sha256']
assert all(sha(p)==h for p,h in pins.items());raw=json.dumps({'format':'native-phase-diagnostic-pins-v1','files':pins},sort_keys=True,separators=(',',':')).encode();digest=hashlib.sha256(raw).hexdigest();cas=OUT/'pin-manifests'/(digest+'.json');cas.write_bytes(raw);ref={'path':str(cas),'sha256':digest,'count':len(pins)}
spec=importlib.util.spec_from_file_location('verified_tree',ROOT/'scripts/qa/scoped-check-runner.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h);fixture=None;results=[];failure=None
def run(label,argv,budget,cwd=ROOT):
 assert all(sha(p)==v for p,v in pins.items()),'source/runtime/helper drift';t=time.monotonic();log=OUT/('native-phase-diagnostic-'+label+'.log');r={'argv':argv,'cwd':str(cwd),'pins':ref,'beforeMatch':True,'maxJobSeconds':budget,'accounting':'SHARED INTEGRATION, not watched checker'};tree=None
 with log.open('wb') as stream:
  try:
   tree=h.Tree(argv,str(cwd),stream);r['pid']=tree.process.pid
   try:r['exit']=tree.process.wait(timeout=max(.1,budget-5))
   except subprocess.TimeoutExpired:r['timeout']=True
  finally:
   if tree:tree.close();tree.process.wait(timeout=5);r['exit']=tree.process.returncode;r['ownedTreeClosed']=True
 r['afterMatch']=all(sha(p)==v for p,v in pins.items());r['active_s']=time.monotonic()-t;r['log']={'path':str(log),'sha256':sha(log)};text=log.read_text(encoding='utf8',errors='replace');r['counts']={k:int(v) for k,v in re.findall(r'(?:#|ℹ) (tests|pass|fail|cancelled|skipped|todo) (\d+)',text)};receipt=OUT/('native-phase-diagnostic-'+label+'-receipt.json');receipt.write_text(json.dumps(r,indent=2));results.append({'path':str(receipt),'sha256':sha(receipt),'exit':r['exit'],'counts':r['counts'],'active_s':r['active_s'],'log':r['log']});print(label,r['exit'],r['counts'],flush=True);return r,text
try:
 r,text=run('head-before',[git,'rev-parse','HEAD'],7);assert r['exit']==0 and text.strip()=='d0f6f2eff242f98a85ba4ccde483db08030ba3c8','GitHEAD mismatch'
 for step in req['sequence'][:2]:
  r,text=run(step['stage'],step['argv'],min(20,30-(time.monotonic()-start)),pathlib.Path(step['cwd']));assert r['exit']==0 and r['afterMatch'],'prerequisite failure';
  if 'expected' in step:assert all(r['counts'].get(k)==v for k,v in step['expected'].items()),'helper selection mismatch'
 os.environ.update(PSModulePath=str(powershell.parent/'Modules'),LKB_NATIVE_PUBLICATION_MONGO_RUN='0',LKB_WHATSAPP_CONSENT_MONGO_RUN='0',KB_U24_PRIVATE_TOC_TESTS='0',T054_AUTHENTIC_INPUT_OPT_IN='0')
 r,text=run('acl-create',[str(powershell),'-NoProfile','-NonInteractive','-File',str(helper),'-Action','Create'],15);assert r['exit']==0;fixture=pathlib.Path(json.loads(text)['fixtureDirectory']);assert fixture.resolve().parent==(ROOT/'qa/evidence/native-acl-fixtures').resolve() and fixture.resolve().is_relative_to(ROOT.resolve()) and re.fullmatch(r'[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}',fixture.name)
 os.environ.update(TMP=str(fixture),TEMP=str(fixture),LKB_NATIVE_TEST_PRIVATE_DIR=str(fixture),LKB_NATIVE_TEST_FFMPEG=bins['ffmpeg.exe'],LKB_NATIVE_TEST_FFPROBE=bins['ffprobe.exe']);adapter=(ROOT/'qa/coordination/resume-20261015/runtime-alias-repair/register.mjs').as_uri()
 r,text=run('acl-verify',[node,'--input-type=module','--import',adapter,'-e',"const {verifyPrivateDirectory}=await import(process.argv[1]);verifyPrivateDirectory(process.argv[2]);console.log('protected owned UUID verified');",(ROOT/'packages/meeting-bot/src/capture/record-consent/private-acl.ts').as_uri(),str(fixture)],15);assert r['exit']==0
 assert 120-(time.monotonic()-start)>=90,'insufficient full75guard+15cleanup admission'
 tracepath=fixture/'native-guard-phases.jsonl';assert not tracepath.exists();os.environ['LKB_NATIVE_GUARD_PHASE_LOG']=str(tracepath)
 r,text=run('guards2',req['sequence'][2]['argv'],75)
 if r['exit']!=0 or r.get('timeout'):failure='guard failure/timeout; inspect exact raw output; no retry'
 elif any(r['counts'].get(k)!=v for k,v in {'tests':2,'pass':2,'fail':0,'skipped':0,'cancelled':0}.items()):failure='selected terminal result mismatch; incomplete'
except BaseException as e:failure=type(e).__name__+': '+str(e);print(failure,flush=True)
finally:
 trace={'status':'DIAGNOSTIC_INCOMPLETE','records':0}
 if fixture is not None:
  tracepath=fixture/'native-guard-phases.jsonl'
  if tracepath.exists():
   rawtrace=tracepath.read_bytes();target=OUT/'native-phase-diagnostic-trace.jsonl';target.write_bytes(rawtrace);rows=[json.loads(v) for v in rawtrace.splitlines()];catalog=load('qa/coordination/resume-20261015/native-next-maker/native-guard-phases/stage-catalog.json');allowed=set(catalog['expected_sequence']) if 'expected_sequence' in catalog else set(v for value in catalog.values() if isinstance(value,list) for v in value if isinstance(v,str) and v.startswith('node'));valid=len(rawtrace)<=65536 and len(rows)<=256 and all(set(v)=={'stageId','elapsedMs'} and v['stageId'] in allowed and isinstance(v['elapsedMs'],int) and 0<=v['elapsedMs']<=75000 for v in rows) and all(b['elapsedMs']>=a['elapsedMs'] for a,b in zip(rows,rows[1:]));trace={'status':'COMPLETE' if valid and len(rows)==76 else 'DIAGNOSTIC_INCOMPLETE','validScalarMonotonic':valid,'records':len(rows),'last':rows[-1] if rows else None,'path':str(target),'sha256':sha(target)};print(json.dumps({'trace':trace}),flush=True)
 if fixture is not None:run('acl-cleanup',[str(powershell),'-NoProfile','-NonInteractive','-File',str(helper),'-Action','Cleanup','-FixtureDirectory',str(fixture)],15)
 r,text=run('head-after',[git,'rev-parse','HEAD'],7);headAfter=text.strip();failure=failure or (None if r['exit']==0 and headAfter=='d0f6f2eff242f98a85ba4ccde483db08030ba3c8' else 'GitHEAD changed/unavailable')
summary={'request':{'path':request,'sha256':sha(ROOT/request)},'candidate':'d0f6f2eff242f98a85ba4ccde483db08030ba3c8','pins':ref,'trace':trace,'atomicReceipts':results,'failure':failure,'selectedTitles':req['sequence'][2]['argv'][-2],'elapsed_s':time.monotonic()-start,'allPinsFinalMatch':all(sha(p)==v for p,v in pins.items()),'headAfter':headAfter,'ownedFixtureRemoved':fixture is not None and not fixture.exists(),'accounting':'SHARED INTEGRATION only; not watched checker','actual_total_tokens':None,'independentVerdict':None};seal=OUT/'native-phase-diagnostic-final-seal.json';seal.write_text(json.dumps(summary,indent=2));print(json.dumps({'seal':str(seal),'sha256':sha(seal),'elapsed_s':summary['elapsed_s'],'failure':failure}))
