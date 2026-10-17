/**
 * TEST-ONLY. ISS-WA-REVIEW-WIRE-006 / T-007: shared planted-text fixture for the per-reader read-side quarantine tests.
 *
 * `waWorld(state)` builds ONE in-memory tenant holding (a) a WhatsApp session whose turns, old-wiring claim, chunk, session page,
 * tree node and graph edge all carry a unique answer-bearing PLANT string, and (b) a public recording session that must stay
 * readable (the control: a reader that returns nothing at all would otherwise pass vacuously).
 * `state` is the review state of the WhatsApp candidate for the first turn: pending, rejected or approved.
 */
import type { Db } from "mongodb";
import type { Sessions, Sources, TreeIndexRootDocument, Turns } from "@lkb/core";
import { detectWhatsAppReviewCandidates, type WhatsAppReviewCandidate } from "../whatsapp/review/detection.js";
import { whatsAppClaimId } from "../whatsapp/review/materializer.js";
import { fakeSnapshotClient } from "./read-fixture.js";

export type Row = Record<string, unknown>;
export type WaState = "pending" | "rejected" | "approved";
export const TENANT = "tenant-a";
export const PLANT = "PLANTZEBRA scholarship deadline is the thirty first of March";
export const PLANT_SIBLING = "UNREVIEWEDOCELOT sibling tuition fee is ninety nine thousand";
export const PUBLIC_TEXT = "Public counselling note about engineering admissions and cutoff ranks";
export const WA_SESSION = "session-wa", WA_SOURCE = "source-wa", PUB_SESSION = "session-pub", PUB_SOURCE = "source-pub";

const isObj = (v: unknown): v is Row => v !== null && typeof v === "object" && !Array.isArray(v);
const at = (row: Row, path: string[]): unknown[] => {
  const walk = (value: unknown, rest: string[]): unknown[] => {
    if (Array.isArray(value)) return value.flatMap(item => walk(item, rest));
    if (!rest.length) return [value];
    return isObj(value) ? walk(value[rest[0]!], rest.slice(1)) : [];
  };
  return walk(row, path);
};
function opMatches(actual: unknown, want: unknown): boolean {
  if (isObj(want) && Object.keys(want).some(k => k.startsWith("$"))) {
    return Object.entries(want).every(([op, arg]) => {
      switch (op) {
        case "$in": return (arg as unknown[]).some(w => opMatches(actual, w));
        case "$nin": return !(arg as unknown[]).some(w => opMatches(actual, w));
        case "$ne": return arg === null ? actual !== undefined && actual !== null : actual !== arg;
        case "$gt": return (actual as never) > (arg as never);
        case "$gte": return (actual as never) >= (arg as never);
        case "$lt": return (actual as never) < (arg as never);
        case "$lte": return (actual as never) <= (arg as never);
        case "$exists": return (actual !== undefined) === Boolean(arg);
        case "$regex": return typeof actual === "string" && new RegExp(String(arg), String((want as Row).$options ?? "")).test(actual);
        case "$options": return true;
        default: throw new Error(`wa-quarantine fixture: unsupported operator ${op}`);
      }
    });
  }
  if (want === undefined || want === null) return actual === undefined || actual === null;
  if (Array.isArray(want)) return JSON.stringify(actual) === JSON.stringify(want);
  return actual === want;
}
export function matches(row: Row, filter: Row): boolean {
  return Object.entries(filter).every(([key, want]) => {
    if (key === "$or") return (want as Row[]).some(f => matches(row, f));
    if (key === "$and") return (want as Row[]).every(f => matches(row, f));
    const values = at(row, key.split("."));
    if (!values.length) return opMatches(undefined, want);
    return values.some(v => opMatches(v, want));
  });
}

/** Mongo-subset database: $or/$and/$in/$regex/$exists, dotted paths, chained sort/skip/limit, projection ignored (full rows). */
export function memoryDb(data: Record<string, Row[]>, log: { collection: string; op: string; filter: Row }[] = []): Pick<Db, "collection" | "client"> & { data: Record<string, Row[]>; log: typeof log } {
  const cursor = (name: string, filter: Row) => {
    let rows = (data[name] ?? []).filter(r => matches(r, filter));
    const api = {
      sort(spec: Record<string, 1 | -1>) { const [[k, d]] = Object.entries(spec) as [[string, 1 | -1]]; rows = [...rows].sort((a, b) => (String(a[k]) < String(b[k]) ? -1 : String(a[k]) > String(b[k]) ? 1 : 0) * d); return api; },
      skip(n: number) { rows = rows.slice(n); return api; },
      limit(n: number) { rows = n > 0 ? rows.slice(0, n) : rows; return api; },
      project() { return api; },
      async toArray() { log.push({ collection: name, op: "find", filter: structuredClone(filter) }); return structuredClone(rows); },
      async *[Symbol.asyncIterator]() { for (const r of structuredClone(rows)) yield r; },
    };
    return api;
  };
  return { data, log, client: fakeSnapshotClient(), collection: (name: string) => ({
    find: (filter: Row = {}) => cursor(name, filter),
    async findOne(filter: Row = {}) { log.push({ collection: name, op: "findOne", filter: structuredClone(filter) }); const r = (data[name] ?? []).find(x => matches(x, filter)); return r ? structuredClone(r) : null; },
    async countDocuments(filter: Row = {}) { return (data[name] ?? []).filter(r => matches(r, filter)).length; },
  }) } as never;
}

export function waWorld(state: WaState, tenantId = TENANT) {
  const first: Turns = { _id: "wa-turn-1", tenantId, sessionId: WA_SESSION, speakerRef: "expert", speakerLabel: "Asha", tStart: 0, tEnd: 0,
    text: PLANT, occurredAt: "2026-10-14T10:00:00.000Z" };
  const sibling: Turns = { ...first, _id: "wa-turn-2", text: PLANT_SIBLING, tStart: 1, tEnd: 1 };
  const source = { _id: WA_SOURCE, tenantId, kind: "whatsapp-batch", path: "group@g.us", consent: { given: true, recordedBy: "wa" } } as unknown as Sources;
  const session: Sessions = { _id: WA_SESSION, tenantId, sourceId: WA_SOURCE, title: "PRIVATE group title", participants: ["PRIVATE person"], date: "2026-10-14",
    status: { transcribe: "done", index: "done" } };
  const found = detectWhatsAppReviewCandidates(tenantId, { source, session, turns: [first, sibling] }, "2026-10-14T11:00:00.000Z");
  const base = found.find(c => c.evidence.some(e => e.turnId === first._id))!;
  const decided: Partial<WhatsAppReviewCandidate> = state === "pending" ? {}
    : { status: state, decision: { action: state, actor: "reviewer-fingerprint", at: "2026-10-14T11:00:00.000Z" } as never };
  const candidate = { ...base, ...decided } as WhatsAppReviewCandidate;
  const others = found.filter(c => c._id !== base._id);
  const pubTurn: Turns = { _id: "pub-turn-1", tenantId, sessionId: PUB_SESSION, speakerRef: "spk:0", tStart: 0, tEnd: 5, text: PUBLIC_TEXT };
  const pubSession: Sessions = { _id: PUB_SESSION, tenantId, sourceId: PUB_SOURCE, title: "Public session", date: "2026-09-07", status: { transcribe: "done", index: "done" } };
  const pubSource = { _id: PUB_SOURCE, tenantId, kind: "recording", path: "fixture/recording", consent: { given: true, recordedBy: "owner" } };
  const approvedClaim: Row | null = state === "approved" ? {
    _id: whatsAppClaimId(candidate._id), tenantId, text: candidate.text, source: "whatsapp", status: "verified", origin: "speaker-statement",
    evidence: candidate.evidence.map(e => ({ turnId: e.turnId, sessionId: e.sessionId, quote: e.quote })),
    waReview: { candidateId: candidate._id, kind: candidate.kind, approvedBy: candidate.decision?.actor, approvedAt: candidate.decision?.at } } : null;
  // Pre-existing rows from the OLD wiring: needs-review claim, chunk, page, tree node, graph edge, all citing the WhatsApp session.
  const oldClaim: Row = { _id: "claim-wa-old", tenantId, text: PLANT, status: "needs-review", confidence: 0.9, topicRefs: ["topic-x"],
    evidence: [{ sessionId: WA_SESSION, turnId: first._id, quote: PLANT }] };
  const pubClaim: Row = { _id: "claim-pub", tenantId, text: PUBLIC_TEXT, status: "verified", evidence: [{ sessionId: PUB_SESSION, turnId: pubTurn._id, quote: PUBLIC_TEXT }] };
  const waChunk: Row = { _id: "chunk-wa", tenantId, sourceRef: WA_SESSION, turnRefs: [first._id, sibling._id], text: `${PLANT} ${PLANT_SIBLING}`,
    chunkIndex: 0, vector: [1, 0], embeddingModel: "m" };
  const pubChunk: Row = { _id: "chunk-pub", tenantId, sourceRef: PUB_SESSION, turnRefs: [pubTurn._id], text: PUBLIC_TEXT, chunkIndex: 0, vector: [0, 1], embeddingModel: "m" };
  const treeRoot: TreeIndexRootDocument & { _id: string } = { _id: `tenant:${tenantId}`, node_id: `tenant:${tenantId}`, tenantId, title: `PLANT tree ${PLANT}`, level: "tenant",
    summary: `${PLANT} ${PUBLIC_TEXT}`, children: [
      { node_id: `tenant:${tenantId}/session:${WA_SESSION}`, level: "session", title: "PRIVATE group title", summary: PLANT, children: [], evidence: { sessionRef: WA_SESSION } },
      { node_id: `tenant:${tenantId}/session:${PUB_SESSION}`, level: "session", title: "Public session", summary: PUBLIC_TEXT, children: [], evidence: { sessionRef: PUB_SESSION } },
    ] } as never;
  const data: Record<string, Row[]> = {
    sources: [source as never, pubSource],
    sessions: [session as never, pubSession as never],
    turns: [first as never, sibling as never, pubTurn as never],
    whatsapp_candidates: [candidate as never, ...(others as never[])],
    claims: [oldClaim, pubClaim, ...(approvedClaim ? [approvedClaim] : [])],
    chunks: [waChunk, pubChunk],
    session_pages: [
      { _id: "page-wa", tenantId, sessionId: WA_SESSION, summary: PLANT, keyInsights: [PLANT], decisions: [], actionItems: [], evidence: [{ sessionId: WA_SESSION, turnId: first._id }] },
      { _id: "page-pub", tenantId, sessionId: PUB_SESSION, summary: PUBLIC_TEXT, keyInsights: [], decisions: [], actionItems: [], evidence: [{ sessionId: PUB_SESSION, turnId: pubTurn._id }] }],
    tree_index: [treeRoot as never],
    graph_edges: [{ _id: "edge-wa", tenantId, sessionRef: WA_SESSION, from: "person:a", to: "topic:b", relation: "mentions", evidence: [{ sessionId: WA_SESSION, turnId: first._id }] }],
    whatsapp_review_log: [],
    transcript_reviews: [],
  };
  const db = memoryDb(data);
  return { tenantId, data, db, first, sibling, source, session, candidate, pubTurn, pubSession, treeRoot, approved: state === "approved" };
}

/** True when `value` serialises with a planted marker; `allowApproved` permits only the approved first-turn text (never the sibling or the title). */
export function leaks(value: unknown, opts: { allowApprovedText?: boolean } = {}): string[] {
  const text = JSON.stringify(value ?? null) ?? "";
  const markers = [PLANT_SIBLING, "UNREVIEWEDOCELOT", "PRIVATE group title", "PRIVATE person", ...(opts.allowApprovedText ? [] : ["PLANTZEBRA"])];
  return markers.filter(m => text.includes(m));
}
