import pathlib,json,sys,os,subprocess,time,hashlib,re
out=pathlib.Path(__file__).parent;root=out.parents[3]
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def load(p):return json.loads((root/p).read_text())
node='C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
kind=sys.argv[1]; rec={'job':kind,'actual_total_tokens':None,'authority':'root authorized scoped child-spawn environment retry; no source changes or independent PASS'}; start=time.monotonic()
env=os.environ.copy();env.update(T054_AUTHENTIC_INPUT_OPT_IN='0',LKB_WHATSAPP_CONSENT_MONGO_RUN='0')
if kind=='profile':
 r=load('qa/coordination/resume-20261015/profile/broker-request.json');pins={j['path']:j['sha256'].lower() for j in r['source_pins']};pins[r['graph_dependency']['path']]=r['graph_dependency']['sha256'].lower();pins['apps/web/vitest.config.ts']=sha(root/'apps/web/vitest.config.ts');pins['apps/web/src/setupTests.ts']=sha(root/'apps/web/src/setupTests.ts')
 env.pop('KB_U24_PRIVATE_TOC_TESTS',None);args=['node_modules/vitest/vitest.mjs','run','src/pages/knowledge/speakers/speakerProfileClient.test.ts','--pool=threads','--poolOptions.threads.singleThread'];cwd=root/'apps/web';timeout=60
else:
 r=load('qa/coordination/resume-20261015/capture/broker-request.json');p=json.loads(pathlib.Path(r['packet']).read_text());pins={j['path']:j['sha256'].lower() for j in p['unit']['files']};env.update(r['environment']);env['KB_U24_PRIVATE_TOC_TESTS']='0';args=['--test','--test-isolation=none','--test-concurrency=1','--test-timeout=30000','--test-name-pattern=^actual Python producer bytes enter strict ingestion, without a browser or asserted decoded authority$','--import',(root/'.cache/coordination/safe-test-runtime/register.mjs').as_uri(),'src/capture/tiles/sampler-clock.test.ts'];cwd=root/'packages/meeting-bot';timeout=45
try:
 rec['pins_before']={p:sha(root/p) for p in pins};assert rec['pins_before']==pins,'pin drift'
 temp=out/(kind+'-escalated-temp');temp.mkdir(exist_ok=True);probe=temp/'owned-probe';probe.mkdir();(probe/'bytes').write_bytes(b'x');assert (probe/'bytes').read_bytes()==b'x';(probe/'bytes').unlink();probe.rmdir();env['TMP']=env['TEMP']=str(temp)
 rec.update(command=[node,*args],cwd=str(cwd),runtime_sha256=sha(node),lock_sha256=sha(root/'pnpm-lock.yaml'),bootstrap_sha256=sha(root/'.cache/coordination/safe-test-runtime/register.mjs'),environment={k:env.get(k) for k in ['KB_U24_PRIVATE_TOC_TESTS','T054_AUTHENTIC_INPUT_OPT_IN','LKB_WHATSAPP_CONSENT_MONGO_RUN','LKB_SAMPLER_TEST_PYTHON','PYTHONDONTWRITEBYTECODE','TMP','TEMP']})
 pre=subprocess.run([node,'--input-type=module','-e',"console.log(JSON.stringify({executable:process.execPath,version:process.version,tsx:import.meta.resolve('tsx')}))"],cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=10);(out/(kind+'-escalated-preflight.log')).write_bytes(pre.stdout);rec['preflight_exit']=pre.returncode;assert pre.returncode==0;assert json.loads(pre.stdout)['tsx'].startswith((root/'node_modules').as_uri())
 if kind=='capture':
  py=env['LKB_SAMPLER_TEST_PYTHON'];rec['python_sha256']=sha(py);pre=subprocess.run([py,'-B','-c','import sys,pathlib,sb_join_tiles; assert pathlib.Path(sb_join_tiles.__file__).resolve().parent==pathlib.Path(sys.argv[1]).resolve(); print(sys.executable); print(sys.version); print(sb_join_tiles.__file__)',str(root/'packages/meeting-bot/py')],cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=10);(out/'capture-escalated-python-preflight.log').write_bytes(pre.stdout);rec['python_preflight_exit']=pre.returncode;assert pre.returncode==0
 s=time.monotonic();p=subprocess.run([node,*args],cwd=cwd,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=timeout);(out/(kind+'-escalated.log')).write_bytes(p.stdout);rec['exit']=p.returncode;rec['command_s']=time.monotonic()-s;txt=p.stdout.decode(errors='replace');rec['counts']={k:int(v) for k,v in re.findall(r'(?:#|ℹ) (tests|pass|fail|cancelled|skipped|todo) (\d+)',txt)};rec['tail']=txt.splitlines()[-18:]
except subprocess.TimeoutExpired as e:(out/(kind+'-escalated.log')).write_bytes(e.stdout or b'');rec['checkpoint']='external timeout; no retry'
except BaseException as e:rec['checkpoint']=type(e).__name__+': '+str(e)
finally:
 rec['pins_after']={p:sha(root/p) for p in pins};rec['pins_unchanged']=rec.get('pins_before')==rec['pins_after'];rec['active_s']=time.monotonic()-start;(out/(kind+'-escalated-receipt.json')).write_text(json.dumps(rec,indent=2));print(json.dumps(rec,indent=2))
