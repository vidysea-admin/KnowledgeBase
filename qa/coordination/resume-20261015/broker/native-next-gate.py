from broker_lib import *
import os,sys
phase=time.monotonic();prefix='native-next-';packet=load('qa/coordination/resume-20261015/native-next-maker/combined-source-pins.json');assert len(packet)==51
assert all(sha(ROOT/p['path'])==p['sha256'].lower() for p in packet),'combined freeze mismatch'
def inventory():
 paths=set()
 for base in [ROOT/'apps',ROOT/'packages',ROOT/'workers',ROOT/'schema',ROOT/'scripts/native-capture']:
  for directory,dirs,files in os.walk(base):
   dirs[:]=[d for d in dirs if d not in ['node_modules','dist','.git','__pycache__']]
   for n in files:
    p=pathlib.Path(directory)/n
    if p.suffix in ['.ts','.tsx','.mts','.cts','.mjs','.js','.json','.py','.ps1','.css']:paths.add(p)
 paths.update(ROOT.glob('tsconfig*.json'))
 paths.update(ROOT/n for n in ['package.json','pnpm-lock.yaml','structure.config.json','.dependency-cruiser.cjs','contracts/contracts.json','contracts/verify_contracts.py','scripts/gen-types.mjs','scripts/qa/scoped-check-runner.py','node_modules/typescript/bin/tsc','scripts/lib/walk.mjs','scripts/lint-dirsize.mjs'])
 return {p.relative_to(ROOT).as_posix():sha(p) for p in sorted(paths) if p.is_file()}
pins=inventory();assert all('vectorless-production-eval' not in (ROOT/p).read_text(encoding='utf8',errors='replace') for p in pins if p.endswith(('.ts','.tsx','.mjs','.js'))),'active evaluator reference inside native/TS inventory'
(OUT/'native-next-inventory-before.json').write_text(json.dumps(pins,indent=2));results=[];gates=True
temp=OUT/'native-next-temp';temp.mkdir(exist_ok=True);probe=temp/'probe';probe.write_bytes(b'owned');probe.unlink();os.environ.update(TMP=str(temp),TEMP=str(temp),LKB_NATIVE_PUBLICATION_MONGO_RUN='0',KB_U24_PRIVATE_TOC_TESTS='0',T054_AUTHENTIC_INPUT_OPT_IN='0',LKB_WHATSAPP_CONSENT_MONGO_RUN='0')
def checked(label,args,cwd=ROOT,limit=70):
 remaining=285-(time.monotonic()-phase)
 if remaining<5:return {'label':label,'checkpoint':'phase admission exhausted; not launched'}
 r=run(prefix+label,args,cwd,min(limit,remaining),pins);results.append(r);return r
try:
 pre=checked('preflight',[NODE,'--input-type=module','-e',"console.log(JSON.stringify({node:process.execPath,version:process.version,typescript:import.meta.resolve('typescript'),tsx:import.meta.resolve('tsx')}))"],limit=10);assert pre.get('exit')==0
 for name,folder in [('core','packages/core'),('db','packages/db'),('bot','packages/meeting-bot'),('api','apps/api'),('web','apps/web')]:
  r=checked(name+'-types',[NODE,'node_modules/typescript/bin/tsc','--noEmit','-p','tsconfig.json'],ROOT/folder);gates=gates and r.get('exit')==0
 config=OUT/'native-next-tsconfig.json';config.write_text(json.dumps({'extends':str(ROOT/'tsconfig.base.json'),'include':[str(ROOT/'scripts/native-capture/*.ts')],'compilerOptions':{'types':['node'],'typeRoots':[str(ROOT/'node_modules/@types')]}}))
 r=checked('root-script-types',[NODE,'node_modules/typescript/bin/tsc','--noEmit','-p',str(config)]);gates=gates and r.get('exit')==0
 r=checked('generated-drift',[NODE,'scripts/gen-types.mjs','--check'],limit=25);gates=gates and r.get('exit')==0
 py=str(ROOT/'.venv/Scripts/python.exe');r=checked('schema-preflight',[py,'-B','-c',"import sys,jsonschema;print(sys.executable);print(jsonschema.__file__)"],limit=10);assert r.get('exit')==0
 r=checked('schema-fixtures',[py,'-B','schema/validate.py'],limit=20);gates=gates and r.get('exit')==0
 r=checked('contracts',[py,'-B','contracts/verify_contracts.py'],limit=10);gates=gates and r.get('exit')==0
 selected=sorted(p['path'] for p in packet);(OUT/'native-next-structure-paths.json').write_text(json.dumps(selected))
 js="import {countLoc,loadConfig} from './scripts/lib/walk.mjs';import {check} from './scripts/lint-dirsize.mjs';import {readFileSync} from 'node:fs';import path from 'node:path';const c=loadConfig(process.cwd()),paths=JSON.parse(readFileSync(process.argv[1],'utf8'));const rows=paths.filter(p=>c.loc.extensions.some(e=>p.endsWith(e))).map(p=>{const nonblank=countLoc(p),limit=c.loc.testPatterns.some(r=>new RegExp(r).test(path.basename(p)))?c.loc.testMax:c.loc.max;return {path:p,nonblank,limit,ok:nonblank<=limit}});const dirs=[...new Set(paths.map(p=>path.posix.dirname(p)))];c.roots=dirs.filter(d=>!dirs.some(p=>p!==d&&d.startsWith(p+'/')));const directory=check(process.cwd(),c);console.log(JSON.stringify({rows,directory,scopeRoots:c.roots},null,2));process.exitCode=rows.some(r=>!r.ok)||directory.violations.length?1:0;"
 r=checked('scoped-structure',[NODE,'--input-type=module','-e',js,str(OUT/'native-next-structure-paths.json')],limit=15);gates=gates and r.get('exit')==0
 r=checked('dependency-cycles',[NODE,'node_modules/dependency-cruiser/bin/dependency-cruise.mjs','--config','.dependency-cruiser.cjs','packages','apps','workers','scripts/native-capture'],limit=50);gates=gates and r.get('exit')==0
except BaseException as e:results.append({'checkpoint':type(e).__name__+': '+str(e)});gates=False
finally:
 after=inventory();(OUT/'native-next-inventory-after.json').write_text(json.dumps(after,indent=2));drift={p:{'before':pins.get(p),'after':after.get(p)} for p in set(pins)|set(after) if pins.get(p)!=after.get(p)}
 summary={'active_s':time.monotonic()-phase,'gates_raw_green':gates,'results':results,'inventory_count':len(pins),'inventory_unchanged':not drift,'drift':drift,'active_eval_exclusion':'only scripts/eval/vectorless-production-eval.mjs/.test.mjs active; no native/TS source reference, excluded','contracts_vacuity':not load('contracts/contracts.json')['stages'],'environment':{k:os.environ.get(k) for k in ['TMP','TEMP','LKB_NATIVE_PUBLICATION_MONGO_RUN','KB_U24_PRIVATE_TOC_TESTS','T054_AUTHENTIC_INPUT_OPT_IN','LKB_WHATSAPP_CONSENT_MONGO_RUN']},'actual_total_tokens':None,'independent_verdict':None};(OUT/'native-next-gate-summary.json').write_text(json.dumps(summary,indent=2));print(json.dumps({k:v for k,v in summary.items() if k not in ['results','environment']}))
