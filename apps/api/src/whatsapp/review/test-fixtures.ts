/** In-memory transactional Mongo driver fixture; never connects to any database. */
import type { Db, ClientSession } from "mongodb";
import type { Turns } from "@lkb/core";
import type { WhatsAppReviewInput } from "./detection.js";

export const REVIEW_TIME = "2026-10-14T11:00:00.000Z";
export function reviewInput(text: string = "Scholarship closes Friday.", tenantId: string = "tenant-a"): WhatsAppReviewInput {
  return {
    source: { _id: `source-${tenantId}`, tenantId, kind: "whatsapp-batch", path: "group@g.us" },
    session: { _id: "session-a", tenantId, sourceId: `source-${tenantId}` },
    turns: [{ _id: "turn-a", tenantId, sessionId: "session-a", speakerRef: "person-a", speakerLabel: "Expert",
      text, tStart: 0, tEnd: 0, occurredAt: "2026-10-14T10:00:00.000Z" }],
  };
}

type Row = Record<string, unknown>;
type Filter = Record<string, unknown>;
export function reviewMongoFixture(inputs: readonly WhatsAppReviewInput[] = [reviewInput()]) {
  let rows: Record<string, Row[]> = { sources: [], sessions: [], turns: [], whatsapp_candidates: [], published: [] };
  for (const input of inputs) {
    rows.sources!.push(structuredClone(input.source)); rows.sessions!.push(structuredClone(input.session));
    rows.turns!.push(...structuredClone(input.turns) as unknown as Row[]);
  }
  const calls: { collection: string; filter: Filter; session?: unknown; operation: string }[] = [];
  let tail = Promise.resolve();
  let sessionCount = 0; let ended = 0;
  const matches = (row: Row, filter: Filter): boolean => Object.entries(filter).every(([key, value]) => row[key] === value);
  const db = {
    client: {
      startSession() {
        sessionCount++;
        const session = {
          async withTransaction<T>(body: () => Promise<T>): Promise<T> {
            let unlock!: () => void;
            const prior = tail; tail = new Promise(resolve => { unlock = resolve; }); await prior;
            const backup = structuredClone(rows);
            try { return await body(); } catch (error) { rows = backup; throw error; } finally { unlock(); }
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
        async updateOne(filter: Filter, update: { $set?: Row; $setOnInsert?: Row }, options: { session?: unknown; upsert?: boolean } = {}) {
          calls.push({ collection: name, filter: structuredClone(filter), session: options.session, operation: "updateOne" });
          const row = rows[name]!.find(row => matches(row, filter));
          if (row) {
            if (update.$set) Object.assign(row, structuredClone(update.$set));
            return { modifiedCount: update.$set ? 1 : 0, upsertedCount: 0 };
          }
          if (options.upsert) { rows[name]!.push(structuredClone({ ...filter, ...update.$setOnInsert, ...update.$set })); return { modifiedCount: 0, upsertedCount: 1 }; }
          return { modifiedCount: 0, upsertedCount: 0 };
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
