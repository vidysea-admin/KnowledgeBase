import os, subprocess, shutil, sys, json, time
from concurrent.futures import ThreadPoolExecutor
S = r"C:\Users\Lenovo\AppData\Local\Temp\claude\D--KnowledgeBase\e7be82aa-d0d7-4247-9d84-e121aa4badfc\scratchpad\b"
BASE = S + r"\base"
UA = "apps/api/src/user-accounts/"
SVC, RTR, THR = UA + "auth-service.ts", UA + "auth-router.ts", UA + "throttle.ts"
T_SVC, T_RTR, T_THR = UA + "auth-service.test.ts", UA + "auth-router.test.ts", UA + "throttle.test.ts"
M = [
 ("A4-1", "existing-email signup returns 409", SVC, 'detail: "existing_account", subjectHash: hash }, meta);\n        return generic();', 'detail: "existing_account", subjectHash: hash }, meta);\n        return { status: 409, body: { error: "exists" } };', [T_SVC, T_RTR]),
 ("A4-2", "stale-unverified check removed from verify", SVC, '|| isStaleUnverified(user)) return fail();', ') return fail();', [T_SVC]),
 ("A4-3", "unknown email skips the password verify", SVC, 'const verified = await password.verify(user?.passwordHash ?? null, pw);', 'const verified = user ? await password.verify(user.passwordHash, pw) : false;', [T_SVC]),
 ("A4-4", "lock threshold 6", THR, 'LOCK_THRESHOLD = 5', 'LOCK_THRESHOLD = 6', [T_THR, T_SVC]),
 ("A4-5", "reset no longer revokes sessions", SVC, 'await sessions.revokeAllForUser(tenantId, user._id, "password_reset");', 'void 0;', [T_SVC, T_RTR]),
 ("A4-6", "change password revokes current session too", SVC, '"password_change", auth.sessionId);', '"password_change");', [T_SVC, T_RTR]),
 ("A4-7", "logout-all revokes nothing", SVC, 'await sessions.revokeAllForUser(auth.tenantId, auth.userId!, "logout");', 'void 0;', [T_SVC, T_RTR]),
 ("A4-8", "login route without per-IP limiter", RTR, 'r.post("/login", limit.login, route(', 'r.post("/login", route(', [T_RTR]),
 ("A4-9", "password_reset ok writes no audit event", SVC, 'await emit(tenantId, { type: "password_reset", outcome: "ok", detail: "none", targetUserId: user._id }, meta);', 'void 0;', [T_SVC]),
 ("A4-10", "Authorization header check disabled", RTR, 'if (req.header("authorization") !== undefined) {', 'if (false) {', [T_RTR]),
 ("X-lock-unreg", "never-registered email is not counted toward lockout", SVC, 'if (hash !== null) newlyLocked = (await throttle.fail(tenantId, hash)).newlyLocked;', 'if (hash !== null && user) newlyLocked = (await throttle.fail(tenantId, hash)).newlyLocked;', [T_SVC, T_RTR]),
 ("X-reset-rejected", "rejected/disabled reset allowed", SVC, 'if (!user || user.status === "rejected" || user.status === "disabled") return fail();', 'if (!user) return fail();', [T_SVC]),
]
def run_tests(root, files):
    out = []
    for f in files:
        try:
            p = subprocess.run(["node", "--test", "--import", "tsx", f.replace("apps/api/", "", 1)], cwd=root + r"\apps\api".replace("\\", os.sep), capture_output=True, text=True, timeout=170, encoding="utf8", errors="replace")
            txt = p.stdout + p.stderr
            def n(k):
                for l in txt.splitlines():
                    if l.startswith("ℹ " + k + " "): return int(l.split()[-1])
                return None
            out.append((os.path.basename(f), p.returncode, n("tests"), n("pass"), n("fail"), [l.strip() for l in txt.splitlines() if l.startswith("✖") ][:4]))
        except subprocess.TimeoutExpired:
            out.append((os.path.basename(f), "TIMEOUT", None, None, None, []))
    return out
J = os.path.join
def mkj(link, tgt):
    subprocess.run(["cmd", "/c", "mklink", "/J", link, tgt], capture_output=True)
def make_copy(k):
    d = J(S, "m_" + k)
    if os.path.exists(d): rm(d)
    os.makedirs(J(d, "apps", "api"))
    for e in os.listdir(BASE):
        if e != "apps": mkj(J(d, e), J(BASE, e))
    for e in os.listdir(J(BASE, "apps")):
        if e != "api": mkj(J(d, "apps", e), J(BASE, "apps", e))
    for e in os.listdir(J(BASE, "apps", "api")):
        src_e = J(BASE, "apps", "api", e)
        if e == "src":
            subprocess.run(["robocopy", src_e, J(d, "apps", "api", "src"), "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/NP"], capture_output=True)
        elif os.path.isdir(src_e):
            mkj(J(d, "apps", "api", e), src_e)
        else:
            shutil.copy(src_e, J(d, "apps", "api", e))
    return d
def rm(d):
    for root, dirs, files in os.walk(d, topdown=True):
        for x in list(dirs):
            p = J(root, x)
            if os.path.islink(p) or (os.lstat(p).st_file_attributes & 0x400):
                subprocess.run(["cmd", "/c", "rmdir", p], capture_output=True); dirs.remove(x)
    shutil.rmtree(d, ignore_errors=True)
def one(m):
    k, desc, f, old, new, tests = m
    d = make_copy(k)
    res = {"id": k, "desc": desc, "file": f}
    try:
        green = run_tests(d, tests)
        res["green_before"] = green
        p = d + "\\" + f.replace("/", "\\")
        src = open(p, encoding="utf8", newline="").read()
        if "\r\n" in src: old, new = old.replace("\n", "\r\n"), new.replace("\n", "\r\n")
        if src.count(old) != 1: res["verdict"] = "PATTERN-COUNT-%d" % src.count(old); return res
        open(p, "w", encoding="utf8", newline="").write(src.replace(old, new))
        red = run_tests(d, tests)
        res["red_after"] = red
        allgreen = all(g[1] == 0 and g[4] == 0 for g in green)
        anyred = any(r[1] != 0 and (r[4] or 0) > 0 for r in red)
        res["verdict"] = "KILLED" if (allgreen and anyred) else ("SURVIVED" if allgreen else "COPY-NOT-GREEN")
    finally:
        rm(d)
    return res
if __name__ == "__main__":
    t0 = time.time()
    with ThreadPoolExecutor(4) as ex:
        rs = list(ex.map(one, M))
    json.dump(rs, open(S + "\\mutants.json", "w"), indent=1)
    for r in rs: print(r["id"], r.get("verdict"), "|", r["desc"], "|", [(x[0], x[4]) for x in r.get("red_after", [])], "green:", [(x[0], x[3], x[4]) for x in r.get("green_before", [])])
    print("elapsed", round(time.time() - t0))
