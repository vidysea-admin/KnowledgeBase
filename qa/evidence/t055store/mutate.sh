#!/usr/bin/env bash
# D-020 + 2026-09-28 amendment: per-mutation byte backup, trap on timeout/INT/ERR, HEAD-fidelity hash check per touched file.
# Usage (from lane root): bash qa/evidence/t055store/mutate.sh
set -u
LANE="$(cd "$(dirname "$0")/../../.." && pwd)"
export PATH="/c/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
TEST="src/page-highlights/page-highlights.test.ts"
run_mutation() { # name file from to
  local name="$1" file="$2" from="$3" to="$4" abs="$LANE/$2" bak
  bak="$(mktemp "$LANE/qa/evidence/t055store/bak.XXXXXX")"
  cp "$abs" "$bak"
  restore() { cp "$bak" "$abs"; }
  trap 'restore; rm -f "$bak"; exit 130' INT TERM
  trap 'restore' ERR
  FROM="$from" TO="$to" ABS="$abs" node -e '
    const fs=require("fs");const t=fs.readFileSync(process.env.ABS,"utf8");const f=process.env.FROM;
    if(t.split(f).length!==2){console.error("MUTATION TARGET NOT UNIQUE");process.exit(3)}
    fs.writeFileSync(process.env.ABS,t.replace(f,()=>process.env.TO));' || { restore; rm -f "$bak"; echo "$name: NOT APPLIED"; return 3; }
  local out rc
  out="$(cd "$LANE/apps/api" && timeout 300 node --test --import tsx "$TEST" 2>&1)"; rc=$?
  restore; cmp -s "$bak" "$abs" || echo "$name: RESTORE CMP FAILED"
  rm -f "$bak"; trap - INT TERM ERR
  local pass fail head cur
  pass="$(echo "$out" | grep -m1 '^ℹ pass' )"; fail="$(echo "$out" | grep -m1 '^ℹ fail')"
  head="$(git -C "$LANE" rev-parse "HEAD:$file")"; cur="$(git -C "$LANE" hash-object "$abs")"
  echo "$name: test_exit=$rc $pass $fail; HEAD-fidelity $([ "$head" = "$cur" ] && echo OK || echo MISMATCH) ($cur)"
  [ "$rc" -ne 0 ] && echo "$name: KILLED" || echo "$name: SURVIVED"
}
R=apps/api/src/page-highlights/router.ts; S=apps/api/src/page-highlights/store.ts
run_mutation "M1-skip-validateHighlight" "$R" 'const verdict = validateHighlight(index, { quote: b.quote, page, start: charStart, end: charEnd });' 'const verdict = { ok: true as const, highlight: { quote: b.quote, page, start: charStart, end: charEnd } };'
run_mutation "M2-skip-tenant-predicate-highlights" "$S" 'scopedCollection<PageHighlightRow>(db, "page_highlights")(t)' '(db.collection("page_highlights") as never)'
run_mutation "M3-skip-tenant-predicate-sources" "$S" 'scopedCollection<SourceRow>(db, "sources")(t)' '(db.collection("sources") as never)'
run_mutation "M4-skip-consent-check" "$S" 'row.consent?.given !== true || WITHDRAWN.has(row.status as string)' 'WITHDRAWN.has(row.status as string)'
echo "final git status of touched files:"; git -C "$LANE" status --short -- apps/api/src/page-highlights
