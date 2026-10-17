"""Persist pure admission/helper results; no reviewer/provider/test execution."""
import hashlib,json,subprocess,sys
from pathlib import Path
p=Path(__file__).parent
s=Path('C:/Users/product/.agents/skills/checker/scripts/review_budget.py')
rows=[]
for name,src in [('validate',p/'managed-review-input.json'),('assess',p/'metrics.json')]:
 argv=[sys.executable,str(s),name,'--input',str(src.resolve())]
 r=subprocess.run(argv,capture_output=True,timeout=15)
 stdout=p/(name+'-stdout.log'); stderr=p/(name+'-stderr.log')
 stdout.write_bytes(r.stdout); stderr.write_bytes(r.stderr)
 rows.append(dict(phase=name,argv=argv,own_exit=r.returncode,input_sha256=hashlib.sha256(src.read_bytes()).hexdigest(),stdout=str(stdout.resolve()),stderr=str(stderr.resolve())))
 print(name,r.returncode,r.stdout.decode(errors='replace'),r.stderr.decode(errors='replace'))
(p/'helper-results.json').write_text(json.dumps(rows,indent=2)+'\n',encoding='utf-8')
