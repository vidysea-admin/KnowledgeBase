from broker_lib import *
import os
phase=time.monotonic();prior=load('qa/coordination/resume-20261015/broker/native-next-stage3-gate-summary.json');used=prior['active_s'];pins=load('qa/coordination/resume-20261015/broker/native-next-stage3-inventory-after.json');fixture=None;results=[]
structure=json.loads((OUT/'native-next-stage3-scoped-structure.log').read_text(encoding='utf8'));assert all(row['ok'] for row in structure['rows']);assert set(structure['directory']['violations'])<={'scripts/webinar: 34 files (budget 30)'}
assert all(r.get('exit')==0 for r in prior['results'] if r['label']!='native-next-stage3-scoped-structure'),'genuine type/graph failure'
adapter=ROOT/'qa/coordination/resume-20261015/runtime-alias-repair/register.mjs';assert sha(adapter)=='e2af4f52f525032e808eae5452804fe7f83c51869ed427d106a3b128dd22999d';pins[adapter.relative_to(ROOT).as_posix()]=sha(adapter)
helper=ROOT/'packages/meeting-bot/src/capture/record-consent/native-acl-fixture.ps1';pins[helper.relative_to(ROOT).as_posix()]=sha(helper)
os.environ.update(LKB_NATIVE_PUBLICATION_MONGO_RUN='0',KB_U24_PRIVATE_TOC_TESTS='0',T054_AUTHENTIC_INPUT_OPT_IN='0',LKB_WHATSAPP_CONSENT_MONGO_RUN='0')
def checked(label,argv,limit=70):
 remaining=285-used-(time.monotonic()-phase);assert remaining>20,'finite phase admission exhausted'
 r=run('native-next-stage3-'+label,argv,ROOT,min(limit,remaining-15),pins);results.append(r);return r
def nodes(label,files,limit=70):
 return checked(label,[NODE,'--test','--test-isolation=none','--test-concurrency=1','--test-timeout=65000','--import',adapter.as_uri(),*files],limit)
try:
 powershell=pathlib.Path(os.environ.get('SystemRoot','C:/Windows'))/'System32/WindowsPowerShell/v1.0/powershell.exe';os.environ['PSModulePath']=str(powershell.parent/'Modules')
 r=checked('acl-create',[str(powershell),'-NoProfile','-NonInteractive','-File',str(helper),'-Action','Create'],15);assert r.get('exit')==0
 data=json.loads(pathlib.Path(r['log']).read_text(encoding='utf-8-sig'));fixture=pathlib.Path(data['fixtureDirectory']);assert fixture.resolve().parent==(ROOT/'qa/evidence/native-acl-fixtures').resolve() and fixture.resolve().is_relative_to(ROOT.resolve()) and re.fullmatch(r'[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}',fixture.name)
 os.environ.update(TMP=str(fixture),TEMP=str(fixture),LKB_NATIVE_TEST_PRIVATE_DIR=str(fixture))
 bins={j['Name']:j['Source'] for j in load('qa/coordination/resume-20261015/broker/native-binaries.json')};known=load('qa/coordination/resume-20261015/broker/native-binary-hashes.json');assert all(sha(v)==known[k]['sha256'] for k,v in bins.items());os.environ.update(LKB_NATIVE_TEST_FFMPEG=bins['ffmpeg.exe'],LKB_NATIVE_TEST_FFPROBE=bins['ffprobe.exe'],LKB_NATIVE_TEST_BROWSER='C:/Program Files/Google/Chrome/Application/chrome.exe')
 proof=checked('acl-verifier',[NODE,'--input-type=module','--import',adapter.as_uri(),'-e',"const {verifyPrivateDirectory}=await import(process.argv[1]);verifyPrivateDirectory(process.argv[2]);console.log('verified protected owned UUID');",(ROOT/'packages/meeting-bot/src/capture/record-consent/private-acl.ts').as_uri(),str(fixture)],15);assert proof.get('exit')==0
 original=load('qa/coordination/resume-20261015/broker/native-next-stage2-atomic-consumer-floor-receipt.json');files=[p for p in original['argv'] if p.endswith('.test.ts')];assert len(files)==25;files.append('apps/api/src/composition/lazy-database.test.ts')
 floor=nodes('original25-plus-lazy-floor',files)
 if floor.get('exit')==0 and floor.get('counts',{}).get('fail')==0:
  nodes('native-recovery-all4',['packages/meeting-bot/src/capture/native/native-archive-recovery.test.ts'])
 else:results.append({'checkpoint':'native recovery file held after original floor failure/timeout; no retry'})
except BaseException as e:results.append({'checkpoint':type(e).__name__+': '+str(e)});print(type(e).__name__,str(e),flush=True)
finally:
 if fixture is not None:
  r=run('native-next-stage3-acl-cleanup',[str(powershell),'-NoProfile','-NonInteractive','-File',str(helper),'-Action','Cleanup','-FixtureDirectory',str(fixture)],ROOT,15,pins);results.append(r)
 after={p:sha(ROOT/p) for p in pins};drift={p:{'before':pins[p],'after':after[p]} for p in pins if pins[p]!=after[p]};(OUT/'native-next-stage3-final-sealed-inventory.json').write_text(json.dumps(after,indent=2))
 summary={'priorGateActive_s':used,'focusedActive_s':time.monotonic()-phase,'totalAdmittedActive_s':used+time.monotonic()-phase,'results':results,'sourceCount':len(pins),'sourceUnchanged':not drift,'drift':drift,'fixtureRemoved':fixture is not None and not fixture.exists(),'environment':{k:os.environ.get(k) for k in ['LKB_NATIVE_TEST_FFMPEG','LKB_NATIVE_TEST_FFPROBE','LKB_NATIVE_TEST_BROWSER','LKB_NATIVE_TEST_PRIVATE_DIR','LKB_NATIVE_PUBLICATION_MONGO_RUN']},'standingStructureGap':'inherited webinar34 vs30 root-admitted; no release green','actual_total_tokens':None,'independent_verdict':None};(OUT/'native-next-stage3-focused-summary.json').write_text(json.dumps(summary,indent=2));print(json.dumps({k:v for k,v in summary.items() if k not in ['results','environment']}))
