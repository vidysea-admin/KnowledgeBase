// Checker falsification driver: one throwaway copy per mutant (outside the bound root), green-before in the COPY, then one single-hunk edit, red-after.
// The bound tree is never touched. Junctions are unlinked with rmdir (never recursive through them).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = "C:/Users/Lenovo/AppData/Local/Temp/claude/D--KnowledgeBase/e7be82aa-d0d7-4247-9d84-e121aa4badfc/scratchpad/chk-a";
const BASE = `${ROOT}/base`;
const MAIN = "D:/KnowledgeBase";
const UA = "apps/api/src/user-accounts";

const M = [
  { id: "A4-1", file: `${UA}/auth-router.ts`, find: "if (keys.some((k) => !allowed.includes(k))) return { ok: false, fields: [\"body\"] };", repl: "", tests: ["auth-router"], note: "unknown body keys (tenant in body) no longer rejected" },
  { id: "A4-2", file: `${UA}/auth-service.ts`, find: "if (!user || user.status !== \"unverified\" || isStaleUnverified(user)) return fail();", repl: "if (!user || user.status !== \"unverified\") return fail();", tests: ["auth-service"], note: "stale unverified user may still verify" },
  { id: "A4-3", file: `${UA}/auth-service.ts`, find: "if (!user || !verified) return failedLogin(tenantId, hash, user, m);", repl: "if (!user) return failedLogin(tenantId, hash, user, m);", tests: ["auth-service"], note: "wrong password accepted at login" },
  { id: "A4-4", file: `${UA}/auth-service.ts`, find: "if (hash !== null && (await throttle.isLocked(tenantId, hash))) {", repl: "if (false && hash !== null && (await throttle.isLocked(tenantId, hash))) {", tests: ["auth-service"], note: "lock not enforced at login" },
  { id: "A4-5", file: `${UA}/auth-service.ts`, find: "if ((await store.consumeToken(tenantId, tokenHash, \"password_reset\", clock())) !== user._id) return fail();", repl: "", tests: ["auth-service"], note: "reset token not consumed (reusable)" },
  { id: "A4-6", file: `${UA}/auth-service.ts`, find: "await sessions.revokeAllForUser(auth.tenantId, user._id, \"password_change\", auth.sessionId);", repl: "", tests: ["auth-service"], note: "change password revokes no other session" },
  { id: "A4-7", file: `${UA}/auth-service.ts`, find: "return { status: 200, body: { ok: true }, clearCookie: true };\r\n    },\r\n    async logoutAll", repl: "return { status: 200, body: { ok: true } };\r\n    },\r\n    async logoutAll", tests: ["auth-service", "auth-router"], note: "logout does not clear the cookie" },
  { id: "A4-8", file: `${UA}/auth-router.ts`, find: "r.post(\"/verify-email\", limit.token, route(", repl: "r.post(\"/verify-email\", route(", tests: ["auth-router"], note: "verify-email loses its per-IP token limiter" },
  { id: "A4-9", file: `${UA}/auth-service.ts`, find: "await emit(tenantId, { type: \"login_ok\", outcome: \"ok\", detail: \"none\", actorUserId: user._id, targetUserId: user._id }, m);", repl: "", tests: ["auth-service"], note: "login success writes no audit row" },
  { id: "A4-10", file: `${UA}/auth-router.ts`, find: "if (req.header(\"authorization\") !== undefined) {", repl: "if (/^Bearer /.test(req.header(\"authorization\") ?? \"\")) {", tests: ["auth-router"], note: "only an exact-case 'Bearer ' header is refused (Basic/bearer pass)" },
];

const only = process.argv[2] ? new Set(process.argv[2].split(",")) : null;

function rm(p) {
  if (!fs.existsSync(p)) return;
  for (const j of [`${p}/apps/api/node_modules`, `${p}/node_modules`, ...fs.readdirSync(`${p}/packages`).map((d) => `${p}/packages/${d}/node_modules`)]) {
    try { if (fs.lstatSync(j).isSymbolicLink() || fs.lstatSync(j).isDirectory()) fs.rmdirSync(j); } catch { /* absent */ }
  }
  fs.rmSync(p, { recursive: true, force: true });
}
function copy(dst) {
  const r = spawnSync("robocopy", [BASE.replace(/\//g, "\\"), dst.replace(/\//g, "\\"), "/E", "/XJ", "/XD", "node_modules", "/NFL", "/NDL", "/NJH", "/NJS", "/NP"], { encoding: "utf8" });
  if (r.status === null || r.status >= 8) throw new Error("robocopy failed " + r.status + r.stdout);
  fs.symlinkSync(`${MAIN}/apps/api/node_modules`, `${dst}/apps/api/node_modules`, "junction");
  fs.symlinkSync(`${MAIN}/node_modules`, `${dst}/node_modules`, "junction");
  for (const d of fs.readdirSync(`${MAIN}/packages`)) if (fs.existsSync(`${MAIN}/packages/${d}/node_modules`) && fs.existsSync(`${dst}/packages/${d}`)) fs.symlinkSync(`${MAIN}/packages/${d}/node_modules`, `${dst}/packages/${d}/node_modules`, "junction");
}
function run(dst, t) {
  const r = spawnSync("node", ["--test", "--import", "tsx", `src/user-accounts/${t}.test.ts`], { cwd: `${dst}/apps/api`, encoding: "utf8", timeout: 150000 });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  const n = (k) => Number((new RegExp(`^ℹ ${k} (\\d+)`, "m").exec(out) ?? [])[1] ?? NaN);
  const failed = [...out.matchAll(/^\s*✖ (.+?) \(\d/gm)].map((m) => m[1]).filter((x) => !x.startsWith("src\\")).filter((v, i, a) => a.indexOf(v) === i);
  return { tests: n("tests"), pass: n("pass"), fail: n("fail"), failed, exit: r.status };
}

const results = [];
const list = M.filter((m) => !only || only.has(m.id));
const BATCH = 3;
for (let i = 0; i < list.length; i += BATCH) {
  const batch = list.slice(i, i + BATCH);
  const rs = await Promise.all(batch.map(async (m) => {
    const dst = `${ROOT}/mut-${m.id}`;
    const rec = { id: m.id, note: m.note, file: m.file };
    try {
      rm(dst); copy(dst);
      rec.green = m.tests.map((t) => ({ t, ...run(dst, t) }));
      const ok = rec.green.every((g) => g.fail === 0 && g.pass > 0);
      if (!ok) { rec.verdict = "UNVERIFIED (copy not green before edit)"; return rec; }
      const fp = `${dst}/${m.file}`; const src = fs.readFileSync(fp, "utf8");
      const idx = src.indexOf(m.find); if (idx < 0 || src.indexOf(m.find, idx + 1) >= 0) { rec.verdict = "UNVERIFIED (find string not unique)"; return rec; }
      fs.writeFileSync(fp, src.replace(m.find, () => m.repl));
      rec.red = m.tests.map((t) => ({ t, ...run(dst, t) }));
      rec.verdict = rec.red.some((g) => g.fail > 0) ? "KILLED" : "SURVIVED";
      return rec;
    } catch (e) { rec.verdict = "ERROR " + String(e).slice(0, 200); return rec; }
    finally { try { rm(dst); } catch (e) { rec.cleanup = String(e).slice(0, 120); } }
  }));
  results.push(...rs);
  for (const r of rs) console.log(JSON.stringify(r));
}
fs.writeFileSync(`${ROOT}/mutants.json`, JSON.stringify(results, null, 1));
