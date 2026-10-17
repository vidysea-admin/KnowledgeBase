/**
 * apps/api/src/indexing-testutils.ts — shared fixtures for the indexing tests.
 *
 * Extracted when the ISS-118 gap tests moved into their own file alongside `vector-gap.ts`: both
 * suites need the same injected fake db and the same tenant-confinement assertions, and copying
 * them would have created two fixtures free to drift — with the tenant-scoping checks, the most
 * safety-relevant assertions in this package, being the ones duplicated. Same reasoning and same
 * shape as `packages/ai/src/testUtils.ts`. Not itself a test; imported by them.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Db } from "mongodb";

export interface Call {
  coll: string;
  op: string;
  filter?: Record<string, unknown>;
  docs?: Record<string, unknown>[];
  update?: Record<string, unknown>;
  options?: Record<string, unknown>;
}

function fixtureValues(value: unknown, path: string[]): unknown[] {
  if (Array.isArray(value)) return value.flatMap(item => fixtureValues(item, path));
  if (!path.length) return [value];
  if (!value || typeof value !== "object") return [];
  return fixtureValues((value as Record<string, unknown>)[path[0]!], path.slice(1));
}
function fixtureMatches(row: Record<string, unknown>, filter: Record<string, unknown> = {}): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    const values = fixtureValues(row, key.split("."));
    if (expected && typeof expected === "object") {
      if ("$in" in expected) return values.some(value => (expected as { $in: unknown[] }).$in.includes(value));
      if ("$nin" in expected) return !values.some(value => (expected as { $nin: unknown[] }).$nin.includes(value));
      if ("$exists" in expected) return values.some(value => value !== undefined) === (expected as { $exists: boolean }).$exists;
      if ("$ne" in expected) return values.every(value => value !== (expected as { $ne: unknown }).$ne);
      throw new Error("Unsupported fixture filter operator");
    }
    return values.some(value => value === expected);
  });
}

/**
 * Records every collection operation. `turns` MUST return a real row: with zero turns
 * `extractClaims` short-circuits to a non-degraded empty result (correctly — there is nothing to
 * extract), so an empty fixture silently tests the wrong branch. The first version of this fake
 * returned nothing anywhere and the degraded-run test failed for that reason, not a code fault.
 *
 * `existingSessionPage`, when set, is what `session_pages.findOne` returns — used to test the
 * ISS-059 guard (a degraded summarize run must not overwrite a real prior page).
 */
export function fakeDb(
  opts: {
    existingSessionPage?: Record<string, unknown> | null;
    /**
     * Rows `claims.find()` returns. Default `[]`, which is what every test had until ISS-126
     * cycle 2 — and that default made the ENTIRE `tagClaims: true` path unreachable in all 137
     * tests, so mutating `topicRefs: refs` to `topicRefs: []` stayed green. An empty fixture does
     * not test the empty case; it tests nothing at all. Opt-in so existing tests are unchanged.
     */
    claims?: Record<string, unknown>[];
    /** Mongo sessions are opaque handles, not serializable document state. */
    onSession?: (session: unknown) => void;
  } = {},
): { db: Pick<Db, "collection">; calls: Call[] } {
  const calls: Call[] = [];
  const TURN = { _id: "t1", tenantId: "t", sessionId: "s1", speakerRef: "spk:0", tStart: 0, tEnd: 1, text: "A real sentence." };
  // A real session, so buildTree(allSessions, allPages) actually produces a root for "t" and the
  // tree_index replaceOne path is genuinely exercised — without this, buildTree([], []) returns
  // {} (no root for any tenant) and replaceOne NEVER fires, so nothing about the tree_index write
  // (including the ISS-062 tenantId-stamping fix) was ever really under test. Found by testing
  // the fix's own mutation and getting a false green.
  // `org` is LOAD-BEARING, not decoration (ISS-154). Without an entity-bearing source,
  // `buildTree` produces no org nodes, so `promoteAndPersistEntities` writes nothing, so
  // the blanket tenant-confinement test had NOTHING TO CONFINE for entities — and the contract's
  // mandatory `scopedCollection` -> bare-handle mutation survived on both `topics` and `orgs` at
  // 159/0 green. A fixture that cannot reach a code path silently exempts it from every test that
  // walks the recorded calls. This is the fifth such gap in this layer.
  const SESSION = { _id: "s1", tenantId: "t", sourceId: "src1", title: "Test Session", date: "2026-09-07", org: "Acme University", status: { transcribe: "done", index: "pending" } };
  const SOURCE = { _id: "src1", tenantId: "t", kind: "recording", path: "fixture/recording", captureMode: "provided",
    hash: createHash("sha256").update(TURN.text).digest("hex"),
    consent: { given: true, recordedBy: "synthetic-fixture-owner", note: "Synthetic supplied recording model" }, createdAt: "2026-09-07T00:00:00.000Z" };
  // MODEL ONLY: real stateful writes/CAS/readback, not Mongo or transaction/MVCC evidence.
  const rows: Record<string, Record<string, unknown>[]> = {
    turns: [TURN], sessions: [SESSION], sources: [SOURCE],
    session_pages: opts.existingSessionPage ? [structuredClone(opts.existingSessionPage)] : [],
    claims: structuredClone(opts.claims ?? []),
    tree_index: [{ _id: "tenant-root:t", tenantId: "t", node_id: "tenant:t", level: "tenant", title: "Knowledge", summary: "", children: [], indexRevision: 0 }],
  };
  const readRows = (name: string): Record<string, unknown>[] => rows[name] ??= [];
  const setPath = (row: Record<string, unknown>, key: string, value: unknown, unset = false) => {
    const parts = key.split("."); let target = row;
    for (const part of parts.slice(0, -1)) {
      if (!target[part] || typeof target[part] !== "object" || Array.isArray(target[part])) target[part] = {};
      target = target[part] as Record<string, unknown>;
    }
    if (unset) delete target[parts.at(-1)!]; else target[parts.at(-1)!] = structuredClone(value);
  };
  const insert = (name: string, doc: Record<string, unknown>) => {
    if (readRows(name).some(row => row._id === doc._id)) throw new Error("Fixture duplicate document identity");
    readRows(name).push(structuredClone(doc));
  };
  const db = {
    collection(name: string) {
      const rec = (op: string, extra?: { filter?: Record<string, unknown>; docs?: Record<string, unknown>[]; update?: Record<string, unknown>; options?: Record<string, unknown> }) => {
        if (extra?.options?.session !== undefined) opts.onSession?.(extra.options.session);
        const options = extra?.options && { ...extra.options, ...(extra.options.session !== undefined ? { session: "opaque-session" } : {}) };
        calls.push(structuredClone({ coll: name, op, filter: extra?.filter, docs: extra?.docs, update: extra?.update, options }));
      };
      return {
        deleteMany: async (filter?: Record<string, unknown>) => {
          rec("deleteMany", { filter });
          const original = readRows(name), retained = original.filter(row => !fixtureMatches(row, filter));
          rows[name] = retained;
          return { acknowledged: true, deletedCount: original.length - retained.length };
        },
        insertOne: async (doc?: Record<string, unknown>) => {
          rec("insertOne", { docs: doc ? [doc] : [] });
          if (!doc) throw new Error("Fixture insert requires document"); insert(name, doc);
          return { acknowledged: true, insertedId: doc._id };
        },
        insertMany: async (docs?: Record<string, unknown>[]) => {
          rec("insertMany", { docs: docs ?? [] });
          if (!docs) throw new Error("Fixture insertMany requires documents"); docs.forEach(doc => insert(name, doc));
          return { acknowledged: true, insertedCount: docs.length };
        },
        replaceOne: async (filter?: Record<string, unknown>, doc?: Record<string, unknown>, options?: Record<string, unknown>) => {
          rec("replaceOne", { filter, docs: doc ? [doc] : [], options });
          if (!doc) throw new Error("Fixture replacement requires document");
          const index = readRows(name).findIndex(row => fixtureMatches(row, filter));
          if (index === -1) {
            if (options?.upsert) { insert(name, doc); return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1 }; }
            return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
          }
          const modified = JSON.stringify(readRows(name)[index]) !== JSON.stringify(doc);
          readRows(name)[index] = structuredClone(doc);
          return { acknowledged: true, matchedCount: 1, modifiedCount: modified ? 1 : 0, upsertedCount: 0 };
        },
        findOne: async (filter?: Record<string, unknown>) => {
          rec("findOne", { filter });
          return structuredClone(readRows(name).find(row => fixtureMatches(row, filter)) ?? null);
        },
        find: (filter?: Record<string, unknown>) => ({
          toArray: async () => {
            rec("find", { filter });
            // Real tenant/id/session and nested evidence filters remain observable and applied.
            return structuredClone(readRows(name).filter(row => fixtureMatches(row, filter)));
          },
        }),
        updateOne: async (filter?: Record<string, unknown>, update?: Record<string, unknown>, options?: Record<string, unknown>) => {
          rec("updateOne", { filter, update, options });
          if (!update) throw new Error("Fixture update requires operators");
          let row = readRows(name).find(candidate => fixtureMatches(candidate, filter));
          const matched = Boolean(row);
          if (!row && !options?.upsert) return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
          if (!row) row = Object.fromEntries(Object.entries(filter ?? {}).filter(([, value]) => value === null || typeof value !== "object"));
          const before = JSON.stringify(row);
          for (const [operator, operand] of Object.entries(update)) {
            if (!operand || typeof operand !== "object" || Array.isArray(operand)) throw new Error("Unsupported fixture update");
            if (operator === "$setOnInsert" && matched) continue;
            if (!["$set", "$unset", "$setOnInsert"].includes(operator)) throw new Error("Unsupported fixture update operator");
            for (const [key, value] of Object.entries(operand)) setPath(row, key, value, operator === "$unset");
          }
          if (!matched) insert(name, row);
          return { acknowledged: true, matchedCount: matched ? 1 : 0, modifiedCount: matched && before !== JSON.stringify(row) ? 1 : 0,
            upsertedCount: matched ? 0 : 1, ...(!matched ? { upsertedId: row._id } : {}) };
        },
      };
    },
  } as unknown as Pick<Db, "collection">;
  return { db, calls };
}

const CLAIMS_JSON = JSON.stringify([{ text: "A real claim.", turnIds: ["t1"] }]);

/** `complete` is called for both summarize and claims; route by the job kind. Each path degrades
 * independently, matching the real degradation shapes (ISS-056/ISS-059) — a claims outage must
 * not take the summary down with it, and vice versa. */
export function completeWith({ claimsFails = false, summarizeFails = false } = {}) {
  return async (job: { kind: string }) => {
    if (job.kind === "claims") {
      if (claimsFails) throw new Error("provider down");
      return { text: CLAIMS_JSON, json: undefined, usage: {}, provider: "fake", model: "fake" };
    }
    if (summarizeFails) throw new Error("provider down");
    return {
      text: JSON.stringify({ summary: "s", keyInsights: [], decisions: [], actionItems: [] }),
      json: undefined, usage: {}, provider: "fake", model: "fake",
    };
  };
}

/** A successful embedder: one 3-dim vector per input text, paired by index. */
export const embedOk = async (job: { texts: string[] }) => ({
  vectors: job.texts.map(() => [0.1, 0.2, 0.3]),
  dims: 3,
  provider: "fake",
  model: "fake-embed",
});

/**
 * Checks an `updateOne` call's UPDATE BODY, not just its filter — `updateOne`'s filter can carry
 * the right tenantId while the update itself moves the document to a different one. First found
 * (2026-09-07) as a single `$set`-only check; that missed `$unset` stripping `tenantId` entirely
 * (ISS-066) — the second instance of this project's own untested-guard pattern landing inside a
 * unit built specifically to close the first instance. Fixed generically this time: every
 * MongoDB update operator's sub-object (`$set`, `$unset`, `$rename`, `$currentDate`, …) and a raw
 * replacement document are all scanned the same way, so a THIRD operator doesn't need a THIRD
 * special case.
 */
export function assertUpdateBodyConfined(call: Call, tenantId: string) {
  const update = call.update!;
  for (const [key, value] of Object.entries(update)) {
    if (!key.startsWith("$")) {
      // A raw replacement document (no operators at all) — `key` is a field name directly.
      if (key === "tenantId") assert.equal(value, tenantId, `${call.coll}.${call.op}'s update body reassigns tenantId — it can move a document into another tenant`);
      continue;
    }
    const operand = value as Record<string, unknown>;
    if (operand === null || typeof operand !== "object" || !("tenantId" in operand)) continue;
    if (key === "$unset") {
      assert.fail(`${call.coll}.${call.op}'s ${key} strips tenantId — the document would carry no tenant at all (ISS-066)`);
    } else {
      assert.equal(operand.tenantId, tenantId, `${call.coll}.${call.op}'s ${key} reassigns tenantId — it can move a document into another tenant`);
    }
  }
}
