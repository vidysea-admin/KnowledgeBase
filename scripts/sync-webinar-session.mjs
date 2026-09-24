#!/usr/bin/env node
/**
 * scripts/sync-webinar-session.mjs — pushes ONE bot-captured webinar session into Mongo and builds
 * its knowledge-graph edges (2026-09-24, first live run; D-027). The TOC sessions came in through
 * seed-toc.mjs + sync-real-turns.mjs; a webinar also carries people, orgs, countries and a capture
 * user, so it gets its own idempotent sync.
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
 * Re-running replaces this session's turns and edges; it never touches other sessions.
 *
 * Usage: node scripts/sync-webinar-session.mjs <sessionId> [--dry-run]
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { register } from "tsx/esm/api";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sessionId = process.argv[2];
const DRY_RUN = process.argv.includes("--dry-run");
if (!sessionId) {
  console.error("usage: node scripts/sync-webinar-session.mjs <sessionId> [--dry-run]");
  process.exit(1);
}
const dir = join(ROOT, "data", "toc-migrated", sessionId);
for (const f of ["source.json", "turns.json", "meta.json"]) {
  if (!existsSync(join(dir, f))) throw new Error(`missing ${join(dir, f)}`);
}
const load = (f) => JSON.parse(readFileSync(join(dir, f), "utf8"));
const source = load("source.json");
const rawTurns = load("turns.json");
const meta = load("meta.json");
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
  status: { transcribe: "done", diarize: "done", summarize: "done", index: "pending" },
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

if (DRY_RUN) {
  console.log("No Mongo connection attempted (--dry-run).");
  process.exit(0);
}

register();
const { connect, close } = await import("../packages/db/src/client.js");
const { sources } = await import("../packages/db/src/collections/sources.js");
const { sessions } = await import("../packages/db/src/collections/sessions.js");
const { turns: turnsColl } = await import("../packages/db/src/collections/turns.js");
const { speakers } = await import("../packages/db/src/collections/speakers.js");
const { orgs } = await import("../packages/db/src/collections/orgs.js");
const { topics } = await import("../packages/db/src/collections/topics.js");
const { graphEdges } = await import("../packages/db/src/collections/graph-edges.js");

const upsert = (coll, doc) => {
  const { _id, ...rest } = doc;
  return coll(tenantId).updateOne({ _id }, { $set: rest }, { upsert: true });
};
const strip = ({ tenantId: _t, ...rest }) => rest;

await connect(process.env.MONGODB_URL || "mongodb://localhost:27017", process.env.MONGODB_DB || "lkb");
try {
  await upsert(sources, sourceDoc);
  await upsert(sessions, sessionDoc);
  const del = await turnsColl(tenantId).deleteMany({ sessionId });
  for (const t of turns) await turnsColl(tenantId).insertOne(strip(t));
  for (const s of speakerDocs) await upsert(speakers, s);
  for (const o of orgDocs) await upsert(orgs, o);
  for (const t of topicDocs) {
    await topics(tenantId).updateOne(
      { _id: t._id },
      { $set: { name: t.name }, $addToSet: { sessionRefs: sessionId } },
      { upsert: true },
    );
  }
  const delE = await graphEdges(tenantId).deleteMany({ sessionRef: sessionId });
  for (const e of edgeList) await graphEdges(tenantId).insertOne(e);
  console.log(`written: turns -${del.deletedCount}/+${turns.length}, graph_edges -${delE.deletedCount}/+${edgeList.length}`);
} finally {
  await close();
}
