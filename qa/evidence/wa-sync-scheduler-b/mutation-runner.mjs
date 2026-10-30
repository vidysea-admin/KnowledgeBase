// checker falsification runner: scratch copy only. Per-mutation byte backup, restore in finally, HEAD-fidelity check after EACH mutation.
import fs from "node:fs"; import { spawnSync } from "node:child_process";
const TREE = process.argv[2], HEADBLOB = process.argv[3], F = `${TREE}/scripts/whatsapp/sync-links.mjs`;
const blob = () => spawnSync("git", ["hash-object", F], { encoding: "utf8" }).stdout.trim();
const T = "scripts/whatsapp/sync-links.test.mjs", TM = "scripts/whatsapp/sync-links.mongo.test.mjs";
const run = (pat, files = [T]) => { const r = spawnSync("node", ["--test", "--test-timeout=15000", "--import", "tsx", ...(pat ? ["--test-name-pattern=" + pat] : []), ...files], { cwd: TREE, encoding: "utf8", timeout: 120000, env: { ...process.env, W9_TEST_MONGO_URL: "mongodb://127.0.0.1:27199/?replicaSet=w9bchk" } });
  const o = r.stdout + r.stderr; const g = (k) => +(o.match(new RegExp("\\b" + k + " (\\d+)")) ?? [0, "?"])[1]; return { pass: g("pass"), fail: g("fail"), cancelled: g("cancelled"), reds: [...o.matchAll(/^✖ (.*?) \(/gm)].map((m) => m[1].slice(0, 70)) }; };
const M = [
 ["W9-1a clamp removed", "W9-1 cadence", `Math.min(MAX_INTERVAL_MIN, Math.max(MIN_INTERVAL_MIN, Math.trunc(n)))`, `Math.trunc(n)`],
 ["W9-1b active re-check dropped", "W9-1 only active links", `if (!link || link.state !== "active" || link.archiverOwnerId !== ownerUserId) return`, `if (!link) return`],
 ["W9-2 held lock ignored", "W9-2 two instances", `catch { row.status = "skipped"; return persist(); }`, `catch { token = "x"; }`],
 ["W9-3 per-link catch rethrows", "W9-3 a store failure", "deps.log(`link ${grant.linkId}: run not recorded (${classifyError(e)})`);", "throw e;"],
 ["W9-3b classifyError returns message text", "W9-3 classifyError", `  return "unknown";\r\n}\r\nconst capError`, `  return String(error?.message ?? "unknown");\r\n}\r\nconst capError`],
 ["W9-4 count all turns", "W9-4", `newTurns: diff(after.turns, before.turns)`, `newTurns: after.turns.size`],
 ["W9-5 cap not counted as partial (hitCap dropped on timeout/size)", "W9-5", `if (isCap(e)) { hitCap = true; if`, `if (isCap(e)) { if`],
 ["W9-6 needs-relink never raised", "W9-6 status poll", `flag("needs-relink", loggedOut)`, `flag("needs-relink", false)`],
 ["W9-7 confirmUnlink skipped", "W9-7 pending", `await deps.confirmUnlink(tenantId, linkId); `, ``],
 ["W9-8 seed removed", "ISS-WAOWNER-001", `for (const { tenantId } of entries) await resolver(tenantId, ADMIN_KEY).catch(() => {});`, ``],
 ["M1c owner filter in listGroups removed (builder: equivalent)", "wired deps", `.filter((g) => g.ownerUserId === grant.ownerUserId)`, ``],
 ["MO1 env-map tenant union removed (builder: redundant)", "ISS-WAOWNER-001", `[...new Set([...entries.map((e) => e.tenantId), ...await`, `[...new Set([...await`],
];
const only = process.argv[4];
const base = fs.readFileSync(F); // per-run pristine bytes; every mutation restores from THIS
if (blob() !== HEADBLOB) { console.log("TREE NOT AT HEAD BLOB"); process.exit(2); }
for (const [name, pat, find, rep] of M) {
  if (only && !name.startsWith(only)) continue;
  const pre = run(pat, name.startsWith("W9-4") || name.startsWith("W9-8") || name.startsWith("MO1") ? [T, TM] : [T]);
  const src = base.toString("utf8"); const idx = src.indexOf(find);
  if (idx < 0 || src.indexOf(find, idx + 1) >= 0) { console.log(`${name}: PATTERN ${idx < 0 ? "NOT FOUND" : "NOT UNIQUE"}`); continue; }
  let post;
  try { fs.writeFileSync(F, src.replace(find, () => rep)); post = run(pat, name.startsWith("W9-4") || name.startsWith("W9-8") || name.startsWith("MO1") ? [T, TM] : [T]); }
  finally { fs.writeFileSync(F, base); }
  console.log(`${name}: green-before pass=${pre.pass} fail=${pre.fail} | after-mutation pass=${post.pass} fail=${post.fail} cancelled=${post.cancelled} reds=${JSON.stringify(post.reds)} | restore=${blob() === HEADBLOB ? "HEAD-OK" : "MISMATCH"}`);
}
