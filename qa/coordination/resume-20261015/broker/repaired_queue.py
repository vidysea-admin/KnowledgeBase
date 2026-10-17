import pathlib,json,subprocess,os,time,hashlib,re
out=pathlib.Path(__file__).parent; root=out.parents[3]; phase=time.monotonic()
node='C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
bootstrap=root/'.cache/coordination/safe-test-runtime/register.mjs'
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def load(p):return json.loads((root/p).read_text())
records=[]
def run(label,args,cwd,pins,timeout,env_extra=None,unset_private=False):
 label=label+'-uri'
 rec={'label':label,'old_vector':['original runtime',*args],'cwd':str(cwd),'actual_total_tokens':None,'authority':'root authorized compatible vector repair; maker evidence only'}
 original=list(args); args=list(args)
 for i,a in list(enumerate(args)):
  if i and args[i-1]=='--import' and a=='tsx': args[i]=bootstrap.as_uri()
 if '--test-isolation=none' not in args:args.insert(0,'--test-isolation=none')
 rec['new_vector']=[node,*args]; rec['change']='bundled working Node; in-process isolation; same graph synchronous safe bootstrap; original test selection retained'
 env=os.environ.copy(); env.update(KB_U24_PRIVATE_TOC_TESTS='0',T054_AUTHENTIC_INPUT_OPT_IN='0',LKB_WHATSAPP_CONSENT_MONGO_RUN='0')
 if env_extra:env.update(env_extra)
 if unset_private:env.pop('KB_U24_PRIVATE_TOC_TESTS',None)
 temp=out/'repaired-temp';temp.mkdir(exist_ok=True);env['TMP']=env['TEMP']=str(temp)
 rec['env_selected']={k:env.get(k) for k in ['KB_U24_PRIVATE_TOC_TESTS','T054_AUTHENTIC_INPUT_OPT_IN','LKB_WHATSAPP_CONSENT_MONGO_RUN','TMP','TEMP']}
 rec['runtime_sha256']=sha(node);rec['bootstrap_sha256']=sha(bootstrap); rec['lock_sha256']=sha(root/'pnpm-lock.yaml')
 rows=root/'qa/evidence/goal-t059-maker/rows.json'; had=rows.exists(); backup=rows.read_bytes() if had and label.startswith('deadline') else None
 if backup is not None:(out/(label+'-rows.backup')).write_bytes(backup)
 start=time.monotonic()
 try:
  rec['pins_before']={p:sha(root/p) for p in pins}; assert rec['pins_before']=={p:v.lower() for p,v in pins.items()},'frozen pin drift'
  if time.monotonic()-phase>190:raise RuntimeError('bounded phase checkpoint; no command started')
  proc=subprocess.run([node,*args],cwd=cwd,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=min(timeout,200-(time.monotonic()-phase)))
  (out/(label+'.log')).write_bytes(proc.stdout); text=proc.stdout.decode(errors='replace')
  rec['exit']=proc.returncode; rec['counts']={k:int(v) for k,v in re.findall(r'(?:#|ℹ) (tests|pass|fail|cancelled|skipped|todo) (\d+)',text)}
 except subprocess.TimeoutExpired as e:
  (out/(label+'.log')).write_bytes(e.stdout or b'');rec['checkpoint']='external timeout';rec['exit']=None
 except BaseException as e:rec['checkpoint']=type(e).__name__+': '+str(e)
 finally:
  if label.startswith('deadline'):
   if backup is not None:rows.write_bytes(backup)
   elif not had and rows.exists():rows.unlink()
   rec['rows_restored']=rows.exists()==had and (not had or rows.read_bytes()==backup)
  rec['duration_s']=time.monotonic()-start;rec['pins_after']={p:sha(root/p) for p in pins};rec['pins_unchanged']=rec.get('pins_before')==rec['pins_after'];records.append(rec)
  (out/(label+'-receipt.json')).write_text(json.dumps(rec,indent=2));print(label,rec.get('exit'),rec.get('counts'),rec.get('checkpoint'),flush=True)
  (out/'repaired-queue-uri-summary.json').write_text(json.dumps({'active_s':time.monotonic()-phase,'records':records,'actual_total_tokens':None},indent=2))

# Existing compatible runtime/import containment and inherited-ACL temp readiness.
temp=out/'repaired-temp';temp.mkdir(exist_ok=True);probe=temp/'owned-probe';probe.mkdir();(probe/'bytes').write_bytes(b'probe');assert (probe/'bytes').read_bytes()==b'probe';(probe/'bytes').unlink();probe.rmdir()
pre=subprocess.run([node,'--input-type=module','-e',"console.log(JSON.stringify({executable:process.execPath,version:process.version,tsx:import.meta.resolve('tsx')}))"],cwd=root,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=10);(out/'repaired-preflight.log').write_bytes(pre.stdout);assert pre.returncode==0;assert json.loads(pre.stdout)['tsx'].startswith((root/'node_modules').as_uri())
r=load('qa/coordination/resume-20261015/deadline-maker/broker-request.json')
for j in r['requests']:run('deadline-repaired-'+j['label'],j['args'],j['cwd'],r['hashes'],j['outerTimeoutMs']/1000)
r=load('qa/coordination/resume-20261015/t052/broker-request.json');pins=load('qa/coordination/resume-20261015/t052/reconciliation.json')['pins'];j=r['requests'][0];run('t052-repaired-state',j['args'],root,pins,30)
r=load('qa/coordination/resume-20261015/t053/broker-request.json');p=load(r['pins']);pins={j['path']:j['sha256'] for j in p['files']+p['dependencies']};run('t053-repaired-watched',r['command'].split()[1:],r['cwd'],pins,60)
r=load('qa/coordination/resume-20261015/profile/broker-request.json');pins={j['path']:j['sha256'] for j in r['source_pins']};pins[r['graph_dependency']['path']]=r['graph_dependency']['sha256'];run('profile-repaired-api',r['commands'][0]['command'].split()[1:],root,pins,120,unset_private=True)
r=load('qa/coordination/resume-20261015/capture/broker-request.json');p=json.loads(pathlib.Path(r['packet']).read_text());pins={j['path']:j['sha256'] for j in p['unit']['files']};j=r['commands'][1];run('capture-repaired-node',j['args'],j['cwd'],pins,90,env_extra=r['environment'])
