#!/usr/bin/env bash
# D-020 + 2026-09-28 amendment: per-mutation byte backup, trap on EXIT/INT/TERM/ERR scoped to the one mutation, timeout, cmp, HEAD-fidelity at the end.
set -u
L=/c/Users/product/Desktop/KnowledgeBase-lanes/w17-wire006
export PATH="/c/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
cd "$L/apps/api"
cp "$L/.mutation/permissive.ts" src/visibility/__mutant_permissive.ts
touched=()
run_mutation() { # name file testfile
  local name="$1" file="$2" test="$3" bak="$L/.mutation/$1.bak"
  cp "$file" "$bak"
  (
    trap 'cp "$bak" "$file"' EXIT INT TERM ERR
    sed -E -i "s#import \{ createKnowledgeVisibility \} from ([\"'])(.*)visibility/knowledge\.js\1;#import { createPermissiveVisibility as createKnowledgeVisibility } from \1\2visibility/__mutant_permissive.js\1;#" "$file"
    sed -E -i "s#import \{ createKnowledgeVisibility, type VisibilityClaim \}#XX#" "$file"
    if cmp -s "$file" "$bak"; then echo "MUTANT-NOT-APPLIED $name"; exit 3; fi
    timeout 600 node --test --import tsx $test > "$L/.mutation/$name.log" 2>&1
    echo "exit=$? $name"
  )
  cp "$bak" "$file"; cmp "$file" "$bak" && echo "restored $name"
  touched+=("$file")
  grep -E "^ℹ (pass|fail)" "$L/.mutation/$name.log" | tr '\n' ' '; echo
  grep -E "^✖" "$L/.mutation/$name.log" | sort -u | head -12
}
run_mutation M10-srcctx src/ask/source-context.ts src/ask/source-context-quarantine.test.ts
rm -f src/visibility/__mutant_permissive.ts
for f in "${touched[@]}"; do
  a=$(git -C "$L" hash-object "apps/api/$f"); b=$(git -C "$L" rev-parse "HEAD:apps/api/$f")
  [ "$a" = "$b" ] && echo "HEAD-OK $f" || echo "HEAD-MISMATCH $f"
done
