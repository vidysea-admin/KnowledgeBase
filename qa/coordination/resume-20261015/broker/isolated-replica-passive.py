from broker_lib import *
import os
phase=time.monotonic();req=load('qa/coordination/resume-20261015/isolated-replica-prep/broker-request.json');pins={pathlib.Path(p['path']).relative_to(ROOT).as_posix():p['sha256'] for p in req['pins']}
pins['pnpm-lock.yaml']=sha(ROOT/'pnpm-lock.yaml');py=ROOT/'.venv/Scripts/python.exe';assert sha(py)==req['requiredRuntimeSha256'];pins['.venv/Scripts/python.exe']=req['requiredRuntimeSha256']
for p in pins:assert sha(ROOT/p)==pins[p],p
helper=pathlib.Path('C:/Users/product/.agents/skills/checker/scripts/review_budget.py');pins[str(helper)]=sha(helper)
results=[];os.environ['PSModulePath']='C:/Windows/System32/WindowsPowerShell/v1.0/Modules'
for step in req['phases']:
 r=run('isolated-replica-'+step['label'],step['argv'],ROOT,step['timeout_s'],pins);text=pathlib.Path(r['log']).read_text(encoding='utf8',errors='replace');r['expected_exit']=step['expected_exit'];r['expected_exit_matched']=r.get('exit')==step['expected_exit'];r['expected_named_hold']=step.get('expected_named_hold');r['named_hold_present']=step.get('expected_named_hold','') in text if step.get('expected_named_hold') else None;results.append(r)
 if not r['expected_exit_matched']:break
summary={'elapsed_s':time.monotonic()-phase,'results':results,'allExpectedExits':len(results)==4 and all(r['expected_exit_matched'] for r in results),'validationDisposition':'EXPECTED HOLD, not READY or PASS','manifest':req['candidate_content_manifest_sha256'],'actual_total_tokens':None,'independent_verdict':None,'vendorExecuted':False,'databaseActivation':False};(OUT/'isolated-replica-passive-final-seal.json').write_text(json.dumps(summary,indent=2));print(json.dumps({k:v for k,v in summary.items() if k!='results'}))
