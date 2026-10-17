"""Metadata-only receipt authentication diagnostics; never executes linked commands.

Persist each row before continuing; schema gaps are data, not aborting assertions.
"""
import hashlib,json,re
from pathlib import Path
from datetime import datetime,timezone
OUT=Path(__file__).parent;JOIN=OUT.parent;ROOT=JOIN.parents[3]
SOURCE=JOIN/'current-focused-bindings.json'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def record(p):return dict(path=str(p.resolve()),sha256=sha(p))
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def write(p,d):p.write_text(json.dumps(d,indent=2)+'\n',encoding='utf-8')
expected={'integrated-t037-current13':13,'integrated-t037-current-lastvalid2':2,'integrated-t056-page-current':19,'t013-ui':38,'t056-api-exact-readlease':7,'t056-ui':21}
result=dict(schema='receipt-schema-diagnostic/1',observed_utc=datetime.now(timezone.utc).isoformat(),input=record(SOURCE),method='Raw-byte SHA and explicit per-receipt schema paths; no product command executed; per-row persistence before continuation',rows=[],metadata_only=True,semantic_verdict=None)
target=OUT/'results.json'
write(target,result)
for index,item in enumerate(read(SOURCE)):
 row=dict(row_index=index,label=item.get('label'),diagnostics=[],expected=dict(exit=0,raw_passed=expected.get(item.get('label'))),provenance=dict(binding_path=str(SOURCE),binding_row=index,claimed_scope=item.get('scope','current focused broker execution')))
 try:
  binding=item['receipt'];p=Path(binding['path']);row['raw_receipt']=dict(path=str(p),expected_sha256=binding['sha256'],observed_sha256=sha(p));row['raw_receipt']['match']=row['raw_receipt']['expected_sha256']==row['raw_receipt']['observed_sha256']
  raw=read(p)
  row['top_level_exit_present']='exit' in raw
  if 'execution' in raw and isinstance(raw['execution'],dict) and 'exit' in raw['execution']:
   execution=raw['execution'];prefix='$.execution';exit_value=execution['exit'];exit_path=prefix+'.exit'
  elif 'exit' in raw:
   execution=raw;prefix='$';exit_value=raw['exit'];exit_path='$.exit'
  else:
   execution=raw;prefix='$';exit_value=None;exit_path=None
  row['exit']=dict(schema_path=exit_path,observed=exit_value,expected=0,valid_integer=type(exit_value) is int,matches_expected=type(exit_value) is int and exit_value==0)
  if not row['top_level_exit_present']:row['diagnostics'].append('Top-level $.exit absent; actual successful exit is '+str(exit_path)+'. A top-level-only assertion would reject this valid schema.')
  row['execution_provenance']={k:dict(schema_path=prefix+'.'+k,observed=execution.get(k,raw.get(k))) for k in ['argv','cwd','pid','started_utc','tree_close_completed','active_s']}
  row['environment_provenance']={k:raw.get(k) for k in ['runtime_sha256','lock_sha256','bootstrap_sha256','supervisor_sha256','request_sha256','packet_sha256','pins_unchanged'] if k in raw}
  count_fields=['counts','actual_vitest_summary','vitest_summary','framework_summary','node_counts']
  row['test_count_fields']=[dict(schema_path='$.'+k,observed=raw[k]) for k in count_fields if k in raw]
  logvalue=execution.get('log',raw.get('log'));logsha=execution.get('log_sha256',raw.get('log_sha256'))
  row['output']=dict(path_schema=prefix+'.log',hash_schema=prefix+'.log_sha256',path=logvalue,expected_sha256=logsha)
  text=''
  if logvalue:
   log=Path(logvalue);text=log.read_text(encoding='utf-8',errors='replace');row['output']['observed_sha256']=sha(log);row['output']['hash_matches']=sha(log)==logsha
  else:row['diagnostics'].append('Missing raw complete output path; no successful output assumed')
  matches=re.findall(r'\bTests\s+(\d+)\s+passed',text)
  tap=re.findall(r'^(?:#|ℹ) pass (\d+)\s*$',text,re.MULTILINE)
  passed=int(matches[-1]) if matches else int(tap[-1]) if tap else None
  row['actual_raw_passed']=dict(observed=passed,schema_path='complete output: Vitest Tests N passed' if matches else 'complete output: TAP pass N' if tap else None,expected=row['expected']['raw_passed'],matches_expected=passed==row['expected']['raw_passed'])
  if item['label']=='t056-ui':
   lines=[x for x in text.splitlines() if re.search(r'directAnswer\.test\.ts\s*\(2 tests\)',x)]
   row['reused_subscope']=dict(raw_suite_passed=21,current_reused_scope='directAnswer.test.ts2 only; old page19 superseded',subscope_evidence=lines,subscope_count=2 if lines else None,independent_reuse_adoption='NOT established by this metadata script')
  row['metadata_ok']=bool(row['raw_receipt']['match'] and row['exit']['matches_expected'] and row['output'].get('hash_matches') and row['actual_raw_passed']['matches_expected'])
 except Exception as exc:
  row['metadata_ok']=False;row['diagnostics'].append(type(exc).__name__+': '+str(exc))
 result['rows'].append(row);write(target,result)
result['all_metadata_ok']=all(r['metadata_ok'] for r in result['rows'])
result['first_top_level_exit_assumption_failure']=next((dict(row_index=r['row_index'],label=r['label'],actual_exit_path=r['exit']['schema_path'],actual_exit=r['exit']['observed']) for r in result['rows'] if not r.get('top_level_exit_present',True)),None)
verdict=ROOT/'qa/verdicts/t013-t037-t056-joined-source-slices.md'
result['checker_artifact_bindings']=[record(p) for p in [verdict,*sorted(JOIN.glob('checker-*'))] if p.is_file()]
result['authority_limit']='Canonical checker HOLD remains authoritative; parser/schema repair is not semantic acceptance or permission to resume checker. No reviewer budget allocated here.'
write(target,result)
print(json.dumps(dict(rows=len(result['rows']),all_metadata_ok=result['all_metadata_ok'],metadata_failures=[dict(row_index=r['row_index'],label=r['label'],diagnostics=r['diagnostics']) for r in result['rows'] if not r['metadata_ok']],first_top_level_exit_assumption_failure=result['first_top_level_exit_assumption_failure'])))
