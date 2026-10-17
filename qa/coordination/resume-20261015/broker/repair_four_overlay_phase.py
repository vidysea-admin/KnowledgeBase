from broker_lib import *
import os,sys,shlex
phase=time.monotonic();old=load('qa/coordination/resume-20261015/broker/integrated-final-sealed-inventory.json');pins=dict(old);adoptions=[]
for item in load('qa/coordination/resume-20261015/native-quota-vectorless-maker/source-pins.json'):
 n=item['path'];v=item['sha256'].lower();adoptions.append({'path':n,'old':pins.get(n),'new':v,'authority':'native-quota-vectorless-maker/source-pins.json'});pins[n]=v
for n,v in load('qa/coordination/resume-20261015/python-identity-fixture/pins.json')['after_and_consumer_pins'].items():
 n=n.replace('\\','/');adoptions.append({'path':n,'old':pins.get(n),'new':v,'authority':'python-identity-fixture/pins.json'});pins[n]=v.lower()
assert all(sha(ROOT/n)==v for n,v in pins.items()),'unexpected whole source drift'
adapter=load('qa/coordination/resume-20261015/runtime-alias-repair/static-receipt.json')
for n,v in adapter['pins'].items():
 path=pathlib.Path(n);name=path.relative_to(ROOT).as_posix() if path.is_relative_to(ROOT) else str(path);assert sha(path)==v,'adapter/source identity drift';pins[name]=v
(OUT/'repair-four-overlay-adoption.json').write_text(json.dumps({'authority':'root latest exact four source overlays; web/source remainder frozen and unchanged','adoptions':adoptions,'adapter_receipt_sha256':sha(ROOT/'qa/coordination/resume-20261015/runtime-alias-repair/static-receipt.json'),'source_inventory_base_count':len(old),'current_pins':pins},indent=2))
temp=OUT/'repair-four-temp';temp.mkdir(exist_ok=True);probe=temp/'owned-probe';probe.mkdir();(probe/'bytes').write_bytes(b'probe');assert (probe/'bytes').read_bytes()==b'probe';(probe/'bytes').unlink();probe.rmdir();os.environ.update(TMP=str(temp),TEMP=str(temp),KB_U24_PRIVATE_TOC_TESTS='0',T054_AUTHENTIC_INPUT_OPT_IN='0',LKB_WHATSAPP_CONSENT_MONGO_RUN='0')
results=[];queued=[]
def checked(label,argv,cwd,limit=60):
 remaining=215-(time.monotonic()-phase)
 if remaining<5:queued.append(label);return {'label':label,'checkpoint':'finite phase exhausted; not started'}
 rec=run(label,argv,cwd,min(limit,remaining),pins);rec['environment']={n:os.environ.get(n) for n in ['TMP','TEMP','KB_U24_PRIVATE_TOC_TESTS','T054_AUTHENTIC_INPUT_OPT_IN','LKB_WHATSAPP_CONSENT_MONGO_RUN','LKB_NATIVE_TEST_FFMPEG','LKB_NATIVE_TEST_FFPROBE','LKB_NATIVE_TEST_BROWSER','LKB_NATIVE_TEST_PRIVATE_DIR','PYTHONPATH','PYTHONDONTWRITEBYTECODE']};text=pathlib.Path(rec['log']).read_text(encoding='utf-8',errors='replace') if pathlib.Path(rec['log']).exists() else '';rec['framework_summary']=[l.strip() for l in text.splitlines() if re.match(r'^\d+ passed',l) or 'failed, ' in l];results.append(rec);(OUT/(label+'-receipt.json')).write_text(json.dumps(rec,indent=2));(OUT/'repair-four-phase-summary.json').write_text(json.dumps({'active_s':time.monotonic()-phase,'results':results,'queued':queued,'actual_total_tokens':None},indent=2));return rec
setup=checked('repair-adapter-required3',adapter['argv'],ROOT,20)
can_continue=setup.get('exit')==0 and setup.get('counts',{}).get('pass')==3
if can_continue:
 pre=checked('repair-runtime-preflight',[NODE,'--input-type=module','-e',"console.log(JSON.stringify({executable:process.execPath,version:process.version,typescript:import.meta.resolve('typescript'),tsx:import.meta.resolve('tsx')}))"],ROOT,10);assert pre.get('exit')==0
 bot=checked('repair-bot-typecheck',[NODE,'node_modules/typescript/bin/tsc','--noEmit','-p','tsconfig.json'],ROOT/'packages/meeting-bot',75);api=checked('repair-api-typecheck',[NODE,'node_modules/typescript/bin/tsc','--noEmit','-p','tsconfig.json'],ROOT/'apps/api',75);can_continue=bot.get('exit')==0 and api.get('exit')==0
if can_continue:
 safe=(ROOT/'qa/coordination/resume-20261015/runtime-alias-repair/register.mjs').as_uri()
 def nodes(label,files,cwd=ROOT,limit=60,pattern=None):
  args=[NODE,'--test','--test-isolation=none','--test-concurrency=1','--test-timeout=30000','--import',safe]
  if pattern:args.append('--test-name-pattern='+pattern)
  return checked(label,[*args,*files],cwd,limit)
 nodes('repair-postcommit-original20',['apps/api/src/indexing/post-commit.test.ts','apps/api/src/indexing/vectorless-publication.test.ts','apps/api/src/grounded-postprocessing/transcripts.test.ts'],limit=50)
 bins=load('qa/coordination/resume-20261015/broker/native-binaries.json');b={j['Name']:j['Source'] for j in bins};binarypins=load('qa/coordination/resume-20261015/broker/native-binary-hashes.json');assert all(sha(v)==binarypins[k]['sha256'] for k,v in b.items());browser=pathlib.Path('C:/Program Files/Google/Chrome/Application/chrome.exe');assert browser.is_file();private=OUT/'repair-native-private';private.mkdir(exist_ok=True);os.environ.update(LKB_NATIVE_TEST_FFMPEG=b['ffmpeg.exe'],LKB_NATIVE_TEST_FFPROBE=b['ffprobe.exe'],LKB_NATIVE_TEST_BROWSER=str(browser),LKB_NATIVE_TEST_PRIVATE_DIR=str(private))
 unsupported='owned status retains deduplicated durable control gaps and refuses corrupt identity without overwrite';(OUT/'repair-environment-unmet-symlink.json').write_text(json.dumps({'case':unsupported,'prior_receipt':'integrated-native-runtime-receipt.json','state':'known EPERM environment limitation remains unmet','scope':'root authorized no duplicate privilege reproving; assertion unchanged, no security PASS claim'},indent=2))
 native=nodes('repair-native-runtime-deferred',['src/capture/native/native-capture-runtime.test.ts','src/capture/tab-browser.test.ts'],ROOT/'packages/meeting-bot',75,'^(?!'+re.escape(unsupported)+'$).*$')
 native_log=pathlib.Path(native.get('log','')).read_text(encoding='utf-8',errors='replace') if native.get('log') else ''
 alias_failed='ERR_MODULE_NOT_FOUND' in native_log and 'lean-video.js' in native_log
 if not alias_failed:nodes('repair-workspace-original',['src/capture/workspace/capture-slot-readiness.test.ts','src/capture/workspace/tab-session-workspace.test.ts','src/capture/workspace/caller-failure-readiness.test.ts'],ROOT/'packages/meeting-bot',45)
 else:queued.append('Workspace/legacy dependent suites held: deep alias still fails; no blind retries')
 py=str(ROOT/'.venv/Scripts/python.exe');os.environ.update(PYTHONPATH=str(ROOT/'packages/meeting-bot/py'),PYTHONDONTWRITEBYTECODE='1',LKB_SAMPLER_TEST_PYTHON=py)
 py_pre=checked('repair-python-preflight',[py,'-B','-c',"import sys,pathlib,pytest,sb_join_tiles;assert pathlib.Path(sb_join_tiles.__file__).resolve().parent==pathlib.Path(sys.argv[1]).resolve();print(sys.executable);print(sys.version);print(sb_join_tiles.__file__)",str(ROOT/'packages/meeting-bot/py')],ROOT,10)
 if py_pre.get('exit')==0:
  bt=OUT/'repair-python-exclusive';assert not bt.exists();checked('repair-python-original14',[py,'-B','-m','pytest','packages/meeting-bot/py/test_sb_join_tiles.py','-q','--basetemp',str(bt)],ROOT,40)
 # Exact latest static relative closure determines whether the receiver overlay affects T037.
 t037=load('qa/coordination/resume-20261015/t037-approved-trust/broker-request.json');parts=shlex.split(t037['command']);seeds=[(pathlib.Path(t037['cwd'])/a).relative_to(ROOT).as_posix() for a in parts if a.endswith('.test.ts')];actual=closure(seeds);changed={j['path'] for j in adoptions if j['old']!=j['new']};intersection=sorted(set(actual)&changed);(OUT/'repair-t037-closure-admission.json').write_text(json.dumps({'closure_count':len(actual),'changed_overlay_intersection':intersection,'rule':'root rerun13+2 if actual current static closure changed; no whole calendar','pins':actual},indent=2))
 if intersection:
  nodes('repair-t037-current13',[a for a in parts[1:] if a not in ['--import','tsx']],ROOT/'packages/meeting-bot',45)
  pattern='^(valid primary seeds snapshot; corruption/missing primary uses it without extending expiry|cached enforcement preserves previously rejected/cancelled selection and evaluator errors refuse)$';nodes('repair-t037-lastvalid2',['packages/meeting-bot/src/calendar/join-rules/join-rules-last-valid-enforce.test.ts'],ROOT,20,pattern)
else:queued.append('Dependent original postcommit/native/workspace/Python checks stopped after adapter/compiler gate failure')
final={n:sha(ROOT/n) for n in pins};diff={n:{'before':pins[n],'after':final[n]} for n in pins if pins[n]!=final[n]};(OUT/'repair-four-final-sealed-inventory.json').write_text(json.dumps(final,indent=2));(OUT/'repair-four-phase-summary.json').write_text(json.dumps({'active_s':time.monotonic()-phase,'results':results,'queued':queued,'inventory_count':len(pins),'inventory_unchanged':not diff,'drift':diff,'web_typecheck_reuse':'prior final web green; all unchanged web/compiler/config inputs included in preserved whole inventory','actual_total_tokens':None,'independent_verdict':None},indent=2))
