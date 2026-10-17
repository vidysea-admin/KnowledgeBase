from broker_lib import *
import os,sys
phase=time.monotonic();temp=OUT/'phase-b-temp';temp.mkdir(exist_ok=True);probe=temp/'owned-probe';probe.mkdir();(probe/'bytes').write_bytes(b'probe');assert (probe/'bytes').read_bytes()==b'probe';(probe/'bytes').unlink();probe.rmdir();os.environ.update(TMP=str(temp),TEMP=str(temp),KB_U24_PRIVATE_TOC_TESTS='0',T054_AUTHENTIC_INPUT_OPT_IN='0',LKB_WHATSAPP_CONSENT_MONGO_RUN='0')
packet=load('qa/coordination/resume-20261015/native-phaseb-maker/source-pins.json');assert all(sha(ROOT/j['path'])==j['sha256'] for j in packet),'PhaseB freeze drift'
def inventory():
 paths=set();bases=[ROOT/'apps/api/src',ROOT/'apps/web/src']+[p/'src' for p in (ROOT/'packages').iterdir() if p.is_dir() and (p/'src').is_dir()]
 for base in bases:
  for d,ds,fs in os.walk(base):
   ds[:]=[n for n in ds if n not in ['node_modules','dist','.git']]
   for n in fs:
    p=pathlib.Path(d)/n
    if p.suffix in ['.ts','.tsx','.mts','.cts','.js','.mjs','.json','.css']:paths.add(p)
 for package in [ROOT/'apps/api',ROOT/'apps/web']+[p for p in (ROOT/'packages').iterdir() if p.is_dir()]:
  paths.update(package.glob('package.json'));paths.update(package.glob('tsconfig*.json'))
 paths.update(ROOT.glob('tsconfig*.json'))
 paths.update(ROOT/n for n in ['package.json','pnpm-lock.yaml','structure.config.json','.dependency-cruiser.cjs','contracts/contracts.json','contracts/verify_contracts.py','scripts/qa/scoped-check-runner.py','node_modules/typescript/package.json','node_modules/typescript/bin/tsc','scripts/lib/walk.mjs','scripts/lint-dirsize.mjs'])
 return {p.relative_to(ROOT).as_posix():sha(p) for p in sorted(paths) if p.is_file()}
before=inventory();assert not [n for n in before if (ROOT/n).suffix in ['.ts','.tsx','.mts','.cts','.js','.mjs'] and 'vectorless-production-eval' in (ROOT/n).read_text(encoding='utf-8',errors='replace')],'eval source inside compiler inventory imports'
(OUT/'phase-b-inventory-before.json').write_text(json.dumps(before,indent=2));(OUT/'phase-b-authority.json').write_text(json.dumps({'authority':'root ALL central PhaseB native/API/web FROZEN; PhaseB14 entries override prior PhaseA/relocated snapshots','phaseb_pins_sha256':sha(ROOT/'qa/coordination/resume-20261015/native-phaseb-maker/source-pins.json'),'entry_count':len(packet),'unique_paths':len(set(j['path'] for j in packet)),'eval_pair_excluded':'outside all API/web/package compiler sources; no source import/name reference found','inventory_count':len(before),'environment':{k:os.environ[k] for k in ['TMP','TEMP','KB_U24_PRIVATE_TOC_TESTS','T054_AUTHENTIC_INPUT_OPT_IN','LKB_WHATSAPP_CONSENT_MONGO_RUN']}},indent=2))
results=[]
def checked(label,args,cwd,limit,pins=before):
 remaining=220-(time.monotonic()-phase)
 if remaining<2:
  receipt={'label':label,'checkpoint':'phase budget exhausted; not started'};results.append(receipt);return receipt
 result=run(label,args,cwd,min(limit,remaining),pins);results.append(result);(OUT/'phase-b-gate-summary.json').write_text(json.dumps({'active_s':time.monotonic()-phase,'results':results,'actual_total_tokens':None},indent=2));return result
pre=checked('phase-b-preflight',[NODE,'--input-type=module','-e',"console.log(JSON.stringify({executable:process.execPath,version:process.version,typescript:import.meta.resolve('typescript'),tsx:import.meta.resolve('tsx')}))"],ROOT,10);assert pre.get('exit')==0
identity=json.loads(pathlib.Path(pre['log']).read_text(encoding='utf-8'));assert identity['tsx'].startswith((ROOT/'node_modules').as_uri()) and identity['typescript'].startswith((ROOT/'node_modules').as_uri())
types=[]
for label,path in [('meeting-bot','packages/meeting-bot'),('api','apps/api'),('web','apps/web')]:types.append(checked('phase-b-'+label+'-typecheck',[NODE,'node_modules/typescript/bin/tsc','--noEmit','-p','tsconfig.json'],ROOT/path,75))
selected={j['path'] for j in packet};selected.update(p.relative_to(ROOT).as_posix() for p in (ROOT/'packages/meeting-bot/src/capture').rglob('*.ts') if p.parent.name in ['capture','native','record-consent','tiles']);selected.update(['packages/meeting-bot/py/sb_join_tiles.py','packages/meeting-bot/py/test_sb_join_tiles.py']);(OUT/'phase-b-structure-paths.json').write_text(json.dumps(sorted(selected),indent=2))
js="import {countLoc,loadConfig} from './scripts/lib/walk.mjs';import {check} from './scripts/lint-dirsize.mjs';import {readFileSync} from 'node:fs';import path from 'node:path';const c=loadConfig(process.cwd()),paths=JSON.parse(readFileSync(process.argv[1],'utf8'));const rows=paths.filter(p=>c.loc.extensions.some(e=>p.endsWith(e))).map(p=>{const n=countLoc(p),test=c.loc.testPatterns.some(r=>new RegExp(r).test(path.basename(p))),limit=test?c.loc.testMax:c.loc.max;return {path:p,nonblank:n,limit,ok:n<=limit}});const dirs=[...new Set(paths.map(p=>path.posix.dirname(p)))];c.roots=dirs.filter(d=>!dirs.some(p=>p!==d&&d.startsWith(p+'/')));const directory=check(process.cwd(),c);console.log(JSON.stringify({rows,directory,scopeRoots:c.roots},null,2));process.exitCode=rows.some(r=>!r.ok)||directory.violations.length?1:0;"
structure=checked('phase-b-scoped-structure',[NODE,'--input-type=module','-e',js,str(OUT/'phase-b-structure-paths.json')],ROOT,15)
sourcefiles=sorted(n for n in selected if n.endswith('.ts') and not n.endswith('.test.ts'))
cycles=checked('phase-b-import-cycles',[NODE,'node_modules/dependency-cruiser/bin/dependency-cruise.mjs','--config','.dependency-cruiser.cjs',*sourcefiles],ROOT,30)
contracts=checked('phase-b-contracts',[sys.executable,'-B','contracts/verify_contracts.py'],ROOT,10)
gates=all(j.get('exit')==0 and j.get('pins_unchanged') for j in [*types,structure,cycles,contracts]);queue=[]
if gates and time.monotonic()-phase<160:
 args=[NODE,'--test','--test-isolation=none','--test-concurrency=1','--test-timeout=30000','--import',(ROOT/'.cache/coordination/safe-test-runtime/register.mjs').as_uri(),'apps/api/src/indexing/post-commit.test.ts','apps/api/src/indexing/vectorless-publication.test.ts','apps/api/src/grounded-postprocessing/transcripts.test.ts'];checked('phase-b-postcommit-floor',args,ROOT,60)
else:queue.append('Postcommit/archive/runtime/Python/legacy focused checks deferred: gate failure or finite phase admission limit')
after=inventory();(OUT/'phase-b-inventory-after.json').write_text(json.dumps(after,indent=2));drift={n:{'before':before.get(n),'after':after.get(n)} for n in set(before)|set(after) if before.get(n)!=after.get(n)}
queue.extend(['Relocated native archive/spool/finalizer actual decoded reproof','Central PhaseA native runtime/deferred HTTP real synthetic integration and original legacy floor','Original Python12 + new2 sampler identity cases and immediate Node sampler consumer'])
summary={'active_s':time.monotonic()-phase,'results':results,'typechecks_green':all(j.get('exit')==0 for j in types),'structural_gates_green':structure.get('exit')==0 and cycles.get('exit')==0,'inventory_count':len(before),'inventory_unchanged':not drift,'drift':drift,'contracts_vacuity':not load('contracts/contracts.json')['stages'],'queued_remaining':queue,'actual_total_tokens':None,'independent_verdict':None};(OUT/'phase-b-gate-summary.json').write_text(json.dumps(summary,indent=2));print(json.dumps({k:v for k,v in summary.items() if k!='results'},indent=2))
