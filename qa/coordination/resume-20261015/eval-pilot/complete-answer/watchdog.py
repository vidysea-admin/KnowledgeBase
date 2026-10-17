import importlib.util,json,pathlib,subprocess,sys,time,hashlib
root=pathlib.Path(r'C:/Users/product/Desktop/KnowledgeBase');out=root/'qa/coordination/resume-20261015/eval-pilot/complete-answer'
start=time.monotonic();deadline=start+240
helper_hash=hashlib.sha256((root/'scripts/qa/scoped-check-runner.py').read_bytes()).hexdigest()
if helper_hash!='d99983ba54d43ecf22bae2e2bad0dad7a57156d9bb16c36cc38d05d3cce3fc6a':raise RuntimeError('verified Job Object helper changed')
spec=importlib.util.spec_from_file_location('verified_job_helper',root/'scripts/qa/scoped-check-runner.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
tree=None;status='INCOMPLETE';code=None;evaluate_deadline=None
try:
 with (out/'process-output.jsonl').open('xb') as stream:
  tree=m.Tree([r'C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe','--import','tsx',str(out/'run.mjs')],str(root),stream)
  while True:
   marker=out/'evaluate-start.json'
   if evaluate_deadline is None and marker.exists():evaluate_deadline=time.monotonic()+max(0,210-(time.time()*1000-json.loads(marker.read_text())['epochMs'])/1000)
   cutoff=min(deadline-5,evaluate_deadline if evaluate_deadline is not None else deadline-5);left=cutoff-time.monotonic()
   if left<=0:status='HARD_EVALUATE_TIMEOUT' if evaluate_deadline is not None and evaluate_deadline<=deadline-5 else 'HARD_OUTER_TIMEOUT';break
   try:code=tree.process.wait(timeout=min(.1,left));status='RETURNED';break
   except subprocess.TimeoutExpired:pass
  tree.close();tree.process.wait(timeout=max(.01,deadline-time.monotonic()));code=tree.process.returncode
finally:
 if tree:tree.close()
 elapsed=time.monotonic()-start;receipt={'status':status,'ownExit':code,'elapsedSeconds':elapsed,'hardOuterSeconds':240,'deadlineMet':elapsed<=240,'evaluateDeadlineApplied':evaluate_deadline is not None,'helper':'scripts/qa/scoped-check-runner.py#Tree','helperSha256':helper_hash,'reviewRouteNotInvoked':True,'auditDisposition':'All original snapshots/audit/citations preserved'}
 with (out/'watchdog-receipt.json').open('x') as output:output.write(json.dumps(receipt,indent=2))
 print(json.dumps(receipt))
sys.exit(0 if status=='RETURNED' and code==0 else 2)
