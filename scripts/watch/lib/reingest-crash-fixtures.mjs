// scripts/watch/lib/reingest-crash-fixtures.mjs -- shared seed data, stores and helpers for the reingest crash-replay
// tests (reingest-crash.test.mjs and reingest-crash-sibling.test.mjs). Split out of the former single test file when it
// crossed the 400-line test budget; no behaviour or assertion changed.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SESSION_COLLECTIONS, replaceSessionRows } from "./reingest-swap.mjs";
import { snapshotHooks } from "./reingest-recover.mjs";
import { BSON, snapshotPaths } from "./reingest-snapshot.mjs";
import { Kill, fakeStore } from "./reingest-fake.mjs";
import { buildTree, treeIndexRootFilter } from "../../../packages/index/src/tree/build.ts";
import { regenerate } from "../../../packages/index/src/tree/regenerate.ts";

export const T = "toc";
export const OLD = "2026-09-25-infocu";
export const NEW = "2026-09-25-infocus";
export const DRIVE = "1mJI5wuOvDuNu7A_sBj191Pe6-Olm18ri";
export const COLLS = [...SESSION_COLLECTIONS, "tree_index"];
export const root = mkdtempSync(join(tmpdir(), "reingestejson-crash-"));
export const cleanup = () => rmSync(root, { recursive: true, force: true });
let seq = 0;
export const freshDir = () => join(root, `d${(seq += 1)}`);

export const session = (id, date, extra = {}) => ({ _id: id, title: id, date, sourceId: `gdrive-${DRIVE}`, status: { index: "done" }, ...extra, tenantId: T });
export const treeFor = (sessions) => ({ ...buildTree(sessions, [])[T], tenantId: T });
/** tenantId LAST in every row, exactly as scopedCollection's `{ ...doc, tenantId }` stores it, so rebuilt rows are byte-identical. */
export function seedOld() {
  const old = session(OLD, "2025-12-31", { ingestedAt: new Date("2026-09-24T08:30:00.001Z"), score: BSON.Decimal128.fromString("12.50") });
  const keep = session("keep-me", "2026-01-05", { sourceId: "gdrive-OTHER" });
  return {
    sources: [{ _id: `gdrive-${DRIVE}`, driveModified: new Date("2026-09-20T00:00:00Z"), tenantId: T }, { _id: "gdrive-OTHER", tenantId: T }],
    sessions: [old, keep],
    turns: [
      { _id: "t1", sessionId: OLD, at: new Date("2026-09-25T10:00:00.123Z"), ref: new BSON.ObjectId("65f0c0ffee0123456789abcd"), startMs: 1500, tenantId: T },
      { _id: new BSON.ObjectId("0123456789abcdef01234567"), sessionId: OLD, text: "नमस्ते ☃", tenantId: T },
      { _id: "tx", sessionId: "keep-me", tenantId: T },
      { _id: "o1", sessionId: OLD, tenantId: "other" },
    ],
    session_pages: [{ _id: "p1", sessionId: OLD, tenantId: T }],
    claims: [{ _id: "c1", evidence: [{ sessionId: OLD }], confidence: BSON.Decimal128.fromString("0.9100000000000000000000000000000001"), tenantId: T }, { _id: "cx", evidence: [{ sessionId: "keep-me" }], tenantId: T }],
    chunks: [
      { _id: "k1", sourceRef: OLD, vector: Array.from({ length: 64 }, (_, i) => Math.cos(i) / 3), embedding: BSON.Binary.fromFloat32Array(new Float32Array([0.5, -2, 1e-3])), tenantId: T },
      { _id: "kx", sourceRef: "keep-me", tenantId: T },
    ],
    tree_index: [{ _id: "root", ...treeFor([old, keep]) }],
  };
}
export const ingestFor = (store) => async () => {
  await store.scoped("sources")(T).insertMany([{ _id: `gdrive-${DRIVE}`, at: new Date() }]);
  await store.scoped("sessions")(T).insertMany([session(NEW, "2026-09-25")]);
  await store.scoped("turns")(T).insertMany([{ _id: "n1", sessionId: NEW }]);
  await store.scoped("chunks")(T).insertMany([{ _id: "nk1", sourceRef: NEW }]);
  return NEW;
};
export const deps = (store, dir, over = {}) => ({
  scoped: store.scoped, tenant: T, driveFileId: DRIVE, oldSessionId: OLD, correctSessionId: NEW, ingest: ingestFor(store),
  rootFilter: treeIndexRootFilter(T), regenerate, ...snapshotHooks({ dir }), ...over,
});
export const recoverDeps = (store, dir, over = {}) => ({ scoped: store.scoped, tenant: T, dir, rootFilter: treeIndexRootFilter(T), regenerate, ...over });
export const hasNode = (rootDoc, id) => JSON.stringify(rootDoc).includes(`/session:${id}"`);
export const snapFile = (dir) => snapshotPaths(dir, T, DRIVE).file;
export const leftover = (dir) => (existsSync(join(dir, T)) ? readdirSync(join(dir, T)) : []);
export const reference = () => fakeStore(seedOld()).bytes(COLLS);

/** run replace in a process that is killed before mutating step `killAt`; returns the dead process's store. */
export async function runKilled(dir, killAt, over = {}) {
  const store = fakeStore(seedOld(), () => false, { killAt });
  await replaceSessionRows(deps(store, dir, over)).catch(() => {});
  return store;
}

// mutating steps of a full successful run: 6 deletes (1-6), 4 ingest inserts (7-10), tree update (11).
export const STEPS = SESSION_COLLECTIONS.length + 4 + 1;
