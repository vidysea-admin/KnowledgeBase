#!/bin/bash
ROOT=C:/Users/product/Desktop/KnowledgeBase-lanes/w27-standalone
F=$ROOT/packages/db/src/lib/native-publication.ts
cp -p "$F" "$F.chk.bak"
restore(){ [ -f "$F.chk.bak" ] && cp -p "$F.chk.bak" "$F" && rm -f "$F.chk.bak"; }
trap restore EXIT INT TERM ERR
python -I - <<PY
p="$F"
b=open(p,"rb").read()
old=b'if (v.tenantId !== tenantId) throw new Error("native_publication_tenant_mismatch");\n    return { ...v, tenantId };'
old2=old.replace(b"\n",b"\r\n")
assert (old in b) or (old2 in b), "target not found"
b=b.replace(old if old in b else old2,b'return { ...v, tenantId: v.tenantId };',1)
open(p,"wb").write(b)
PY
cd $ROOT/apps/api
for t in src/visibility/zz-checker-probe.test.ts src/visibility/standalone-publication.test.ts; do
  timeout 600 node --test --test-force-exit --import tsx $t > "$1.$(basename $t).out" 2>&1; echo "$t mutant exit=$?"; done
