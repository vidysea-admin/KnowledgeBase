#!/bin/bash
# args: relfile  python-old  python-new  testfile  outprefix ; ABSOLUTE paths in trap
ROOT=C:/Users/product/Desktop/KnowledgeBase-lanes/w27-standalone
F=$ROOT/$1
cp -p "$F" "$F.chk.bak"
restore(){ [ -f "$F.chk.bak" ] && cp -p "$F.chk.bak" "$F" && rm -f "$F.chk.bak"; }
trap restore EXIT INT TERM ERR
OLD="$2" NEW="$3" TARGET="$F" python -I -c '
import os
p=os.environ["TARGET"];b=open(p,"rb").read();o=os.environ["OLD"].encode();n=os.environ["NEW"].encode()
if o not in b: o=o.replace(b"\n",b"\r\n"); n=n.replace(b"\n",b"\r\n")
assert o in b,"target not found"
open(p,"wb").write(b.replace(o,n,1))'
cd $ROOT/apps/api
timeout 600 node --test --test-force-exit --import tsx $4 > "$5" 2>&1; echo "mutant exit=$?"
