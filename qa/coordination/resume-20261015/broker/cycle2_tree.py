import pathlib,json,os,hashlib,time,sys,importlib.util,re
out=pathlib.Path(__file__).parent;root=out.parents[3];phase=time.monotonic()
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def load(p):return json.loads((root/p).read_text())
spec=importlib.util.spec_from_file_location('verified_scoped_runner',root/'scripts/qa/scoped-check-runner.py');helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
node='C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe';bootstrap=root/'.cache/coordination/safe-test-runtime/register.mjs'
leases=json.loads(pathlib.Path(sys.argv[1]).read_text());leased={p for lane in leases['leases'] for p in lane['paths']};results=[]
assert sha(root/leases['sharedFrozen']['path'])==leases['sharedFrozen']['sha256'].lower(),'shared frozen types drift'
def execute(label,argv,cwd,seconds):
 tree=None;t=time.monotonic();rec={'command':argv,'cwd':str(cwd),'supervisor_sha256':sha(root/'scripts/qa/scoped-check-runner.py'),'supervisor':'existing verified Tree JobObject'}
 log=out/(label+'.log')
 try:
  with log.open('wb') as stream:
   tree=helper.Tree(argv,str(cwd),stream);rec['pid']=tree.process.pid;rec['launched_utc']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
   try:rec['exit']=tree.process.wait(timeout=seconds)
   except __import__('subprocess').TimeoutExpired:rec['timeout']=True
   finally:
    tree.close();tree.process.wait(timeout=5);rec['exit']=tree.process.returncode;rec['tree_close_completed']=True
 finally:
  if tree:tree.close()
  rec['duration_s']=time.monotonic()-t;rec['log_sha256']=sha(log);rec['log']=str(log)
 return rec
os.environ.update(KB_U24_PRIVATE_TOC_TESTS='0',T054_AUTHENTIC_INPUT_OPT_IN='0',LKB_WHATSAPP_CONSENT_MONGO_RUN='0')
temp=out/'cycle2-tree-temp';temp.mkdir(exist_ok=True);probe=temp/'owned-probe';probe.mkdir();(probe/'bytes').write_bytes(b'probe');assert (probe/'bytes').read_bytes()==b'probe';(probe/'bytes').unlink();probe.rmdir();os.environ['TMP']=os.environ['TEMP']=str(temp)
pre=execute('cycle2-tree-preflight',[node,'--input-type=module','-e',"console.log(JSON.stringify({executable:process.execPath,version:process.version,tsx:import.meta.resolve('tsx')}))"],root,10);(out/'cycle2-tree-preflight.json').write_text(json.dumps(pre,indent=2));assert pre['exit']==0;assert json.loads(pathlib.Path(pre['log']).read_text())['tsx'].startswith((root/'node_modules').as_uri())
def job(label,request,pins,j):
 rec={'label':label,'request_sha256':sha(request),'actual_total_tokens':None,'writer_lease_sha256':sha(sys.argv[1]),'writer_intersection':sorted(set(pins)&leased),'original_vector':[j['program'],*j['args']]};rows=root/'qa/evidence/goal-t059-maker/rows.json';had=rows.exists();backup=rows.read_bytes() if label.startswith('deadline') and had else None
 if backup is not None:(out/(label+'-rows.backup')).write_bytes(backup)
 try:
  assert not rec['writer_intersection'],'active writer intersection'
  rec['pins_before']={p:sha(root/p) for p in pins};assert rec['pins_before']=={p:v.lower() for p,v in pins.items()},'frozen pin drift'
  assert time.monotonic()-phase<150,'phase admission deadline'
  args=list(j['args']);args.insert(0,'--test-isolation=none')
  for i,a in enumerate(args):
   if i and args[i-1]=='--import' and a=='tsx':args[i]=bootstrap.as_uri()
  rec.update(runtime_sha256=sha(node),bootstrap_sha256=sha(bootstrap),lock_sha256=sha(root/'pnpm-lock.yaml'),environment={k:os.environ[k] for k in ['KB_U24_PRIVATE_TOC_TESTS','T054_AUTHENTIC_INPUT_OPT_IN','LKB_WHATSAPP_CONSENT_MONGO_RUN','TMP','TEMP']})
  rec.update(execute(label,[node,*args],j.get('cwd',root),min(j.get('outerTimeoutMs',j.get('timeoutMs',30000))/1000,160-(time.monotonic()-phase))))
  rec['counts']={k:int(v) for k,v in re.findall(r'(?:#|ℹ) (tests|pass|fail|cancelled|skipped|todo) (\d+)',pathlib.Path(rec['log']).read_text(errors='replace'))}
 except BaseException as e:rec['checkpoint']=type(e).__name__+': '+str(e)
 finally:
  if label.startswith('deadline'):
   if backup is not None:rows.write_bytes(backup)
   elif not had and rows.exists():rows.unlink()
   rec['rows_restored']=rows.exists()==had and (not had or rows.read_bytes()==backup)
  rec['pins_after']={p:sha(root/p) for p in pins};rec['pins_unchanged']=rec.get('pins_before')==rec['pins_after'];results.append(rec);(out/(label+'-receipt.json')).write_text(json.dumps(rec,indent=2));(out/'cycle2-tree-summary.json').write_text(json.dumps({'active_s':time.monotonic()-phase,'actual_total_tokens':None,'results':results},indent=2));print(label,rec.get('exit'),rec.get('counts'),rec.get('checkpoint'),flush=True)
p=root/'qa/coordination/resume-20261015/deadline-maker/cycle2-broker-request.json';r=json.loads(p.read_text())
for j in r['requests']:job('deadline-cycle2-'+j['label'],p,r['hashes'],j)
p=root/'qa/coordination/resume-20261015/t052/broker-request.json';r=json.loads(p.read_text());pins=load('qa/coordination/resume-20261015/t052/reconciliation.json')['pins'];pins[r['candidateFile']['path']]=r['candidateFile']['sha256'];job('t052-cycle2-state',p,pins,r['requests'][0])
