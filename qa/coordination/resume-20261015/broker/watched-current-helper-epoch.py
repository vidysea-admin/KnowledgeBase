import pathlib,hashlib,sys,json,os,time,subprocess,importlib.util,re
HERE=pathlib.Path(__file__).resolve();BROKER=HERE.parent
def rawsha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
assert rawsha(BROKER/'broker_lib.py')=='580ee50c6203c1bac2245ad3fa630cc7692292d7017ec72c9745a35ed84f5e9f'
from broker_lib import ROOT,OUT,NODE,sha,load
phase=time.monotonic();required={
 'qa/coordination/resume-20261015/broker/broker_lib.py':'580ee50c6203c1bac2245ad3fa630cc7692292d7017ec72c9745a35ed84f5e9f',
 'scripts/qa/scoped-check-runner.py':'d99983ba54d43ecf22bae2e2bad0dad7a57156d9bb16c36cc38d05d3cce3fc6a',
 'qa/coordination/resume-20261015/runtime-alias-repair/register.mjs':'e2af4f52f525032e808eae5452804fe7f83c51869ed427d106a3b128dd22999d'}
assert all(rawsha(ROOT/p)==h for p,h in required.items())
manifest='qa/coordination/resume-20261015/native-next-maker/combined-source-pins-watched-server-join-repair2.json';manifestSha='1ad28fd36efe8eb92c454949ed2305a29dac8c6760f51d0e4dbea2dfabb4c797';assert sha(ROOT/manifest)==manifestSha;unit=load(manifest);assert len(unit)==73 and all(sha(ROOT/p['path'])==p['sha256'] for p in unit)
paths={ROOT/p['path'] for p in unit}|{ROOT/p for p in required}|{HERE,ROOT/manifest,ROOT/'scripts/webinar/scheduler/service.mjs'}
for base in [ROOT/'packages',ROOT/'apps',ROOT/'workers',ROOT/'scripts/native-capture',ROOT/'scripts/watched-sources']:
 for directory,dirs,files in os.walk(base):
  dirs[:]=[d for d in dirs if d not in ['node_modules','dist','.git','__pycache__']]
  for n in files:
   p=pathlib.Path(directory)/n
   if p.suffix in ['.ts','.tsx','.mts','.cts','.js','.mjs','.json']:paths.add(p)
for rel in ['package.json','pnpm-lock.yaml','tsconfig.base.json','.dependency-cruiser.cjs','structure.config.json','scripts/lib/walk.mjs','scripts/lint-dirsize.mjs','.cache/coordination/safe-test-runtime/register.mjs','node_modules/typescript/package.json','node_modules/typescript/bin/tsc','node_modules/typescript/lib/typescript.js','node_modules/tsx/package.json','node_modules/tsx/dist/loader.mjs','node_modules/dependency-cruiser/package.json','node_modules/dependency-cruiser/bin/dependency-cruise.mjs']:paths.add(ROOT/rel)
pins={p.relative_to(ROOT).as_posix():sha(p) for p in sorted(paths) if p.is_file()};runtime={NODE:sha(NODE),str(pathlib.Path(sys.executable).resolve()):sha(sys.executable)}
assert runtime[NODE]=='3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237'
raw=json.dumps({'format':'canonical-source-runtime-pins-v2','sourceFiles':pins,'runtimeFiles':runtime,'purpose':'fresh watched28/roottypes/fullgraph/LOC actual inputs plus executing runner, broker library, supervisor and adapters'},sort_keys=True,separators=(',',':')).encode();digest=hashlib.sha256(raw).hexdigest();cas=OUT/'pin-manifests';cas.mkdir(exist_ok=True);canonical=cas/(digest+'.json')
if canonical.exists():assert canonical.read_bytes()==raw
else:canonical.write_bytes(raw)
ref={'path':str(canonical),'sha256':digest,'sourceCount':len(pins),'runtimeCount':len(runtime)};results=[]
spec=importlib.util.spec_from_file_location('verified_tree',ROOT/'scripts/qa/scoped-check-runner.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
temp=OUT/'watched-current-helper-epoch-temp';temp.mkdir(exist_ok=True);(temp/'probe').write_bytes(b'owned');(temp/'probe').unlink();os.environ.update(TMP=str(temp),TEMP=str(temp),LKB_NATIVE_PUBLICATION_MONGO_RUN='0',LKB_WHATSAPP_CONSENT_MONGO_RUN='0',PYTHONDONTWRITEBYTECODE='1')
def matches():return all(sha(ROOT/p)==v for p,v in pins.items()) and all(sha(p)==v for p,v in runtime.items())
def command(label,argv,limit):
 remaining=115-(time.monotonic()-phase);assert remaining>limit,'phase admission budget insufficient';assert matches(),'current source/helper/runtime drift before launch';t=time.monotonic();log=OUT/(label+'.log');tree=None;r={'argv':argv,'cwd':str(ROOT),'canonicalManifest':ref,'requiredHelpersBefore':required,'allPinsBeforeMatch':True,'ownRunnerSha256':pins[HERE.relative_to(ROOT).as_posix()],'maxCommandExecutionSeconds':limit,'maxTreeCleanupSeconds':5}
 try:
  with log.open('wb') as stream:
   tree=h.Tree(argv,str(ROOT),stream);r['pid']=tree.process.pid
   try:r['exit']=tree.process.wait(timeout=limit)
   except subprocess.TimeoutExpired:r['timeout']=True
   finally:tree.close();tree.process.wait(timeout=5);r['exit']=tree.process.returncode;r['ownedTreeClosed']=True
 finally:
  if tree:tree.close()
  r['allPinsAfterMatch']=matches();r['requiredHelpersAfter']={p:sha(ROOT/p) for p in required};r['active_s']=time.monotonic()-t;r['log']={'path':str(log),'sha256':sha(log)};text=log.read_text(encoding='utf8',errors='replace');r['counts']={k:int(v) for k,v in re.findall(r'(?:#|ℹ) (tests|pass|fail|cancelled|skipped|todo) (\d+)',text)};receipt=OUT/(label+'-receipt.json');receipt.write_text(json.dumps(r,indent=2));results.append({'path':str(receipt),'sha256':sha(receipt),'exit':r.get('exit'),'counts':r['counts'],'active_s':r['active_s']});print(label,r.get('exit'),r['counts'],flush=True)
 return r
failure=None
try:
 r=command('watched-current-helper-preflight',[NODE,'--input-type=module','-e',"console.log(JSON.stringify({node:process.execPath,version:process.version,typescript:import.meta.resolve('typescript'),tsx:import.meta.resolve('tsx')}))"],10);identity=json.loads(pathlib.Path(r['log']['path']).read_text());assert r['exit']==0 and all(identity[k].startswith((ROOT/'node_modules').as_uri()) for k in ['typescript','tsx'])
 config=OUT/'watched-current-helper-tsconfig.json';files=sorted((ROOT/'scripts/native-capture').glob('*.ts'));assert len(files)==7;config.write_text(json.dumps({'extends':(ROOT/'tsconfig.base.json').as_posix(),'files':[p.as_posix() for p in files],'compilerOptions':{'types':['node'],'typeRoots':[(ROOT/'node_modules/@types').as_posix()]}}))
 r=command('watched-current-helper-root-types',[NODE,'node_modules/typescript/bin/tsc','--noEmit','-p',str(config)],65);assert r['exit']==0 and r['allPinsAfterMatch'],'compiler/source failure'
 r=command('watched-current-helper-full-graph',[NODE,'node_modules/dependency-cruiser/bin/dependency-cruise.mjs','--config','.dependency-cruiser.cjs','packages','apps','workers','scripts/native-capture','scripts/watched-sources'],45);assert r['exit']==0 and r['allPinsAfterMatch'],'graph/source failure'
 js="import {countLoc,loadConfig} from './scripts/lib/walk.mjs';import {check} from './scripts/lint-dirsize.mjs';const c=loadConfig(process.cwd()),names=['scripts/native-capture/server.ts','scripts/native-capture/server-watched.test.ts','scripts/watched-sources/host.ts','scripts/watched-sources/supervisor.ts','scripts/webinar/scheduler/service.d.mts'];const rows=names.map(p=>{const n=countLoc(p),limit=p.endsWith('.test.ts')?c.loc.testMax:c.loc.max;return {path:p,nonblank:n,limit,ok:n<=limit}});c.roots=['scripts/native-capture','scripts/watched-sources','scripts/webinar/scheduler'];const directory=check(process.cwd(),c);console.log(JSON.stringify({rows,directory},null,2));process.exitCode=rows.some(r=>!r.ok)||directory.violations.length?1:0;"
 r=command('watched-current-helper-scoped-structure',[NODE,'--input-type=module','-e',js],10);assert r['exit']==0 and r['allPinsAfterMatch'],'structure/source failure'
 adapter=(ROOT/'qa/coordination/resume-20261015/runtime-alias-repair/register.mjs').as_uri();r=command('watched-current-helper-all28',[NODE,'--test','--test-concurrency=1','--test-timeout=60000','--import',adapter,'scripts/native-capture/server.test.ts','scripts/native-capture/server-watched.test.ts','scripts/watched-sources/host.test.ts','apps/api/src/connector-workflow/watched-job.test.ts'],65);assert r['exit']==0 and r['counts'].get('tests')==28 and r['counts'].get('pass')==28 and r['allPinsAfterMatch'],'28-case failure/selection/source mismatch'
except BaseException as e:failure=type(e).__name__+': '+str(e);print(failure,flush=True)
summary={'status':'CURRENT_EPOCH_COMPLETE' if failure is None else 'CURRENT_EPOCH_HOLD','unitManifest':{'path':manifest,'sha256':manifestSha,'count':73},'canonicalManifest':ref,'requiredHelperPins':required,'atomicReceipts':results,'failure':failure,'allPinsFinalMatch':matches(),'unit73PinsFinalMatch':all(sha(ROOT/p['path'])==p['sha256'] for p in unit),'elapsed_s':time.monotonic()-phase,'historicalSameByteBrokerLibraryBinding':'UNKNOWN; no retrospective identity claim or old-proof rewrite','historicalReceiptReuseUsed':False,'sourceFreezeReleased':True,'noRealDbProviderNetworkBrowserHostOrDecoder':True,'actual_total_tokens':None,'independentVerdict':None};(OUT/'watched-current-helper-final-seal.json').write_text(json.dumps(summary,indent=2));print(json.dumps({'failure':failure,'elapsed_s':summary['elapsed_s'],'pinsStable':summary['allPinsFinalMatch'],'sourcePins':len(pins)}))
