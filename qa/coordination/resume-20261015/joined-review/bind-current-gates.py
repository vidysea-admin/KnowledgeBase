"""Metadata rebinding only. Preserve previous phase; never execute product code."""
import json,hashlib,shutil
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path('C:/Users/product/Desktop/KnowledgeBase'); OUT=Path(__file__).parent
BROKER=OUT.parent/'broker'
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def bound(p,**kw):return dict(path=str(p.resolve()),sha256=sha(p),**kw)
def write(n,v):(OUT/n).write_text(json.dumps(v,indent=2)+'\n',encoding='utf-8')
old=OUT/'phase1-metadata-history'
if not old.exists():
 old.mkdir()
 for p in OUT.iterdir():
  if p.is_file() and p.suffix in ['.json','.log','.md','.txt']:shutil.copyfile(p,old/p.name)
pins=read(OUT/'candidate-pins.json')
authorized='apps/web/src/pages/answer-policy/PolicyAskPage.test.tsx'
newpins={r['path']:r['sha256'].lower() for r in read(OUT.parent/'t056-direct-answer/source-pins.json')}
for r in pins['files']:
 actual=sha(ROOT/r['path'])
 if r['path']==authorized:
  assert actual==newpins[authorized]=='c7ef0c78679d74d9e6476acb86b18710c4073edbaa6fb72aae1d30a3e7e98f8e'
  r['previous_sha256']=r['current_sha256'];r['expected_sha256']=actual;r['authorization']='Root exact timestamp test-fixture change; maker source-pins.json updated; focused smallest page rerun pending'
 else:assert actual==r['current_sha256'],r['path']
 r['current_sha256']=actual;r['match']=actual==r['expected_sha256']
candidate=hashlib.sha256(json.dumps([dict(path=r['path'],sha256=r['current_sha256']) for r in sorted(pins['files'],key=lambda x:x['path'])],separators=(',',':'),sort_keys=True).encode()).hexdigest()
pins['candidate_sha256']=candidate;pins['all_maker_pins_match']=all(r['match'] for r in pins['files']);write('candidate-pins.json',pins)
summary=read(BROKER/'integrated-freeze-gate-summary.json')
rows=[]
for r in summary['results']:
 mismatches=[]
 for f in pins['files']:
  expected=r['pins_after'].get(f['path'])
  if expected!=f['current_sha256']:mismatches.append(dict(path=f['path'],receipt_sha256=expected,current_sha256=f['current_sha256']))
 log=Path(r['log']);rows.append(dict(label=r['label'],exit=r.get('exit'),argv=r['argv'],cwd=r['cwd'],active_s=r.get('active_s'),pins_unchanged=r.get('pins_unchanged'),joined_source_mismatches=mismatches,log=bound(log),raw_receipt=bound(BROKER/(r['label']+'-receipt.json'))))
struct=read(Path(next(r for r in summary['results'] if r['label']=='integrated-freeze-scoped-structure')['log']))
write('central-gates.json',dict(summary=bound(BROKER/'integrated-freeze-gate-summary.json'),results=rows,inventory_count=summary['inventory_count'],inventory_unchanged=summary['inventory_unchanged'],contracts_vacuity=summary['contracts_vacuity'],selected_LOC_rows_all_green=all(r['ok'] for r in struct['rows']),directory_violations=struct['directory']['violations'],scope='Full bot/API/web typechecks green; import cycles green348modules1052dependencies. Structure own exit1: selected LOC rows green; broad scripts/qa33 and scripts/webinar34 inherited directory limits remain distinct, no whole-repo structural PASS.',shared_integration_active_s=summary['active_s'],actual_total_tokens=None,independent_verdict=None))
packet=read(OUT/'managed-review-input.json');packet['unit']['candidate_sha']=candidate;packet['unit']['files']=[bound(ROOT/r['path']) for r in pins['files']]
packet['metrics']['completion_reserve_id']=packet['unit']['slug']+'/0/'+candidate
packet['readiness']['receipts'].append(bound(OUT/'central-gates.json',role='central-gates'))
packet['worker']['runtime_identity']['mode']='prospective instruction-aware fresh manual native checker; optional managed launcher NOT requested'
packet['readiness']['complete']=False
write('metrics.json',packet['metrics']);write('managed-review-input.json',packet)
admission=read(OUT/'admission.json');admission.update(status='METADATA_REBOUND_PENDING_TWO_FOCUSED_REFRESHES',dispatch_allowed=False,candidate_sha256=candidate,updated_utc=datetime.now(timezone.utc).isoformat(),required_pending=['Current T03713+2 broker receipts on exact current93path closure; retain old archive-spool mismatch historically','Current smallest PolicyAskPage timestamp-fixture rerun receipt; retain previous21 UI receipt historically','Fresh helper validate after exact focused refresh binding; helper assess before next phase','Root manual native checker allocation/instruction admission; no managed launcher controls/startup assurance or hardcap claimed'],central_gate_binding='central-gates.json',historical_phase='phase1-metadata-history',semantic_verdict=None)
write('admission.json',admission)
print(json.dumps(dict(candidate=candidate,central_bound=len(rows),source_mismatches=[r for r in rows if r['joined_source_mismatches']],dispatch_allowed=False)))
