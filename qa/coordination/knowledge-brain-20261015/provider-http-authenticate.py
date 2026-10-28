import json,hashlib,pathlib,subprocess
root=pathlib.Path.cwd(); out=root/'qa/coordination/knowledge-brain-20261015'; results=[]
sha=lambda p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
pins=json.loads((out/'provider-http-current-candidate.json').read_text(encoding='utf-8-sig'))
assert all(sha(root/p['path'])==p['sha256'] for p in pins['pins'])
for name in ['central-provider-outputs-20261015T0847','current-composition-four-20261015T0944','local-ollama-mandatory-20261015T0954','ai-package-types-20261015T0954']:
 idx=json.loads((out/('verification-'+name+'-index.json')).read_text(encoding='utf-8-sig')); raw=root/idx['rawReceipt']; r=json.loads(raw.read_text(encoding='utf-8-sig'))
 assert sha(raw)==idx['rawReceiptSha256']
 drift=[p for p,h in r['after'].items() if sha(root/p)!=h]; assert not drift,(name,drift)
 assert r['before']==r['after'] and r['exitCode']==0 and r['hashesUnchanged']
 assert sha(root/'pnpm-lock.yaml')==r['lock_hash']; assert sha(r['program'])==r['runtime_executable_sha256']
 identity={k:r[k] for k in ['candidate_sha','base_sha','command','lock_hash','import_root','environment_hash','runtime_identity']}; identity.update(python=r['program'],python_version=r['runtime_version'],exit_code=r['exitCode'])
 pair={'existing':identity,'requested':dict(identity)}; pairpath=out/('provider-http-reuse-'+name+'.json');pairpath.write_text(json.dumps(pair))
 proc=subprocess.run(['python','C:/Users/product/.agents/skills/checker/scripts/review_budget.py','reuse','--input',str(pairpath)],capture_output=True,text=True);assert proc.returncode==0,proc.stdout
 result=json.loads(proc.stdout);(out/('provider-http-reuse-'+name+'-result.json')).write_text(proc.stdout)
 stdout=(root/r['stdoutPath']).read_text(encoding='utf-8-sig');results.append({'name':name,'raw_sha256':sha(raw),'exit':0,'current_drift':drift,'pins':len(r['after']),'reuse':result['status'],'stdout_tail':stdout[-330:]})
(out/'provider-http-independent-authentication.json').write_text(json.dumps({'candidate_sha':pins['candidate_sha'],'candidate12_current':True,'receipts':results},indent=2));print(json.dumps(results))
