"""Bind real broker refresh receipts; schema readiness is not execution admission."""
import json,hashlib,shutil
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path('C:/Users/product/Desktop/KnowledgeBase');OUT=Path(__file__).parent;BROKER=OUT.parent/'broker'
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def bound(p,**kw):return dict(path=str(p.resolve()),sha256=sha(p),**kw)
def write(n,d):(OUT/n).write_text(json.dumps(d,indent=2)+'\n',encoding='utf-8')
history=OUT/'phase2-metadata-history'
if not history.exists():
 history.mkdir()
 for p in OUT.iterdir():
  if p.is_file() and p.suffix in ['.json','.log','.md','.txt']:shutil.copyfile(p,history/p.name)
packet=read(OUT/'managed-review-input.json');pins=read(OUT/'candidate-pins.json')
for row in pins['files']:assert sha(ROOT/row['path'])==row['current_sha256'],row['path']
labels=['integrated-t037-current13','integrated-t037-current-lastvalid2','integrated-t056-page-current']
refresh=[];dependencies={}
for label in labels:
 p=BROKER/(label+'-receipt.json');r=read(p)
 assert r['exit']==0 and r['pins_unchanged'] and r['tree_close_completed']
 log=Path(r['log']);assert sha(log)==r['log_sha256']
 dependencies.update(r['pins_after'])
 refresh.append(dict(label=label,receipt=bound(p),log=bound(log),argv=r['argv'],cwd=r['cwd'],exit=r['exit'],actual_summary=r.get('framework_summary',r['counts']),active_s=r['active_s'],runtime_sha256=r['runtime_sha256'],lock_sha256=r['lock_sha256'],supervisor_sha256=r['supervisor_sha256'],pins_unchanged=True))
# Reuse only unchanged older focused scopes; updated page19 replaces former page19,
# while untouched directAnswer2 remains attributed to original combined21 receipt.
for name in ['t013-ui','t056-api-exact-readlease','t056-ui']:
 p=BROKER/(name+'-receipt.json');r=read(p)
 if name!='t056-ui':dependencies.update(r['pins_after'])
 refresh.append(dict(label=name,receipt=bound(p),classification='Attributed older focused receipt; independent checker must authenticate reuse identity and meaningful boundary',scope='directAnswer.test.ts2 only; old page19 superseded by current page19' if name=='t056-ui' else 'unchanged source focused scope'))
# Later current broker receipts supersede older broad dependency fingerprints.
for label in labels:dependencies.update(read(BROKER/(label+'-receipt.json'))['pins_after'])
write('current-focused-bindings.json',refresh)
env=[]
for path,expected in sorted(dependencies.items()):
 f=ROOT/path;actual=sha(f) if f.is_file() else None
 env.append(dict(path=path,receipt_sha256=expected,current_sha256=actual,match=actual==expected))
drift=[r for r in env if not r['match']]
write('current-environment-bindings.json',dict(recorded_utc=datetime.now(timezone.utc).isoformat(),dependencies=env,current_drift=drift,focused=bound(OUT/'current-focused-bindings.json'),scope='Source/environment provenance metadata. Root must freshly freeze/recheck actual dependency hashes before manual checker; active unrelated/conditional runtime repairs do not authorize silent receipt reuse.',maker_actual_total_tokens=None,checker_actual_total_tokens=None))
extra=['integrated-final-checkpoint.md','integrated-final-identity.json','integrated-final-sealed-inventory.json','integrated-affected-structure-admission.json','integrated-t037-current-summary.json','integrated-focused-summary.json','integrated-freeze-explicit-overlays.json']
packet['readiness']['receipts']=[bound(OUT/'current-environment-bindings.json',role='environment'),bound(OUT/'current-focused-bindings.json',role='focused-test'),bound(OUT/'central-gates.json',role='central-gates')]+[bound(BROKER/n,role='central-evidence') for n in extra]
packet['readiness']['complete']=True
packet['worker']['runtime_identity']=dict(mode='prospective instruction-aware fresh manual native checker under checker skill; optional managed launcher NOT requested',native_controls='UNKNOWN; no assurance or hardcap claimed',startup='Historical observation only; no current managed-launcher startup assurance claimed')
write('managed-review-input.json',packet)
a=read(OUT/'admission.json');a.update(status='METADATA_COMPLETE_PENDING_ROOT_MANUAL_ADMISSION',dispatch_allowed=False,semantic_verdict=None,source_pin_mismatches=[],current_dependency_drift=drift,old_archive_mismatch='Preserved in phase1/phase2; superseded by real current T03713+2 broker receipts, never classified unrelated',required_pending=['Root next approval for ONE fresh instruction-aware manual checker under explicit finite180seconds/180000actual_total allocation; no optional managed launcher runtime controls or hardcap claimed','Fresh root dependency freeze/hash check after three active small fixture/receiver repairs; current_environment_bindings records exact observed drift','Fresh helper assess at dispatch and material phases; actual runtime totals/null accounting, reserved finalization and independent verdict obligations remain'],schema_readiness_complete=True,current_focused_binding='current-focused-bindings.json',current_environment_binding='current-environment-bindings.json',history=['phase1-metadata-history','phase2-metadata-history'])
write('admission.json',a)
print(json.dumps(dict(candidate=pins['candidate_sha256'],changed_paths=len(pins['files']),dependency_drifts=drift,readiness_complete=True,dispatch_allowed=False)))
