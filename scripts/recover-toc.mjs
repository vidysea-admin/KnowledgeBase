#!/usr/bin/env node
/** Build/verify preserved source recovery; live import requires an exact task isolated database. */
import {readFileSync, writeFileSync, renameSync, rmSync, existsSync} from "node:fs";
import {resolve, dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";
import {register} from "tsx/esm/api";
register();
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const {buildTree} = await import("../packages/index/src/tree/build.ts");
const {readRecoveryInputs, buildRecoveryPacket, writeRecoveryPacket, readRecoveryPacket} = await import("./lib/toc-recovery.mjs");
const {requireRecoveryDatabase, importRecoveryPacket} = await import("./lib/toc-recovery-import.mjs");
const args = process.argv.slice(2);
const allowed = new Set(["--build", "--dry-run", "--import", "--packet", "--receipt"]);
function option(name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`${name} path required`);
  return resolve(args[index + 1]);
}
async function main() {
  for (let i = 0; i < args.length; i++) {
    if (!allowed.has(args[i])) throw new Error("unknown recovery argument");
    if (["--packet", "--receipt"].includes(args[i])) i++;
  }
  if (["--build", "--dry-run", "--import"].filter(name => args.includes(name)).length !== 1) throw new Error("choose exactly one --build, --dry-run or --import");
  const corpus = join(ROOT, "data", "toc-migrated"), snapshot = readRecoveryInputs(corpus,
    join(ROOT, "data", "eval", "extraction-reconciliation-reviewed.json"), join(ROOT, "data", "eval", "extraction-corpus.json"));
  const directory = option("--packet");
  if (args.includes("--build")) {
    if (!directory) throw new Error("--packet new directory required");
    const packet = buildRecoveryPacket(snapshot, buildTree); writeRecoveryPacket(packet, directory, corpus);
    console.log(JSON.stringify({status: "built-source-recovery", packetId: packet.manifest.packetId, counts: packet.manifest.counts,
      excludedTurns: packet.manifest.excludedTurns, unresolvedClaims: 65, treeBytes: packet.manifest.treeBytes})); return;
  }
  const packet = directory ? readRecoveryPacket(directory, snapshot, buildTree) : buildRecoveryPacket(snapshot, buildTree);
  if (args.includes("--dry-run")) {
    console.log(JSON.stringify({status: "dry-run-no-database-import", packetId: packet.manifest.packetId, counts: packet.manifest.counts,
      unresolvedClaims: 65, excludedIntervals: 3, strictIndexAcceptance: false})); return;
  }
  if (!directory) throw new Error("--import requires a built --packet");
  const target = requireRecoveryDatabase(process.env), receiptPath = option("--receipt");
  if (!receiptPath || existsSync(receiptPath)) throw new Error("--receipt new file required");
  const attemptId = randomUUID();
  writeFileSync(receiptPath, JSON.stringify({attemptId, status: "connecting"}), {flag: "wx"});
  const record = receipt => {
    if (JSON.parse(readFileSync(receiptPath, "utf8")).attemptId !== attemptId) throw new Error("receipt ownership changed");
    const temporary = `${receiptPath}.${attemptId}.tmp`;
    try {writeFileSync(temporary, `${JSON.stringify({...receipt, attemptId}, null, 2)}\n`, {flag: "wx"}); renameSync(temporary, receiptPath);}
    finally {rmSync(temporary, {force: true});}
  };
  const {connect, close, scopedCollection} = await import("../packages/db/src/index.ts");
  try {
    const db = await connect(target.url, target.dbName);
    const receipt = await importRecoveryPacket(packet, {db, dbName: target.dbName, scoped: scopedCollection, record});
    console.log(JSON.stringify({status: receipt.status, counts: receipt.confirmedCounts, strictIndexAcceptance: false}));
  } catch (error) {
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    if (receipt.status === "connecting") record({status: "connection-failed-before-writes", dbName: target.dbName,
      failure: "Could not open the explicit isolated database; no import attempted."});
    throw error;
  } finally {await close();}
}
main().catch(error => {console.error(`FAIL: ${error.message}`); process.exitCode = 1;});
