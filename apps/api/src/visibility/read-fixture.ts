/**
 * apps/api/src/visibility/read-fixture.ts - TEST-ONLY read model for the production knowledge visibility gate.
 *
 * Every transcript reader now goes through `readEffectiveTurns` (a scoped `transcript_reviews.findOne`) and
 * `createKnowledgeVisibility` (scoped `sessions` / `sources` / `turns` `findOne` lookups). Older per-file fakes only
 * modelled `find().toArray()`, so the fail-closed gate correctly refused them. This wraps such a fake with the minimum
 * CONSISTENT state the gate needs, derived from the fake's own turn rows: one consented recording source per
 * (tenant, session), no review head, no WhatsApp provenance. Production code is unchanged; nothing here loosens it.
 * A base collection that already implements `findOne` keeps its own behaviour. Not a test file; imported by tests.
 */
import type { Db } from "mongodb";

type Row = Record<string, unknown>;
const matches = (row: Row, filter: Row): boolean => Object.entries(filter).every(([key, want]) => {
  if (want && typeof want === "object" && !Array.isArray(want)) {
    const ops = want as Row;
    if ("$in" in ops) return (ops.$in as unknown[]).includes(row[key]);
    return false;
  }
  return row[key] === want;
});

/** Sessions and consented recording sources implied by `turns`, one per (tenantId, sessionId). */
export function impliedSessionRows(turns: readonly Row[]): { sessions: Row[]; sources: Row[] } {
  const sessions: Row[] = [], sources: Row[] = [], seen = new Set<string>();
  for (const turn of turns) {
    const tenantId = turn.tenantId, sessionId = turn.sessionId;
    if (typeof tenantId !== "string" || typeof sessionId !== "string") continue;
    const key = JSON.stringify([tenantId, sessionId]);
    if (seen.has(key)) continue;
    seen.add(key);
    const sourceId = `fixture-source:${sessionId}`;
    sessions.push({ _id: sessionId, tenantId, sourceId, title: `Fixture ${sessionId}`, date: "2026-09-07", status: { transcribe: "done", index: "done" } });
    sources.push({ _id: sourceId, tenantId, kind: "recording", path: `fixture/${sessionId}`, consent: { given: true, recordedBy: "fixture" } });
  }
  return { sessions, sources };
}

/**
 * Adds `findOne` for `turns`, `sessions` and `sources` (and `null` for every other collection, e.g. no
 * `transcript_reviews` head) to a fake db whose collections lack it. `turns()` is read lazily so tests that mutate
 * their rows between calls stay consistent. `extra` supplies explicit rows that override the implied ones.
 */
export function withVisibleTranscripts(base: Pick<Db, "collection">, turns: () => readonly Row[],
  extra: { sessions?: Row[]; sources?: Row[] } = {}): Pick<Db, "collection"> {
  const rowsFor = (name: string): readonly Row[] => {
    const all = turns();
    if (name === "turns") return all;
    const implied = impliedSessionRows(all);
    if (name === "sessions") return [...(extra.sessions ?? []), ...implied.sessions];
    if (name === "sources") return [...(extra.sources ?? []), ...implied.sources];
    return [];
  };
  return { collection(name: string) {
    const collection = base.collection(name) as unknown as Row;
    // D-206 K1: the visibility gate fetches raw turns with ONE batched `find({ tenantId, _id: { $in } })`. Older fakes only
    // model `sessionId`-keyed finds, so that one shape is answered from the fixture's own rows; every other find is the fake's.
    const baseFind = collection.find as ((filter: Row) => unknown) | undefined;
    const find = name === "turns" ? (filter: Row = {}) => {
      const ids = (filter._id as { $in?: unknown[] } | undefined)?.$in;
      if (!Array.isArray(ids)) return baseFind?.call(collection, filter);
      const rows = turns().filter(candidate => matches(candidate, filter));
      return { toArray: async () => structuredClone(rows), limit() { return this; } };
    } : baseFind;
    if (typeof collection.findOne === "function") return find === baseFind ? collection : { ...collection, find };
    return { ...collection, ...(find ? { find } : {}), async findOne(filter: Row = {}) {
      const row = rowsFor(name).find(candidate => matches(candidate, filter));
      return row ? structuredClone(row) : null;
    } };
  } } as unknown as Pick<Db, "collection">;
}

/**
 * TEST-ONLY stand-in for a transaction-capable Mongo client, so `withKnowledgeReadSnapshot` and manual
 * `startTransaction` publishers can run over an in-memory fake. Bodies run exactly once and writes apply directly:
 * it models no isolation or rollback, which these single-threaded tenant-scope fakes do not assert on.
 */
export function fakeSnapshotClient() {
  return { startSession: () => {
    let active = false;
    return {
      startTransaction: () => { active = true; }, inTransaction: () => active,
      commitTransaction: async () => { active = false; }, abortTransaction: async () => { active = false; },
      withTransaction: async <T>(run: () => Promise<T>): Promise<T> => { active = true; try { return await run(); } finally { active = false; } },
      endSession: async () => { active = false; },
    };
  } } as unknown as Db["client"];
}
