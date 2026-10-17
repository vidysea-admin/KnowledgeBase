import hashlib,json,re,subprocess
from pathlib import Path
root=Path.cwd(); out=root/'qa/coordination/resume-20261015/t036-current-dependencies'
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
packages={}
for p in (root/'packages').glob('*/package.json'):
 d=json.loads(p.read_text()); packages[d['name']]=(p.parent,d)
entries=['packages/meeting-bot/src/calendar/auto-join.test.ts','qa/evidence/t036-provenance-refresh-independent-20261015.mjs']
todo=[root/p for p in entries]; seen=set(); edges=[]; unresolved=[]; external={}; pins={}
def pin(p):
 if p.is_file(): pins[p.relative_to(root).as_posix() if p.is_relative_to(root) else str(p)]=digest(p)
def resolve(p):
 options=[p]
 if p.suffix in ('.js','.mjs','.cjs'): options=[p.with_suffix('.ts'),p.with_suffix('.tsx'),p]
 if not p.suffix: options += [p.with_suffix('.ts'),p/'index.ts',p.with_suffix('.js')]
 return next((q for q in options if q.is_file()),None)
pattern=re.compile(r'\b(?:import|export)\s+(?!type\b)(?:[^;]*?\sfrom\s*)?[\"\']([^\"\']+)[\"\']|\b(?:import|require)\s*\(\s*[\"\']([^\"\']+)[\"\']\s*\)',re.M)
while todo:
 p=todo.pop().resolve()
 if p in seen: continue
 seen.add(p); pin(p)
 for parent in [p.parent,*p.parents]:
  if not parent.is_relative_to(root): break
  for name in ['package.json','tsconfig.json','tsconfig.base.json']: pin(parent/name)
 text=p.read_text(encoding='utf-8-sig')
 text=re.sub(r'/\*.*?\*/|^\s*//[^\n]*','',text,flags=re.S|re.M)
 for m in pattern.finditer(text):
  spec=m.group(1) or m.group(2)
  if spec.startswith('node:'): continue
  q=None
  if spec.startswith('.'):
   q=resolve(p.parent/spec)
  elif spec.startswith('@lkb/'):
   bits=spec.split('/'); name='/'.join(bits[:2]); item=packages.get(name)
   if item:
    folder,manifest=item; pin(folder/'package.json')
    q=resolve(folder/('/'.join(bits[2:]) if len(bits)>2 else manifest.get('main','src/index.ts')))
  else:
   bits=spec.split('/'); name='/'.join(bits[:2]) if spec.startswith('@') else bits[0]
   current=p.parent
   while current.is_relative_to(root):
    package=current/'node_modules'/name/'package.json'
    if package.is_file():
     data=json.loads(package.read_text()); pin(package)
     target=resolve(package.parent/data.get('main','index.js'))
     if target: pin(target)
     external[name]={'manifest':str(package.relative_to(root)),'version':data.get('version'),'main':str(target) if target else None};break
    current=current.parent
   else: unresolved.append({'from':str(p.relative_to(root)),'specifier':spec,'kind':'external manifest unresolved'})
   continue
  if q:
   edges.append({'from':str(p.relative_to(root)),'specifier':spec,'to':str(q.resolve().relative_to(root))});todo.append(q)
  else: unresolved.append({'from':str(p.relative_to(root)),'specifier':spec,'kind':'workspace unresolved'})
old=json.loads((root/'qa/goal-vectorless-2026-10-15/verification-t036-20261015T0721.json').read_text())
for p in old['after']: pin(root/p)
for p in ['tsconfig.base.json','pnpm-workspace.yaml','node_modules/.modules.yaml','node_modules/.pnpm/lock.yaml','packages/meeting-bot/src/calendar/schedule-tick.ts','packages/meeting-bot/src/calendar/join-rules/join-rules-approved-trust.ts','packages/meeting-bot/src/calendar/join-rules/join-rules-approved-trust-tick.test.ts']: pin(root/p)
for folder in ['node_modules/tsx/dist','node_modules/esbuild/lib','node_modules/@esbuild/win32-x64']:
 for p in (root/folder).rglob('*'):
  if p.is_file(): pin(p)
for p in ['node_modules/tsx/package.json','node_modules/esbuild/package.json']: pin(root/p)
program=Path(old['program']); pin(program)
closure={'method':'Conservative lexical static runtime import/re-export plus literal dynamic import/require traversal; pure import type excluded. Workspace edges traversed recursively; external manifest/main and installed lock pinned. External package transitive file trees are not claimed fully traversed.','workspaceFiles':len(seen),'edges':edges,'externalPackages':external,'unresolved':unresolved}
(out/'import-closure.json').write_text(json.dumps(closure,indent=2)+'\n')
pin(out/'import-closure.json')
request={'program':str(program).replace('\\','/'),'args':['--test','--test-concurrency=1','--test-timeout=30000','--test-name-pattern=^(T036 |actual factory refresh reconstructed model retains rejected decision and zero counts$|healthy approved control remains eligible through actual loader and selector$|new refusal evidence on approved legacy link remains blocking after reconstructed factory refresh$)','--import','tsx',*entries],'cwd':str(root),'timeoutMs':120000,'env':{'KB_U24_PRIVATE_TOC_TESTS':'0','KB_U24_PRIVATE_TOC_TESTS_ALLOW_GENUINE_NATIVE':'0'},'environment':{'KB_U24_PRIVATE_TOC_TESTS':'0','KB_U24_PRIVATE_TOC_TESTS_ALLOW_GENUINE_NATIVE':'0'},'expectedTests':7,'expectedSelectedPass':7,'allowPatternSkipped':True,'output':str(out.relative_to(root)/'broker-seven-current'),'candidateSha':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'pins':dict(sorted(pins.items())),'constraints':['sole root CPU broker only','No external network/provider/DB/browser/private corpus calls; selected tests use public in-memory storage and mocked fetch','Do not opt into private tests; no inherited NODE_OPTIONS preload permitted','Abort on any source/runtime/config pin drift; capture before/after pins and own full argv/env names/exit/counts/output/timestamps','Three approval consumer cases excluded from seven; matching current-byte receipts or separate narrow check remain pending','Canonical cycle1 packet reconciliation, independent checker admission/accounting and full parent gates remain pending'],'historicalReceipt':'qa/goal-vectorless-2026-10-15/verification-t036-20261015T0721.json','runtimeVersion':{'nodeExecutableSha256':digest(program),'nodeVersion':subprocess.check_output([str(program),'--version'],text=True).strip()},'actualUsage':None}
(out/'broker-request.json').write_text(json.dumps(request,indent=2)+'\n')
print(json.dumps({'requestSha256':digest(out/'broker-request.json'),'candidateSha':request['candidateSha'],'pinCount':len(pins),'workspaceFiles':len(seen),'unresolved':unresolved}))
