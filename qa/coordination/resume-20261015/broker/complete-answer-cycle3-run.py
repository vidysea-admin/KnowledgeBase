from broker_lib import *
import os
req=load('qa/coordination/resume-20261015/eval-pilot/complete-answer-cycle3/broker-request.json');pins=load('qa/coordination/resume-20261015/broker/native-next-stage2-inventory-after.json')
for p in req['pins']:pins[p['path']]=p['sha256']
for p in load('qa/coordination/resume-20261015/eval-pilot/offline-controls/approved-data-pins.json'):pins[p['path']]=p['sha256']
ledgers=['qa/coordination/resume-20261015/eval-pilot/provider-request-ledger.jsonl','qa/coordination/resume-20261015/eval-pilot/grant2/provider-request-reservations.jsonl']
for p in ledgers:pins[p]=sha(ROOT/p)
adapter=ROOT/'qa/coordination/resume-20261015/runtime-alias-repair/register.mjs';assert sha(adapter)=='e2af4f52f525032e808eae5452804fe7f83c51869ed427d106a3b128dd22999d';pins[adapter.relative_to(ROOT).as_posix()]=sha(adapter)
temp=OUT/'complete-answer-cycle3-temp';temp.mkdir(exist_ok=True);probe=temp/'probe';probe.write_bytes(b'owned');probe.unlink();os.environ.update(TMP=str(temp),TEMP=str(temp),LKB_NATIVE_PUBLICATION_MONGO_RUN='0')
args=req['command'][1:];args.insert(0,'--test-isolation=none');args[args.index('tsx')]=adapter.as_uri()
r=run('complete-answer-cycle3-auth13',[NODE,*args],ROOT,40,pins)
receipt={'candidate':req['candidate'],'requestedCount':13,'actual':r,'rootAuthority':'all sources frozen Stage2; earlier active DB barrel now frozen in63pin manifest','sourceAndDataBindings':len(pins),'paidLedgerHashes':{p:pins[p] for p in ledgers},'realGrantState':'awaiting_human; IDs6-17 unspent; no actual provider execution','modelTokens':0,'primaryOrAnswerPASS':False,'actual_total_tokens':None}
(OUT/'complete-answer-cycle3-final-seal.json').write_text(json.dumps(receipt,indent=2));print(json.dumps({'exit':r.get('exit'),'counts':r.get('counts'),'pinsUnchanged':r.get('pins_unchanged')}))
