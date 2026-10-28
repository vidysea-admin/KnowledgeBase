import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = process.cwd();
const original = resolve(root, "packages/db/src/collections/watch-heartbeat.ts");
const liveBytes = readFileSync(original);
const scratch = resolve(root, "packages/db/.checker-heartbeat-tenancy");
if (existsSync(scratch)) throw new Error("Scratch already exists; refuse reuse");
const target = resolve(scratch, "src/collections/watch-heartbeat.ts");
const backup = resolve(scratch, "watch-heartbeat.byte-backup");
const source = liveBytes.toString("utf8");
const scoped = 'return scopedCollection<WatchHeartbeat>(db, "watch_heartbeat")(tenantId);';
if (!source.includes(scoped)) throw new Error("Unexpected accessor preimage");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
let armed = false;
function restore() {
  if (!armed) return;
  writeFileSync(target, readFileSync(backup));
  if (!readFileSync(target).equals(readFileSync(backup))) throw new Error("Byte restore mismatch");
  armed = false;
  console.log("RESTORED byte-identical sha256=" + hash(readFileSync(target)));
}
function interrupted(signal) {
  try { restore(); } finally { process.exit(signal === "SIGINT" ? 130 : 143); }
}
process.on("SIGINT", () => interrupted("SIGINT"));
process.on("SIGTERM", () => interrupted("SIGTERM"));
const test = resolve(scratch, "src/collections/watch-heartbeat.test.ts");
function run(label, code, expectedFailure) {
  if (code !== null && code === source) throw new Error("Mutation preimage not found: " + label);
  if (code !== null) { writeFileSync(backup, liveBytes); armed = true; writeFileSync(target, code); }
  let result;
  try {
    result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", "--import", "tsx", test],
      { cwd: root, encoding: "utf8", timeout: 30000, killSignal: "SIGKILL" });
    const output = String(result.stdout ?? "") + String(result.stderr ?? "");
    console.log("CASE " + label + " exit=" + result.status + " timeout=" + Boolean(result.error));
    console.log(output);
    if (result.error) throw result.error;
    if (expectedFailure ? result.status === 0 : result.status !== 0) throw new Error("Unexpected result: " + label);
    if (expectedFailure && !/fail [1-9]/.test(output)) throw new Error("Mutation lacked test failure: " + label);
  } finally { restore(); }
}
try {
  for (const relative of ["collections/watch-heartbeat.ts", "collections/watch-heartbeat.test.ts", "client.ts", "lib/tenantScope.ts"]) {
    const dest = resolve(scratch, "src", relative); mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, readFileSync(resolve(root, "packages/db/src", relative)));
  }
  console.log("LIVE sha256=" + hash(liveBytes));
  run("isolated-baseline", null, false);
  run("ISS-U4BHB-001 exact ledger replacement; changed preimage only", source.replace(scoped,
    'void tenantId; void scopedCollection; return getDb().collection("watch_heartbeat") as unknown as ReturnType<ReturnType<typeof scopedCollection<WatchHeartbeat>>>;'), true);
  run("adapted injected-db raw-handle semantic leak", source.replace(scoped,
    'void tenantId; void scopedCollection; return db.collection("watch_heartbeat") as unknown as ReturnType<ReturnType<typeof scopedCollection<WatchHeartbeat>>>;'), true);
  run("forged document id reaches scoped write", source.replace('{ _id: watchHeartbeatId(tenantId, sourceType) },', '{ _id: doc._id },'), true);
  run("list helper bypasses scoped accessor", source.replace('return watchHeartbeat(tenantId, db).find({}).toArray();', 'return db.collection<WatchHeartbeat>("watch_heartbeat").find({}).toArray();'), true);
  run("restored-baseline", null, false);
  console.log("ISS-U4BHB-001 corpus 1/1 detected; additional semantic mutations 3/3 detected");
} finally {
  restore();
  if (!readFileSync(original).equals(liveBytes)) throw new Error("LIVE source changed during isolated check");
  console.log("LIVE unchanged byte-identical sha256=" + hash(readFileSync(original)));
  const allowed = resolve(root, "packages/db");
  if (dirname(scratch) !== allowed || !scratch.endsWith(".checker-heartbeat-tenancy")) throw new Error("Unsafe scratch cleanup target");
  rmSync(scratch, { recursive: true, force: true });
}
