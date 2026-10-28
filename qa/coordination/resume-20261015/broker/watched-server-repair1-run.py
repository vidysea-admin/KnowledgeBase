from broker_lib import ROOT,OUT,NODE,sha,load
import pathlib,json,os,time,subprocess,importlib.util,hashlib,re
phase=time.monotonic();base='qa/coordination/resume-20261015/native-next-maker/';manifest=base+'combined-source-pins-watched-server-join-repair1.json';assert sha(ROOT/manifest)=='4ad0bc94b0c858788e1e683b1ed9ff2e85e1cf95dc66bc3db3d7731de43eaf26';unit=load(manifest);assert len(unit)==72 and all(sha(ROOT/p['path'])==p['sha256'] for p in unit)
paths=set()
for basepath in [ROOT/'packages',ROOT/'apps',ROOT/'workers',ROOT/'scripts/native-capture',ROOT/'scripts/watched-sources']:
 for directory,dirs,files in os.walk(basepath):
  dirs[:]=[d for d in dirs if d not in ['node_modules','dist','.git','__pycache__']]
  for name in files:
   p=pathlib.Path(directory)/name
   if p.suffix in ['.ts','.tsx','.mts','.cts','.js','.mjs','.json']:paths.add(p)
for rel in ['package.json','pnpm-lock.yaml','tsconfig.base.json','.dependency-cruiser.cjs','structure.config.json','scripts/lib/walk.mjs','scripts/lint-dirsize.mjs','scripts/qa/scoped-check-runner.py','qa/coordination/resume-20261015/runtime-alias-repair/register.mjs','.cache/coordination/safe-test-runtime/register.mjs','node_modules/typescript/package.json','node_modules/typescript/bin/tsc','node_modules/typescript/lib/typescript.js','node_modules/tsx/package.json','node_modules/tsx/dist/loader.mjs','node_modules/dependency-cruiser/package.json','node_modules/dependency-cruiser/bin/dependency-cruise.mjs']:paths.add(ROOT/rel)
pins={p.relative_to(ROOT).as_posix():sha(p) for p in sorted(paths) if p.is_file()};raw=json.dumps({'format':'canonical-source-pins-v1','purpose':'actual complete dependency-cruise inputs plus root-script compiler/test closure; excludes unrelated schema/Python/CSS/QA trees','files':pins},sort_keys=True,separators=(',',':')).encode();digest=hashlib.sha256(raw).hexdigest();cas=OUT/'pin-manifests';cas.mkdir(exist_ok=True);canonical=cas/(digest+'.json')
if canonical.exists():assert canonical.read_bytes()==raw
else:canonical.write_bytes(raw)
ref={'path':str(canonical),'sha256':digest,'count':len(pins)};results=[]
spec=importlib.util.spec_from_file_location('verified_tree',ROOT/'scripts/qa/scoped-check-runner.py');treeModule=importlib.util.module_from_spec(spec);spec.loader.exec_module(treeModule)
temp=OUT/'watched-server-repair1-temp';temp.mkdir(exist_ok=True);(temp/'probe').write_bytes(b'owned');(temp/'probe').unlink();os.environ.update(TMP=str(temp),TEMP=str(temp),LKB_NATIVE_PUBLICATION_MONGO_RUN='0',LKB_WHATSAPP_CONSENT_MONGO_RUN='0')
def run(label,argv,limit=70):
 assert 170-(time.monotonic()-phase)>=limit,'phase budget insufficient'
 t=time.monotonic();before={p:sha(ROOT/p) for p in pins};assert before==pins,'source drift before dispatch';log=OUT/(label+'.log');tree=None;r={'label':label,'argv':argv,'cwd':str(ROOT),'canonicalPins':ref,'pinsBeforeMatch':True,'runtime':{'path':argv[0],'sha256':sha(argv[0])},'lockSha256':pins['pnpm-lock.yaml'],'supervisorSha256':pins['scripts/qa/scoped-check-runner.py']}
 try:
  with log.open('wb') as stream:
   tree=treeModule.Tree(argv,str(ROOT),stream);r['pid']=tree.process.pid
   try:r['exit']=tree.process.wait(timeout=limit)
   except subprocess.TimeoutExpired:r['timeout']=True
   finally:tree.close();tree.process.wait(timeout=5);r['exit']=tree.process.returncode;r['treeClosed']=True
 finally:
  if tree:tree.close()
  after={p:sha(ROOT/p) for p in pins};r['pinsAfterMatch']=after==pins;r['drift']=[p for p in pins if after[p]!=pins[p]];r['active_s']=time.monotonic()-t;r['log']={'path':str(log),'sha256':sha(log)};text=log.read_text(encoding='utf8',errors='replace');r['counts']={k:int(v) for k,v in re.findall(r'(?:#|ℹ) (tests|pass|fail|cancelled|skipped|todo) (\d+)',text)};receipt=OUT/(label+'-receipt.json');receipt.write_text(json.dumps(r,indent=2));results.append({'path':str(receipt),'sha256':sha(receipt),'label':label,'exit':r.get('exit'),'counts':r.get('counts'),'active_s':r['active_s']});print(label,r.get('exit'),r.get('counts'),flush=True)
 return r
try:
 pre=run('watched-server-repair1-preflight',[NODE,'--input-type=module','-e',"console.log(JSON.stringify({executable:process.execPath,version:process.version,tsx:import.meta.resolve('tsx'),typescript:import.meta.resolve('typescript')}))"],10);assert pre['exit']==0
 config=OUT/'watched-server-repair1-tsconfig.json';files=sorted((ROOT/'scripts/native-capture').glob('*.ts'));assert len(files)==7;config.write_text(json.dumps({'extends':(ROOT/'tsconfig.base.json').as_posix(),'files':[p.as_posix() for p in files],'compilerOptions':{'types':['node'],'typeRoots':[(ROOT/'node_modules/@types').as_posix()]}}))
 r=run('watched-server-repair1-root-types',[NODE,'node_modules/typescript/bin/tsc','--noEmit','-p',str(config)]);assert r['exit']==0,'root types failure'
 r=run('watched-server-repair1-full-graph',[NODE,'node_modules/dependency-cruiser/bin/dependency-cruise.mjs','--config','.dependency-cruiser.cjs','packages','apps','workers','scripts/native-capture','scripts/watched-sources'],50);assert r['exit']==0,'dependency graph failure'
 js="import {countLoc,loadConfig} from './scripts/lib/walk.mjs';import {check} from './scripts/lint-dirsize.mjs';const c=loadConfig(process.cwd()),names=['scripts/native-capture/server.ts','scripts/native-capture/server-watched.test.ts'];const rows=names.map(p=>{const n=countLoc(p),limit=p.endsWith('.test.ts')?c.loc.testMax:c.loc.max;return {path:p,nonblank:n,limit,ok:n<=limit}});c.roots=['scripts/native-capture','scripts/watched-sources'];const directory=check(process.cwd(),c);console.log(JSON.stringify({rows,directory},null,2));process.exitCode=rows.some(r=>!r.ok)||directory.violations.length?1:0;"
 r=run('watched-server-repair1-scoped-structure',[NODE,'--input-type=module','-e',js],15);assert r['exit']==0,'affected structure failure'
 adapter=(ROOT/'qa/coordination/resume-20261015/runtime-alias-repair/register.mjs').as_uri();r=run('watched-server-repair1-focused16',[NODE,'--test','--test-concurrency=1','--test-timeout=60000','--import',adapter,'scripts/native-capture/server.test.ts','scripts/native-capture/server-watched.test.ts']);assert r['exit']==0 and r['counts'].get('tests')==16,'focused test failure or count mismatch'
 reuse=[];eligible=True
 for name,count in [('watched-cadence-new7',7),('watched-cadence-existing5',5)]:
  oldpath=OUT/(name+'-receipt.json');old=json.loads(oldpath.read_text());matches=old['exit']==0 and old['counts']['tests']==count and old['counts']['pass']==count and old['pins_unchanged'] and old['runtime_sha256']==sha(NODE) and old['lock_sha256']==sha(ROOT/'pnpm-lock.yaml') and sha(pathlib.Path(old['log']))==old['log_sha256'] and all(sha(ROOT/p)==h for p,h in old['pins_after'].items());eligible=eligible and matches;reuse.append({'receipt':{'path':str(oldpath),'sha256':sha(oldpath)},'tests':count,'eligible':matches,'scope':'only source-identical upstream test file; original flags retained in receipt'})
 if not eligible:
  r=run('watched-server-repair1-upstream12',[NODE,'--test','--test-concurrency=1','--test-timeout=60000','--import',adapter,'scripts/watched-sources/host.test.ts','apps/api/src/connector-workflow/watched-job.test.ts']);assert r['exit']==0 and r['counts']['tests']==12,'upstream failure'
except BaseException as e:
 failure=type(e).__name__+': '+str(e);print(failure,flush=True)
else:failure=None
summary={'unitManifest':{'path':manifest,'sha256':sha(ROOT/manifest),'count':72},'canonicalPins':ref,'commandReceipts':results,'upstreamReuse':locals().get('reuse',[]),'failure':failure,'elapsed_s':time.monotonic()-phase,'finalPinsMatch':all(sha(ROOT/p)==h for p,h in pins.items()),'noNativeDecoderOrActivation':True,'actual_total_tokens':None,'independentVerdict':None};(OUT/'watched-server-repair1-final-seal.json').write_text(json.dumps(summary,indent=2));print(json.dumps({'elapsed_s':summary['elapsed_s'],'failure':failure,'pins':len(pins),'sourceStable':summary['finalPinsMatch']}))
