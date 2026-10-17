import importlib.util,json,pathlib,subprocess,sys,time,hashlib
root=pathlib.Path(r'C:/Users/product/Desktop/KnowledgeBase');out=root/'qa/coordination/resume-20261015/eval-pilot/offline-controls-20261016-stage2'
start=time.monotonic();deadline=start+60;spec=importlib.util.spec_from_file_location('verified_job_helper',root/'scripts/qa/scoped-check-runner.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
helper_hash=hashlib.sha256((root/'scripts/qa/scoped-check-runner.py').read_bytes()).hexdigest()
if helper_hash!='d99983ba54d43ecf22bae2e2bad0dad7a57156d9bb16c36cc38d05d3cce3fc6a':raise RuntimeError('verified helper changed')
tree=None;status='INCOMPLETE';code=None
try:
 with (out/'process-output.jsonl').open('xb') as output:
  tree=m.Tree([r'C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe','--max-old-space-size=256','--import','tsx',str(out/'adapter.mjs')],str(root),output)
  try:code=tree.process.wait(timeout=max(.01,deadline-time.monotonic()-5));status='RETURNED'
  except subprocess.TimeoutExpired:status='HARD_WALL_TIMEOUT'
  finally:tree.close();tree.process.wait(timeout=max(.01,deadline-time.monotonic()));code=tree.process.returncode
finally:
 if tree:tree.close()
 elapsed=time.monotonic()-start;receipt={'status':status,'ownExit':code,'elapsedSeconds':elapsed,'hardOuterSeconds':60,'deadlineMet':elapsed<=60,'helperSha256':helper_hash,'v8OldSpaceMiB':256,'totalRssCapClaim':False,'primaryPipelinePASS':False}
 with (out/'watchdog-receipt.json').open('x') as output:output.write(json.dumps(receipt,indent=2))
 print(json.dumps(receipt))
sys.exit(0 if status=='RETURNED' and code==0 else 2)
