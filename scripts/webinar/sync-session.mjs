#!/usr/bin/env node
/**
 * scripts/webinar/sync-session.mjs (moved from scripts/sync-webinar-session.mjs 2026-09-24,
 * fix cycle 1 — lint-dirsize budget: scripts/ was 33/32, this was the only new file in the diff,
 * ISS-285) — pushes ONE bot-captured webinar session into Mongo and builds its knowledge-graph
 * edges (2026-09-24, first live run; D-027). The TOC sessions came in through seed-toc.mjs +
 * sync-real-turns.mjs; a webinar also carries people, orgs, countries and a capture user, so it
 * gets its own idempotent sync.
 *
 * Inputs: data/toc-migrated/<id>/{source.json, turns.json, meta.json}. meta.json is the
 * hand-checked people/org/country/topic list for the session.
 * Writes, tenant-scoped via the packages/db coll(tenantId) accessors:
 *   sources · sessions · turns (speakerRef → personId, speakerLabel, occurredAt) · speakers ·
 *   orgs · topics · graph_edges
 *
 * Graph edges are DETERMINISTIC (no LLM). Each edge carries evidence[] with the turn ids and
 * timestamps that support it (H3 "no fact without provenance"), plus sessionRef, date and
 * confidence. Edge types:
 *   person-spoke_in-session · person-represents-org · org-located_in-country ·
 *   org-partner_of-org · session-covers-country · session-covers-topic ·
 *   person-discussed-topic · person-discussed-country · session-held_on-date ·
 *   date-in_month-month · user-captured-session
 * Re-running replaces this session's turns and edges; it never touches other sessions. The
 * replace is a generation swap (ISS-291, `session-rows.mjs`): new rows are upserted first and the
 * old generation is deleted only after every write succeeded, so a crash never leaves the session
 * partially deleted. (The Mongo is standalone — no transactions.)
 *
 * --emit-files (ISS-294): writes session.json / session_page.json / claims.json into the session
 *   dir, derived from meta/source/turns — the files every other data/toc-migrated/<id>/ carries.
 * --index (ISS-296): after the sync, runs the SAME `indexSession` every live-ingested session goes
 *   through (apps/api/src/indexing/session.ts, bound by production.ts's `buildIndexer`): LLM
 *   summary -> session_pages, claims, chunks + embeddings, incremental tree_index, entity
 *   promotion, status.index -> done. With --dry-run it prints the plan and connects to nothing.
 *
 * Usage: node scripts/webinar/sync-session.mjs <sessionId> [--dry-run] [--emit-files] [--index]
 */
import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import "dotenv/config";
import { register } from "tsx/esm/api";
import { replaceSessionRows, buildSessionFiles, loadWebinarSession } from "./session-rows.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sessionId = process.argv[2];
const DRY_RUN = process.argv.includes("--dry-run");
const EMIT_FILES = process.argv.includes("--emit-files");
const INDEX = process.argv.includes("--index");
if (!sessionId) {
  console.error("usage: node scripts/webinar/sync-session.mjs <sessionId> [--dry-run] [--emit-files] [--index]");
  process.exit(1);
}
const dir = join(ROOT, "data", "toc-migrated", sessionId);
const { source, rawTurns, meta, screenEvidence, notes } = loadWebinarSession(dir, sessionId);
const tenantId = meta.tenantId;
const t0 = new Date(meta.t0).getTime();

// ---- turns: stable person ids, readable labels, absolute timestamps -------------------------
const byLabel = new Map(meta.people.map((p) => [p.label, p]));
const turns = rawTurns.map((t) => {
  const person = byLabel.get(t.speakerRef);
  return {
    ...t,
    sessionId,
    speakerRef: person ? person.personId : t.speakerRef,
    speakerLabel: person ? person.label : t.speakerRef,
    occurredAt: new Date(t0 + t.tStart * 1000).toISOString(),
  };
});

// ---- graph edges ---------------------------------------------------------------------------
const edges = new Map();
const slug = (s) => s.replace(/[^a-zA-Z0-9:._-]+/g, "-");
function addEdge(from, type, to, turn, extra = {}) {
  const _id = `${tenantId}-edge:${slug(sessionId)}|${slug(from)}|${type}|${slug(to)}`;
  let e = edges.get(_id);
  if (!e) {
    e = { _id, from, to, type, weight: 0, sessionRef: sessionId, date: meta.date, evidence: [], ...extra };
    edges.set(_id, e);
  }
  e.weight += 1;
  if (turn && e.evidence.length < 5) e.evidence.push({ turnId: turn._id, tStart: turn.tStart, occurredAt: turn.occurredAt });
  return e;
}
const sessionNode = `session:${sessionId}`;
const dateNode = `date:${meta.date}`;
addEdge(sessionNode, "held_on", dateNode, null, { confidence: 1 });
addEdge(dateNode, "in_month", `month:${meta.date.slice(0, 7)}`, null, { confidence: 1 });
addEdge(meta.capturedBy.id, "captured", sessionNode, null, { confidence: 1, via: meta.capturedBy.via });

for (const p of meta.people) {
  const own = turns.filter((t) => t.speakerRef === p.personId);
  if (own.length === 0) continue;
  const e = addEdge(p.personId, "spoke_in", sessionNode, own[0], { confidence: p.confidence, role: p.role });
  e.weight = own.length;
  e.speakingSeconds = Math.round(own.reduce((s, t) => s + (t.tEnd - t.tStart), 0));
  if (p.org) addEdge(p.personId, "represents", p.org, own[0], { confidence: p.confidence, role: p.role });
}
for (const o of meta.orgs) {
  for (const c of o.countries) addEdge(o.id, "located_in", c, null, { confidence: 0.9 });
  if (o.partnerOf) {
    const re = new RegExp(o.pattern, "i");
    const hit = turns.find((t) => re.test(t.text));
    if (hit) addEdge(o.partnerOf, "partner_of", o.id, hit, { confidence: 0.85 });
  }
}
for (const [node, pattern] of [...Object.entries(meta.countries), ...Object.entries(meta.topics)]) {
  const re = new RegExp(pattern, "i");
  for (const t of turns) {
    if (!re.test(t.text)) continue;
    addEdge(sessionNode, "covers", node, t, { confidence: 0.8 });
    if (t.speakerRef.startsWith("person:")) addEdge(t.speakerRef, "discussed", node, t, { confidence: 0.7 });
  }
}

// ---- documents -----------------------------------------------------------------------------
const participants = meta.people.map((p) => p.personId);
const sessionDoc = {
  _id: sessionId,
  sourceId: source._id,
  title: meta.title,
  date: meta.date,
  org: meta.orgs.filter((o) => !o.partnerOf).map((o) => o.name).join(" · "),
  participants,
  platform: meta.platform,
  capturedBy: meta.capturedBy,
  status: { transcribe: "done", diarize: "done", summarize: "pending", index: "pending" },
  ...(screenEvidence ? { screenEvidence, notes } : {}),
};
const sourceDoc = { ...source, tenantId: undefined };
delete sourceDoc.tenantId;
const speakerDocs = meta.people.map((p) => ({
  _id: `${tenantId}-${p.personId}`,
  personId: p.personId,
  aliases: p.aliases,
  org: p.org ?? undefined,
  role: p.role,
  confidence: p.confidence,
  evidence: turns.filter((t) => t.speakerRef === p.personId).slice(0, 3).map((t) => ({ turnId: t._id, sessionId })),
}));
const orgDocs = meta.orgs.map((o) => ({ _id: `${tenantId}-${o.id}`, name: o.name, aliases: o.aliases }));
const topicDocs = Object.keys(meta.topics)
  .filter((k) => [...edges.values()].some((e) => e.to === k && e.type === "covers"))
  .map((k) => ({ _id: `${tenantId}-${k}`, name: k.replace("topic:", "").replace(/-/g, " "), sessionRefs: [sessionId] }));

const edgeList = [...edges.values()];
const byType = edgeList.reduce((m, e) => ((m[e.type] = (m[e.type] ?? 0) + 1), m), {});
console.log(`session ${sessionId} (tenant ${tenantId})`);
console.log(`  turns ${turns.length} · speakers ${speakerDocs.length} · orgs ${orgDocs.length} · topics ${topicDocs.length}`);
console.log(`  graph_edges ${edgeList.length}: ${JSON.stringify(byType)}`);

if (EMIT_FILES) {
  const files = buildSessionFiles({ sessionId, tenantId, sessionDoc, meta, turns });
  for (const [name, doc] of [["session.json", files.session], ["session_page.json", files.sessionPage], ["claims.json", files.claims]]) {
    if (!DRY_RUN) writeFileSync(join(dir, name), `${JSON.stringify(doc, null, 2)}\n`);
    console.log(`  ${DRY_RUN ? "would write" : "wrote"} ${name}`);
  }
}

register();
if (INDEX && DRY_RUN) {
  // No connection: the plan is computed from the same turns the live run will read back.
  const { buildChunks } = await import("../../packages/index/src/index.ts");
  console.log(`  index plan: summarize + claims (LLM, routed per config/ai-routing.yaml) -> session_pages/claims; ` +
    `${buildChunks(turns).length} chunk(s) to embed from ${turns.length} turns; tree_index regenerate([${sessionId}]); ` +
    `entity promotion; sessions.status.index -> done`);
}
if (DRY_RUN) {
  console.log("No Mongo connection attempted (--dry-run).");
  process.exit(0);
}

const { connect, close } = await import("../../packages/db/src/client.js");
const { sources } = await import("../../packages/db/src/collections/sources.js");
const { sessions } = await import("../../packages/db/src/collections/sessions.js");
const { turns: turnsColl } = await import("../../packages/db/src/collections/turns.js");
const { speakers } = await import("../../packages/db/src/collections/speakers.js");
const { orgs } = await import("../../packages/db/src/collections/orgs.js");
const { topics } = await import("../../packages/db/src/collections/topics.js");
const { graphEdges } = await import("../../packages/db/src/collections/graph-edges.js");

const upsert = (coll, doc) => {
  const { _id, ...rest } = doc;
  return coll(tenantId).updateOne({ _id }, { $set: rest }, { upsert: true });
};
const strip = ({ tenantId: _t, ...rest }) => rest;

const workDb = process.env.MONGO_WORK_DB?.trim();
if (!workDb || ["lkb", "global_university_db"].includes(workDb)) throw new Error("MONGO_WORK_DB must name an isolated work database; production writes refused");
await connect(process.env.MONGODB_URL || "mongodb://localhost:27017", workDb);
const gen = `gen-${Date.now()}`;
try {
  await upsert(sources, sourceDoc);
  // Never regress an index status a previous --index run already advanced to "done".
  const prior = await sessions(tenantId).findOne({ _id: sessionId });
  if (prior?.status?.index === "done") sessionDoc.status.index = "done";
  await upsert(sessions, sessionDoc);
  const tw = await replaceSessionRows(turnsColl(tenantId), { sessionId }, turns.map(strip), gen);
  for (const s of speakerDocs) await upsert(speakers, s);
  for (const o of orgDocs) await upsert(orgs, o);
  for (const t of topicDocs) {
    await topics(tenantId).updateOne(
      { _id: t._id },
      { $set: { name: t.name }, $addToSet: { sessionRefs: sessionId } },
      { upsert: true },
    );
  }
  const ew = await replaceSessionRows(graphEdges(tenantId), { sessionRef: sessionId }, edgeList, gen);
  console.log(`written (${gen}): turns ${tw.upserted} upserted/${tw.removedStale} stale removed, ` +
    `graph_edges ${ew.upserted} upserted/${ew.removedStale} stale removed`);
  if (INDEX) {
    const { buildIndexer } = await import("../../apps/api/src/production.ts");
    const res = await buildIndexer(undefined, { strictWebinar: true })(tenantId, sessionId);
    if (!res.completion?.strict || !res.completion.complete || res.summary?.degraded || res.claims?.degraded || res.chunks.skipped || !res.completion.treeWritten) {
      throw new Error("required webinar indexing incomplete; no completion proof emitted");
    }
    const inputHash = createHash("sha256").update(readFileSync(join(dir, "knowledge-turns.json"))).digest("hex");
    const proof = { version: 2, sessionId, tenantId, inputHash, generation: res.completion.generation,
      status: "done", strict: true, summary: "done", claims: "done", chunks: "done", tree: "done",
      turnCount: res.completion.turnCount, semanticSupport: "passed" };
    const proofPath = join(dir, "index-proof.json"), temp = `${proofPath}.${randomUUID()}.tmp`;
    writeFileSync(temp, JSON.stringify(proof) + "\n", { flag: "wx" }); renameSync(temp, proofPath);
    console.log(`indexed: chunks ${res.chunks.written}${res.chunks.skipped ? ` (skipped: ${res.chunks.skipped})` : ""}` +
      `${res.entities ? `, entities ${JSON.stringify(res.entities)}` : ""}`);
  }
} finally {
  await close();
}
