#!/usr/bin/env python3
"""Checker B mutation harness for wa-owner-resolver. Runs in the throwaway copy only.
Per-mutation byte backup, timeout, restore in finally (fires on timeout/interrupt/error), cmp + HEAD-blob fidelity check after each."""
import subprocess, shutil, sys, os, hashlib, json

COPY = r"C:\Users\Lenovo\AppData\Local\Temp\claude\D--KnowledgeBase\e7be82aa-d0d7-4247-9d84-e121aa4badfc\scratchpad\w4b"
BOUND = r"D:\KnowledgeBase\.worktrees\wa-owner-resolver"
TESTS = ["apps/api/src/whatsapp/owner-config.test.ts", "apps/api/src/whatsapp/store-isolation.test.ts", "apps/api/src/whatsapp/route-tenant.test.ts"]
OC = "apps/api/src/whatsapp/owner-config.ts"
ST = "apps/api/src/whatsapp/store.ts"

MUTS = [
  ("W4-1", OC, "(caller?.kind === \"session\" ? mine : link.userId === null)", "(caller?.kind === \"session\" ? (mine || link.userId === null) : link.userId === null)"),
  ("W4-2", ST, "if (wanted !== undefined && (typeof wanted !== \"string\" || grant.linkId !== wanted)) continue;", "if (false) continue;"),
  ("W4-3", OC, "const entries = parseWhatsAppOwnerMap(options.rawMap);", "const entries = (() => { try { return parseWhatsAppOwnerMap(options.rawMap); } catch { return []; } })();"),
  ("W4-4", OC, "if (grants.size === 0) throw new WhatsAppNotConfiguredError();", "if (grants.size === 0) throw new WhatsAppUnavailableError();"),
  ("W4-5", ST, "await options.resolveOwners(tenantId, scope?.caller)", "await options.resolveOwners(tenantId)"),
]
if len(sys.argv) > 1:
    only = set(sys.argv[1:]); MUTS = [m for m in MUTS if m[0] in only]

def run(cmd, timeout):
    try:
        p = subprocess.run(cmd, cwd=COPY, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout, shell=True)
        return p.returncode, p.stdout + p.stderr
    except subprocess.TimeoutExpired as e:
        return 124, "TIMEOUT"

def head_blob(rel):
    return subprocess.run(["git", "-C", BOUND, "rev-parse", f"HEAD:{rel}"], capture_output=True, text=True).stdout.strip()
def hobj(rel):
    return subprocess.run(["git", "hash-object", os.path.join(COPY, rel)], capture_output=True, text=True).stdout.strip()

cmd = "node --test --test-reporter=tap --import tsx " + " ".join(TESTS)
results = []
for cid, rel, old, new in MUTS:
    path = os.path.join(COPY, rel); bak = path + ".bak"
    shutil.copyfile(path, bak)                      # byte backup PER MUTATION
    try:
        src = open(path, encoding="utf-8", newline="").read()
        assert src.count(old) == 1, f"{cid}: anchor count {src.count(old)}"
        open(path, "w", encoding="utf-8", newline="").write(src.replace(old, new))
        rc, out = run(cmd, 150)
        fails = [l.strip() for l in out.splitlines() if l.strip().startswith("not ok") and "- " in l and not l.strip().startswith("not ok 1 - /")]
        import re as _re
        summ = {k: (_re.search(r"^# %s (\d+)" % k, out, _re.M) or [None, "?"])[1] for k in ("tests", "pass", "fail")}
        results.append((cid, rel, rc, summ, fails[:6]))
    finally:
        shutil.copyfile(bak, path); os.remove(bak)  # restore on every exit path
        same_head = hobj(rel) == head_blob(rel)
        print(f"{cid} restored; hash==HEAD blob: {same_head}", flush=True)
for r in results:
    print(json.dumps({"id": r[0], "file": r[1], "rc": r[2], "summary": r[3], "failing": r[4]}, ensure_ascii=False, indent=1))
