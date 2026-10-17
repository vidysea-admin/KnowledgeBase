import pathlib,os,json,time,hashlib,re,importlib.util,sys,subprocess
out=pathlib.Path(__file__).parent;root=out.parents[3];start=time.monotonic()
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def load(p):return json.loads((root/p).read_text(encoding='utf-8-sig'))
spec=importlib.util.spec_from_file_location('verified_tree',root/'scripts/qa/scoped-check-runner.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
node='C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe';temp=out/'phase-a-temp';temp.mkdir(exist_ok=True);probe=temp/'owned-probe';probe.mkdir();(probe/'bytes').write_bytes(b'probe');assert (probe/'bytes').read_bytes()==b'probe';(probe/'bytes').unlink();probe.rmdir();os.environ.update(TMP=str(temp),TEMP=str(temp),KB_U24_PRIVATE_TOC_TESTS='0',T054_AUTHENTIC_INPUT_OPT_IN='0',LKB_WHATSAPP_CONSENT_MONGO_RUN='0')
central=load('qa/coordination/resume-20261015/native-central-maker/source-pins.json');assert all(sha(root/j['path'])==j['sha256'] for j in central['files']),'central freeze pin drift'
excluded={'scripts/eval/vectorless-production-eval.mjs','scripts/eval/vectorless-production-eval.test.mjs'}
def inventory():
 paths=set()
 bases=[root/'apps/api/src']+[p/'src' for p in (root/'packages').iterdir() if p.is_dir() and (p/'src').is_dir()]
 for base in bases:
  for d,ds,fs in os.walk(base):
   ds[:]=[n for n in ds if n not in ['node_modules','dist','.git']]
   for name in fs:
    p=pathlib.Path(d)/name
    if p.suffix in ['.ts','.tsx','.mts','.cts','.js','.mjs','.json']:paths.add(p)
 for package in [root/'apps/api']+[p for p in (root/'packages').iterdir() if p.is_dir()]:
  for pattern in ['package.json','tsconfig*.json']:
   paths.update(package.glob(pattern))
 paths.update(root.glob('tsconfig*.json'));paths.update([root/'package.json',root/'pnpm-lock.yaml',root/'structure.config.json',root/'contracts/contracts.json',root/'contracts/verify_contracts.py',root/'scripts/qa/scoped-check-runner.py',root/'node_modules/typescript/package.json',root/'node_modules/typescript/bin/tsc'])
 return {p.relative_to(root).as_posix():sha(p) for p in sorted(paths) if p.is_file()}
before=inventory();(out/'phase-a-inventory-before.json').write_text(json.dumps(before,indent=2))
suspects=[]
for rel in before:
 if (root/rel).suffix in ['.ts','.tsx','.mts','.cts','.js','.mjs']:
  txt=(root/rel).read_text(encoding='utf-8',errors='replace')
  if 'vectorless-production-eval' in txt:suspects.append(rel)
assert not suspects,'active eval actor source imported by compiler source inventory'
auth={'authority':'root explicit PhaseA ALLNATIVEFROZEN dispatch supersedes stale native-active-writers-current entries','frozen_central_pins':central,'active_actor_excluded':sorted(excluded),'exclusion_check':'no vectorless-production-eval string/import references in inventoried apps/api and package sources','node_sha256':sha(node),'python':sys.executable,'python_sha256':sha(sys.executable),'inventory_count':len(before)};(out/'phase-a-authority.json').write_text(json.dumps(auth,indent=2))
receipts=[]
def run(label,argv,cwd,limit):
 rec={'label':label,'argv':argv,'cwd':str(cwd),'actual_total_tokens':None,'supervisor_sha256':sha(root/'scripts/qa/scoped-check-runner.py')};t=time.monotonic();tree=None;log=out/(label+'.log')
 try:
  with log.open('wb') as f:
   tree=h.Tree(argv,str(cwd),f);rec['pid']=tree.process.pid;rec['started_utc']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
   try:rec['exit']=tree.process.wait(timeout=min(limit,210-(time.monotonic()-start)))
   except subprocess.TimeoutExpired:rec['timeout']=True
   finally:tree.close();tree.process.wait(timeout=5);rec['exit']=tree.process.returncode;rec['tree_close_completed']=True
 except BaseException as e:rec['checkpoint']=type(e).__name__+': '+str(e)
 finally:
  if tree:tree.close()
  rec['active_s']=time.monotonic()-t;rec['log']=str(log);rec['log_sha256']=sha(log) if log.exists() else None;receipts.append(rec);print(label,rec.get('exit'),rec.get('checkpoint'),flush=True)
  (out/'phase-a-gate-summary.json').write_text(json.dumps({'active_s':time.monotonic()-start,'receipts':receipts,'actual_total_tokens':None},indent=2))
 return rec
pre=run('phase-a-preflight',[node,'--input-type=module','-e',"console.log(JSON.stringify({executable:process.execPath,version:process.version,typescript:import.meta.resolve('typescript'),tsx:import.meta.resolve('tsx')}))"],root,10);assert pre['exit']==0
info=json.loads(pathlib.Path(pre['log']).read_text(encoding='utf-8'));assert info['typescript'].startswith((root/'node_modules').as_uri()) and info['tsx'].startswith((root/'node_modules').as_uri())
bot=run('phase-a-meeting-bot-typecheck',[node,'node_modules/typescript/bin/tsc','--noEmit','-p','tsconfig.json'],root/'packages/meeting-bot',75)
api=run('phase-a-api-typecheck',[node,'node_modules/typescript/bin/tsc','--noEmit','-p','tsconfig.json'],root/'apps/api',75)
passed=bot.get('exit')==0 and api.get('exit')==0
# Scoped actual structure budgets, using repository countLoc and current contract config.
selected={j['path'] for j in central['files']}
for p,key in [('qa/coordination/resume-20261015/native-codecledger/candidate-pins.json',None),('qa/coordination/resume-20261015/native-finalizer-maker/fix-2/checkpoint.json','files'),('qa/coordination/resume-20261015/native-privacy-audio-maker/checkpoint.json','sources')]:
 data=load(p);items=data[key] if key else data
 for j in items:
  path=pathlib.Path(j['path']);selected.add((path if path.is_absolute() else root/path).relative_to(root).as_posix())
selected.update(load('qa/coordination/resume-20261015/native-measurement/packet.json')['owned_paths']);(out/'phase-a-structure-paths.json').write_text(json.dumps(sorted(selected),indent=2))
js="import {countLoc,loadConfig} from './scripts/lib/walk.mjs'; import {readFileSync} from 'node:fs'; import path from 'node:path'; const c=loadConfig(process.cwd()),names=JSON.parse(readFileSync(process.argv[1],'utf8')); const rows=names.filter(p=>c.loc.extensions.some(e=>p.endsWith(e))).map(p=>{const n=countLoc(p),test=c.loc.testPatterns.some(v=>new RegExp(v).test(path.basename(p))),limit=test?c.loc.testMax:c.loc.max;return {path:p,nonblank:n,limit,ok:n<=limit}}); const dirs=[...new Set(names.map(p=>path.dirname(p)))].map(p=>{const n=JSON.parse('[]');return p});console.log(JSON.stringify({scope:'changed native files; actual repository countLoc/config',rows},null,2)); process.exitCode=rows.some(r=>!r.ok)?1:0;"
run('phase-a-scoped-structure',[node,'--input-type=module','-e',js,str(out/'phase-a-structure-paths.json')],root,15)
run('phase-a-contracts',[sys.executable,'-B','contracts/verify_contracts.py'],root,15)
after=inventory();(out/'phase-a-inventory-after.json').write_text(json.dumps(after,indent=2));drift={k:{'before':before.get(k),'after':after.get(k)} for k in set(before)|set(after) if before.get(k)!=after.get(k)}
result={'active_s':time.monotonic()-start,'receipts':receipts,'inventory_count':len(before),'inventory_unchanged':not drift,'drift':drift,'typechecks_green':passed,'focused_execution':'READY_NEXT_BOUNDED_ADMISSION' if passed and not drift else 'STOPPED: typecheck or source identity failure; no dependent runtime/Python/legacy test started','contracts_vacuity':len(load('contracts/contracts.json')['stages'])==0,'actual_total_tokens':None}
(out/'phase-a-gate-summary.json').write_text(json.dumps(result,indent=2));print(json.dumps({k:v for k,v in result.items() if k!='receipts'},indent=2))
