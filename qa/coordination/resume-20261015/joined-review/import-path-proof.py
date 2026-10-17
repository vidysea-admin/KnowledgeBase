"""Static text-only provenance: exact shortest relative-import path, no source execution."""
import re,json,hashlib
from pathlib import Path
from collections import deque
ROOT=Path('C:/Users/product/Desktop/KnowledgeBase')
OUT=Path(__file__).parent
seed='packages/meeting-bot/src/calendar/join-rules/join-rules-approved-trust-tick.test.ts'
target='packages/meeting-bot/src/capture/native/native-archive-spool.ts'
todo=deque([(seed,[]) ]); seen=set(); chain=None
pat=re.compile(r'(?:import|export)\s+(?!type\b)(?:[^;\n]*?from\s*)?[\"\'](\.[^\"\']+)[\"\']|import\s*\(\s*[\"\'](\.[^\"\']+)[\"\']')
while todo:
 rel,path=todo.popleft()
 if rel in seen: continue
 seen.add(rel)
 if rel==target: chain=path;break
 f=ROOT/rel
 if f.suffix not in ['.ts','.tsx','.mts','.js','.mjs','.cjs']:continue
 text=f.read_text(encoding='utf-8',errors='replace')
 for m in pat.finditer(text):
  q=(f.parent/(m.group(1) or m.group(2))).resolve()
  dest=next((v for v in [q,q.with_suffix('.ts'),q.with_suffix('.tsx'),q.with_suffix('.mts')] if v.is_file() and v.is_relative_to(ROOT)),None)
  if dest:
   destrel=dest.relative_to(ROOT).as_posix()
   edge=dict(source=rel,source_sha256=hashlib.sha256(f.read_bytes()).hexdigest(),line=text.count('\n',0,m.start())+1,import_text=m.group(0),target=destrel)
   todo.append((destrel,path+[edge]))
result=dict(method='Static relative-import edges matching broker closure grammar, excluding top-level import type; mixed/type-elision and conditional execution require separate judgment',seed=seed,target=target,reachable=chain is not None,chain=chain)
(OUT/'archive-import-path-proof.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
