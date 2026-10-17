"""Seal metadata against the broker's final source epoch; no execution admission."""
import json,hashlib,shutil
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path('C:/Users/product/Desktop/KnowledgeBase');OUT=Path(__file__).parent;B=OUT.parent/'broker'
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def bound(p,**kw):return dict(path=str(p.resolve()),sha256=sha(p),**kw)
def write(n,v):(OUT/n).write_text(json.dumps(v,indent=2)+'\n',encoding='utf-8')
hist=OUT/'phase3-metadata-history'
if not hist.exists():
 hist.mkdir()
 for p in OUT.iterdir():
  if p.is_file() and p.suffix in ['.json','.md','.log','.txt']:shutil.copyfile(p,hist/p.name)
packet=read(OUT/'managed-review-input.json');pins=read(OUT/'candidate-pins.json')
assert pins['candidate_sha256']=='eebad8d658fad78a678eae50252909b44c567f0184feda35bdbc3df97be122de'
for r in packet['unit']['files']:assert sha(Path(r['path']))==r['sha256']
seal=read(B/'secure-native-final-sealed-inventory.json')
adopt=read(B/'secure-native-two-test-adoption.json')
assert len(adopt['adoptions'])==2
for r in adopt['adoptions']:assert sha(ROOT/r['path'])==r['after']==seal[r['path']]
env=read(OUT/'current-environment-bindings.json');oldenv=env['dependencies'];rows=[]
for row in oldenv:
 path=row['path'];p=ROOT/path;actual=sha(p) if p.is_file() else None
 expected=seal.get(path,row['receipt_sha256'])
 rows.append(dict(path=path,old_receipt_sha256=row['receipt_sha256'],sealed_epoch_sha256=expected,current_sha256=actual,match=actual==expected,epoch_authority='secure-native-final-sealed-inventory.json' if path in seal else 'existing focused receipt unchanged'))
assert all(r['match'] for r in rows),[r for r in rows if not r['match']]
extras=['secure-native-final-checkpoint.md','secure-native-final-sealed-inventory.json','secure-native-two-test-adoption.json','secure-native-two-test-phase-summary.json','repair-four-final-checkpoint.md','repair-four-final-sealed-inventory.json','repair-four-overlay-adoption.json','repair-four-phase-summary.json','repair-t037-closure-admission.json']
bindings=[bound(B/n,role='final-epoch') for n in extras]
current=[]
for label in ['repair-t037-current13','repair-t037-lastvalid2','repair-bot-typecheck','repair-api-typecheck','ordered-verifier-postcommit20','aligned-clock-workspace12','secure-native-original-two-joins']:
 p=B/(label+'-receipt.json');r=read(p);assert r['exit']==0 and r['pins_unchanged']
 log=Path(r['log']);assert sha(log)==r['log_sha256']
 current.append(dict(receipt=bound(p),log=bound(log),label=label,exit=r['exit'],counts=r.get('counts'),argv=r['argv'],cwd=r['cwd'],active_s=r.get('active_s'),scope='Attributed shared integration evidence; independent reviewer validates relevant reuse; not a full parent or production-host acceptance'))
write('final-epoch-bindings.json',dict(recorded_utc=datetime.now(timezone.utc).isoformat(),candidate_sha256=pins['candidate_sha256'],dependency_count=len(rows),dependencies=rows,current_drift=[],raw_bindings=bindings,current_receipts=current,standing_external_gates=['Unsupported file-symlink privilege/security coverage','Production automatic private-root creation and native production/host qualification','Archive fresh-process rehydration/PhaseB full acceptance; live platform/provider/human/database full-parent gates'],shared_integration_accounting='Keep broker recorded script durations separate; maker/checker model-active/tokens/cost remain unknown, not invented measured usage. Historical reds and control-validation breach preserved.'))
packet['readiness']['receipts'].append(bound(OUT/'final-epoch-bindings.json',role='environment'))
packet['readiness']['receipts']+=bindings
# Old current-environment file remains a truthful historical drift snapshot. Final
# exact epoch and explicit overlays above supersede it; never silently edit old pins.
packet['readiness']['complete']=True
write('managed-review-input.json',packet)
verdict=ROOT/'qa/verdicts/t013-t037-t056-joined-source-slices.md'
a=read(OUT/'admission.json');a.update(status='SEALED_METADATA_READY_FOR_ONE_MANUAL_CHECKER_PENDING_ROOT_COMMAND',dispatch_allowed=False,current_dependency_drift=[],final_epoch_binding='final-epoch-bindings.json',required_pending=['Root explicit next dispatch command for ONE fresh instruction-aware manual checker; recheck source/dependency seal immediately before launch'],prospective_verdict_path=str(verdict),identity=packet['metrics']['completion_reserve_id'],manual_workflow='checker/SKILL.md fresh context, explicit finite allocation, independently review source and authenticate evidence, broker-only checks and persisted canonical verdict; optional managed launcher not requested',native_hard_total_token_cap_established=False,semantic_verdict=None)
a['history'].append('phase3-metadata-history');write('admission.json',a)
print(json.dumps(dict(identity=a['identity'],dependencies=len(rows),drift=0,dispatch_allowed=False,verdict_path=str(verdict))))
