import pathlib,json,os,time,hashlib,importlib.util,subprocess,sys
root=pathlib.Path(__file__).resolve().parents[4];out=pathlib.Path(__file__).parent/'fix-3';out.mkdir(exist_ok=True)
sha=lambda p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
supervisor=root/'scripts/qa/scoped-check-runner.py';assert sha(supervisor)=='d99983ba54d43ecf22bae2e2bad0dad7a57156d9bb16c36cc38d05d3cce3fc6a'
spec=importlib.util.spec_from_file_location('verified_tree',supervisor);h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
prior=json.loads((root/'qa/coordination/resume-20261015/broker/native-finalizer-fix2-receipt.json').read_text());argv=prior['command'];env=prior['environment'];os.environ.update({k:v for k,v in env.items() if v is not None})
label=sys.argv[1];privacy=len(sys.argv)>2
if privacy:argv=argv[:-2]+['src/capture/record-consent/native-provider-audio.test.ts','src/capture/record-consent/provider-input.test.ts','src/capture/record-consent/finalizer-input.test.ts']
files=list(prior['pins_before']);files += ['packages/meeting-bot/src/capture/record-consent/native-provider-audio.ts','packages/meeting-bot/src/capture/record-consent/native-provider-audio.test.ts','packages/meeting-bot/src/capture/record-consent/finalizer-input.ts','packages/meeting-bot/src/capture/record-consent/provider-input.ts'] if privacy else []
pins={p:sha(root/p) for p in files};start=time.monotonic();rec={'kind':'MAKER_SELFTEST_NOT_INDEPENDENT','argv':argv,'environment':env,'pins_before':pins,'tokens':None,'supervisor_sha256':sha(supervisor),'runtime_sha256':sha(argv[0]),'bootstrap_sha256':sha(root/'.cache/coordination/safe-test-runtime/register.mjs')};tree=None
try:
 with (out/(label+'.log')).open('wb') as stream:
  tree=h.Tree(argv,prior['cwd'],stream);rec['pid']=tree.process.pid
  try:rec['exit']=tree.process.wait(timeout=35)
  except subprocess.TimeoutExpired:rec['timeout']=True
  finally:tree.close();tree.process.wait(timeout=5);rec['tree_closed']=True;rec['exit']=tree.process.returncode
finally:
 if tree:tree.close()
 rec['active_s']=time.monotonic()-start;rec['pins_after']={p:sha(root/p) for p in files};rec['pins_unchanged']=pins==rec['pins_after'];rec['log_sha256']=sha(out/(label+'.log'));(out/(label+'.json')).write_text(json.dumps(rec,indent=2))
print(json.dumps({'label':label,'exit':rec['exit'],'seconds':rec['active_s'],'pins_unchanged':rec['pins_unchanged']}))
