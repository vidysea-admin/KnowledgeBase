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
/** Opt-in model of MongoDB transaction isolation for deterministic race tests (ISS-WAVECTORLESS-002).
 * - First-committer-wins: a session write to a row committed (by anyone) after the transaction's snapshot
 *   throws a TransientTransactionError WriteConflict; withTransaction rolls back and retries the body.
 * - Row write locks: a row written inside an open transaction is invisible, and unwritable, to out-of-session
 *   operations until commit or rollback (they read the pre-transaction image and wait to write), like Mongo.
 * - `beforeSessionOp(n)` runs before the n-th (0-based, fixture-wide) session read or write, so a test can
 *   release a competing actor at an exact point in the transaction's life.
 * - Session reads are point-in-time at the transaction's first operation (snapshot isolation), plus its own writes. */
export interface ReviewMongoIsolation { beforeSessionOp?: (completedSessionOps: number) => void | Promise<void> }
const MAX_TRANSIENT_RETRIES = 25;
const isTransient = (error: unknown): boolean => Array.isArray((error as { errorLabels?: unknown })?.errorLabels)
  && (error as { errorLabels: unknown[] }).errorLabels.includes("TransientTransactionError");
const writeConflict = () => Object.assign(new Error("WriteConflict: transaction write to a row changed after its snapshot"), { code: 112, errorLabels: ["TransientTransactionError"] });

export function reviewMongoFixture(inputs: readonly WhatsAppReviewInput[] = [reviewInput()], isolation?: ReviewMongoIsolation) {
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
  // Isolation model state (inert unless `isolation` is passed).
  let clock = 0; const stamps = new WeakMap<Row, number>();
  const held = new Map<Row, { image: Row; done: Promise<void>; release: () => void }>();
  let txn: { snapshot?: number; own: Set<Row> } | null = null;
  let sessionOps = 0; let conflicts = 0;
  const visible = (row: Row): Row => held.get(row)?.image ?? row;
  const releaseLocks = () => { if (txn) for (const row of txn.own) { held.get(row)?.release(); held.delete(row); } txn = null; };
  /** Runs the test hook, then pins the snapshot at the transaction's first operation. */
  const sessionGate = async (): Promise<void> => {
    const completed = sessionOps++;
    await isolation!.beforeSessionOp?.(completed);
    if (txn) txn.snapshot ??= clock;
  };
  /** In-session write intent on a row: conflict if committed after the snapshot, else take its write lock. */
  const lockForWrite = (row: Row): void => {
    if (!txn || txn.own.has(row)) return;
    if ((stamps.get(row) ?? 0) > (txn.snapshot ?? clock)) throw writeConflict();
    let release!: () => void; const done = new Promise<void>(resolve => { release = resolve; });
    held.set(row, { image: structuredClone(row), done, release }); txn.own.add(row);
  };
  // Per-row history of pre-images, so a transaction reads the state as of its snapshot even after later commits.
  const history = new WeakMap<Row, { stamp: number; image: Row }[]>();
  const imageAt = (row: Row, snapshot: number): Row | undefined => {
    if (txn?.own.has(row) || (stamps.get(row) ?? 0) <= snapshot) return row;
    const past = history.get(row) ?? [];
    for (let i = past.length - 1; i >= 0; i--) if (past[i]!.stamp <= snapshot) return past[i]!.image;
    return undefined;
  };
  const inSnapshot = (row: Row, filter: Filter): boolean => { const image = imageAt(row, txn?.snapshot ?? clock); return image !== undefined && matches(image, filter); };
  /** Call BEFORE mutating a row: keeps its pre-image for older snapshots and stamps the write. */
  const touch = (row: Row): void => {
    const past = history.get(row) ?? []; past.push({ stamp: stamps.get(row) ?? 0, image: structuredClone(row) }); history.set(row, past);
    stamps.set(row, ++clock);
  };
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
            try {
              for (let attempt = 0; ; attempt++) {
                const undo: (() => void)[] = []; journal = undo; txn = isolation ? { own: new Set() } : null;
                active = true;
                try { const result = await body(); releaseLocks(); return result; } catch (error) {
                  for (const step of undo.reverse()) step();
                  releaseLocks();
                  if (!isolation || !isTransient(error) || attempt >= MAX_TRANSIENT_RETRIES) throw error;
                  conflicts++;
                } finally { active = false; journal = null; }
              }
            } finally { unlock(); }
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
          if (isolation && !(options.session && journal)) {
            // Out-of-session reads see committed state only: rows locked by an open transaction show their pre-image.
            const found = rows[name]!.find(row => matches(visible(row), filter));
            return structuredClone(found ? visible(found) : null);
          }
          if (isolation) {
            await sessionGate();
            const found = rows[name]!.find(row => inSnapshot(row, filter));
            return structuredClone(found ? imageAt(found, txn?.snapshot ?? clock) ?? null : null);
          }
          return structuredClone(rows[name]!.find(row => matches(row, filter)) ?? null);
        },
        find(filter: Filter) {
          calls.push({ collection: name, filter: structuredClone(filter), operation: "find" });
          return { async toArray() { return structuredClone(isolation ? rows[name]!.filter(row => matches(visible(row), filter)).map(visible) : rows[name]!.filter(row => matches(row, filter))); } };
        },
        async updateOne(filter: Filter, update: { $set?: Row; $setOnInsert?: Row; $inc?: Record<string, number> }, options: { session?: unknown; upsert?: boolean } = {}) {
          calls.push({ collection: name, filter: structuredClone(filter), session: options.session, operation: "updateOne" });
          const inTxn = Boolean(options.session && journal);
          let row: Row | undefined;
          if (isolation && inTxn) {
            await sessionGate();
            row = rows[name]!.find(candidate => inSnapshot(candidate, filter));
            if (row) lockForWrite(row);
          } else if (isolation) {
            // A non-transactional writer blocks behind a row locked by an open transaction, then re-evaluates its filter.
            for (;;) {
              row = rows[name]!.find(candidate => matches(visible(candidate), filter));
              const lock = row && held.get(row);
              if (!lock) break;
              await lock.done;
            }
          } else row = rows[name]!.find(candidate => matches(candidate, filter));
          if (row) {
            const target = row;
            if (inTxn) {
              const snapshot = structuredClone(target); const priorStamp = stamps.get(target);
              journal!.push(() => { for (const key of Object.keys(target)) delete target[key]; Object.assign(target, snapshot); if (isolation) stamps.set(target, priorStamp ?? 0); });
            }
            if (isolation) touch(target);
            if (update.$set) setFields(target, update.$set);
            if (update.$inc) setFields(target, Object.fromEntries(Object.entries(update.$inc).map(([k, v]) => [k, (Number(valueAt(target, k)) || 0) + v])));
            return { acknowledged: true, matchedCount: 1, modifiedCount: update.$set || update.$inc ? 1 : 0, upsertedCount: 0 };
          }
          if (options.upsert) { const doc = structuredClone({ ...filter, ...update.$setOnInsert, ...update.$set }); rows[name]!.push(doc); if (isolation) { stamps.set(doc, ++clock); txn?.own.add(doc); } if (inTxn) { const list = rows[name]!; journal!.push(() => { list.splice(list.indexOf(doc), 1); }); } return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1 }; }
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
    /** Isolation model only: session ops performed so far and WriteConflict retries taken. */
    isolationStats: () => ({ sessionOps, conflicts }),
    async publish(candidate: { _id: string; tenantId: string; text: string }, session: ClientSession) {
      await db.collection<{ _id: string; tenantId: string; text: string }>("published").updateOne({ _id: candidate._id, tenantId: candidate.tenantId }, { $setOnInsert: { text: candidate.text } }, { session, upsert: true });
    },
  };
}
