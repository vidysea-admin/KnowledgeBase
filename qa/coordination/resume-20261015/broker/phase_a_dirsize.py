import pathlib,importlib.util,subprocess,json,time,hashlib
out=pathlib.Path(__file__).parent;root=out.parents[3];spec=importlib.util.spec_from_file_location('verified_tree',root/'scripts/qa/scoped-check-runner.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
node='C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
js="import {check} from './scripts/lint-dirsize.mjs';import {loadConfig} from './scripts/lib/walk.mjs';import {readFileSync} from 'node:fs';import path from 'node:path';const c=loadConfig(process.cwd()),names=JSON.parse(readFileSync(process.argv[1],'utf8'));const dirs=[...new Set(names.map(p=>path.posix.dirname(p)))].sort();c.roots=dirs.filter(d=>!dirs.some(p=>p!==d&&d.startsWith(p+'/')));const result=check(process.cwd(),c);console.log(JSON.stringify({scopeRoots:c.roots,...result},null,2));process.exitCode=result.violations.length?1:0;"
argv=[node,'--input-type=module','-e',js,str(out/'phase-a-structure-paths.json')];rec={'argv':argv,'actual_total_tokens':None};t=time.monotonic();tree=None;log=out/'phase-a-scoped-dirsize.log'
try:
 with log.open('wb') as stream:
  tree=h.Tree(argv,str(root),stream);rec['pid']=tree.process.pid
  try:rec['exit']=tree.process.wait(timeout=15)
  except subprocess.TimeoutExpired:rec['timeout']=True
  finally:tree.close();tree.process.wait(timeout=5);rec['exit']=tree.process.returncode;rec['tree_close_completed']=True
finally:
 if tree:tree.close()
 rec['active_s']=time.monotonic()-t;rec['log_sha256']=hashlib.sha256(log.read_bytes()).hexdigest();(out/'phase-a-scoped-dirsize-receipt.json').write_text(json.dumps(rec,indent=2));print(json.dumps(rec,indent=2));print(log.read_text(encoding='utf-8'))
