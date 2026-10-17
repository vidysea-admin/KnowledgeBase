import pathlib,json,os,sys,time,hashlib,importlib.util,re,subprocess
out=pathlib.Path(__file__).parent;root=out.parents[3];start=time.monotonic()
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def load(p):return json.loads((root/p).read_text(encoding='utf-8-sig'))
leasepath=root/'qa/coordination/resume-20261015/native-current-writers.json';leases=load(leasepath);active={p for lane in leases['activeWriters'] for p in lane['paths']}
types='packages/meeting-bot/src/capture/native-media-types.ts';assert sha(root/types)==leases['sharedTypesSha256'].lower()
spec=importlib.util.spec_from_file_location('verified_tree',root/'scripts/qa/scoped-check-runner.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
node='C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe';bootstrap=root/'.cache/coordination/safe-test-runtime/register.mjs';summary=[]
temp=out/'finite-native-temp';temp.mkdir(exist_ok=True);probe=temp/'owned-probe';probe.mkdir();(probe/'bytes').write_bytes(b'probe');assert (probe/'bytes').read_bytes()==b'probe';(probe/'bytes').unlink();probe.rmdir()
os.environ.update(KB_U24_PRIVATE_TOC_TESTS='0',T054_AUTHENTIC_INPUT_OPT_IN='0',LKB_WHATSAPP_CONSENT_MONGO_RUN='0',TMP=str(temp),TEMP=str(temp))
def norm(p):return pathlib.Path(p).resolve().relative_to(root).as_posix()
def pins_from(items):return {norm(root/j['path']):j['sha256'].lower() for j in items}
def closure(pins):
 result=dict(pins);todo=list(result);seen=set()
 while todo:
  rel=todo.pop()
  if rel in seen:continue
  seen.add(rel);p=root/rel
  if p.suffix not in ['.ts','.tsx','.js','.mjs','.cts','.mts']:continue
  text=p.read_text(encoding='utf-8',errors='replace')
  for m in re.finditer(r'(?:import|export)\s+(?!type\b)(?:[^;\n]*?from\s*)?[\"\'](\.[^\"\']+)[\"\']|import\s*\(\s*[\"\'](\.[^\"\']+)[\"\']',text):
   value=m.group(1) or m.group(2);q=(p.parent/value).resolve();options=[q,q.with_suffix('.ts'),q.with_suffix('.tsx'),q.with_suffix('.mts')]
   target=next((v for v in options if v.is_file() and v.is_relative_to(root)),None)
   if target:
    name=norm(target)
    if name not in result:result[name]=sha(target);todo.append(name)
 return result
def run(label,args,cwd,pins,timeout,request,envextra=None,rows_restore=False,exact=False):
 rec={'label':label,'request':str(request),'request_sha256':sha(request),'actual_total_tokens':None,'independent_verdict':None,'lease_sha256':sha(leasepath)};rows=root/'qa/evidence/goal-t059-maker/rows.json';had=rows.exists();backup=rows.read_bytes() if rows_restore and had else None
 try:
  if time.monotonic()-start>190:raise RuntimeError('phase admission limit; remains ready')
  assert sha(root/types)==leases['sharedTypesSha256'].lower(),'shared types drift'
  expected={p:v.lower() for p,v in pins.items()};assert {p:sha(root/p) for p in expected}==expected,'packet pin drift'
  allpins=closure(expected);allpins[types]=sha(root/types);rec['pins_before']=allpins;rec['writer_intersection']=sorted(set(allpins)&active);assert not rec['writer_intersection'],'active runtime dependency writer'
  argv=[node,*args]
  if not exact:
   if '--test-concurrency=1' not in argv:argv.insert(1,'--test-concurrency=1')
   if '--test-isolation=none' not in argv:argv.insert(1,'--test-isolation=none')
   for i,a in enumerate(argv):
    if i and argv[i-1]=='--import' and a=='tsx':argv[i]=bootstrap.as_uri()
  env_before={k:os.environ.get(k) for k in (envextra or {})}
  for k,v in (envextra or {}).items():
   if v is None:os.environ.pop(k,None)
   else:os.environ[k]=v
  rec.update(command=argv,cwd=str(cwd),runtime_sha256=sha(node),bootstrap_sha256=sha(bootstrap),lock_sha256=sha(root/'pnpm-lock.yaml'),supervisor_sha256=sha(root/'scripts/qa/scoped-check-runner.py'),environment={k:os.environ.get(k) for k in ['KB_U24_PRIVATE_TOC_TESTS','T054_AUTHENTIC_INPUT_OPT_IN','LKB_WHATSAPP_CONSENT_MONGO_RUN','LKB_NATIVE_TEST_FFMPEG','LKB_NATIVE_TEST_FFPROBE','TMP','TEMP']})
  if backup is not None:(out/(label+'-rows.backup')).write_bytes(backup)
  t=time.monotonic();tree=None;log=out/(label+'.log')
  try:
   with log.open('wb') as stream:
    tree=h.Tree(argv,str(cwd),stream);rec['pid']=tree.process.pid;rec['started_utc']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
    try:rec['exit']=tree.process.wait(timeout=min(timeout,220-(time.monotonic()-start)))
    except subprocess.TimeoutExpired:rec['timeout']=True
    finally:tree.close();tree.process.wait(timeout=5);rec['exit']=tree.process.returncode;rec['tree_close_completed']=True
  finally:
   if tree:tree.close()
   rec['command_s']=time.monotonic()-t
   for k,v in env_before.items():
    if v is None:os.environ.pop(k,None)
    else:os.environ[k]=v
  raw=log.read_bytes();text=raw.decode('utf-8',errors='replace');rec['counts']={k:int(v) for k,v in re.findall(r'(?:#|ℹ) (tests|pass|fail|cancelled|skipped|todo) (\d+)',text)};rec.update(log=str(log),log_sha256=sha(log),tail=text.splitlines()[-20:])
 except BaseException as e:rec['checkpoint']=type(e).__name__+': '+str(e)
 finally:
  if rows_restore:
   if backup is not None:rows.write_bytes(backup)
   elif not had and rows.exists():rows.unlink()
   rec['rows_restored']=rows.exists()==had and (not had or rows.read_bytes()==backup)
  rec['pins_after']={p:sha(root/p) for p in rec.get('pins_before',{})};rec['pins_unchanged']=rec.get('pins_before')==rec['pins_after'];summary.append(rec);(out/(label+'-receipt.json')).write_text(json.dumps(rec,indent=2));(out/'finite-native-summary.json').write_text(json.dumps({'active_s':time.monotonic()-start,'actual_total_tokens':None,'results':summary},indent=2));print(label,rec.get('exit'),rec.get('counts'),rec.get('checkpoint'),flush=True)

# Same existing runtime and import containment preflight under verified tree.
prelog=out/'finite-native-preflight.log'
with prelog.open('wb') as f:
 t=h.Tree([node,'--input-type=module','-e',"console.log(JSON.stringify({executable:process.execPath,version:process.version,tsx:import.meta.resolve('tsx')}))"],str(root),f)
 try:assert t.process.wait(timeout=10)==0
 finally:t.close();t.process.wait(timeout=5)
assert json.loads(prelog.read_text(encoding='utf-8'))['tsx'].startswith((root/'node_modules').as_uri())

p=root/'qa/coordination/resume-20261015/native-codecledger/broker-request.json';r=load(p);codec=pins_from(load(r['source_pins']));run('native-codecledger',r['command'].split()[1:],r['cwd'],codec,r['timeout_s'],p)
p=root/'qa/coordination/resume-20261015/native-finalizer-maker/packet.md';cp=load('qa/coordination/resume-20261015/native-finalizer-maker/checkpoint.json');pins=pins_from(cp['files']);pins.update(codec);bins=load('qa/coordination/resume-20261015/broker/native-binaries.json');b={j['Name']:j['Source'] for j in bins};assert all(pathlib.Path(v).is_file() and pathlib.Path(v).is_absolute() for v in b.values());(out/'native-binary-hashes.json').write_text(json.dumps({k:{'path':v,'sha256':sha(v)} for k,v in b.items()},indent=2));run('native-finalizer',['--test','--import','tsx','src/capture/native-media-probe.test.ts','src/capture/native-media-finalize.test.ts'],root/'packages/meeting-bot',pins,65,p,envextra={'LKB_NATIVE_TEST_FFMPEG':b['ffmpeg.exe'],'LKB_NATIVE_TEST_FFPROBE':b['ffprobe.exe']})
p=root/'qa/coordination/resume-20261015/deadline-maker/cycle3-broker-request.json';r=load(p)
for j in r['requests']:run('deadline-cycle3-'+j['label'],j['args'],j['cwd'],r['hashes'],j['outerTimeoutMs']/1000,p,rows_restore=True)
p=root/'qa/coordination/resume-20261015/eval-pilot/diagnostics-cycle1/broker-request.json';r=load(p);run('eval-diagnostics-cycle1',r['command'][1:],root,pins_from(r['pins']),r['outerTimeoutSeconds'],p)
p=root/'qa/coordination/resume-20261015/native-producer-design/browserproducer-component.json';r=load(p);pins=pins_from(r['files']);pins.update(codec);run('browserproducer-new',['--test','py/tab-capture/native-video.test.mjs','py/tab-capture/native-audio-worklet.test.mjs','py/tab-capture/native-recorder.test.mjs'],root/'packages/meeting-bot',pins,35,p)
p=root/'qa/coordination/resume-20261015/profile/broker-observability-request.json';r=load(p);run('profile-observability',r['argv'][1:],r['cwd'],pins_from(r['pins']),r['timeout_s'],p,envextra=r['environment'],exact=True)
