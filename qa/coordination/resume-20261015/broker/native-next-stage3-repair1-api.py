from broker_lib import *
import os
phase=time.monotonic();packetpath='qa/coordination/resume-20261015/native-next-maker/combined-source-pins-stage3-api-repair1.json';assert sha(ROOT/packetpath)=='db8f2a92105d3f934e03befe49d60583aba704c8522c32af61281a7f1640630c';packet=load(packetpath);assert len(packet)==66;assert all(sha(ROOT/p['path'])==p['sha256'] for p in packet)
pins=load('qa/coordination/resume-20261015/broker/native-next-stage3-inventory-after.json');allowed={'apps/api/src/composition/lazy-database.test.ts'};watched=load('qa/coordination/resume-20261015/watched-cadence/source-pins.json');allowed.update(p['path'] for p in watched);adoptions=[]
for p,h in list(pins.items()):
 current=sha(ROOT/p)
 if current!=h:
  assert p in allowed,'unexpected dependency epoch drift '+p
  adoptions.append({'path':p,'previous':h,'current':current});pins[p]=current
for p in load('qa/coordination/resume-20261015/native-next-maker/deleted-source-paths-stage2.json'):assert not (ROOT/p).exists()
temp=OUT/'native-next-stage3-repair1-temp';temp.mkdir(exist_ok=True);(temp/'probe').write_bytes(b'owned');(temp/'probe').unlink();os.environ.update(TMP=str(temp),TEMP=str(temp),LKB_NATIVE_PUBLICATION_MONGO_RUN='0')
(OUT/'native-next-stage3-repair1-inventory-before.json').write_text(json.dumps(pins,indent=2));r=run('native-next-stage3-repair1-api-types',[NODE,'node_modules/typescript/bin/tsc','--noEmit','-p','tsconfig.json'],ROOT/'apps/api',70,pins)
(OUT/'native-next-stage3-repair1-inventory-after.json').write_text(json.dumps(r['pins_after'],indent=2));summary={'active_s':time.monotonic()-phase,'results':[r],'adoptions':adoptions,'reuse':'root-approved prior DB/bot/root/graph/LOC receipts; only typed test fixture changed, all65otherunit paths exact; watched separate authority','actual_total_tokens':None,'independent_verdict':None};(OUT/'native-next-stage3-repair1-gate-summary.json').write_text(json.dumps(summary,indent=2));print(json.dumps({'exit':r.get('exit'),'pinsStable':r.get('pins_unchanged'),'active_s':summary['active_s']}))
