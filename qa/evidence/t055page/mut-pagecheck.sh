#!/bin/bash
# Per-mutation backup + trap (D-020). Mutation: skip the page-membership check.
export PATH="/c/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
L=C:/Users/product/Desktop/KnowledgeBase-lanes/w17-t055page
F=$L/packages/index/src/pipeline/page-evidence/highlight-validator.ts
B=$L/qa/evidence/t055page/.mut-backup.ts
cp "$F" "$B"
restore() { cp "$B" "$F"; cmp "$B" "$F" && echo "restored"; }
trap restore EXIT INT TERM ERR
sed -i 's/if (h.page > index.pageCount) return { ok: false, reason: "page-out-of-range" };//; s/const seg = index.segments.find(s => s.page === h.page);/const seg = index.segments.find(s => s.text.includes(h.quote as string)) ?? index.segments[0]!;/' "$F"
git -C $L diff --stat -- "$F" | tail -1
cd $L/packages/index && timeout 600 node --test --import tsx src/pipeline/page-evidence/highlight-validator.test.ts 2>&1 | grep -E "^(✔|✖)|ℹ (pass|fail)"
