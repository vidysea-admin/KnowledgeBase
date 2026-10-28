import pathlib,json,hashlib,os,time,re,subprocess,importlib.util
out=pathlib.Path(__file__).parent;root=out.parents[3];phase=time.monotonic()
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def load(p):return json.loads((root/p).read_text(encoding='utf-8-sig'))
spec=importlib.util.spec_from_file_location('verified_tree',root/'scripts/qa/scoped-check-runner.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
p=root/'qa/coordination/resume-20261015/t013-voice-conversation/broker-request.json';r=load(p);pins={j['path']:j['sha256'].lower() for j in load(r['pins'])}
for name in ['apps/web/vitest.config.ts','apps/web/src/setupTests.ts','apps/web/package.json','pnpm-lock.yaml','qa/coordination/resume-20261015/profile/worker-trace.cjs','qa/coordination/resume-20261015/profile/collection-reporter.mjs']:pins[name]=sha(root/name)
todo=list(pins);seen=set()
while todo:
 rel=todo.pop()
 if rel in seen:continue
 seen.add(rel);file=root/rel
 if file.suffix not in ['.ts','.tsx','.js','.mjs','.cjs']:continue
 text=file.read_text(encoding='utf-8',errors='replace')
 for m in re.finditer(r'(?:import|export)\s+(?!type\b)(?:[^;\n]*?from\s*)?[\"\'](\.[^\"\']+)[\"\']|import\s*\(\s*[\"\'](\.[^\"\']+)[\"\']',text):
  q=(file.parent/(m.group(1) or m.group(2))).resolve();options=[q,q.with_suffix('.ts'),q.with_suffix('.tsx'),q.with_suffix('.mts')];target=next((v for v in options if v.is_file() and v.is_relative_to(root)),None)
  if target:
   name=target.relative_to(root).as_posix()
   if name not in pins:pins[name]=sha(target);todo.append(name)
active={j['path'] for j in load('qa/coordination/resume-20261015/t056-direct-answer/before-pins.json')};active.update(j['path'] for j in load('qa/coordination/resume-20261015/t037-approved-trust/before.json')['pins'])
rec={'request_sha256':sha(p),'active_intersection':sorted(set(pins)&active),'active_lease_basis':'root names disjoint API/index/archive, T037 calendar, T056 answer-policy; exact T037/T056 paths independently read','pins_before':{name:sha(root/name) for name in pins},'actual_total_tokens':None,'independent_verdict':None}
assert rec['pins_before']==pins,'candidate pin drift';assert not rec['active_intersection'],'active import closure intersection';assert all(n.startswith('apps/web/') or n.startswith('qa/') or n=='pnpm-lock.yaml' for n in pins),'unexpected cross-project source import'
temp=out/'t013-ui-temp';temp.mkdir(exist_ok=True);probe=temp/'owned-probe';probe.mkdir();(probe/'bytes').write_bytes(b'probe');assert (probe/'bytes').read_bytes()==b'probe';(probe/'bytes').unlink();probe.rmdir();os.environ.update(TMP=str(temp),TEMP=str(temp),KB_U24_PRIVATE_TOC_TESTS='0',T054_AUTHENTIC_INPUT_OPT_IN='0',LKB_WHATSAPP_CONSENT_MONGO_RUN='0')
def execute(label,argv,limit):
 tree=None;t=time.monotonic();info={'argv':argv,'cwd':r['cwd']};log=out/(label+'.log')
 try:
  with log.open('wb') as stream:
   tree=h.Tree(argv,r['cwd'],stream);info['pid']=tree.process.pid;info['started_utc']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
   try:info['exit']=tree.process.wait(timeout=limit)
   except subprocess.TimeoutExpired:info['timeout']=True
   finally:tree.close();tree.process.wait(timeout=5);info['exit']=tree.process.returncode;info['tree_close_completed']=True
 finally:
  if tree:tree.close()
  info.update(active_s=time.monotonic()-t,log=str(log),log_sha256=sha(log))
 return info
try:
 rec.update(runtime_sha256=sha(r['executable']),supervisor_sha256=sha(root/'scripts/qa/scoped-check-runner.py'),environment={k:os.environ.get(k) for k in ['TMP','TEMP','KB_U24_PRIVATE_TOC_TESTS','T054_AUTHENTIC_INPUT_OPT_IN','LKB_WHATSAPP_CONSENT_MONGO_RUN']})
 rec['preflight']=execute('t013-ui-preflight',[r['executable'],'--input-type=module','-e',"import React from 'react'; import {JSDOM} from 'jsdom'; console.log(JSON.stringify({executable:process.execPath,version:process.version,react:React.version,jsdom:typeof JSDOM,vitest:import.meta.resolve('vitest')}))"],15);assert rec['preflight']['exit']==0
 argv=[r['executable'],'--require',str(root/'qa/coordination/resume-20261015/profile/worker-trace.cjs'),*r['arguments'],'--pool=threads','--poolOptions.threads.singleThread','--reporter=default','--reporter='+str(root/'qa/coordination/resume-20261015/profile/collection-reporter.mjs')]
 rec['execution']=execute('t013-ui',argv,120);text=pathlib.Path(rec['execution']['log']).read_text(encoding='utf-8',errors='replace');clean=re.sub(r'\x1b\[[0-9;]*m','',text);rec['actual_vitest_summary']=[line.strip() for line in clean.splitlines() if re.match(r'^\s*(Tests|Test Files)\s',line)];rec['tail']=clean.splitlines()[-28:]
except BaseException as e:rec['checkpoint']=type(e).__name__+': '+str(e)
finally:
 rec['pins_after']={name:sha(root/name) for name in pins};rec['pins_unchanged']=rec['pins_before']==rec['pins_after'];rec['phase_active_s']=time.monotonic()-phase;(out/'t013-ui-receipt.json').write_text(json.dumps(rec,indent=2));print(json.dumps({k:v for k,v in rec.items() if k not in ['pins_before','pins_after']},indent=2))
