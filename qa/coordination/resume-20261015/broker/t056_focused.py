import pathlib,json,os,hashlib,time,re,subprocess,importlib.util,shlex
out=pathlib.Path(__file__).parent;root=out.parents[3];start=time.monotonic()
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def load(p):return json.loads((root/p).read_text(encoding='utf-8-sig'))
p=root/'qa/coordination/resume-20261015/t056-direct-answer/broker-request.json';r=load(p);assert r['source_frozen'];base=p.parent
expected={j['path']:j['sha256'].lower() for j in [*load(base/r['source_pins']),*load(base/r['dependency_pins'])]}
assert {n:sha(root/n) for n in expected}==expected,'candidate/dependency pin drift'
spec=importlib.util.spec_from_file_location('verified_tree',root/'scripts/qa/scoped-check-runner.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h);node='C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
temp=out/'t056-temp';temp.mkdir(exist_ok=True);probe=temp/'owned-probe';probe.mkdir();(probe/'bytes').write_bytes(b'probe');assert (probe/'bytes').read_bytes()==b'probe';(probe/'bytes').unlink();probe.rmdir();os.environ.update(TMP=str(temp),TEMP=str(temp),KB_U24_PRIVATE_TOC_TESTS='0',T054_AUTHENTIC_INPUT_OPT_IN='0',LKB_WHATSAPP_CONSENT_MONGO_RUN='0')
def closure(seeds):
 result={};todo=list(seeds)
 while todo:
  rel=todo.pop()
  if rel in result:continue
  f=root/rel;result[rel]=sha(f)
  if f.suffix not in ['.ts','.tsx','.mts','.mjs','.js','.cjs']:continue
  text=f.read_text(encoding='utf-8',errors='replace')
  for m in re.finditer(r'(?:import|export)\s+(?!type\b)(?:[^;\n]*?from\s*)?[\"\'](\.[^\"\']+)[\"\']|import\s*\(\s*[\"\'](\.[^\"\']+)[\"\']',text):
   q=(f.parent/(m.group(1) or m.group(2))).resolve();target=next((x for x in [q,q.with_suffix('.ts'),q.with_suffix('.tsx'),q.with_suffix('.mts')] if x.is_file() and x.is_relative_to(root)),None)
   if target:todo.append(target.relative_to(root).as_posix())
 return result
def execute(label,argv,cwd,limit):
 info={'argv':argv,'cwd':str(cwd)};log=out/(label+'.log');t=time.monotonic();tree=None
 try:
  with log.open('wb') as stream:
   tree=h.Tree(argv,str(cwd),stream);info['pid']=tree.process.pid;info['started_utc']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
   try:info['exit']=tree.process.wait(timeout=min(limit,138-(time.monotonic()-start)))
   except subprocess.TimeoutExpired:info['timeout']=True
   finally:tree.close();tree.process.wait(timeout=5);info['exit']=tree.process.returncode;info['tree_close_completed']=True
 finally:
  if tree:tree.close()
  info.update(active_s=time.monotonic()-t,log=str(log),log_sha256=sha(log))
 return info
pre=execute('t056-preflight',[node,'--input-type=module','-e',"import React from 'react';import {JSDOM} from 'jsdom';console.log(JSON.stringify({executable:process.execPath,version:process.version,react:React.version,jsdom:typeof JSDOM,vitest:import.meta.resolve('vitest')}))"],root/'apps/web',15);assert pre['exit']==0
results=[]
for index,job in enumerate(r['commands']):
 label='t056-api' if index==0 else 't056-ui';rec={'label':label,'request_sha256':sha(p),'packet_sha256':sha(base/'packet.md'),'actual_total_tokens':None,'independent_verdict':None,'original_command':job['command'],'preflight':pre};paths=[]
 try:
  assert time.monotonic()-start<120,'phase admission deadline'
  parts=shlex.split(job['command']);cwd=pathlib.Path(job['cwd']);tests=[(cwd/a).relative_to(root).as_posix() for a in parts if a.endswith(('.test.ts','.test.tsx'))]
  seeds=tests+(['apps/web/vitest.config.ts','apps/web/src/setupTests.ts'] if index else [])
  actual=closure(seeds);rec['active_intersection']=[n for n in actual if n.startswith(('apps/api/src/indexing/','packages/meeting-bot/src/capture/','packages/meeting-bot/src/calendar/')) or 'native-archive' in n or 'postcommit' in n];assert not rec['active_intersection'],'active central runtime closure'
  allpins={**expected,**actual};rec['pins_before']={n:sha(root/n) for n in allpins};assert all(rec['pins_before'][n]==v for n,v in expected.items()),'frozen candidate drift'
  if not index:
   args=parts[1:];args.insert(0,'--test-concurrency=1');args.insert(0,'--test-isolation=none')
   for i,a in enumerate(args):
    if i and args[i-1]=='--import' and a=='tsx':args[i]=(root/'.cache/coordination/safe-test-runtime/register.mjs').as_uri()
   argv=[node,*args]
  else:
   argv=[node,'--require',str(root/'qa/coordination/resume-20261015/profile/worker-trace.cjs'),'node_modules/vitest/vitest.mjs',*parts[2:],'--pool=threads','--poolOptions.threads.singleThread','--maxWorkers=1','--minWorkers=1','--reporter=default','--reporter='+str(root/'qa/coordination/resume-20261015/profile/collection-reporter.mjs')]
   for n in ['qa/coordination/resume-20261015/profile/worker-trace.cjs','qa/coordination/resume-20261015/profile/collection-reporter.mjs']:rec['pins_before'][n]=sha(root/n)
  rec.update(runtime_sha256=sha(node),supervisor_sha256=sha(root/'scripts/qa/scoped-check-runner.py'),bootstrap_sha256=sha(root/'.cache/coordination/safe-test-runtime/register.mjs'),environment={n:os.environ[n] for n in ['TMP','TEMP','KB_U24_PRIVATE_TOC_TESTS','T054_AUTHENTIC_INPUT_OPT_IN','LKB_WHATSAPP_CONSENT_MONGO_RUN']})
  rec['execution']=execute(label,argv,cwd,65);text=pathlib.Path(rec['execution']['log']).read_text(encoding='utf-8',errors='replace');rec['node_counts']={k:int(v) for k,v in re.findall(r'(?:#|ℹ) (tests|pass|fail|cancelled|skipped|todo) (\d+)',text)};clean=re.sub(r'\x1b\[[0-9;]*m','',text);rec['vitest_summary']=[line.strip() for line in clean.splitlines() if re.match(r'^\s*(Test Files|Tests)\s',line)];rec['tail']=clean.splitlines()[-25:]
 except BaseException as e:rec['checkpoint']=type(e).__name__+': '+str(e)
 finally:
  rec['pins_after']={n:sha(root/n) for n in rec.get('pins_before',{})};rec['pins_unchanged']=rec.get('pins_before')==rec['pins_after'];results.append(rec);(out/(label+'-receipt.json')).write_text(json.dumps(rec,indent=2));(out/'t056-focused-summary.json').write_text(json.dumps({'phase_active_s':time.monotonic()-start,'results':results,'actual_total_tokens':None},indent=2));print(label,rec.get('execution',{}).get('exit'),rec.get('node_counts'),rec.get('vitest_summary'),rec.get('checkpoint'),flush=True)
