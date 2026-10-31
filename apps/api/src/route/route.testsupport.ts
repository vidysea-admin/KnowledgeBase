/**
 * apps/api/src/route/route.testsupport.ts - D-206 /route test fixtures: a synthetic PageIndex tree shaped like the live
 * corpus (22 sessions, 110 topics), deterministic turns, and an in-memory Mongo handle that APPLIES filters (so tenant
 * and id scoping are falsifiable). Not a test file; never touches a real database or provider.
 */
import type { TreeIndexNode } from "@lkb/core";
import { project } from "../search-cache/search-fixture.testsupport.js";

export const NATURAL_QUESTIONS = [
  { q: "cost of living in Toronto for students", session: "s01" },
  { q: "IELTS requirement for UK masters", session: "s02" },
  { q: "best universities in Canada", session: "s03" },
  { q: "visa requirements for Germany", session: "s04" },
] as const;

const NAMED: { title: string; topics: string[]; line: string }[] = [
  { title: "Cost of Living in Canada: Toronto, Vancouver, Montreal", line: "The cost of living in Toronto for a student is about 1500 dollars a month, and rent is the largest part.",
    topics: ["Toronto rent and accommodation costs", "Groceries and transport in Toronto", "Student budget in Canada", "Part-time work in Canada", "Health insurance for students"] },
  { title: "UK Masters: IELTS and Admissions", line: "For UK masters most universities ask IELTS 6.5 overall with no band below 6.",
    topics: ["IELTS requirement for UK masters", "UCAS and postgraduate applications", "UK tuition fees", "Personal statement advice", "Scholarships in the UK"] },
  { title: "Best Universities in Canada", line: "The best universities in Canada for engineering are Toronto, Waterloo, UBC and McGill.",
    topics: ["University of Toronto and McGill", "UBC and Waterloo programs", "Canada university rankings", "Co-op programs", "Canada admission deadlines"] },
  { title: "Visa Blueprint: Germany", line: "The Germany student visa requires a blocked account with 11904 euros and health insurance.",
    topics: ["Germany student visa requirements", "Blocked account for Germany", "German language requirement", "Tuition free universities in Germany", "Health insurance in Germany"] },
];
const FILL_PLACES = ["USA UC System", "Australia Go8", "New Zealand pathways", "Ireland Dublin colleges", "France business schools", "Italy scholarships", "Singapore NUS NTU",
  "GRE preparation", "GMAT strategy", "SAT and ACT", "Education loans and forex", "AI in counselling", "Statement of purpose writing", "Recommendation letters",
  "Internships and placements", "Dubai campuses", "Netherlands programs", "Study gap explained"];
const WORDS = ["panel", "counsellor", "question", "session", "timeline", "document", "checklist", "profile", "college", "decision", "student", "parents", "planning", "update"];

export interface SynthOpts { tenantId?: string; turnsPerSession?: number }
export const sessionIdOf = (i: number): string => `s${String(i + 1).padStart(2, "0")}`;

function rng(seed: number): () => number { let s = seed; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; }

/** 22 sessions x 5 topics = 110 topic nodes, tenant -> year -> month -> session -> topic (the shape `buildTree` produces). */
export function syntheticTree(opts: SynthOpts = {}): TreeIndexNode {
  const tenantId = opts.tenantId ?? "toc";
  const sessions: TreeIndexNode[] = [];
  const all = [...NAMED.map((n) => n.title), ...FILL_PLACES.map((p) => `Webinar: ${p}`)];
  all.forEach((title, i) => {
    const id = sessionIdOf(i), topics = i < NAMED.length ? NAMED[i]!.topics : [1, 2, 3, 4, 5].map((n) => `${FILL_PLACES[i - NAMED.length]} part ${n}`);
    const node_id = `${tenantId}/year:2026/month:03/session:${id}`;
    sessions.push({ node_id, title, level: "session", summary: `${title}. ${topics.join(". ")}.`, evidence: { sessionRef: id },
      children: topics.map((t, n) => ({ node_id: `${node_id}/topic:${n}`, title: t, level: "topic" as const, summary: "", evidence: { sessionRef: id, sessionRefs: [id] }, children: [] })) });
  });
  return { node_id: `tenant:${tenantId}`, tenantId, title: tenantId, level: "tenant", summary: "", children: [{ node_id: `${tenantId}/year:2026`, title: "2026", level: "year", summary: "",
    children: [{ node_id: `${tenantId}/year:2026/month:03`, title: "03", level: "month", summary: "", children: sessions }] }] } as TreeIndexNode;
}

export function syntheticTurns(opts: SynthOpts = {}): Record<string, unknown>[] {
  const tenantId = opts.tenantId ?? "toc", per = opts.turnsPerSession ?? 140, rows: Record<string, unknown>[] = [];
  for (let i = 0; i < 22; i++) {
    const r = rng(i + 7), sid = sessionIdOf(i);
    for (let n = 0; n < per; n++) {
      const text = n === 3 && i < NAMED.length ? NAMED[i]!.line
        : Array.from({ length: 12 }, () => WORDS[Math.floor(r() * WORDS.length)]).join(" ") + ` ${i < NAMED.length ? "" : FILL_PLACES[i - NAMED.length]!.split(" ")[0]}.`;
      rows.push({ _id: `${tenantId}-${sid}-t${n}`, tenantId, sessionId: sid, speakerRef: "spk:0", tStart: n, tEnd: n + 1, text });
    }
  }
  return rows;
}

/** D-208 route_index fault injection: `read` fails/hangs every route_index read, `write` fails every route_index write. */
export interface RouteIndexFaults { read?: "fail" | "hang"; write?: "fail" }
export interface FakeDbOpts extends SynthOpts { failed?: string[]; withdrawn?: string[]; extra?: Record<string, Record<string, unknown>[]>; routeIndex?: RouteIndexFaults }
function matches(filter: Record<string, unknown>, doc: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === "$or") return (cond as Record<string, unknown>[]).some((b) => matches(b, doc));
    const v = doc[key];
    if (cond && typeof cond === "object" && "$in" in (cond as object)) return ((cond as { $in: unknown[] }).$in).includes(v);
    if (cond && typeof cond === "object" && "$regex" in (cond as object)) { const c = cond as { $regex: string; $options?: string }; return typeof v === "string" && new RegExp(c.$regex, c.$options).test(v); }
    return v === cond;
  });
}
/** Two tenants live in the same fake db (`toc` and `other`) so an unscoped query is DETECTABLE. */
export function fakeRouteDb(opts: FakeDbOpts = {}) {
  const calls: { coll: string; filter: Record<string, unknown>; options?: Record<string, unknown>; op?: string }[] = [];
  const faults: RouteIndexFaults = { ...opts.routeIndex };
  const data: Record<string, Record<string, unknown>[]> = { sessions: [], sources: [], turns: [], transcript_reviews: [], whatsapp_candidates: [], tree_index: [], route_index: [], ...opts.extra };
  for (const tenantId of ["toc", "other"]) {
    for (let i = 0; i < 22; i++) {
      const sid = sessionIdOf(i), full = `${tenantId}:${sid}`;
      data.sessions!.push({ _id: sid, tenantId, sourceId: `src-${full}`, title: `T${i}`, date: "2026-03-01", status: { transcribe: "done", index: opts.failed?.includes(sid) ? "failed" : "done" } });
      data.sources!.push({ _id: `src-${full}`, tenantId, kind: "recording", path: `x/${full}`, consent: opts.withdrawn?.includes(sid) ? { given: false } : { given: true } });
    }
    data.turns!.push(...syntheticTurns({ ...opts, tenantId }));
  }
  const db = { collection: (coll: string) => ({
    // Honours `projection` (ISS-425) and records the options of every read (maxTimeMS, ISS-427).
    find: (filter: Record<string, unknown>, options?: Record<string, unknown>) => {
      calls.push({ coll, filter, ...(options ? { options } : {}) });
      let limit = Number.POSITIVE_INFINITY;
      const cursor = { limit(n: number) { limit = n; return cursor; }, toArray: async () => structuredClone((data[coll] ?? []).filter((d) => matches(filter, d)).slice(0, limit).map((d) => project(d, options?.projection as Record<string, unknown> | undefined))) };
      return cursor;
    },
    findOne: async (filter: Record<string, unknown>, options?: Record<string, unknown>) => {
      calls.push({ coll, filter, ...(options ? { options } : {}) });
      if (coll === "route_index" && faults.read === "fail") throw new Error("route_index read failed");
      if (coll === "route_index" && faults.read === "hang") return new Promise<never>(() => undefined);
      const found = (data[coll] ?? []).find((d) => matches(filter, d));
      return structuredClone(found ? project(found, options?.projection as Record<string, unknown> | undefined) : null);
    },
    /** Applies the filter and honours `upsert` (the inserted document is the replacement, as Mongo does for a replacement upsert). */
    replaceOne: async (filter: Record<string, unknown>, replacement: Record<string, unknown>, options?: { upsert?: boolean }) => {
      calls.push({ coll, filter, op: "replaceOne", ...(options ? { options: options as Record<string, unknown> } : {}) });
      if (coll === "route_index" && faults.write === "fail") throw new Error("route_index write failed");
      const rows = (data[coll] ??= []), at = rows.findIndex((d) => matches(filter, d));
      if (at >= 0) rows[at] = structuredClone({ _id: rows[at]!._id, ...replacement });
      else if (options?.upsert) rows.push(structuredClone(replacement));
      return { matchedCount: at >= 0 ? 1 : 0, modifiedCount: at >= 0 ? 1 : 0, upsertedCount: at >= 0 || !options?.upsert ? 0 : 1 };
    },
  }) };
  return { db: db as never, calls, data, faults };
}

/** ISS-WARLG-001: link states a `whatsapp_links` row can be in after a live link goes away (revoked/unlinked/rejected carry `live` false, suspended keeps `live` true by `isLiveLinkState`). */
export const WA_LINK_ID = "link-wa";
export type WaLinkKind = "live" | "revoked" | "unlinked" | "rejected" | "suspended";
export const WA_DEAD_LINKS: readonly WaLinkKind[] = ["revoked", "unlinked", "rejected", "suspended"];
/** Rewires the recording source of `sessionId` (tenant toc) into a WhatsApp source bound to `WA_LINK_ID`, and sets the link row to `kind` (studentData "no" throughout). */
export function setWaLink(data: Record<string, Record<string, unknown>[]>, sessionId: string, kind: WaLinkKind): void {
  const source = data.sources!.find((s) => s._id === `src-toc:${sessionId}`)!;
  Object.assign(source, { kind: "whatsapp-batch", sourceMeta: { whatsappLinkId: WA_LINK_ID } });
  data.whatsapp_links = [{ _id: WA_LINK_ID, tenantId: "toc", state: kind === "live" ? "active" : kind, live: kind === "live" || kind === "suspended", studentData: "no" }];
}
