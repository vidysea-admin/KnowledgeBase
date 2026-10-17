import pathlib,json,re,hashlib
out=pathlib.Path(__file__).parent
original=out/'cycle2-tree-summary.json';r=json.loads(original.read_text());rows=[]
for j in r['results']:
 p=pathlib.Path(j['log']);raw=p.read_bytes();text=raw.decode('utf-8',errors='replace');counts={k:int(v) for k,v in re.findall(r'(?:#|ℹ) (tests|pass|fail|cancelled|skipped|todo) (\d+)',text)}
 rows.append({'label':j['label'],'exit':j['exit'],'pid':j.get('pid'),'counts':counts,'duration_s':j['duration_s'],'log':str(p),'log_sha256':hashlib.sha256(raw).hexdigest(),'pins_unchanged':j['pins_unchanged'],'rows_restored':j.get('rows_restored'),'writer_intersection':j['writer_intersection'],'tree_close_completed':j.get('tree_close_completed')})
receipt={'supplements':str(original),'original_receipt_sha256':hashlib.sha256(original.read_bytes()).hexdigest(),'reason':'Decode Node log UTF8 explicitly; original Windows locale parser left empty counts. No tests rerun.','active_s':r['active_s'],'results':rows,'actual_total_tokens':None,'independent_verdict':None}
(out/'cycle2-counts-supplement.json').write_text(json.dumps(receipt,indent=2));print(json.dumps(receipt,indent=2))
