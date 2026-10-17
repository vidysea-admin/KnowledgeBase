import pathlib
p=pathlib.Path(__file__).with_name('offline-controls-run.py');code=p.read_text(encoding='utf8')
code=code.replace("d='qa/coordination/resume-20261015/eval-pilot/offline-controls/'","d='qa/coordination/resume-20261015/eval-pilot/offline-controls-20261016-stage2/'")
code=code.replace("offline-controls-admission.json","offline-controls-stage2-admission.json").replace("offline-controls-full92","offline-controls-stage2-full92").replace("offline-controls-final-seal.json","offline-controls-stage2-final-seal.json")
code=code.replace("sum(len((b.ROOT/p).read_text().splitlines()) for p in ledgers)","sum(sum(json.loads(row).get('event')=='reserved' for row in (b.ROOT/p).read_text().splitlines() if row.strip()) for p in ledgers)")
code=code.replace("'arms':r['arms'] if result.exists() else None","'hits':{k:{'hits':v['hits'],'total':v['total'],'misses':len(v['misses'])} for k,v in r['arms'].items() if v} if result.exists() else None")
exec(compile(code,str(p),'exec'))
