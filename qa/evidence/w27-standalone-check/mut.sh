#!/bin/bash
# per-mutation backup + trap (EXIT/INT/TERM/ERR) scoped to this single mutation
F=packages/db/src/lib/native-publication.ts
cp -p "$F" "$F.chk.bak"
restore(){ [ -f "$F.chk.bak" ] && cp -p "$F.chk.bak" "$F" && rm -f "$F.chk.bak"; }
trap restore EXIT INT TERM ERR
python -I - <<'PY'
p="packages/db/src/lib/native-publication.ts"
b=open(p,"rb").read()
old=b'if (v.tenantId !== tenantId) throw new Error("native_publication_tenant_mismatch");\n    return { ...v, tenantId };'
old2=old.replace(b"\n",b"\r\n")
assert (old in b) or (old2 in b), "target not found"
new=b'return { ...v, tenantId: v.tenantId };'
b=b.replace(old if old in b else old2,new,1)
open(p,"wb").write(b)
PY
cd apps/api
timeout 600 node --test --test-force-exit --import tsx src/visibility/standalone-publication.test.ts > "$1" 2>&1
echo "mutant run exit=$?"
