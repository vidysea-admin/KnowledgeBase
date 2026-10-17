import pathlib,json,sys,os,time
sys.path.insert(0,str(pathlib.Path(__file__).parent))
import broker_lib as b
start=time.monotonic();base=b.OUT/'atomic-types-generation';base.mkdir(exist_ok=False)
schema=sorted((b.ROOT/'schema').glob('*.schema.json'));generated=b.ROOT/'packages/core/src/generated';index=b.ROOT/'packages/core/src/index.ts'
targets=set(generated.rglob('*'));targets={p for p in targets if p.is_file()}|{generated/(p.name.removesuffix('.schema.json')+'.ts') for p in schema}|{index}
assert all(p.resolve().is_relative_to(b.ROOT) for p in targets)
before={};backup=base/'before';backup.mkdir()
for p in sorted(targets):
 rel=p.relative_to(b.ROOT).as_posix();before[rel]=b.sha(p) if p.exists() else None
 if p.exists():q=backup/rel;q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(p.read_bytes());assert b.sha(q)==before[rel]
pins={p.relative_to(b.ROOT).as_posix():b.sha(p) for p in schema}
for rel in ['scripts/gen-types.mjs','package.json','pnpm-lock.yaml','node_modules/json-schema-to-typescript/package.json']:
 pins[rel]=b.sha(b.ROOT/rel)
for directory in ['domain','alerts']:
 for p in (b.ROOT/'packages/core/src'/directory).glob('*.ts'):pins[p.relative_to(b.ROOT).as_posix()]=b.sha(p)
pnpm=pathlib.Path(b.NODE).parent.parent/'node_modules/pnpm/bin/pnpm.mjs';assert pnpm.is_file();pnpmhash=b.sha(pnpm)
assert b.sha(b.ROOT/'schema/sessions.schema.json')=='0591af585e542564c774b1f5154d7d34605752a09638e8fb529424d37a956a72'
assert b.sha(b.ROOT/'schema/speaker_suggestions.schema.json')=='a6a074dd628d193169209ce7356d6348e5c5bbcf86f09c9c6283efd2da0a4ad7'
admission={'potentialOutputs':before,'inputPins':pins,'pnpm':str(pnpm),'pnpmSha256':pnpmhash,'activeWriterAuthority':'root grants generated outputs exclusively; central production/sync/tile wiring disjoint','command':[b.NODE,str(pnpm),'run','gen:types'],'backupByteVerified':True}
(base/'admission.json').write_text(json.dumps(admission,indent=2),encoding='utf8')
os.environ['PATH']=str(pathlib.Path(b.NODE).parent)+os.pathsep+os.environ.get('PATH','')
rec=b.run('atomic-types-generation',admission['command'],b.ROOT,25,pins)
after={p.relative_to(b.ROOT).as_posix():b.sha(p) if p.exists() else None for p in targets}
for p in generated.rglob('*'):
 if p.is_file():after[p.relative_to(b.ROOT).as_posix()]=b.sha(p)
delta=[p for p in sorted(set(before)|set(after)) if before.get(p)!=after.get(p)]
expected=['packages/core/src/generated/sessions.ts','packages/core/src/generated/speaker_suggestions.ts']
afterdir=base/'after';afterdir.mkdir()
for rel in delta:
 p=b.ROOT/rel
 if p.exists():q=afterdir/rel;q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(p.read_bytes())
summary={'ownExit':rec.get('exit'),'timeout':rec.get('timeout',False),'outputBefore':before,'outputAfter':after,'changed':delta,'unexpectedDelta':[p for p in delta if p not in expected],'indexUnchanged':before[index.relative_to(b.ROOT).as_posix()]==after[index.relative_to(b.ROOT).as_posix()],'inputPinsUnchanged':rec['pins_unchanged'],'elapsedSeconds':time.monotonic()-start,'noRestorationPerformed':True,'semanticPASS':False}
(base/'final-seal.json').write_text(json.dumps(summary,indent=2),encoding='utf8');print(json.dumps({k:v for k,v in summary.items() if k not in ['outputBefore','outputAfter']}))
