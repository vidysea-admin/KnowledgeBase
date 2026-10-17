from broker_lib import *
import os
phase=time.monotonic();req=load('qa/coordination/resume-20261015/watched-cadence/broker-request.json');declared=load(req['source_pins'])+load(req['dependency_pins']);pins={p['path']:p['sha256'] for p in declared};assert all(sha(ROOT/p)==h for p,h in pins.items()),'declared pin drift'
seeds=[p for p in pins if p.endswith(('.ts','.mjs','.js'))];seen={};todo=seeds
while todo:
 current=closure(todo);todo=[]
 for p,h in current.items():
  if p in seen:continue
  seen[p]=h;text=(ROOT/p).read_text(encoding='utf8',errors='replace')
  for package in set(re.findall(r'[\"\']@lkb/([a-z-]+)[\"\']',text)):
   packagejson=ROOT/'packages'/package/'package.json'
   if packagejson.exists():
    pins[packagejson.relative_to(ROOT).as_posix()]=sha(packagejson);entry=(packagejson.parent/json.loads(packagejson.read_text())['main']).resolve().relative_to(ROOT).as_posix()
    if entry not in seen:todo.append(entry)
pins.update(seen);assert 'apps/api/src/composition/lazy-database.test.ts' not in pins,'active unrelated fixture reached'
adapter=ROOT/'qa/coordination/resume-20261015/runtime-alias-repair/register.mjs';assert sha(adapter)=='e2af4f52f525032e808eae5452804fe7f83c51869ed427d106a3b128dd22999d';pins[adapter.relative_to(ROOT).as_posix()]=sha(adapter)
temp=OUT/'watched-cadence-temp';temp.mkdir(exist_ok=True);probe=temp/'probe';probe.mkdir();(probe/'bytes').write_bytes(b'owned');assert (probe/'bytes').read_bytes()==b'owned';(probe/'bytes').unlink();probe.rmdir();os.environ.update(TMP=str(temp),TEMP=str(temp),LKB_NATIVE_PUBLICATION_MONGO_RUN='0',LKB_WHATSAPP_CONSENT_MONGO_RUN='0')
pre=run('watched-cadence-preflight',[NODE,'--input-type=module','-e',"console.log(JSON.stringify({executable:process.execPath,version:process.version,tsx:import.meta.resolve('tsx')}));",],ROOT,10,pins);assert pre.get('exit')==0
identity=json.loads(pathlib.Path(pre['log']).read_text(encoding='utf8'));assert identity['tsx'].startswith((ROOT/'node_modules').as_uri())
def nodes(label,file,cwd):return run(label,[NODE,'--test','--test-isolation=none','--test-concurrency=1','--test-timeout=10000','--import',adapter.as_uri(),file],cwd,60,pins)
new=nodes('watched-cadence-new7','scripts/watched-sources/host.test.ts',ROOT)
down=nodes('watched-cadence-existing5','src/connector-workflow/watched-job.test.ts',ROOT/'apps/api') if new.get('exit')==0 else {'checkpoint':'downstream held after host failure'}
summary={'candidate':req['candidate_content_manifest_sha256'],'sourceCount':len(pins),'declaredSources':len(declared),'actualImportPins':len(seen),'preflight':pre,'new7':new,'downstream5':down,'elapsed_s':time.monotonic()-phase,'unrelatedFixtureExcluded':True,'zeroRealProviderDatabaseNetworkActions':True,'disabledZeroIO':'new host/supervisor test original assertions measure zero store reads/key verification while disabled','actual_total_tokens':None,'independent_verdict':None};(OUT/'watched-cadence-final-seal.json').write_text(json.dumps(summary,indent=2));print(json.dumps({'new':new.get('counts'),'downstream':down.get('counts'),'elapsed_s':summary['elapsed_s'],'pins':len(pins)}))
