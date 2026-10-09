/**
 * apps/api/src/fixtures.ts — shared test fakes (C7: "tests use fakes for these" — treeSearch,
 * provider `complete`, `scoreFn`, key/tree stores). Not a `*.test.ts` file itself; imported by
 * them so every test file builds `ServerDeps` the same honest way.
 */
import type { CompleteResult } from "@lkb/ai";
import type { EvalRuns, TreeIndexNode, WatchedSources } from "@lkb/core";
import type { AskV2Deps } from "@lkb/ask";
import type { ApiKeyStore, VerifiedKey } from "./auth.js";
import type { TreeStore } from "./routes/ask.js";
import type { EvalRunStore } from "./routes/compete.js";
import { randomUUID } from "node:crypto";
import type { WatchedSourceDeps } from "./routes/watched-sources.js";
import type { BrainReadDeps, SessionDetail } from "./routes/brain.js";
import type { Citation, CitationsDeps } from "./routes/citations.js";
import type { HealthDeps, HealthReport } from "./routes/health.js";
import type { SearchDeps, SearchHit } from "./routes/search.js";
import type { GraphReadDeps } from "./routes/graph.js";
import type { CalendarReadDeps, UpcomingMeeting } from "./routes/calendar.js";
import type { MeetingCandidate, MeetingCandidatesDeps } from "./routes/meeting-candidates.js";
import type { WhatsAppGroup, WhatsAppIngestResult, WhatsAppRouteDeps } from "./routes/whatsapp.js";
import type { ApiKeySummary, KeysDeps } from "./routes/keys.js";
import type { IngestDeps } from "./routes/ingest.js";
import type { ServerDeps } from "./server.js";

export const FIXTURE_TREE: TreeIndexNode = {
  node_id: "tenant-1",
  title: "Tenant Root",
  level: "tenant",
  summary: "root",
  children: [
    { node_id: "n1", title: "Topic One", level: "topic", summary: "everything about topic one", children: [] },
  ],
};

export function fakeKeyStore(keys: Record<string, VerifiedKey | undefined>): ApiKeyStore {
  return { verify: async (key) => keys[key] ?? null };
}

export function fakeTreeStore(tree: TreeIndexNode | null = FIXTURE_TREE): TreeStore {
  return { load: async () => tree };
}

function flatten(node: TreeIndexNode): TreeIndexNode[] {
  return [node, ...node.children.flatMap(flatten)];
}

/** A fake `NodeSearchFn` — deliberately reimplemented, not `@lkb/index`'s `treeSearch`, so the
 * route's injection seam is what's under test, independent of the real implementation. */
export const fakeTreeSearchFn = (tree: TreeIndexNode, nodeIds: string[]): TreeIndexNode[] =>
  flatten(tree).filter((n) => nodeIds.includes(n.node_id));

function completion(text: string, json?: unknown): CompleteResult {
  return { text, json, usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake-1", costUsd: 0 };
}

/** Always resolves node `n1` and answers with a fixed string — enough to exercise a full
 * `askV2` "correct verdict, no refine, no web" happy path end to end. */
export const fakeComplete: AskV2Deps["complete"] = async (job) => {
  if (job.kind === "ask.select_nodes") return completion("", { node_ids: ["n1"] });
  return completion("This is the fake answer.");
};

export const fakeScoreFn: AskV2Deps["scoreFn"] = () => [0.9, "fixture: always scores above upper threshold"];

export function fakeAskDeps(): Omit<AskV2Deps, "tenantId"> {
  return {
    complete: fakeComplete,
    scoreFn: fakeScoreFn,
    treeSearchFn: fakeTreeSearchFn,
    write: async () => {},
  };
}

/** An in-memory `EvalRunStore` — tests never touch Mongo. `_rows` is exposed for assertions. */
export function fakeEvalRunStore(): EvalRunStore & { _rows: Map<string, EvalRuns> } {
  const rows = new Map<string, EvalRuns>();
  return {
    _rows: rows,
    async create(tenantId, doc) {
      const row = { ...doc, tenantId } as EvalRuns;
      rows.set(row._id, row);
    },
    async recordScore(tenantId, id, update) {
      const row = rows.get(id);
      if (!row || row.tenantId !== tenantId) return false;
      rows.set(id, { ...row, counsellorAnswer: update.counsellorAnswer, score: update.score });
      return true;
    },
  };
}

/** An in-memory `BrainReadDeps` — tests never touch Mongo. Seeded with one fixture session so
 * both the list and detail routes have something real to return by default. */
export function fakeBrainReadDeps(overrides: Partial<BrainReadDeps> = {}): BrainReadDeps {
  const fixtureDetail: SessionDetail = {
    session: {
      _id: "session-1", tenantId: "tenant-1", sourceId: "source-1", title: "Fixture Session",
      date: "2026-01-15", status: { transcribe: "done", index: "done" },
    },
    page: { _id: "page-1", tenantId: "tenant-1", sessionId: "session-1", summary: "A fixture summary.", evidence: [{ turnId: "t1", sessionId: "session-1" }] },
    claims: [{ _id: "claim-1", tenantId: "tenant-1", text: "A fixture claim.", status: "verified", evidence: [{ turnId: "t1", sessionId: "session-1" }] }],
    turns: [{ _id: "t1", tenantId: "tenant-1", sessionId: "session-1", speakerRef: "spk:0", tStart: 0, tEnd: 5, text: "Hello." }],
  };
  return {
    listSessions: async () => [fixtureDetail.session],
    getSessionDetail: async (_tenantId, id) => (id === "session-1" ? fixtureDetail : null),
    listSources: async () => [],
    listGaps: async () => [],
    ...overrides,
  };
}

/** An in-memory `CitationsDeps` — tests never touch Mongo. Shares `claim-1`/`t1`/`session-1`
 * with `fakeBrainReadDeps`' fixture so a test can cross-check the same ids resolve consistently
 * from both routes. */
/**
 * In-memory watched sources, partitioned BY TENANT — not one shared array. A fake that ignores
 * tenantId cannot fail the isolation test, and isolation is the property most worth testing on a
 * route that stores outbound fetch targets.
 */
export function fakeWatchedSourceDeps(
  overrides: Partial<WatchedSourceDeps> = {},
  ranFor: string[] = [],
): WatchedSourceDeps {
  const byTenant = new Map<string, WatchedSources[]>();
  return {
    create: async (tenantId, doc) => {
      const list = byTenant.get(tenantId) ?? [];
      list.push({ ...doc, tenantId } as WatchedSources);
      byTenant.set(tenantId, list);
    },
    listActive: async (tenantId) => (byTenant.get(tenantId) ?? []).filter((s) => s.active),
    // ISS-C-UNRUN-WRITERS-018: this fake took NO argument, so a handler that ran the wrong
    // tenant's sources -- or no tenant at all -- passed every test. It records what it was given.
    run: async (tenantId) => {
      ranFor.push(tenantId);
      return { checked: 0, changed: 0, skipped: 0, failed: [], remaining: 0 };
    },
    ...overrides,
  };
}

export function fakeCitationsDeps(overrides: Partial<CitationsDeps> = {}): CitationsDeps {
  const fixtureCitation: Citation = {
    claim: { _id: "claim-1", tenantId: "tenant-1", text: "A fixture claim.", status: "verified", evidence: [{ turnId: "t1", sessionId: "session-1" }] },
    evidence: [{
      turnId: "t1", sessionId: "session-1",
      turn: { _id: "t1", tenantId: "tenant-1", sessionId: "session-1", speakerRef: "spk:0", tStart: 0, tEnd: 5, text: "Hello." },
      session: { _id: "session-1", tenantId: "tenant-1", sourceId: "source-1", title: "Fixture Session", date: "2026-01-15", status: { transcribe: "done", index: "done" } },
    }],
  };
  return {
    getCitation: async (_tenantId, claimId) => (claimId === "claim-1" ? fixtureCitation : null),
    ...overrides,
  };
}

/** An in-memory `HealthDeps` — tests never touch Mongo. Defaults to a healthy report with two
 * fixture collection counts. */
export function fakeHealthDeps(overrides: Partial<HealthDeps> = {}): HealthDeps {
  const healthy: HealthReport = { db: "ok", collections: { sessions: 1, claims: 1 } };
  return {
    checkHealth: async () => healthy,
    ...overrides,
  };
}

/** An in-memory `SearchDeps` — tests never touch Mongo. Returns one fixture hit for the query
 * "hello" (matching `fakeBrainReadDeps`' turn `t1`/"Hello."), none otherwise. */
export function fakeSearchDeps(overrides: Partial<SearchDeps> = {}): SearchDeps {
  const fixtureHit: SearchHit = {
    turnId: "t1", sessionId: "session-1", score: 1,
    turn: { _id: "t1", tenantId: "tenant-1", sessionId: "session-1", speakerRef: "spk:0", tStart: 0, tEnd: 5, text: "Hello." },
    session: { _id: "session-1", tenantId: "tenant-1", sourceId: "source-1", title: "Fixture Session", date: "2026-01-15", status: { transcribe: "done", index: "done" } },
  };
  return {
    search: async (_tenantId, query) => (query.toLowerCase().includes("hello") ? [fixtureHit] : []),
    ...overrides,
  };
}

/** An in-memory `GraphReadDeps` — tests never touch Mongo. Carries one node from EACH source
 * (a `tree_index` session/topic pair and a `graph_edges` person edge) plus the `stats` block, so
 * the union shape U-BRAIN put on the wire is exercised by the default fixture, and both the
 * empty-graph and non-empty-graph shapes stay reachable. */
export function fakeGraphReadDeps(overrides: Partial<GraphReadDeps> = {}): GraphReadDeps {
  return {
    loadGraph: async (tenantId) =>
      tenantId === "tenant-1"
        ? {
            nodes: [
              { id: "session:session-1", label: "Fixture Session", kind: "session", ref: "session-1", sources: ["tree_index"] },
              { id: "topic:visas", label: "Visas", kind: "topic", ref: "visas", sources: ["tree_index"] },
              { id: "person:anita", label: "Anita", kind: "person", ref: "anita", sources: ["graph_edges"] },
            ],
            edges: [
              { source: "session:session-1", target: "topic:visas", type: "session-topic", inferred: false, origin: "tree_index" },
              { source: "person:anita", target: "session:session-1", type: "spoke_in", inferred: false, confidence: 1, sessionRef: "session-1", evidence: [{ turnId: "t1", sessionId: "session-1" }], origin: "graph_edges" },
            ],
            stats: { sessionsTotal: 1, sessionsInGraph: 1, sessionsMissing: [], edgeSources: { treeIndex: 1, entityEdges: 1 } },
          }
        : null,
    ...overrides,
  };
}

/** An in-memory `CalendarReadDeps` — tests never shell out to `gws`. One fixture meeting by
 * default so both the populated and (via override) empty shapes are reachable. */
export function fakeCalendarReadDeps(overrides: Partial<CalendarReadDeps> = {}): CalendarReadDeps {
  const fixtureMeeting: UpcomingMeeting = {
    id: "evt-1", title: "Fixture Sync", startTime: "2026-09-05T10:00:00.000Z",
    endTime: "2026-09-05T10:30:00.000Z", meetingUrl: "https://meet.google.com/fixture", organizer: "umeshsugara@vidysea.com",
  };
  return {
    listUpcoming: async () => [fixtureMeeting],
    ...overrides,
  };
}

/** Tenant-isolated fixture; `_rows`/`_trust` alias tenant-1 for existing single-tenant tests. */
export function fakeMeetingCandidatesDeps(overrides: Partial<MeetingCandidatesDeps> = {}): MeetingCandidatesDeps & {
  _rows: Map<string, MeetingCandidate>; _trust: Map<string, number>; _rowsFor(tenantId: string): Map<string, MeetingCandidate>; _trustFor(tenantId: string): Map<string, number>;
} {
  const rowsByTenant = new Map<string, Map<string, MeetingCandidate>>(), trustByTenant = new Map<string, Map<string, number>>();
  function scopedMap<T>(maps: Map<string, Map<string, T>>, tenantId: string): Map<string, T> {
    if (!maps.has(tenantId)) maps.set(tenantId, new Map<string, T>()); return maps.get(tenantId)!;
  }
  const rowsFor = (tenantId: string) => scopedMap(rowsByTenant, tenantId), trustFor = (tenantId: string) => scopedMap(trustByTenant, tenantId);
  return {
    _rows: rowsFor("tenant-1"), _trust: trustFor("tenant-1"), _rowsFor: rowsFor, _trustFor: trustFor,
    async scanGmail() { return { created: 0, autoApproved: 0 }; },
    async listCandidates(tenantId) { return [...rowsFor(tenantId).values()]; },
    async approve(tenantId, id) {
      const row = rowsFor(tenantId).get(id), trust = trustFor(tenantId);
      if (!row || row.status !== "pending") return false;
      row.status = "approved";
      row.decidedAt = new Date().toISOString();
      trust.set(row.senderDomain, (trust.get(row.senderDomain) ?? 0) + 1);
      return true;
    },
    async reject(tenantId, id) {
      const row = rowsFor(tenantId).get(id);
      if (!row || row.status !== "pending") return false;
      row.status = "rejected";
      row.decidedAt = new Date().toISOString();
      return true;
    },
    ...overrides,
  };
}

/** A REAL in-memory `WhatsAppRouteDeps` — tests never touch either Mongo. Overridable per-test
 * so a failure path (a real fetch/adapter error) can be exercised too. */
export function fakeWhatsAppDeps(overrides: Partial<WhatsAppRouteDeps> = {}): WhatsAppRouteDeps {
  const fixtureGroups: WhatsAppGroup[] = [
    { groupJid: "g1@g.us", ownerUserId: "u1", subject: "Fixture Group", trackedPersonCount: 2 },
  ];
  const fixtureResult: WhatsAppIngestResult = { sessionId: "fake-wa-session", sourceId: "fake-wa-source", turnCount: 3 };
  return {
    async listGroups() { return fixtureGroups; },
    async ingestGroup(_tenantId, _groupJid) { return fixtureResult; },
    ...overrides,
  };
}

/** A REAL in-memory `KeysDeps` (not read-only like the fakes above — create/list/revoke must
 * stay consistent within one test, matching what the real Mongo-backed impl guarantees). Never
 * exposes a raw key or hash from `listKeys`, same as the production implementation. */
export function fakeKeysDeps(): KeysDeps & { _raw: Map<string, { tenantId: string; label: string; scopes: string[]; createdAt: string; revokedAt: string | null }> } {
  const rows = new Map<string, { tenantId: string; label: string; scopes: string[]; createdAt: string; revokedAt: string | null }>();
  return {
    _raw: rows,
    async listKeys(tenantId): Promise<ApiKeySummary[]> {
      return [...rows.entries()]
        .filter(([, r]) => r.tenantId === tenantId)
        .map(([_id, r]) => ({ _id, label: r.label, scopes: r.scopes, createdAt: r.createdAt, revokedAt: r.revokedAt }));
    },
    async createKey(tenantId, label, scopes) {
      const id = randomUUID();
      rows.set(id, { tenantId, label, scopes, createdAt: new Date().toISOString(), revokedAt: null });
      return { id, rawKey: `fake_${id}` };
    },
    async revokeKey(tenantId, id) {
      const row = rows.get(id);
      if (!row || row.tenantId !== tenantId || row.revokedAt) return false;
      row.revokedAt = new Date().toISOString();
      return true;
    },
  };
}

/** A REAL in-memory `IngestDeps` — tests never touch Mongo or a real network fetch. Overridable
 * per-test so a failure path (a real fetch/adapter error) can be exercised too. */
export function fakeIngestDeps(overrides: Partial<IngestDeps> = {}): IngestDeps {
  return {
    async ingestUrl(_tenantId, url) {
      return { sessionId: `fake-session-for-${url}`, sourceId: `fake-source-for-${url}`, turnCount: 3 };
    },
    ...overrides,
  };
}

export function buildTestDeps(overrides: Partial<ServerDeps> = {}): ServerDeps {
  return {
    keyStore: fakeKeyStore({ "good-ask-key": { tenantId: "tenant-1", scopes: ["ask"] } }),
    ask: { tree: fakeTreeStore(), askDeps: fakeAskDeps() },
    evalRuns: fakeEvalRunStore(),
    brain: fakeBrainReadDeps(),
    citations: fakeCitationsDeps(),
    health: fakeHealthDeps(),
    search: fakeSearchDeps(),
    graph: fakeGraphReadDeps(),
    calendar: fakeCalendarReadDeps(),
    meetingCandidates: fakeMeetingCandidatesDeps(),
    whatsapp: fakeWhatsAppDeps(),
    keys: fakeKeysDeps(),
    ingest: fakeIngestDeps(),
    watchedSources: fakeWatchedSourceDeps(),
    ...overrides,
  };
}
