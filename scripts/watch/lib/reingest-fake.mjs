// scripts/watch/lib/reingest-fake.mjs — TEST SUPPORT (no production import). In-memory fake of the
// packages/db scopedCollection accessor (tenant merged into every filter, like tenantScope.ts) that stores
// documents the way MongoDB does: as BSON BYTES. Every read decodes, every write encodes, so ObjectId, Date,
// Binary, Decimal128, Int32/Double really are BSON types here and a type lost anywhere shows up as a byte
// difference. Proven only against this fake; never against a real MongoDB.
import assert from "node:assert/strict";
import { BSON } from "./reingest-snapshot.mjs";

/** Thrown by the fake at the kill point and by every call after it: the "process" is gone. */
export class Kill extends Error {
  constructor(msg) { super(msg); this.name = "Kill"; }
}

const enc = (d) => BSON.serialize(d);
const dec = (b) => BSON.deserialize(b);
const same = (a, b) => a === b || (a !== null && b !== null && typeof a === "object" && typeof b === "object" && Buffer.compare(enc({ v: a }), enc({ v: b })) === 0);
const get = (o, path) => path.split(".").reduce((vals, k) => vals.flatMap((v) => (Array.isArray(v) ? v : [v])).map((v) => v?.[k]), [o]).flatMap((v) => (Array.isArray(v) ? v : [v]));
const match = (doc, f) => Object.entries(f).every(([k, c]) => get(doc, k).some((v) => (c && typeof c === "object" && !c._bsontype && "$in" in c ? c.$in.some((x) => same(v, x)) : same(v, c))));

/**
 * `seed` is { coll: [doc] } of plain/BSON docs, or `{ raw: { coll: [bytes] } }` (a previous process's dump).
 * `fail(op, coll, n)` -> throw on the n-th (1-based, global) mutating call when it returns true.
 * `killAt` -> the n-th mutating call kills the process BEFORE it applies; all later calls (reads too) throw Kill.
 */
export function fakeStore(seed, fail = () => false, { killAt = 0 } = {}) {
  const data = seed.raw
    ? Object.fromEntries(Object.entries(seed.raw).map(([k, v]) => [k, v.map((b) => Uint8Array.from(b))]))
    : Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map(enc)]));
  const calls = [];
  const state = { n: 0, dead: false };
  const scoped = (name) => (tenant) => {
    assert.equal(typeof tenant, "string");
    const rows = () => (data[name] ??= []);
    const live = () => rows().map(dec);
    const f = (x = {}) => ({ ...x, tenantId: tenant });
    const alive = () => { if (state.dead) throw new Kill("process is dead"); };
    const mut = (op) => {
      alive();
      state.n += 1;
      calls.push(`${op}:${name}`);
      if (killAt && state.n === killAt) { state.dead = true; throw new Kill(`killed before ${op} ${name} #${state.n}`); }
      if (fail(op, name, state.n)) throw new Error(`injected ${op} ${name} #${state.n}`);
    };
    return {
      find: (x) => ({ toArray: async () => { alive(); return live().filter((d) => match(d, f(x))); } }),
      findOne: async (x) => { alive(); return live().find((d) => match(d, f(x))) ?? null; },
      countDocuments: async (x) => { alive(); return live().filter((d) => match(d, f(x))).length; },
      deleteMany: async (x) => {
        mut("delete");
        const keep = rows().filter((b) => !match(dec(b), f(x)));
        const c = rows().length - keep.length;
        data[name] = keep;
        return { deletedCount: c };
      },
      insertMany: async (docs) => {
        mut("insert");
        const have = live().filter((d) => d.tenantId === tenant).map((d) => d._id); // per tenant: real Mongo is stricter (_id unique per collection)
        for (const d of docs) if (have.some((id) => same(id, d._id))) throw new Error(`E11000 duplicate key ${name} ${String(d._id)}`);
        rows().push(...docs.map((d) => enc({ ...d, tenantId: tenant })));
      },
      updateOne: async (x, u) => {
        mut("update");
        const i = rows().findIndex((b) => match(dec(b), f(x)));
        if (i >= 0) rows()[i] = enc({ ...dec(rows()[i]), ...u.$set });
      },
    };
  };
  return {
    scoped, calls, state,
    /** decoded documents of one collection (a copy) */
    docs: (name) => (data[name] ?? []).map(dec),
    /** the stored BSON bytes: what a fresh process sees after this one died */
    dump: () => ({ raw: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.map((b) => Uint8Array.from(b))])) }),
    /** per-collection list of hex BSON bytes, sorted: byte-exact comparison of two states */
    bytes: (names) => Object.fromEntries(names.map((n) => [n, (data[n] ?? []).map((b) => Buffer.from(b).toString("hex")).sort()])),
  };
}
