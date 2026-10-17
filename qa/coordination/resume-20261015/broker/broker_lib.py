import pathlib,json,hashlib,re,time,subprocess,importlib.util
OUT=pathlib.Path(__file__).parent;ROOT=OUT.parents[3]
NODE='C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def load(p):return json.loads((ROOT/p).read_text(encoding='utf-8-sig'))
def closure(seeds):
 result={};todo=list(seeds)
 while todo:
  rel=todo.pop()
  if rel in result:continue
  f=ROOT/rel;result[rel]=sha(f)
  if f.suffix not in ['.ts','.tsx','.mts','.js','.mjs','.cjs']:continue
  text=f.read_text(encoding='utf-8',errors='replace')
  for m in re.finditer(r'(?:import|export)\s+(?!type\b)(?:[^;\n]*?from\s*)?[\"\'](\.[^\"\']+)[\"\']|import\s*\(\s*[\"\'](\.[^\"\']+)[\"\']',text):
   q=(f.parent/(m.group(1) or m.group(2))).resolve();target=next((v for v in [q,q.with_suffix('.ts'),q.with_suffix('.tsx'),q.with_suffix('.mts')] if v.is_file() and v.is_relative_to(ROOT)),None)
   if target:todo.append(target.relative_to(ROOT).as_posix())
 return result
def run(label,argv,cwd,timeout,pins,active=()):
 start=time.monotonic();rec={'label':label,'argv':argv,'cwd':str(cwd),'actual_total_tokens':None,'independent_verdict':None};log=OUT/(label+'.log');tree=None
 try:
  rec['pins_before']={n:sha(ROOT/n) for n in pins};assert rec['pins_before']=={n:v.lower() for n,v in pins.items()},'source/dependency drift';rec['active_intersection']=sorted(set(pins)&set(active));assert not rec['active_intersection'],'exact active dependency'
  spec=importlib.util.spec_from_file_location('verified_tree',ROOT/'scripts/qa/scoped-check-runner.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h);rec['supervisor_sha256']=sha(ROOT/'scripts/qa/scoped-check-runner.py');rec['runtime_sha256']=sha(argv[0]);rec['lock_sha256']=sha(ROOT/'pnpm-lock.yaml')
  with log.open('wb') as f:
   tree=h.Tree(argv,str(cwd),f);rec['pid']=tree.process.pid;rec['started_utc']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
   try:rec['exit']=tree.process.wait(timeout=timeout)
   except subprocess.TimeoutExpired:rec['timeout']=True
   finally:tree.close();tree.process.wait(timeout=5);rec['exit']=tree.process.returncode;rec['tree_close_completed']=True
  text=log.read_text(encoding='utf-8',errors='replace');rec['counts']={k:int(v) for k,v in re.findall(r'(?:#|ℹ) (tests|pass|fail|cancelled|skipped|todo) (\d+)',text)};rec['tail']=text.splitlines()[-25:]
 except BaseException as e:rec['checkpoint']=type(e).__name__+': '+str(e)
 finally:
  if tree:tree.close()
  rec['pins_after']={n:sha(ROOT/n) for n in rec.get('pins_before',{})};rec['pins_unchanged']=rec.get('pins_before')==rec['pins_after'];rec['active_s']=time.monotonic()-start;rec['log']=str(log);rec['log_sha256']=sha(log) if log.exists() else None;(OUT/(label+'-receipt.json')).write_text(json.dumps(rec,indent=2));print(label,rec.get('exit'),rec.get('counts'),rec.get('checkpoint'),flush=True)
 return rec
