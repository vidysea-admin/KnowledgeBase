// Cycle-2 mutants for ISS-008..011. Run from apps/api. Mutates only a throwaway copy dir (src/whatsapp/review-wamut), removed in finally.
import { cpSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
const base = "src/whatsapp/review/", copy = "src/whatsapp/review-wamut/";
const muts = [
  ["marker id not tenant-structured", "ingest.ts", 'whatsAppLogId(tenantId, "pending-invalidation", groupJid)', "`pending-invalidation:${groupJid}`"],
  ["shrink guard removed", "invalidate.ts", "if (!snapshot.force && absent.length > 0 &&", "if (false &&"],
  ["empty-snapshot refusal removed", "invalidate.ts", "snapshot.presentTurnIds.size === 0 ||", "false ||"],
  ["fraction threshold removed", "invalidate.ts", "absent.length / stored.length > limit", "false"],
  ["force flag ignored", "invalidate.ts", "!snapshot.force &&", "true &&"],
  ["forceIngestGroup does not force", "ingest.ts", "run(tenantId, groupJid, true)", "run(tenantId, groupJid, false)"],
  ["candidate text not redacted", "invalidate.ts", "{ text: REDACTED_TEXT, evidence", "{ evidence"],
  ["evidence quote not redacted", "invalidate.ts", "quote: REDACTED_TEXT })", "quote: e.quote })"],
  ["missing-snapshot guard removed", "ingest.ts", "if (!messageIds) throw new Error(", "if (false) throw new Error("],
  ["affected-candidate lookup unscoped", "invalidate.ts", 'candidates.find(withTenant<WhatsAppReviewCandidate>(tenantId, { sourceId, "evidence.turnId": turn._id })', 'candidates.find({ sourceId, "evidence.turnId": turn._id } as never'],
  ["refusal log row not written", "ingest.ts", 'kind: "snapshot-refused"', 'kind: "other"'],
];
let killed = 0;
try {
  for (const [name, file, from, to] of muts) {
    rmSync(copy, { recursive: true, force: true }); cpSync(base, copy, { recursive: true });
    const text = readFileSync(copy + file, "utf8");
    if (!text.includes(from)) { console.log("NOT-APPLIED", name); continue; }
    writeFileSync(copy + file, text.replace(from, to));
    const r = spawnSync(process.execPath, ["--test", "--import", "tsx", copy + "wire-fix1.test.ts", copy + "wire.test.ts"], { encoding: "utf8", timeout: 180000 });
    if (r.status !== 0) killed++;
    console.log(r.status !== 0 ? "KILLED  " : "SURVIVED", name);
  }
} finally { rmSync(copy, { recursive: true, force: true }); }
console.log(`killed ${killed}/${muts.length}`);
