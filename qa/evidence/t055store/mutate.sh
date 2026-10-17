#!/usr/bin/env bash
# D-020 + 2026-09-28 amendment: per-mutation backup, trap on timeout/INT/ERR, HEAD-fidelity check per touched file.
# Run after the candidate commit so HEAD holds the unmutated bytes. From lane root: bash qa/evidence/t055store/mutate.sh
set -u
LANE="$(cd "$(dirname "$0")/../../.." && pwd)"
export PATH="/c/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
run_mutation() { # name file from to
  local name="$1" file="$2" from="$3" to="$4" abs="$LANE/$2" bak
  bak="$(mktemp "$LANE/qa/evidence/t055store/bak.XXXXXX")"; cp "$abs" "$bak"
  restore() { cp "$bak" "$abs"; }
  trap 'restore; rm -f "$bak"; exit 130' INT TERM; trap 'restore' ERR
  FROM="$from" TO="$to" ABS="$abs" node -e '
    const fs=require("fs");const t=fs.readFileSync(process.env.ABS,"utf8");const f=process.env.FROM;
    if(t.split(f).length!==2){console.error("MUTATION TARGET NOT UNIQUE");process.exit(3)}
    fs.writeFileSync(process.env.ABS,t.replace(f,()=>process.env.TO));' || { restore; rm -f "$bak"; echo "$name: NOT APPLIED"; return 3; }
  local out rc
  out="$(cd "$LANE/apps/api" && timeout 300 node --test --import tsx src/knowledge/collections.test.ts 2>&1)"; rc=$?
  restore; cmp -s "$bak" "$abs" || echo "$name: RESTORE CMP FAILED"
  rm -f "$bak"; trap - INT TERM ERR
  local head cur; head="$(git -C "$LANE" rev-parse "HEAD:$file")"; cur="$(git -C "$LANE" hash-object "$abs")"
  echo "$name: test_exit=$rc $(echo "$out" | grep -m1 '^ℹ pass') $(echo "$out" | grep -m1 '^ℹ fail'); HEAD-fidelity $([ "$head" = "$cur" ] && echo OK || echo MISMATCH)"
  [ "$rc" -ne 0 ] && echo "$name: KILLED" || echo "$name: SURVIVED"
}
R=apps/api/src/knowledge/collections-router.ts; S=apps/api/src/knowledge/collections-store.ts
run_mutation "M1-skip-validateHighlight" "$R" 'if (!verdict.ok) return send(res, 422, { error: "evidence_unavailable", reason: verdict.reason });' ''
run_mutation "M2-skip-tenant-predicate-docs" "$S" 'scopedCollection<DocumentRow>(db, "document_documents")(t)' '(db.collection("document_documents") as never)'
run_mutation "M3-skip-tenant-own-check" "$S" 'const own = <T extends { tenantId: string }>(tenantId: string, row: T | null): T | null => row?.tenantId === tenantId ? row : null;' 'const own = <T extends { tenantId: string }>(tenantId: string, row: T | null): T | null => row;'
run_mutation "M4-skip-consent-check-post" "$R" 'if (await deps.store.sourceWithdrawn(t, row.sourceId)) return send(res, 403, { error: "source_consent_withdrawn" });' ''
echo "git status of touched files:"; git -C "$LANE" status --short -- apps/api/src/knowledge
