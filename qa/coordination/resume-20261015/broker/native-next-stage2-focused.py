from broker_lib import *
import os,sys
phase=time.monotonic();prior=load('qa/coordination/resume-20261015/broker/native-next-stage2-gate-summary.json');auth=load('qa/coordination/resume-20261015/broker/complete-answer-cycle3-final-seal.json');used=prior['active_s']+auth['actual']['active_s'];pins=load('qa/coordination/resume-20261015/broker/native-next-stage2-inventory-after.json');fixture=None;results=[]
adapter=ROOT/'qa/coordination/resume-20261015/runtime-alias-repair/register.mjs';assert sha(adapter)=='e2af4f52f525032e808eae5452804fe7f83c51869ed427d106a3b128dd22999d';pins[adapter.relative_to(ROOT).as_posix()]=sha(adapter)
helper=ROOT/'packages/meeting-bot/src/capture/record-consent/native-acl-fixture.ps1';pins[helper.relative_to(ROOT).as_posix()]=sha(helper)
os.environ.update(LKB_NATIVE_PUBLICATION_MONGO_RUN='0',KB_U24_PRIVATE_TOC_TESTS='0',T054_AUTHENTIC_INPUT_OPT_IN='0',LKB_WHATSAPP_CONSENT_MONGO_RUN='0')
def checked(label,argv,limit=65):
 remaining=285-used-(time.monotonic()-phase)
 assert remaining>15,'remaining finite phase budget insufficient'
 r=run('native-next-stage2-'+label,argv,ROOT,min(limit,remaining-10),pins);results.append(r);return r
def nodes(label,files,pattern=None,limit=65):
 args=[NODE,'--test','--test-isolation=none','--test-concurrency=1','--test-timeout=65000','--import',adapter.as_uri()]
 if pattern:args.append('--test-name-pattern='+pattern)
 return checked(label,[*args,*files],limit)
try:
 powershell=pathlib.Path(os.environ.get('SystemRoot','C:/Windows'))/'System32/WindowsPowerShell/v1.0/powershell.exe';assert powershell.is_file();os.environ['PSModulePath']=str(powershell.parent/'Modules')
 previous=OUT/'native-next-stage2-focused-summary.json';(OUT/'native-next-stage2-focused-setup-failure.json').write_bytes(previous.read_bytes())
 r=load('qa/coordination/resume-20261015/broker/native-next-stage2-acl-create-receipt.json');assert r.get('exit')==0,'previous fixture creation failed'
 data=json.loads(pathlib.Path(r['log']).read_text(encoding='utf-8-sig'));fixture=pathlib.Path(data['fixtureDirectory']);assert fixture.resolve().parent==(ROOT/'qa/evidence/native-acl-fixtures').resolve() and fixture.resolve().is_relative_to(ROOT.resolve()) and re.fullmatch(r'[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}',fixture.name)
 os.environ.update(TMP=str(fixture),TEMP=str(fixture),LKB_NATIVE_TEST_PRIVATE_DIR=str(fixture))
 bins={j['Name']:j['Source'] for j in load('qa/coordination/resume-20261015/broker/native-binaries.json')};known=load('qa/coordination/resume-20261015/broker/native-binary-hashes.json');assert all(sha(v)==known[k]['sha256'] for k,v in bins.items());os.environ.update(LKB_NATIVE_TEST_FFMPEG=bins['ffmpeg.exe'],LKB_NATIVE_TEST_FFPROBE=bins['ffprobe.exe'],LKB_NATIVE_TEST_BROWSER='C:/Program Files/Google/Chrome/Application/chrome.exe')
 proof=checked('acl-verifier',[NODE,'--input-type=module','--import',adapter.as_uri(),'-e',"const {verifyPrivateDirectory}=await import(process.argv[1]);verifyPrivateDirectory(process.argv[2]);console.log('verified protected owned UUID');",(ROOT/'packages/meeting-bot/src/capture/record-consent/private-acl.ts').as_uri(),str(fixture)],15);assert proof.get('exit')==0
 files=['apps/api/src/production.test.ts','apps/api/src/indexing/tile-speaker-suggest.test.ts','apps/api/src/indexing/post-commit.test.ts','apps/api/src/indexing/public-preserved-review.test.ts','apps/api/src/indexing/vectorless-publication.test.ts','apps/api/src/indexing/native-archive/binding.test.ts','apps/api/src/indexing/native-archive/publication.test.ts','apps/api/src/grounded-postprocessing/transcripts.test.ts',*[f'apps/api/src/transcript-review/{n}.test.ts' for n in ['persist','service','refresh','refresh-executor','authorization']],'packages/db/src/collections/speaker-suggestions/index.test.ts',*[f'scripts/native-capture/{n}.test.ts' for n in ['server','record','production']],'apps/api/src/capture-readiness/router.test.ts','apps/api/src/source-intake/jobs/jobs.test.ts','apps/api/src/source-intake/jobs/privacy.test.ts','apps/api/src/indexing/speaker-suggest.test.ts','apps/api/src/speaker-profiles/router.test.ts','apps/api/src/speaker-profiles/store.test.ts','apps/api/src/speaker-suggestions/reindex-survival.test.ts','apps/api/src/speaker-suggestions/speaker-suggestions.test.ts']
 assert all((ROOT/p).is_file() for p in files),'selected file missing'
 floor=nodes('atomic-consumer-floor',files,'^(?!genuine live seal)',65)
 if floor.get('exit')==0:
  nodes('actual-native-restart-chain',['packages/meeting-bot/src/capture/native/native-archive-recovery.test.ts','scripts/native-capture/production.test.ts'],'actual runRecord sealing child EXIT|genuine live seal',65)
 else:results.append({'checkpoint':'genuine-native chain held after focused floor failure; no retry'})
except BaseException as e:results.append({'checkpoint':type(e).__name__+': '+str(e)});print(type(e).__name__,str(e),flush=True)
finally:
 if fixture is not None:
  cleanup=run('native-next-stage2-acl-cleanup',[str(powershell),'-NoProfile','-NonInteractive','-File',str(helper),'-Action','Cleanup','-FixtureDirectory',str(fixture)],ROOT,15,pins);results.append(cleanup)
 after={p:sha(ROOT/p) for p in pins};drift={p:{'before':pins[p],'after':after[p]} for p in pins if pins[p]!=after[p]};(OUT/'native-next-stage2-final-sealed-inventory.json').write_text(json.dumps(after,indent=2))
 summary={'priorGateAndAuthActive_s':used,'focusedActive_s':time.monotonic()-phase,'totalAdmittedActive_s':used+time.monotonic()-phase,'results':results,'sourceCount':len(pins),'sourceUnchanged':not drift,'drift':drift,'fixtureRemoved':fixture is not None and not fixture.exists(),'standingStructureGap':'scripts/webinar34 vs30 remains inherited release gap; root explicitly admitted focused tests','runtimeEnvironment':{k:os.environ.get(k) for k in ['LKB_NATIVE_TEST_FFMPEG','LKB_NATIVE_TEST_FFPROBE','LKB_NATIVE_TEST_BROWSER','LKB_NATIVE_TEST_PRIVATE_DIR','LKB_NATIVE_PUBLICATION_MONGO_RUN']},'actual_total_tokens':None,'independent_verdict':None};(OUT/'native-next-stage2-focused-summary.json').write_text(json.dumps(summary,indent=2));print(json.dumps({k:v for k,v in summary.items() if k not in ['results','runtimeEnvironment']}))
