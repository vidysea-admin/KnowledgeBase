import { createHash } from "node:crypto";
import { readFile, lstat } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import type { CalibrationPacket } from "./types.js";
import { CalibrationReviewError } from "./types.js";

export const hash = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const insist = (ok: unknown): void => { if (!ok) throw new CalibrationReviewError(409, "calibration_sources_changed"); };
const safeId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/.test(id);

/** Never accepts client paths. Current seed binds ALL source bytes and production judge inputs. */
export async function loadCalibrationSeed(projectRoot: string, packetPath: string): Promise<CalibrationPacket> {
  try {
    const packet = JSON.parse(await readFile(packetPath, "utf8")) as CalibrationPacket;
    insist(packet.format === "calibration-human-review-v1" && safeId(packet.tenantId));
    insist(Object.keys(packet).join(",") === "format,status,tenantId,selection,rubric,limitations,sources,batches,items");
    insist(packet.status === "awaiting-individual-human-review"
      && packet.selection === "15 evenly spaced current golden questions; each paired with its recorded semantic best rival; neutral hash order"
      && packet.rubric === "Score how well this title + summary answers the query, from 0 to 1. Be conservative: above 0.7 only when directly and completely answered. Judge these displayed inputs, not the full transcript.");
    insist(JSON.stringify(packet.limitations) === JSON.stringify([
      "No AI or derived reference is human gold.",
      "Approval assertions need individual Umesh review; this tool does not authenticate the reviewer.",
      "Review-only node IDs use session IDs; title/summary are current default production judge inputs.",
      "Export does not close T-022 or tune production thresholds. Live judge calibration is still required.",
    ]));
    insist(Array.isArray(packet.items) && packet.items.length === 30 && Array.isArray(packet.sources));
    insist(new Set(packet.items.map(i => i.id)).size === 30);
    const sources = new Map<string, Buffer>();
    for (const source of packet.sources) {
      insist(Object.keys(source).join(",") === "path,bytes,sha256");
      insist(typeof source.path === "string" && !isAbsolute(source.path) && !source.path.includes("\\") && !sources.has(source.path));
      insist(/^(?:data\/eval\/(?:golden-set|golden-set-sibling-semantic)\.json|packages\/index\/src\/tree\/build\.ts|apps\/api\/src\/score\.ts|data\/toc-migrated\/[A-Za-z0-9][A-Za-z0-9_.-]{0,199}\/(?:session|session_page)\.json)$/.test(source.path));
      const path = resolve(projectRoot, source.path), rel = relative(resolve(projectRoot), path);
      insist(rel !== "" && !rel.startsWith("..") && !isAbsolute(rel));
      insist(!(await lstat(path)).isSymbolicLink());
      const bytes = await readFile(path);
      insist(bytes.length === source.bytes && hash(bytes) === source.sha256);
      sources.set(source.path, bytes);
    }
    const json = (path: string): any => { insist(sources.has(path)); return JSON.parse(sources.get(path)!.toString("utf8")); };
    const gold = json("data/eval/golden-set.json"), rivals = json("data/eval/golden-set-sibling-semantic.json");
    insist(Array.isArray(gold) && gold.length >= 15 && Array.isArray(rivals.rows));
    insist(sources.has("packages/index/src/tree/build.ts") && sources.has("apps/api/src/score.ts"));
    const selected = Array.from({ length: 15 }, (_, i) => gold[Math.floor(i * (gold.length - 1) / 14)]);
    const candidates = selected.flatMap(q => {
      const rival = rivals.rows.find((r: any) => r.id === q.id);
      insist(rival?.question === q.question && rival.expectedSessionId === q.expectedSessionId && safeId(rival.bestRival) && rival.bestRival !== q.expectedSessionId);
      return [q.expectedSessionId, rival.bestRival].map(sessionId => ({ questionId: q.id, query: q.question, sessionId }));
    }).sort((a, b) => hash(`${a.questionId}\0${a.sessionId}`).localeCompare(hash(`${b.questionId}\0${b.sessionId}`)));
    const expectedPaths = new Set(["data/eval/golden-set.json", "data/eval/golden-set-sibling-semantic.json", "packages/index/src/tree/build.ts", "apps/api/src/score.ts"]);
    for (let i = 0; i < 30; i++) {
      const item = packet.items[i]!, candidate = candidates[i]!;
      insist(Object.keys(item).join(",") === "id,batch,questionId,query,sessionId,node,inputSha256,humanReview");
      insist(safeId(candidate.sessionId));
      const sp = `data/toc-migrated/${candidate.sessionId}/session.json`, pp = `data/toc-migrated/${candidate.sessionId}/session_page.json`;
      expectedPaths.add(sp); expectedPaths.add(pp);
      const session = json(sp), page = json(pp);
      insist(session._id === candidate.sessionId && page.sessionId === candidate.sessionId && session.tenantId === packet.tenantId && page.tenantId === packet.tenantId);
      const node = { node_id: session._id, title: session.title, level: "session", summary: page.summary, children: [], evidence: { sessionRef: session._id } };
      insist(item.id === `review-${String(i + 1).padStart(3, "0")}` && item.batch === Math.floor(i / 10) + 1);
      insist(item.questionId === candidate.questionId && item.query === candidate.query && item.sessionId === candidate.sessionId);
      insist(JSON.stringify(item.node) === JSON.stringify(node) && item.inputSha256 === hash(JSON.stringify({ query: item.query, title: node.title, summary: node.summary })));
      insist(JSON.stringify(item.humanReview) === JSON.stringify({ score: null, rationale: null, approvedBy: null, approvedAt: null }));
    }
    insist(sources.size === expectedPaths.size && [...sources.keys()].every(p => expectedPaths.has(p)));
    insist(JSON.stringify(packet.batches) === JSON.stringify([1, 2, 3].map(id => ({ id, itemIds: packet.items.filter(i => i.batch === id).map(i => i.id) }))));
    return packet;
  } catch (error) {
    if (error instanceof CalibrationReviewError) throw error;
    throw new CalibrationReviewError(503, "calibration_sources_unavailable");
  }
}
