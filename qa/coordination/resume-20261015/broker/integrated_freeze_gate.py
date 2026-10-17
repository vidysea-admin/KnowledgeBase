import pathlib
driver=pathlib.Path(__file__).with_name('phase_b_gate.py');code=driver.read_text(encoding='utf-8').replace('phase-b-','integrated-freeze-')
old="packet=load('qa/coordination/resume-20261015/native-phaseb-maker/source-pins.json');assert all(sha(ROOT/j['path'])==j['sha256'] for j in packet),'PhaseB freeze drift'"
new="""original_phaseb=load('qa/coordination/resume-20261015/native-phaseb-maker/source-pins.json');desired={j['path'].replace('\\\\','/'):j['sha256'].lower() for j in original_phaseb};adoptions=[]
overlay_specs=[('qa/coordination/resume-20261015/native-cycle-maker/source-pins.json',None,'sha256'),('qa/coordination/resume-20261015/api-cycle-repairs/candidate-pins.json','pins','sha256'),('qa/coordination/resume-20261015/workspace-cycle-repair/pins.json','files','after_sha256'),('qa/coordination/resume-20261015/indexing-structure-maker/candidate-pins.json',None,'sha256'),('qa/coordination/resume-20261015/t056-direct-answer/source-pins.json',None,'sha256')]
for artifact,key,hashkey in overlay_specs:
 data=load(artifact);items=data[key] if key else data
 for item in items:
  path=item['path'].replace('\\\\','/');value=item[hashkey].lower();adoptions.append({'path':path,'prior':desired.get(path),'current':value,'authority_artifact':artifact,'artifact_sha256':sha(ROOT/artifact)});desired[path]=value
assert all(sha(ROOT/n)==v for n,v in desired.items()),'explicit latest overlay pin drift'
(OUT/'integrated-freeze-explicit-overlays.json').write_text(json.dumps({'authority':'root latest all-source freeze; path-specific overlays only','phaseb_original_sha256':sha(ROOT/'qa/coordination/resume-20261015/native-phaseb-maker/source-pins.json'),'adoptions':adoptions,'final_pins':desired},indent=2));packet=[{'path':n,'sha256':v} for n,v in desired.items()]"""
assert old in code;code=code.replace(old,new)
code=code.replace("paths.update(ROOT.glob('tsconfig*.json'))","paths.update(ROOT.glob('tsconfig*.json'));paths.update((ROOT/'packages/meeting-bot/py').glob('*.py'))")
code=code.replace("'scoped source',", "'scoped source',")
exec(compile(code,str(driver),'exec'))

# Additional requested independent focused checks only after the integrated gates.
if gates and not drift:
 bins=load('qa/coordination/resume-20261015/broker/native-binaries.json');b={j['Name']:j['Source'] for j in bins};oldbins=load('qa/coordination/resume-20261015/broker/native-binary-hashes.json');assert all(sha(v)==oldbins[k]['sha256'] for k,v in b.items())
 os.environ.update(LKB_NATIVE_TEST_FFMPEG=b['ffmpeg.exe'],LKB_NATIVE_TEST_FFPROBE=b['ffprobe.exe']);safe=(ROOT/'.cache/coordination/safe-test-runtime/register.mjs').as_uri()
 def nodes(label,paths,cwd,limit=60):return checked(label,[NODE,'--test','--test-isolation=none','--test-concurrency=1','--test-timeout=30000','--import',safe,*paths],cwd,limit)
 if time.monotonic()-phase<170:
  archive=nodes('integrated-native-archive-floor',['src/capture/native/native-capture-archive.test.ts','src/capture/native/native-spool.test.ts','src/capture/native/native-media-finalize.test.ts'],ROOT/'packages/meeting-bot',50)
  if archive.get('exit')==0 and time.monotonic()-phase<185:
   browser=pathlib.Path('C:/Program Files/Google/Chrome/Application/chrome.exe');assert browser.is_file();private=OUT/'integrated-native-private';private.mkdir(exist_ok=True);os.environ.update(LKB_NATIVE_TEST_BROWSER=str(browser),LKB_NATIVE_TEST_PRIVATE_DIR=str(private));(OUT/'integrated-runtime-binaries.json').write_text(json.dumps({**{k:{'path':v,'sha256':sha(v)} for k,v in b.items()},'browser':{'path':str(browser),'sha256':sha(browser)}},indent=2))
   runtime=nodes('integrated-native-central-runtime',['src/capture/native/native-capture-runtime.test.ts','src/capture/tab-browser.test.ts'],ROOT/'packages/meeting-bot',60)
   if runtime.get('exit')!=0:queue.append('Central runtime failure: no duplicate dependent legacy/Python expansion in this phase')
  else:queue.append('Central runtime deferred after archive failure or phase admission bound')
 else:queue.append('Archive and central runtime deferred by finite phase bound')
 if time.monotonic()-phase<190:
  nodes('integrated-workspace-floor',['src/capture/workspace/capture-slot-readiness.test.ts','src/capture/workspace/tab-session-workspace.test.ts','src/capture/workspace/caller-failure-readiness.test.ts'],ROOT/'packages/meeting-bot',35)
 if time.monotonic()-phase<195:
  py=str(ROOT/'.venv/Scripts/python.exe');os.environ.update(PYTHONPATH=str(ROOT/'packages/meeting-bot/py'),PYTHONDONTWRITEBYTECODE='1',LKB_SAMPLER_TEST_PYTHON=py)
  py_pre=checked('integrated-python-preflight',[py,'-B','-c',"import pathlib,sys,pytest,sb_join_tiles; assert pathlib.Path(sb_join_tiles.__file__).resolve().parent==pathlib.Path(sys.argv[1]).resolve(); print(sys.executable); print(sys.version); print(sb_join_tiles.__file__)",str(ROOT/'packages/meeting-bot/py')],ROOT,10)
  if py_pre.get('exit')==0:
   bt=OUT/'integrated-pytest-exclusive';assert not bt.exists();checked('integrated-python-sampler14',[py,'-B','-m','pytest','packages/meeting-bot/py/test_sb_join_tiles.py','-q','--basetemp',str(bt)],ROOT,40)
 if time.monotonic()-phase<200:
  ep=load('qa/coordination/resume-20261015/eval-pilot/preflight-cycle2/broker-request.json');assert all(sha(ROOT/j['path'])==j['sha256'] for j in ep['pins']);args=ep['command'][1:];args.insert(0,'--test-isolation=none')
  for i,a in enumerate(args):
   if i and args[i-1]=='--import' and a=='tsx':args[i]=safe
  checked('integrated-eval-preflight7',[NODE,*args],ROOT,30,{**before,**{j['path']:j['sha256'] for j in ep['pins']}})
 # Seal final inventory after all admitted commands, without changing old receipts.
 final=inventory();(OUT/'integrated-freeze-final-inventory.json').write_text(json.dumps(final,indent=2));finaldrift={n:{'before':before.get(n),'after':final.get(n)} for n in set(before)|set(final) if before.get(n)!=final.get(n)}
 (OUT/'integrated-freeze-gate-summary.json').write_text(json.dumps({'active_s':time.monotonic()-phase,'results':results,'inventory_count':len(before),'inventory_unchanged':not finaldrift,'drift':finaldrift,'typechecks_green':all(j.get('exit')==0 for j in types),'structural_gates_green':structure.get('exit')==0 and cycles.get('exit')==0,'contracts_vacuity':not load('contracts/contracts.json')['stages'],'remaining_gate_note':'Any omitted/failed/timeout check remains pending; historical queue entries retained without implying execution','queued_remaining':queue,'actual_total_tokens':None,'independent_verdict':None},indent=2))
