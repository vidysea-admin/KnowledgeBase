"""Read/hash metadata only; never launch tests or reviewers."""
import hashlib,json,subprocess,sys
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path('C:/Users/product/Desktop/KnowledgeBase')
OUT=Path(__file__).parent
BASE=ROOT/'qa/coordination/resume-20261015'
SKILL=Path('C:/Users/product/.agents/skills/checker')
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p): return json.loads(p.read_text(encoding='utf-8-sig'))
def write(name,value): (OUT/name).write_text(json.dumps(value,indent=2)+'\n',encoding='utf-8')
def bound(p,**kw): return dict(path=str(p.resolve()),sha256=digest(p),**kw)
def git(*args): return subprocess.check_output(['git',*args],cwd=ROOT,text=True).strip()
t13=read(BASE/'t013-voice-conversation/candidate-pins.json')
t37=read(BASE/'t037-approved-trust/pins.json')['pins']
t56=read(BASE/'t056-direct-answer/source-pins.json')
changed=t13+[r for r in t37 if r['role']=='changed']+t56
assert len(changed)==16
checks=[]
for row in changed:
 p=ROOT/row['path']; actual=digest(p)
 checks.append(dict(path=row['path'],expected_sha256=row['sha256'].lower(),current_sha256=actual,match=actual==row['sha256'].lower(),git_status=git('status','--porcelain','--',row['path'])))
candidate=hashlib.sha256(json.dumps([{ 'path':r['path'],'sha256':r['current_sha256']} for r in sorted(checks,key=lambda x:x['path'])],separators=(',',':'),sort_keys=True).encode()).hexdigest()
write('candidate-pins.json',dict(identity_kind='sha256 of UTF-8 canonical JSON sorted path/sha256 raw-byte map; NOT a Git commit',candidate_sha256=candidate,base_sha='5c4cbade2d1a8aa4815de13d587db8de3b01cc4a',head=git('rev-parse','HEAD'),files=checks,all_maker_pins_match=all(r['match'] for r in checks)))
names=['t013-ui','t037-approved-trust13','t037-lastvalid-floor2','t056-ui','t056-api-exact-readlease']
receipts=[]
deps={}
for name,count in zip(names,[38,13,2,21,7]):
 p=BASE/'broker'/f'{name}-receipt.json'; r=read(p)
 execution=r.get('execution',r)
 before=r.get('pins_before',{}); after=r.get('pins_after',{})
 for path,sha in before.items(): deps[path]=sha.lower()
 receipts.append(dict(**bound(p,role='focused-test'),expected_passed=count,reported_summary=r.get('actual_vitest_summary',r.get('vitest_summary',r.get('counts',r.get('node_counts')))),own_exit=execution.get('exit',r.get('exit_code')),command=execution.get('argv',r.get('argv')),cwd=execution.get('cwd',r.get('cwd')),log=execution.get('log',r.get('log')),log_sha256=execution.get('log_sha256',r.get('log_sha256')),pins_unchanged=r.get('pins_unchanged'),before_after_match=before==after,raw_receipt_authority='Broker evidence; no independent semantic/reuse verdict'))
write('focused-evidence.json',receipts)
dependencies=[]
for path,sha in sorted(deps.items()):
 p=ROOT/path
 dependencies.append(dict(path=path,receipt_sha256=sha,current_sha256=digest(p) if p.is_file() else None,match=p.is_file() and digest(p)==sha))
write('environment-and-read-dependencies.json',dict(runtime='Exact Node executable/runtime/import bootstrap/temp and safe environment identities are bound inside linked raw receipts; no secret environment dump',dependencies=dependencies,all_match=all(r['match'] for r in dependencies),focused_evidence=bound(OUT/'focused-evidence.json')))
sources=[BASE/'t013-voice-conversation/packet-fragment.md',BASE/'t037-approved-trust/packet.md',BASE/'t056-direct-answer/packet.md',BASE/'broker/t037-t056-checkpoint.md']
for folder in ['t013-voice-conversation','t037-approved-trust','t056-direct-answer']:
 sources.extend(p for p in (BASE/folder).glob('*.json'))
history=ROOT/'qa/coordination/checker-runtime-validation-20261015/independent-telemetry.json'
sources.extend([history,SKILL/'SKILL.md',SKILL/'references/managed-review-v1.md',SKILL/'scripts/review_contract.py',SKILL/'scripts/review_budget.py'])
sources.extend(ROOT/f'qa/contracts/goal-t{n}.md' for n in ['013','037','056'])
write('immutable-input-bindings.json',[bound(p) for p in sources])
slug='t013-t037-t056-joined-source-slices'
metrics=dict(token_metric='actual_total',maker=dict(token_metric='actual_total',active_s=None,tokens=None,cost=None),reviewers=[dict(id='not-started',token_metric='actual_total',active_s=0,tokens=0,cost=None)],next_phase=dict(token_metric='actual_total',kind='review',active_s=150,tokens=130000,cost=None),completion_reserve=True,completion_reserve_id=f'{slug}/0/{candidate}',completion_reserve_tokens=50000,bootstrap_scope='ONE joined source-slice independent review, 16 changed paths, no full-parent closure or provider/browser/runtime launch',bootstrap=dict(token_metric='actual_total',active_s=180,tokens=180000,cost=None),escalation=dict(authority='Root explicit finite BOOTSTRAP exception in task dispatch 2026-10-15; not claimed Umesh enforcement approval',reason='Maker actual denominators unavailable; historical native startup about 41574 input tokens; reserve must include runtime input plus output. Workflow allocation only; no hard token cap or measured 10% guarantee.',limits=dict(token_metric='actual_total',active_s=180,tokens=180000,cost=None)))
write('metrics.json',metrics)
prompt='''Metadata envelope only: DO NOT DISPATCH until admission.json dispatch_allowed=true and fresh helper checks. Future independent checker must read checker SKILL.md, PACKET.md, exact goal contracts, changed raw bytes and immediate consumers; verify source/cycle/environment/evidence provenance and a meaningful boundary. No source/contract/enforcement edits. Broker-only CPU commands; no native children, full suites, browser/provider/DB/real scheduler. Native runtime controls and startup assurance are not established by this envelope. Persist scoped verdict only after required evidence. Actual-total reporting includes cached input once and every child/retry; 180 active seconds/180000 total-token allocation, review150/130000 plus reserve30/50000, no hardcap. Full parents remain open. If blocked, checkpoint once and return immediately; no polling.'''
(OUT/'prompt.txt').write_text(prompt+'\n',encoding='utf-8')
selected=[dict(node='src/pages/counsellor/voice.test.ts + src/pages/counsellor/CounsellorPage.test.tsx',reason='38 existing broker cases; adapter completion and actual mounted two-turn conversation/callback retirement',boundary='auth, cancellation, no recognition during readback, API failures')]
selected+=read(BASE/'t037-approved-trust/broker-request.json')['selected_checks']
selected += [dict(node=r['command'],reason=r['coverage'],boundary='direct identity/tenant/auth/publication/replay lineage') for r in read(BASE/'t056-direct-answer/broker-request.json')['commands']]
packet=dict(policy_version='managed-review/1',unit=dict(root=str(ROOT),slug=slug,cycle=0,base_sha='5c4cbade2d1a8aa4815de13d587db8de3b01cc4a',candidate_sha=candidate,files=[bound(ROOT/r['path']) for r in checks]),metrics=metrics,worker=dict(provider='codex',executable='C:/Users/product/AppData/Local/Programs/OpenAI/Codex/bin/codex.exe',runtime_identity=dict(mode='prospective scoped native review; launcher not admitted',native_controls='UNKNOWN; no observed inventory/control claim',startup='historical observation only, no current bound startup assurance'),timeout_s=150,max_turns=8,phase_id='joined-source-cycle0-review',prompt=bound(OUT/'prompt.txt')),readiness=dict(complete=False,mutation_required=False,receipts=[bound(OUT/'environment-and-read-dependencies.json',role='environment')]+[bound(Path(r['path']),role='focused-test') for r in receipts]),selected_checks=selected,previous_receipt=None)
write('managed-review-input.json',packet)
pending=['Final compatible web semantic typecheck exact-candidate receipt','Final compatible meeting-bot semantic typecheck exact-candidate receipt','Final compatible API semantic typecheck exact-candidate receipt','contracts/verify_contracts.py successful receipt; disclose empty registry if applicable','Applicable scoped structure gate receipt','Bind central shared integration and lease/freeze scope, command/runtime/lock/environment hashes and outputs; include separately attributed cost','Fresh packet validate and assess after missing receipts are bound; root releases admission explicitly','Future native checker identity/runtime authorization and telemetry; no managed launcher invocation admitted']
write('admission.json',dict(status='METADATA_PACKAGED_PENDING_MANDATORY_BINDINGS',dispatch_allowed=False,semantic_verdict=None,created_utc=datetime.now(timezone.utc).isoformat(),candidate_sha256=candidate,candidate_kind='dirty-source-content-sha256-not-Git',required_pending=pending,source_pin_mismatches=[r for r in checks if not r['match']],dependency_pin_mismatches=[r for r in dependencies if not r['match']],historical_usage=dict(path=str(history),classification='shared prior control-validation review; preserved not reset or charged to this new unit',actual_total_tokens=133880,prior_limit=51981,actual_active_s=None,breach=True),ratio_status='UNVERIFIED',native_hard_total_token_cap_established=False))
print(json.dumps(dict(candidate=candidate,changed_paths=len(checks),source_mismatches=sum(not r['match'] for r in checks),dependency_mismatches=sum(not r['match'] for r in dependencies),dispatch_allowed=False)))
