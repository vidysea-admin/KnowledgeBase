// Cycle-1 ISS-003 survivors, killed by tests. Run from apps/api. Mutates only a throwaway copy dir (src/whatsapp/review-wamut), removed in finally.
import { cpSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
const base = "src/whatsapp/review/", copy = "src/whatsapp/review-wamut/";
const muts = [
  ["claim status needs-review", "materializer.ts", "status: WA_APPROVED_CLAIM_STATUS", 'status: "needs-review"'],
  ["personal-excluded guard removed", "materializer.ts", 'if (candidate.flags.some(flag => flag.kind === "personal-excluded")) throw', 'if (false) throw'],
  ["non-approved guard removed", "materializer.ts", 'if (candidate.status !== "approved" ||', 'if (false ||'],
  ["invalidate candidate find unscoped", "invalidate.ts", 'const rows = await candidates.find(withTenant<WhatsAppReviewCandidate>(tenantId, { sourceId })', 'const rows = await candidates.find({ sourceId } as never'],
  ["revoke deleteOne unscoped", "materializer.ts", 'deleteOne(withTenant<{ tenantId: string }>(tenantId, { _id: whatsAppClaimId(candidate._id) } as never) as never', 'deleteOne({ _id: whatsAppClaimId(candidate._id) } as never'],
  ["upstream-deleted turn not removed", "invalidate.ts", "if (snapshot.presentTurnIds.has(turn._id)) continue;", "continue;"],
  ["marker never cleared", "ingest.ts", "await db.collection(WHATSAPP_REVIEW_LOG).deleteOne({ _id: markerId, tenantId } as never);", ""],
  ["claim source dropped", "materializer.ts", "source: WA_CLAIM_SOURCE,", ""],
  ["audit ignores stale quote", "quarantine.ts", "turn.text !== e.quote", "false"],
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
