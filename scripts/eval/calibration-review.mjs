#!/usr/bin/env node
/** T-022 human review intake. No providers, DB writes, threshold changes or gate closure.
 * prepare -> three unreviewed batches of ten; export -> separately named scored references.
 * Approval fields record human assertions; this local file tool does not authenticate a reviewer.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const safeId = (value) => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/.test(value);
function requireValue(condition, message) { if (!condition) throw new Error(message); }
function readBound(root, path, sources, json = true) {
  const bytes = readFileSync(join(root, path));
  sources.set(path, { path, bytes: bytes.length, sha256: digest(bytes) });
  return json ? JSON.parse(bytes.toString("utf8")) : bytes;
}

/** The neutral review inputs are regenerated from source; proxy scores are never copied. */
export async function prepareCalibrationReview(root = ROOT) {
  const sources = new Map();
  const golden = readBound(root, "data/eval/golden-set.json", sources);
  const semantic = readBound(root, "data/eval/golden-set-sibling-semantic.json", sources);
  for (const path of ["packages/index/src/tree/build.ts", "apps/api/src/score.ts"])
    readBound(root, path, sources, false);
  requireValue(Array.isArray(golden) && golden.length >= 15, "need at least 15 golden questions");
  requireValue(Array.isArray(semantic.rows), "missing semantic rival rows");
  requireValue(new Set(golden.map((q) => q.id)).size === golden.length, "duplicate golden IDs");
  requireValue(new Set(semantic.rows.map((q) => q.id)).size === semantic.rows.length, "duplicate rival IDs");
  const selected = Array.from({ length: 15 }, (_, i) => golden[Math.floor(i * (golden.length - 1) / 14)]);
  const candidates = selected.flatMap((q) => {
    requireValue(typeof q.id === "string" && typeof q.question === "string" && q.question.trim(), "invalid golden question");
    const row = semantic.rows.find((r) => r.id === q.id);
    requireValue(row?.question === q.question && row?.expectedSessionId === q.expectedSessionId, `stale semantic query: ${q.id}`);
    requireValue(safeId(q.expectedSessionId) && safeId(row.bestRival) && row.bestRival !== q.expectedSessionId, `invalid rival: ${q.id}`);
    return [q.expectedSessionId, row.bestRival].map((sessionId) => ({ questionId: q.id, query: q.question, sessionId }));
  });
  const sessions = [], pages = [];
  for (const sessionId of [...new Set(candidates.map((c) => c.sessionId))].sort()) {
    const session = readBound(root, `data/toc-migrated/${sessionId}/session.json`, sources);
    const page = readBound(root, `data/toc-migrated/${sessionId}/session_page.json`, sources);
    requireValue(session._id === sessionId && page.sessionId === sessionId && session.tenantId === page.tenantId, `source identity mismatch: ${sessionId}`);
    requireValue(typeof session.tenantId === "string" && session.tenantId.trim(), "missing tenant");
    requireValue(typeof session.title === "string" && typeof page.summary === "string", "missing judge title/summary");
    sessions.push(session); pages.push(page);
  }
  requireValue(new Set(sessions.map((s) => s.tenantId)).size === 1, "cross-tenant review refused");
  // buildTree's default session inputs are session.title and page.summary; the judge
  // consumes only these strings (apps/api/src/score.ts). Review-only nodes use stable
  // session IDs, not the production tree path; no tsx/esbuild subprocess is needed.
  const nodes = new Map(sessions.map((session) => [session._id, {
    node_id: session._id, title: session.title, level: "session",
    summary: pages.find((page) => page.sessionId === session._id).summary,
    children: [], evidence: { sessionRef: session._id },
  }]));
  candidates.sort((a, b) => digest(`${a.questionId}\0${a.sessionId}`).localeCompare(digest(`${b.questionId}\0${b.sessionId}`)));
  const items = candidates.map((c, i) => {
    const n = nodes.get(c.sessionId);
    const node = { node_id: n.node_id, title: n.title, level: n.level, summary: n.summary, children: [], evidence: n.evidence };
    return { id: `review-${String(i + 1).padStart(3, "0")}`, batch: Math.floor(i / 10) + 1,
      ...c, node, inputSha256: digest(JSON.stringify({ query: c.query, title: node.title, summary: node.summary })),
      humanReview: { score: null, rationale: null, approvedBy: null, approvedAt: null } };
  });
  return { format: "calibration-human-review-v1", status: "awaiting-individual-human-review", tenantId: sessions[0].tenantId,
    selection: "15 evenly spaced current golden questions; each paired with its recorded semantic best rival; neutral hash order",
    rubric: "Score how well this title + summary answers the query, from 0 to 1. Be conservative: above 0.7 only when directly and completely answered. Judge these displayed inputs, not the full transcript.",
    limitations: ["No AI or derived reference is human gold.", "Approval assertions need individual Umesh review; this tool does not authenticate the reviewer.", "Review-only node IDs use session IDs; title/summary are current default production judge inputs.", "Export does not close T-022 or tune production thresholds. Live judge calibration is still required."],
    sources: [...sources.values()].sort((a, b) => a.path.localeCompare(b.path)), batches: [1, 2, 3].map((id) => ({ id, itemIds: items.filter((i) => i.batch === id).map((i) => i.id) })), items };
}

/** Fail before any export when inputs changed or one of the thirty approvals is missing. */
export async function exportCalibrationReferences(packet, root = ROOT) {
  const current = await prepareCalibrationReview(root);
  requireValue(Array.isArray(packet?.items) && packet.items.length === 30, "need exactly 30 review items");
  const withoutReviews = { ...packet, items: packet.items.map((item) => ({ ...item, humanReview: { score: null, rationale: null, approvedBy: null, approvedAt: null } })) };
  requireValue(JSON.stringify(withoutReviews) === JSON.stringify(current), "review packet or bound sources changed; regenerate and review again");
  const pairs = packet.items.map((item) => {
    const r = item.humanReview;
    requireValue(r && typeof r.score === "number" && Number.isFinite(r.score) && r.score >= 0 && r.score <= 1, `pending/invalid score: ${item.id}`);
    requireValue(r.approvedBy === "Umesh" && typeof r.rationale === "string" && r.rationale.trim(), `individual Umesh review required: ${item.id}`);
    requireValue(typeof r.approvedAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(r.approvedAt)
      && Number.isFinite(Date.parse(r.approvedAt)) && new Date(r.approvedAt).toISOString() === r.approvedAt, `invalid approval time (use canonical ISO UTC): ${item.id}`);
    return { id: item.id, query: item.query, sessionId: item.sessionId, node: item.node, referenceScore: r.score,
      review: { ...r }, inputSha256: item.inputSha256 };
  });
  return { format: "calibration-human-references-v1", provenance: "individual human approval assertions (not authenticated by this file tool)",
    packetSha256: digest(JSON.stringify(packet)), tenantId: packet.tenantId, sources: packet.sources, pairs,
    remainingGate: "Run the real LLM judge on all approved pairs and independently check calibration; no production threshold change." };
}

export async function runCalibrationReview(argv, root = ROOT) {
  const [mode, ...args] = argv;
  requireValue(["prepare", "export"].includes(mode), "usage: calibration-review.mjs prepare --out <new.json> | export --packet <reviewed.json> --out <new.json>");
  const allowed = mode === "prepare" ? ["--out"] : ["--packet", "--out"];
  requireValue(args.length === allowed.length * 2, "provide each required option exactly once");
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    requireValue(allowed.includes(args[i]) && !options[args[i]] && args[i + 1] && !args[i + 1].startsWith("--"), "invalid/duplicate option");
    options[args[i]] = args[i + 1];
  }
  requireValue(allowed.every((a) => options[a]), "missing option");
  const report = mode === "prepare" ? await prepareCalibrationReview(root) : await exportCalibrationReferences(JSON.parse(readFileSync(resolve(options["--packet"]), "utf8")), root);
  const out = resolve(options["--out"]);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  console.log(`${mode}: ${mode === "prepare" ? report.items.length : report.pairs.length} items; wrote new ${out}; T-022 remains open`);
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  runCalibrationReview(process.argv.slice(2)).catch((error) => { console.error(`refused: ${error.message}`); process.exitCode = 2; });
