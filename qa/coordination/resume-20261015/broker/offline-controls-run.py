import pathlib,json,re,hashlib,sys,time,os
sys.path.insert(0,str(pathlib.Path(__file__).parent))
import broker_lib as b
started=time.monotonic();d='qa/coordination/resume-20261015/eval-pilot/offline-controls/'
request=b.load(d+'broker-request.json');closure=b.load(request['sourceClosure']);approved=b.load(d+'approved-data-pins.json')
pins={p['path']:p['sha256'] for p in request['pins']+closure['files']+approved}
source=(b.ROOT/'scripts/eval/vectorless-production-eval.mjs').read_text(encoding='utf8')
code=re.findall(r"'([^']+)'",source.split('const CODE = [',1)[1].split('];',1)[0])
for p in code:pins.setdefault(p,b.sha(b.ROOT/p))
ledgers=['qa/coordination/resume-20261015/eval-pilot/provider-request-ledger.jsonl','qa/coordination/resume-20261015/eval-pilot/grant2/provider-request-reservations.jsonl']
for p in ledgers:pins[p]=b.sha(b.ROOT/p)
active_prefixes=['schema/sessions.schema.json','schema/speaker_suggestions.schema.json','apps/api/src/transcript-review/store','apps/api/src/transcript-review/service','apps/api/src/transcript-review/refresh-executor','apps/api/src/indexing/native-archive/publication','packages/db/src/collections/speaker-suggestions','packages/db/src/lib/native-publication/index.ts']
intersection=[p for p in pins if any(p.startswith(a) for a in active_prefixes)]
assert not intersection,intersection
assert len(approved)==119
assert all(b.sha(b.ROOT/p)==h for p,h in pins.items()),'pin mismatch'
assert not any((b.ROOT/d/p).exists() for p in ['result.json','refusal.json','process-output.jsonl','watchdog-receipt.json']),'historical output present'
probe=b.OUT/('offline-controls-temp-'+__import__('uuid').uuid4().hex);probe.mkdir();(probe/'probe').write_bytes(b'owned');(probe/'probe').unlink();probe.rmdir()
for rel in ['node_modules/tsx/package.json','node_modules/tsx/dist/loader.mjs','.venv/Scripts/python.exe']:
 pins[rel]=b.sha(b.ROOT/rel)
meta={'requestCandidate':request['candidate'],'sourcePair':request['sourcePair'],'sourceBefore':pins,'approvedDataCount':len(approved),'freezeCodePaths':code,'activeIntersection':intersection,'selectedImportClosure':'evaluator builtin static imports only; productionRuntime dynamic imports never called; lexical has no imports; baseline type-only recall import erased','activeAuthority':'root NEW_TASK explicit paths; schemas/generated and transcript-review helpers not bound unless listed in CODE','reservedRequestRows':sum(len((b.ROOT/p).read_text().splitlines()) for p in ledgers),'command':request['command'],'actual_total_tokens':None}
(b.OUT/'offline-controls-admission.json').write_text(json.dumps(meta,indent=2),encoding='utf8')
rec=b.run('offline-controls-full92',[str(b.ROOT/request['command'][0]),request['command'][1]],b.ROOT,60,pins)
meta['receipt']=rec;meta['brokerActiveSeconds']=time.monotonic()-started
result=b.ROOT/d/'result.json'
if result.exists():
 r=json.loads(result.read_text(encoding='utf8'));meta['summary']={k:r[k] for k in ['status','input','callCounts','arms','memory','paidLedgersUnchanged','primaryPipelinePASS','answerCitationPASS']};meta['resultSha256']=b.sha(result)
(b.OUT/'offline-controls-final-seal.json').write_text(json.dumps(meta,indent=2),encoding='utf8')
print(json.dumps({'exit':rec.get('exit'),'pinsUnchanged':rec.get('pins_unchanged'),'seconds':meta['brokerActiveSeconds'],'result':r['status'] if result.exists() else None,'arms':r['arms'] if result.exists() else None}))
