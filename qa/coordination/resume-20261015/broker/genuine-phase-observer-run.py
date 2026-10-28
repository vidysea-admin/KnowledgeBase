import pathlib
p=pathlib.Path(__file__).with_name('genuine-seal-isolated-diagnostic.py');code=p.read_text(encoding='utf8')
code=code.replace('combined-source-pins-stage3-api-repair1.json','combined-source-pins-genuine-phase-observer.json')
old="assert all(sha(ROOT/p)==h for p,h in pins.items())"
new="""adopted=[];allowed={j['path']:j['sha256'] for j in packet}
for n,h in list(pins.items()):
 current=sha(ROOT/n)
 if current!=h:
  assert n in allowed and allowed[n]==current,'unapproved dependency epoch '+n
  adopted.append({'path':n,'before':h,'after':current});pins[n]=current
assert len(adopted)==3,'expected exact3observer overlays'
(OUT/'genuine-phase-observer-adoptions.json').write_text(json.dumps(adopted,indent=2))"""
assert old in code;code=code.replace(old,new)
code=code.replace('genuine-seal-isolated','genuine-phase-observer')
# The original inventory is a historical dependency baseline; keep its exact filename.
code=code.replace('broker/native-next-stage3-repair1-final-sealed-inventory.json','broker/native-next-stage3-repair1-final-sealed-inventory.json')
code=code.replace(" r=run('genuine-phase-observer-'+label,argv,ROOT,limit,pins)"," remaining=225-(time.monotonic()-phase);assert remaining>limit,'finite observer phase admission exhausted';r=run('genuine-phase-observer-'+label,argv,ROOT,limit,pins)")
insert="""try:
 r=checked('bot-types',[NODE,'node_modules/typescript/bin/tsc','--noEmit','-p','tsconfig.json'],70) if False else None
 r=run('genuine-phase-observer-bot-types',[NODE,'node_modules/typescript/bin/tsc','--noEmit','-p','tsconfig.json'],ROOT/'packages/meeting-bot',70,pins);results.append(r);assert r.get('exit')==0,'bot types failed'
 r=checked('root-fixture-types',[NODE,'node_modules/typescript/bin/tsc','--noEmit','-p',str(OUT/'native-next-stage3-tsconfig.json')],70);assert r.get('exit')==0,'root fixture types failed'
 selected=[j['path'] for j in adopted];scope=OUT/'genuine-phase-observer-loc-paths.json';scope.write_text(json.dumps(selected))
 js="import {countLoc,loadConfig} from './scripts/lib/walk.mjs';import {check} from './scripts/lint-dirsize.mjs';import fs from 'node:fs';import path from 'node:path';const c=loadConfig(process.cwd()),names=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const rows=names.map(p=>{const n=countLoc(p),limit=p.endsWith('.test.ts')?c.loc.testMax:c.loc.max;return {path:p,nonblank:n,limit,ok:n<=limit}});c.roots=[...new Set(names.map(p=>path.posix.dirname(p)))];const dirs=check(process.cwd(),c);console.log(JSON.stringify({rows,dirs},null,2));process.exitCode=rows.some(r=>!r.ok)||dirs.violations.length?1:0;"
 r=checked('scoped-loc',[NODE,'--input-type=module','-e',js,str(scope)],15);assert r.get('exit')==0,'scoped LOC/directories failed'
"""
code=code.replace('try:\n powershell=',insert+' powershell=',1)
find=" # Use Node's default per-file isolation"
reg=""" regression='throwing recovery observer preserves genuine missing admission refusal and fixed failure fields'
 r=checked('throwing-order-regression',[NODE,'--test','--test-concurrency=1','--test-timeout=60000','--test-name-pattern=^'+re.escape(regression)+'$','--import',adapter.as_uri(),'packages/meeting-bot/src/capture/native/native-archive-recovery.test.ts'],70)
 assert r.get('exit')==0 and r.get('counts',{}).get('tests')==1 and r['counts'].get('pass')==1,'throwing/order regression failed or selection mismatch'
"""
assert find in code;code=code.replace(find,reg+find)
exec(compile(code,str(p),'exec'))
