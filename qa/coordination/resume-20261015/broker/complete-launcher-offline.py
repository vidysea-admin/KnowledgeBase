from broker_lib import *
import os,sys
phase=time.monotonic();base='qa/coordination/resume-20261015/eval-pilot/complete-answer/';req=load(base+'launcher-broker-request.json');plan=load(base+'launch-pins.json');assert sha(ROOT/base/'launch-pins.json')==req['launchPinsSha256'];assert len(plan['files'])==150
pins={p['path']:p['sha256'] for p in plan['files']+req['files']};pins[base+'launch-pins.json']=req['launchPinsSha256'];bad=[p for p,h in pins.items() if sha(ROOT/p)!=h]
if bad:
 (OUT/'complete-launcher-offline-refusal.json').write_text(json.dumps({'status':'pin-drift-before-dispatch','paths':bad,'testsLaunched':0,'providerCalls':0},indent=2));print(json.dumps({'pinDrift':bad}));sys.exit(0)
ledgerNames=['qa/coordination/resume-20261015/eval-pilot/provider-request-ledger.jsonl','qa/coordination/resume-20261015/eval-pilot/grant2/provider-request-reservations.jsonl']
for p in ledgerNames:pins[p]=sha(ROOT/p)
pending=load(base+'authorization.pending.json');assert pending['approvalState']=='awaiting_human';assert not (ROOT/base/'authorization.approved.json').exists()
beforeFiles=sorted(p.name for p in (ROOT/base).iterdir() if p.is_file());temp=OUT/'complete-launcher-offline-temp';temp.mkdir(exist_ok=True);q=temp/'probe';q.write_bytes(b'owned');q.unlink();os.environ.update(TMP=str(temp),TEMP=str(temp))
syntax=run('complete-launcher-watchdog-syntax',[str(ROOT/'.venv/Scripts/python.exe'),'-B','-c',"import ast,pathlib,sys;ast.parse(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'));print('watchdog AST syntax valid; not imported or executed')",str(ROOT/base/'watchdog.py')],ROOT,10,pins)
assert syntax.get('exit')==0,'watchdog syntax failure'
tests=run('complete-launcher-offline4',req['command'],ROOT,20,pins)
afterFiles=sorted(p.name for p in (ROOT/base).iterdir() if p.is_file());reserved=sum(sum(json.loads(line).get('event')=='reserved' for line in (ROOT/p).read_text().splitlines() if line.strip()) for p in ledgerNames)
receipt={'syntax':syntax,'tests':tests,'launchPinsCount':len(plan['files']),'allBoundPinCount':len(pins),'sourcePair':req['sourcePair'],'approvalState':pending['approvalState'],'approvedArtifactAbsent':not (ROOT/base/'authorization.approved.json').exists(),'baselineReservedRequests':reserved,'realGrantIds6To17':'unspent; no actual launcher execution','providerCalls':0,'credentialReads':0,'directoryListingUnchanged':beforeFiles==afterFiles,'elapsed_s':time.monotonic()-phase,'actual_total_tokens':None,'independent_verdict':None};(OUT/'complete-launcher-offline-final-seal.json').write_text(json.dumps(receipt,indent=2));print(json.dumps({'syntaxExit':syntax.get('exit'),'testsExit':tests.get('exit'),'counts':tests.get('counts'),'pinStable':tests.get('pins_unchanged'),'reserved':reserved,'elapsed_s':receipt['elapsed_s']}))
