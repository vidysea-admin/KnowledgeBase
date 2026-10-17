import json, pathlib, hashlib, os, subprocess, time
root=pathlib.Path.cwd(); out=root/'qa/evidence'; stem='t038-cycle1-independent'; h=lambda b:hashlib.sha256(b).hexdigest(); dump=lambda n,x:(out/(stem+n)).write_text(json.dumps(x,indent=2),encoding='utf8')
r=json.loads((root/'qa/goal-vectorless-2026-10-15/verification-t038-literal-floor-20261015T0811.json').read_text()); s=json.loads((root/'qa/goal-vectorless-2026-10-15/verification-t038-literal-floor-20261015T0811-spec.json').read_text()); env={**os.environ,**s.get('env',{})}
observed={p:h((root/p).read_bytes()) for p in r['before']}; drift=[p for p in observed if observed[p]!=r['before'][p] or observed[p]!=r['after'][p]]
eid={k:None if k not in env else h(env[k].encode()) for k in r['environmentWhitelistHashes']}; version=subprocess.run([r['program'],'--version'],capture_output=True,text=True,timeout=5)
f={'candidate_sha':h(json.dumps(observed,separators=(',',':')).encode()),'base_sha':subprocess.run(['git','rev-parse','HEAD'],capture_output=True,text=True).stdout.strip(),'command':r['command'],'python':'not-applicable:node','python_version':'not-applicable:node','lock_hash':observed['pnpm-lock.yaml'],'import_root':str(root),'environment_hash':h(json.dumps(eid,separators=(',',':')).encode()),'runtime_identity':{**r['runtime_identity'],'executable':r['program'],'version':version.stdout.strip()}}
e={k:r[k] for k in ['candidate_sha','base_sha','command','lock_hash','import_root','environment_hash','runtime_identity']}; e.update(python='not-applicable:node',python_version='not-applicable:node',exit_code=r['exitCode']); dump('-reuse.json',{'existing':e,'requested':f})
readiness={'pins':len(observed),'drift':drift,'runtime_hash_matches':h(pathlib.Path(r['program']).read_bytes())==r['runtime_executable_sha256'],'env_matches':eid==r['environmentWhitelistHashes'],'candidate_matches':f['candidate_sha']==r['candidate_sha'],'receipt_hash':h((root/'qa/goal-vectorless-2026-10-15/verification-t038-literal-floor-20261015T0811.json').read_bytes()),'source_import_root':str(root),'runtime':version.stdout.strip(),'temp_writable':None}; import tempfile
if True:
 p=out/'t038-cycle1-temp-probe.txt';p.write_text('ok');readiness['temp_writable']=p.read_text()=='ok'
dump('-readiness.json',readiness); print(json.dumps(readiness)); assert not drift and readiness['runtime_hash_matches'] and readiness['env_matches'] and readiness['candidate_matches']


