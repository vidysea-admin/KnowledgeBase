import type { Db } from "mongodb";
import { scopedCollection, assertValidTenantId } from "@lkb/db";
import type { EvalRuns, Sources, Sessions, Turns, Chunks, TreeIndexRootDocument } from "@lkb/core";
import { treeIndexRootFilter } from "@lkb/index";
import type { FlywheelGap, FlywheelStore } from "./types.js";

/** New write seam deliberately limited to test databases until its own production approval. */
export function createMongoFlywheelStore(db: Db): FlywheelStore {
  if (!/^lkb_t059_[a-z0-9_-]+$/i.test(db.databaseName)) throw new Error("flywheel database unavailable");
  const evals = scopedCollection<EvalRuns>(db, "eval_runs");
  const gaps = scopedCollection<FlywheelGap>(db, "gaps");
  const sources = scopedCollection<Sources>(db, "sources");
  const sessions = scopedCollection<Sessions>(db, "sessions");
  const turns = scopedCollection<Turns>(db, "turns");
  const chunks = scopedCollection<Chunks>(db, "chunks");
  const trees = scopedCollection<TreeIndexRootDocument & { _id: string }>(db, "tree_index");
  const owned = <T extends { tenantId: string }>(t: string, row: T | null): T | null => row?.tenantId === t ? row : null;
  return {
    async evaluation(t, id) { return owned(t, await evals(t).findOne({ _id: id })); },
    async gap(t, id) { return owned(t, await gaps(t).findOne({ _id: id })); },
    async createGap(t, row) {
      assertValidTenantId(t, "flywheel.createGap");
      if (row.tenantId !== t) throw new Error("flywheel tenant mismatch");
      const { _id, tenantId: _t, ...fields } = row;
      await gaps(t).updateOne({ _id }, { $setOnInsert: fields }, { upsert: true });
    },
    async replaceGap(t, expectedRevision, row) {
      if (row.tenantId !== t || row.flywheel.revision !== expectedRevision + 1) throw new Error("flywheel revision mismatch");
      const r = await gaps(t).replaceOne({ _id: row._id, "flywheel.revision": expectedRevision }, row);
      return r.matchedCount === 1;
    },
    async sourceRows(t, sourceId, sessionId) {
      const [source, session, rows] = await Promise.all([sources(t).findOne({ _id: sourceId }),
        sessions(t).findOne({ _id: sessionId }), turns(t).find({ sessionId }).sort({ tStart: 1, _id: 1 }).toArray()]);
      return { source: owned(t, source), session: owned(t, session), turns: rows };
    },
    async indexedRows(t, sessionId) {
      const [tree, rows] = await Promise.all([trees(t).findOne(treeIndexRootFilter(t)), chunks(t).find({ sourceRef: sessionId }).sort({ chunkIndex: 1 }).toArray()]);
      return { tree: owned(t, tree), chunks: rows };
    },
    async createRetest(t, row) {
      if (row.tenantId !== t) throw new Error("flywheel tenant mismatch");
      const { _id, tenantId: _t, ...fields } = row;
      await evals(t).updateOne({ _id }, { $setOnInsert: fields }, { upsert: true });
    },
  };
}
