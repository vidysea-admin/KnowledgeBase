import importlib.util,json,pathlib,sys,time,subprocess,hashlib
root=pathlib.Path(__file__).resolve().parents[4]
# Root below is explicitly the shared workspace; do not derive kill targets.
root=pathlib.Path(r'C:/Users/product/Desktop/KnowledgeBase')
out=root/'qa/coordination/resume-20261015/eval-pilot'
start=time.monotonic();deadline=start+60
spec=importlib.util.spec_from_file_location('verified_job_helper',root/'scripts/qa/scoped-check-runner.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
argv=[r'C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe','--import','tsx',str(out/'remaining-status-and-pilot.mjs')]
tree=None;status='INCOMPLETE';code=None
try:
 with (out/'remaining-process-output.jsonl').open('wb') as output:
  tree=m.Tree(argv,str(root),output)
  try:
   code=tree.process.wait(timeout=max(.01,deadline-time.monotonic()-4));status='RETURNED'
  except subprocess.TimeoutExpired:status='HARD_WALL_TIMEOUT'
  finally:
   tree.close();tree.process.wait(timeout=max(.01,deadline-time.monotonic()));code=tree.process.returncode
finally:
 if tree:tree.close()
 elapsed=time.monotonic()-start
 receipt={'status':status,'ownExit':code,'elapsedSeconds':elapsed,'hardWallSeconds':60,'deadlineMet':elapsed<=60,'processTreeHelper':'scripts/qa/scoped-check-runner.py#Tree','helperSha256':hashlib.sha256((root/'scripts/qa/scoped-check-runner.py').read_bytes()).hexdigest(),'reviewRouteNotInvoked':True,'authority':'root separately authorized bounded provider operation; not checker model review'}
 (out/'receipt.remaining-watchdog.json').write_text(json.dumps(receipt,indent=2))
 print(json.dumps(receipt))
sys.exit(0 if status=='RETURNED' and code==0 else 2)
