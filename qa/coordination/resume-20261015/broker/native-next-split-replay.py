from broker_lib import *
import os,collections
phase=time.monotonic();planpath='qa/coordination/resume-20261015/native-next-maker/next-split-replay-plan.json';assert sha(ROOT/planpath)=='4d1c93f9657fe69c5fb46b94d491d0929e31d143b54134d717e3207e03244a79';plan=load(planpath);manifest='qa/coordination/resume-20261015/native-next-maker/'+plan['candidate_manifest'];assert sha(ROOT/manifest)==plan['candidate_sha256'];packet=load(manifest);assert len(packet)==66 and all(sha(ROOT/p['path'])==p['sha256'] for p in packet)
reuse=load('qa/coordination/resume-20261015/'+plan['reused_genuine_receipt']);assert reuse['exit']==0 and reuse['counts']=={'tests':1,'pass':1,'fail':0,'cancelled':0,'skipped':0,'todo':0};assert sha(pathlib.Path(reuse['log']))==plan['reused_genuine_log_sha256'];assert reuse['runtime_sha256']==sha(NODE) and reuse['lock_sha256']==sha(ROOT/'pnpm-lock.yaml') and reuse['pins_unchanged'];pins=reuse['pins_after'];assert all(sha(ROOT/p)==h for p,h in pins.items())
def titles(path):
 text=pathlib.Path(path).read_text(encoding='utf8',errors='replace').split('ℹ tests ')[0]
 return [{'title':m.group(2),'outcome':{'✔':'pass','✖':'fail','﹣':'skip'}[m.group(1)],'durationMs':float(m.group(3)),'suffix':m.group(4)} for m in re.finditer(r'^\s*([✔✖﹣]) (.*?) \(([0-9.]+)ms\)(.*)$',text,re.M)]
old=load('qa/coordination/resume-20261015/broker/native-next-stage2-atomic-consumer-floor-receipt.json');assert sha(pathlib.Path(old['log']))==old['log_sha256'];baseline=titles(old['log']);assert len(baseline)==206,'baseline title extraction mismatch'
assert len(set(plan['original_paths']))==25;allpaths=[p for g in plan['groups'] for p in g['paths']];assert len(allpaths)==26 and len(set(allpaths))==26 and set(plan['original_paths'])<=set(allpaths)
fixture=None;results=[];rows=[];pending=[];floorGreen=False;adapter=ROOT/'qa/coordination/resume-20261015/runtime-alias-repair/register.mjs';helper=ROOT/'packages/meeting-bot/src/capture/record-consent/native-acl-fixture.ps1';os.environ.update(LKB_NATIVE_PUBLICATION_MONGO_RUN='0',KB_U24_PRIVATE_TOC_TESTS='0',T054_AUTHENTIC_INPUT_OPT_IN='0',LKB_WHATSAPP_CONSENT_MONGO_RUN='0')
def checked(label,argv,limit):
 remaining=285-(time.monotonic()-phase);assert remaining>=limit,'finite global budget not sufficient for declared command'
 r=run('native-next-split-'+label,argv,ROOT,limit,pins);results.append(r);return r
def nodes(label,paths,pattern=None,limit=70,testms=70000):
 argv=[NODE,'--test','--test-concurrency=1','--test-timeout='+str(testms),'--import',adapter.as_uri()]
 if pattern:argv.append('--test-name-pattern='+pattern)
 return checked(label,[*argv,*paths],limit)
try:
 powershell=pathlib.Path(os.environ.get('SystemRoot','C:/Windows'))/'System32/WindowsPowerShell/v1.0/powershell.exe';os.environ['PSModulePath']=str(powershell.parent/'Modules')
 r=checked('acl-create',[str(powershell),'-NoProfile','-NonInteractive','-File',str(helper),'-Action','Create'],15);assert r.get('exit')==0
 data=json.loads(pathlib.Path(r['log']).read_text(encoding='utf-8-sig'));fixture=pathlib.Path(data['fixtureDirectory']);assert fixture.resolve().parent==(ROOT/'qa/evidence/native-acl-fixtures').resolve() and fixture.resolve().is_relative_to(ROOT.resolve()) and re.fullmatch(r'[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}',fixture.name)
 os.environ.update(TMP=str(fixture),TEMP=str(fixture),LKB_NATIVE_TEST_PRIVATE_DIR=str(fixture));bins={j['Name']:j['Source'] for j in load('qa/coordination/resume-20261015/broker/native-binaries.json')};known=load('qa/coordination/resume-20261015/broker/native-binary-hashes.json');assert all(sha(v)==known[k]['sha256'] for k,v in bins.items());browser=pathlib.Path('C:/Program Files/Google/Chrome/Application/chrome.exe');assert browser.is_file();os.environ.update(LKB_NATIVE_TEST_FFMPEG=bins['ffmpeg.exe'],LKB_NATIVE_TEST_FFPROBE=bins['ffprobe.exe'],LKB_NATIVE_TEST_BROWSER=str(browser))
 assert all(os.environ.get(k)==v for k,v in load('qa/coordination/resume-20261015/broker/genuine-phase-observer-final-seal.json')['environment'].items() if k!='LKB_NATIVE_TEST_PRIVATE_DIR'),'reuse native environment drift'
 r=checked('acl-verify',[NODE,'--input-type=module','--import',adapter.as_uri(),'-e',"const {verifyPrivateDirectory}=await import(process.argv[1]);verifyPrivateDirectory(process.argv[2]);console.log('verified owned protected UUID');",(ROOT/'packages/meeting-bot/src/capture/record-consent/private-acl.ts').as_uri(),str(fixture)],15);assert r.get('exit')==0
 group3start=None
 for group in plan['groups']:
  if group['id']=='floor3a':group3start=time.monotonic()
  limit=70 if group['id']!='floor3b' else min(70,70-(time.monotonic()-group3start))
  assert limit>5,'shared group3 deadline exhausted'
  r=nodes(group['id'],group['paths'],group.get('positive_pattern'),limit,min(70000,int(limit*1000)))
  observed=titles(r['log']);rows.extend({**row,'group':group['id'],'log':r['log']} for row in observed)
  assert r.get('exit')==0 and not r.get('timeout'),'floor group failure/deadline; no continuation'
  assert len(observed)==r['counts']['tests'],'terminal title count mismatch'
  if group.get('required_selected'):assert r['counts']['tests']==group['required_selected'],'positive production remainder selection mismatch'
 rows.extend({**row,'group':'exact-genuine-reuse','log':reuse['log']} for row in titles(reuse['log']))
 current=collections.defaultdict(list)
 for row in rows:current[row['title']].append(row)
 reconciliation=[]
 for original in baseline:
  matches=current.get(original['title'],[])
  reconciliation.append({'original':original,'current':matches.pop(0) if matches else None,'incompleteReason':None if matches else 'no matching current terminal title'})
 # current lists have been consumed; each missing title is explicit rather than dropped.
 missing=[r for r in reconciliation if r['current'] is None];(OUT/'native-next-split-original206-title-map.json').write_text(json.dumps({'originalCount':206,'currentTerminalCount':len(rows),'originalCases':reconciliation,'additionalCurrentCases':[r for values in current.values() for r in values],'missing':missing},indent=2));assert not missing,'original title coverage incomplete'
 floorGreen=True
 # Root explicitly authorizes first EXIT attempt at125s including cleanup; authored
 # upper child timeouts are not treated as a minimum. No redundant decode before it.
 if 300-(time.monotonic()-phase)>=140:
  r=nodes('actual-exit-fresh-process',['packages/meeting-bot/src/capture/native/native-archive-recovery.test.ts'],'^actual runRecord sealing child EXIT precedes fresh-process retained WAV/provider reproof$',120,120000)
  if r.get('exit')!=0:pending.append('EXIT chain failed/deadline; no automatic retry or further decoder work')
 else:pending.append('EXIT chain queued: remaining global budget below125s plus owned cleanup allowance; not launched')
 pending.extend(['Separate readonly five-stage positive','Tamper/revocation/hardlink/copied-orphan corpus','Fair-page/quota/interrupted-journal corpus','Remaining primitive/runtime/provider/downstream corpus and operational/native/private/symlink/release gates'])
except BaseException as e:pending.append(type(e).__name__+': '+str(e));print(type(e).__name__,str(e),flush=True)
finally:
 if fixture is not None:results.append(run('native-next-split-acl-cleanup',[str(powershell),'-NoProfile','-NonInteractive','-File',str(helper),'-Action','Cleanup','-FixtureDirectory',str(fixture)],ROOT,15,pins))
 after={p:sha(ROOT/p) for p in pins};(OUT/'native-next-split-final-inventory.json').write_text(json.dumps(after,indent=2))
 observedCounts={key:sum(row['outcome']==key for row in rows) for key in ['pass','fail','skip']}
 summary={'results':results,'elapsed_s':time.monotonic()-phase,'currentFloorTerminalResults':len(rows),'floorObservedCounts':observedCounts,'floorAllOriginalTitlesTerminal':floorGreen,'prerequisiteSkipsAreIncomplete':True,'genuineReuse':{'receipt':plan['reused_genuine_receipt'],'logSha256':plan['reused_genuine_log_sha256'],'scope':'only exact genuine node'},'pinCount':len(pins),'pinsUnchanged':pins==after,'fixtureRemoved':fixture is not None and not fixture.exists(),'pending':pending,'priorUnavailableFailure':'UNEXPLAINED OPEN','wholeUnitPASS':False,'actual_total_tokens':None,'independent_verdict':None};(OUT/'native-next-split-final-seal.json').write_text(json.dumps(summary,indent=2));print(json.dumps({k:v for k,v in summary.items() if k!='results'}))
