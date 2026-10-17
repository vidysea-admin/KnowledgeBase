import json,pathlib,hashlib
root=pathlib.Path.cwd();results=[]
sha=lambda p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
for name in ['frozen-contracts-20261015T0914','api-types-20261015T0940','web-types-20261015T0940','api-build-20261015T0940','web-build-20261015T0940']:
 p=root/('qa/goal-vectorless-2026-10-15/verification-'+name+'.json');r=json.loads(p.read_text(encoding='utf-8-sig'));drift=[s for s,h in r['after'].items() if sha(root/s)!=h];assert not drift,(name,drift);assert r['exitCode']==0 and r['before']==r['after'];assert sha(root/'pnpm-lock.yaml')==r['lock_hash'];results.append({'name':name,'receipt_sha256':sha(p),'exit':0,'currentDrift':drift,'durationMs':r['elapsedMs']})
(root/'qa/coordination/knowledge-brain-20261015/provider-http-coherence-authentication.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
