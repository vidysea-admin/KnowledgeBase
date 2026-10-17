import type { Db } from "mongodb";
import type { Turns } from "@lkb/core";
import type { BrainReadDeps } from "../routes/brain.js";
import { trustedBrainReads } from "../composition/integrations/trusted-readers.js";
import { headId } from "../transcript-review/store.js";

type Row = Record<string, unknown>;
type Filter = Record<string, unknown>;
function values(row: unknown, parts: string[]): unknown[] {
  if (Array.isArray(row)) return row.flatMap((item) => values(item, parts));
  if (!parts.length) return [row];
  if (!row || typeof row !== "object") return [undefined];
  return values((row as Row)[parts[0]!], parts.slice(1));
}
function matches(row: Row, filter: Filter): boolean {
  return Object.entries(filter).every(([key, want]) => {
    const found = values(row, key.split("."));
    if (want && typeof want === "object" && "$in" in want) return found.some((v) => (want as { $in: unknown[] }).$in.includes(v));
    if (key === "evidence" && want && typeof want === "object" && "$not" in want) {
      const other = (want as { $not: { $elemMatch: { sessionId: { $ne: string } } } }).$not.$elemMatch.sessionId.$ne;
      return (row.evidence as Row[]).every((e) => e.sessionId === other);
    }
    return found.some((v) => v === want);
  });
}

/** In-memory Mongo behavior, including predicates, immutable snapshots and unique IDs. */
export function memoryDecisionFixture(input: Turns[], sourceKind = "recording") {
  const tables = new Map<string, Row[]>(), queries: Array<{ name: string; op: string; filter: Filter; snapshot?: boolean }> = [];
  const table = (name: string): Row[] => { if (!tables.has(name)) tables.set(name, []); return tables.get(name)!; };
  const first = input[0]!;
  table("turns").push(...structuredClone(input));
  table("sessions").push({ _id: first.sessionId, tenantId: first.tenantId, sourceId: "source-fixture", title: "Fixture session",
    date: "2026-10-14", status: { transcribe: "done", index: "done" } });
  table("sources").push({ _id: "source-fixture", tenantId: first.tenantId, kind: sourceKind, path: "fixture", captureMode: "provided", createdAt: "2026-10-14T00:00:00Z" });
  let hook: ((name: string, op: string, filter: Filter) => void | Promise<void>) | undefined;
  let snapshotAvailable = true;
  /** Test-only session model: captures all tables at first read. Not real Mongo MVCC proof. */
  class FixtureSession {
    private captured: Map<string, Row[]> | null = null;
    active = false; ended = false;
    rows(name: string) {
      if (!this.active || this.ended) throw new Error("fixture snapshot session inactive");
      this.captured ??= structuredClone(tables);
      return this.captured.get(name) ?? [];
    }
    async withTransaction<T>(run: () => Promise<T>, options: { readConcern?: { level?: string } }) {
      if (options.readConcern?.level !== "snapshot") throw new Error("fixture requires snapshot read concern");
      this.active = true;
      try { return await run(); } finally { this.active = false; }
    }
    inTransaction() { return this.active; }
    async abortTransaction() { this.active = false; }
    async endSession() { this.active = false; this.ended = true; }
  }
  const sessions: FixtureSession[] = [];
  const read = async (name: string, op: string, filter: Filter, options: { session?: unknown } = {}) => {
    if (options.session !== undefined && !(options.session instanceof FixtureSession)) throw new Error("foreign fixture session");
    queries.push({ name, op, filter: structuredClone(filter), snapshot: options.session instanceof FixtureSession }); await hook?.(name, op, filter);
    const rows = options.session instanceof FixtureSession ? options.session.rows(name) : table(name);
    return structuredClone(rows.filter((row) => matches(row, filter)));
  };
  const db = { client: { startSession(options: { causalConsistency?: boolean }) {
    if (!snapshotAvailable || options.causalConsistency !== false) throw new Error("fixture snapshot unavailable");
    const session = new FixtureSession(); sessions.push(session); return session;
  } }, collection(name: string) { return {
    find(filter: Filter, options: { session?: unknown } = {}) { return { toArray: () => read(name, "find", filter, options) }; },
    async findOne(filter: Filter, options: { session?: unknown } = {}) { return (await read(name, "findOne", filter, options))[0] ?? null; },
    async updateOne(filter: Filter, update: { $setOnInsert?: Row; $set?: Row }, options: { upsert?: boolean }) {
      queries.push({ name, op: "updateOne", filter: structuredClone(filter) });
      const old = table(name).find((row) => matches(row, filter));
      if (old) { if (update.$set) Object.assign(old, structuredClone(update.$set)); }
      else if (options.upsert) {
        const doc = structuredClone(update.$setOnInsert ?? update.$set!);
        if (table(name).some((row) => row._id === doc._id)) throw new Error("duplicate key");
        table(name).push(doc);
      }
      return {};
    },
    async deleteMany(filter: Filter) {
      queries.push({ name, op: "deleteMany", filter: structuredClone(filter) });
      tables.set(name, table(name).filter((row) => !matches(row, filter))); return {};
    },
  }; } } as unknown as Db;
  const base: BrainReadDeps = {
    async getSessionDetail(tenantId, sessionId) {
      const session = (await db.collection<Row & { _id: string }>("sessions").findOne({ tenantId, _id: sessionId }));
      if (!session) return null;
      return { session, page: null, claims: [], turns: await db.collection<Turns>("turns").find({ tenantId, sessionId }).toArray() } as never;
    },
    listSessions: async () => [], listSources: async () => [], listGaps: async () => [],
  };
  const brain = trustedBrainReads(base, () => db);
  return { db, brain, table, queries, sessions, setSnapshotAvailable: (available: boolean) => { snapshotAvailable = available; }, setHook: (next: typeof hook) => { hook = next; },
    overlay(turnId: string, text: string, speakerRef = "expert") {
      tables.set("transcript_reviews", [{ _id: headId(first.tenantId, first.sessionId), tenantId: first.tenantId, sessionId: first.sessionId,
        revision: "reviewed-r1", parentRevision: "base", overlay: [{ turnId, text, speakerRef }],
        audit: { actorRef: "reviewer", reviewedAt: "2026-10-14T00:00:00Z", reason: "Privacy", changes: [] },
        refresh: { status: "complete", revision: "reviewed-r1", targets: [], completed: [] }, committedAt: "2026-10-14T00:00:00Z" }]);
    },
  };
}

export const decisionTurns: Turns[] = [
  { _id: "opening", tenantId: "tenant-a", sessionId: "decision-session", speakerRef: "expert", text: "Should we ship Friday?", tStart: 0, tEnd: 3 },
  { _id: "choice", tenantId: "tenant-a", sessionId: "decision-session", speakerRef: "expert", text: "We will ship Friday.", tStart: 3, tEnd: 6 },
  { _id: "agreement", tenantId: "tenant-a", sessionId: "decision-session", speakerRef: "chair", text: "Agreed.", tStart: 6, tEnd: 7 },
];
