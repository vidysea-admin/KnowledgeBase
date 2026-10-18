/** In-memory transactional Mongo driver fixture; never connects to any database. */
import type { Db, ClientSession } from "mongodb";
import type { Turns } from "@lkb/core";
import type { WhatsAppReviewInput } from "./detection.js";

export const REVIEW_TIME = "2026-10-14T11:00:00.000Z";
export function reviewInput(text: string = "Scholarship closes Friday.", tenantId: string = "tenant-a"): WhatsAppReviewInput {
  return {
    source: { _id: `source-${tenantId}`, tenantId, kind: "whatsapp-batch", path: "group@g.us", consent: { given: true, recordedBy: "test-owner" } } as WhatsAppReviewInput["source"],
    session: { _id: "session-a", tenantId, sourceId: `source-${tenantId}` },
    turns: [{ _id: "turn-a", tenantId, sessionId: "session-a", speakerRef: "person-a", speakerLabel: "Expert",
      text, tStart: 0, tEnd: 0, occurredAt: "2026-10-14T10:00:00.000Z" }],
  };
}

type Row = Record<string, unknown>;
type Filter = Record<string, unknown>;
const valueAt = (row: Row, key: string): unknown => key.split(".").reduce<unknown>((value, part) =>
  value !== null && typeof value === "object" ? (value as Row)[part] : undefined, row);
const setFields = (row: Row, values: Row): void => {
  for (const [key, value] of Object.entries(values)) {
    const parts = key.split("."); let target = row;
    for (const part of parts.slice(0, -1)) target = (target[part] ??= {}) as Row;
    target[parts.at(-1)!] = structuredClone(value);
  }
};
export function reviewMongoFixture(inputs: readonly WhatsAppReviewInput[] = [reviewInput()]) {
  let rows: Record<string, Row[]> = { sources: [], sessions: [], turns: [], whatsapp_candidates: [], published: [] };
  for (const input of inputs) {
    rows.sources!.push(structuredClone(input.source)); rows.sessions!.push(structuredClone(input.session));
    rows.turns!.push(...structuredClone(input.turns) as unknown as Row[]);
  }
  const calls: { collection: string; filter: Filter; session?: unknown; operation: string }[] = [];
  let tail = Promise.resolve();
  // Undo journal for writes made with a session; out-of-session writes (a concurrent committer) survive a rollback.
  let journal: (() => void)[] | null = null;
  let sessionCount = 0; let ended = 0;
  const matches = (row: Row, filter: Filter): boolean => Object.entries(filter).every(([key, value]) => {
    const actual = valueAt(row, key);
    if (value !== null && typeof value === "object" && "$ne" in value && Object.keys(value).length === 1) return actual !== value.$ne;
    // The effective reader selects immutable physical turns with scalar _id:$in.
    // Keep all other fixture predicates on their existing equality path.
    if (value !== null && typeof value === "object" && Object.hasOwn(value, "$in") && "$in" in value && Object.keys(value).length === 1) {
      const operands = value.$in;
      if (Array.isArray(operands) && operands.every(operand => operand === null || ["string", "number", "boolean"].includes(typeof operand))) {
        return operands.some(operand => (actual ?? null) === operand);
      }
    }
    return (actual ?? null) === (value ?? null);
  });
  const db = {
    client: {
      startSession() {
        sessionCount++;
        let active = false;
        const session = {
          inTransaction: () => active,
          async withTransaction<T>(body: () => Promise<T>): Promise<T> {
            let unlock!: () => void;
            const prior = tail; tail = new Promise(resolve => { unlock = resolve; }); await prior;
            const undo: (() => void)[] = []; journal = undo;
            active = true;
            try { return await body(); } catch (error) { for (const step of undo.reverse()) step(); throw error; } finally { active = false; journal = null; unlock(); }
          },
          async endSession() { ended++; },
        };
        return session;
      },
    },
    collection(name: string) {
      if (!rows[name]) rows[name] = [];
      return {
        async findOne(filter: Filter, options: { session?: unknown } = {}) {
          calls.push({ collection: name, filter: structuredClone(filter), session: options.session, operation: "findOne" });
          return structuredClone(rows[name]!.find(row => matches(row, filter)) ?? null);
        },
        find(filter: Filter) {
          calls.push({ collection: name, filter: structuredClone(filter), operation: "find" });
          return { async toArray() { return structuredClone(rows[name]!.filter(row => matches(row, filter))); } };
        },
        async updateOne(filter: Filter, update: { $set?: Row; $setOnInsert?: Row; $inc?: Record<string, number> }, options: { session?: unknown; upsert?: boolean } = {}) {
          calls.push({ collection: name, filter: structuredClone(filter), session: options.session, operation: "updateOne" });
          const row = rows[name]!.find(row => matches(row, filter));
          if (row) {
            if (options.session && journal) { const snapshot = structuredClone(row); journal.push(() => { for (const key of Object.keys(row)) delete row[key]; Object.assign(row, snapshot); }); }
            if (update.$set) setFields(row, update.$set);
            if (update.$inc) setFields(row, Object.fromEntries(Object.entries(update.$inc).map(([k, v]) => [k, (Number(valueAt(row, k)) || 0) + v])));
            return { acknowledged: true, matchedCount: 1, modifiedCount: update.$set || update.$inc ? 1 : 0, upsertedCount: 0 };
          }
          if (options.upsert) { const doc = structuredClone({ ...filter, ...update.$setOnInsert, ...update.$set }); rows[name]!.push(doc); if (options.session && journal) { const list = rows[name]!; journal.push(() => { list.splice(list.indexOf(doc), 1); }); } return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1 }; }
          return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
        },
      };
    },
  } as unknown as Db;
  return {
    db, calls, rows: (name: string) => structuredClone(rows[name] ?? []),
    removeTurn: (id: string) => { rows.turns = rows.turns!.filter(row => row._id !== id); },
    replaceTurn: (row: Turns) => { rows.turns = rows.turns!.filter(old => old._id !== row._id || old.tenantId !== row.tenantId); rows.turns.push(row as unknown as Row); },
    counts: () => ({ sessions: sessionCount, ended }),
    async publish(candidate: { _id: string; tenantId: string; text: string }, session: ClientSession) {
      await db.collection<{ _id: string; tenantId: string; text: string }>("published").updateOne({ _id: candidate._id, tenantId: candidate.tenantId }, { $setOnInsert: { text: candidate.text } }, { session, upsert: true });
    },
  };
}
