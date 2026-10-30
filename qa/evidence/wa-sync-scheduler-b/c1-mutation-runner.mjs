// checker B cycle-1 falsification runner: scratch copy only. Per-mutation in-memory byte backup, restore in finally, HEAD-fidelity (git hash-object vs HEAD blob) after EACH mutation.
import fs from "node:fs"; import { spawnSync } from "node:child_process";
const TREE = process.argv[2], HEADBLOB = process.argv[3], F = `${TREE}/scripts/whatsapp/sync-links.mjs`;
const blob = () => spawnSync("git", ["hash-object", F], { encoding: "utf8" }).stdout.trim();
const T = "scripts/whatsapp/sync-links.test.mjs", TM = "scripts/whatsapp/sync-links.mongo.test.mjs";
const run = (pat, files = [T]) => { const r = spawnSync("node", ["--test", "--test-timeout=20000", "--import", "tsx", ...(pat ? ["--test-name-pattern=" + pat] : []), ...files], { cwd: TREE, encoding: "utf8", timeout: 150000, env: { ...process.env, W9_TEST_MONGO_URL: "mongodb://127.0.0.1:28817/?replicaSet=w9bB" } });
  const o = r.stdout + r.stderr; const g = (k) => +(o.match(new RegExp("ℹ " + k + " (\\d+)")) ?? [0, "?"])[1]; return { pass: g("pass"), fail: g("fail"), cancelled: g("cancelled"), reds: [...new Set([...o.matchAll(/^✖ (.*?) \(/gm)].map((m) => m[1].slice(0, 70)))] }; };
const M = [
 ["W9-7 owing-tenant union removed", "W9-7 wired", `...active, ...owing]`, `...active]`],
 ["W9-8a env-map tenant union removed", "W9-8 wired", `[...new Set([...entries.map((e) => e.tenantId), ...active, ...owing])]`, `[...new Set([...active, ...owing])]`],
 ["W9-8b seed failure no longer logged", "W9-8 wired", `if (classifyError(e) !== "not_configured") log(\`tenant \${tenantId}: legacy seed failed (\${classifyError(e)})\`);`, ``],
 ["W9-8c seed removed entirely", "ISS-WAOWNER-001", `for (const { tenantId } of entries) await resolver(tenantId, ADMIN_KEY).catch((e) => { if (classifyError(e) !== "not_configured") log(\`tenant \${tenantId}: legacy seed failed (\${classifyError(e)})\`); });`, ``],
 ["W9-2 any acquire error => skipped", "W9-2 a held lock", `if (e?.code === "locked") {`, `if (true) {`],
 ["W9-3a removed flags never pulled", "health flags are written", `if (flagsRemove.length) await`, `if (false) await`],
 ["W9-3b flags never added", "health flags are written", `$each: flagsAdd }`, `$each: [] }`],
 ["W9-3c whole-array $set again", "health flags are written", `$addToSet: { "health.flags": { $each: flagsAdd } } });`, `}); await links.updateOne({ _id: linkId }, { $set: { "health.flags": flagsAdd } });`],
 ["W9-1 mid-run active recheck removed", "W9-1 a link suspended", `if (fresh?.state !== "active") { aborted = true; break; }`, `if (false) { aborted = true; break; }`],
];
const only = process.argv[4];
const base = fs.readFileSync(F);
if (blob() !== HEADBLOB) { console.log("TREE NOT AT HEAD BLOB"); process.exit(2); }
for (const [name, pat, find, rep] of M) {
  if (only && !name.startsWith(only)) continue;
  const files = name.startsWith("W9-8c") ? [T, TM] : [T];
  const pre = run(pat, files);
  const src = base.toString("utf8"); const idx = src.indexOf(find);
  if (idx < 0 || src.indexOf(find, idx + 1) >= 0) { console.log(`${name}: PATTERN ${idx < 0 ? "NOT FOUND" : "NOT UNIQUE"}`); continue; }
  let post;
  try { fs.writeFileSync(F, src.replace(find, () => rep)); post = run(pat, files); }
  finally { fs.writeFileSync(F, base); }
  console.log(`${name}: green-before pass=${pre.pass} fail=${pre.fail} | after pass=${post.pass} fail=${post.fail} cancelled=${post.cancelled} reds=${JSON.stringify(post.reds)} | restore=${blob() === HEADBLOB ? "HEAD-OK" : "MISMATCH"}`);
}
