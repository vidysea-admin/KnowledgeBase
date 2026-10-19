/**
 * Mongo-backed AnswerPolicyStore. Two collections: `answer_policy_revisions` (append-only history, never updated or
 * deleted) and `answer_policy_review_items`. Every query ANDs `tenantId` into its filter; the tenant is validated by the
 * shared assertValidTenantId.
 *
 * Atomicity by construction, not by index alone: a revision's `_id` is the structured object `{tenantId, policyId, version}` (no delimiter, so no id can collide with another tenant's), so two writers racing to
 * append the same version collide on `_id` (E11000) and exactly one wins even if ensureAnswerPolicyIndexes was never run.
 * Review items use a deterministic `_id` (hash of tenant+kind+key) so dedupe is likewise atomic. Closing an item is a
 * filtered update (`status: "open"`), so it can only succeed once.
 *
 * Database guard: refuses the protected/unsafe work-DB names (db-name.ts isRefusedWorkDb) unless the caller passes
 * `production: true` to say it is deliberately wired to the API's own, explicitly named database.
 */
import { createHash } from "node:crypto";
import type { Db, Document } from "mongodb";
import { assertValidTenantId } from "../../../../packages/db/src/lib/tenantScope.js";
import { isRefusedWorkDb } from "../db-name.js";
import { validPolicyId } from "./rules.js";
import type { AnswerPolicyStore } from "./store.js";
import type { PolicyRevision, ReviewItem } from "./types.js";

export const REVISIONS = "answer_policy_revisions";
export const ITEMS = "answer_policy_review_items";
const DUPLICATE_KEY = 11000;
const isDuplicate = (e: unknown): boolean => typeof e === "object" && e !== null && (e as { code?: unknown }).code === DUPLICATE_KEY;

export async function ensureAnswerPolicyIndexes(db: Db): Promise<void> {
  await db.collection(REVISIONS).createIndex({ tenantId: 1, policyId: 1, version: 1 }, { unique: true });
  await db.collection(ITEMS).createIndex({ tenantId: 1, kind: 1, key: 1 }, { unique: true });
  await db.collection(ITEMS).createIndex({ tenantId: 1, status: 1, createdAt: 1 });
}

const revisionId = (r: { tenantId: string; policyId: string; version: number }) => ({ tenantId: r.tenantId, policyId: r.policyId, version: r.version });
const itemId = (tenantId: string, kind: string, key: string) => createHash("sha256").update(`${tenantId}\0${kind}\0${key}`).digest("hex");
function revisionOut(doc: Document): PolicyRevision { const { _id, ...rest } = doc; void _id; return rest as unknown as PolicyRevision; }
function itemOut(doc: Document): ReviewItem { const { _id, ...rest } = doc; return { ...rest, id: String(_id) } as unknown as ReviewItem; }

export function createMongoAnswerPolicyStore(db: Db, opts: { production?: boolean } = {}): AnswerPolicyStore {
  if (!opts.production && isRefusedWorkDb(db.databaseName)) throw new Error(`answer policy store refuses database "${db.databaseName}"`);
  const revisions = db.collection(REVISIONS), items = db.collection(ITEMS);
  const tenant = (t: string, where: string): string => { assertValidTenantId(t, `answerPolicyStore.${where}`); return t; };

  return {
    async appendRevision(tenantId, rev, expectedLatest) {
      tenant(tenantId, "appendRevision");
      if (rev.tenantId !== tenantId) throw new Error("answer policy tenant mismatch");
      if (!validPolicyId(rev.policyId)) throw new Error("answer policy: invalid policy id");
      if (rev.version !== expectedLatest + 1) return false;
      if (expectedLatest > 0 && !(await revisions.findOne({ _id: revisionId({ tenantId, policyId: rev.policyId, version: expectedLatest }) as never, tenantId }))) return false;
      try { await revisions.insertOne({ ...rev, _id: revisionId(rev) as never }); return true; }
      catch (e) { if (isDuplicate(e)) return false; throw e; }
    },
    async history(tenantId, policyId) {
      tenant(tenantId, "history");
      if (!validPolicyId(policyId)) throw new Error("answer policy: invalid policy id");
      return (await revisions.find({ tenantId, policyId }).sort({ version: 1 }).toArray()).map(revisionOut);
    },
    async latest(tenantId) {
      tenant(tenantId, "latest");
      const byPolicy = new Map<string, PolicyRevision>();
      for (const doc of await revisions.find({ tenantId }).sort({ policyId: 1, version: 1 }).toArray()) byPolicy.set(String(doc.policyId), revisionOut(doc));
      return [...byPolicy.values()].sort((a, b) => a.policyId.localeCompare(b.policyId));
    },
    async addItemIfAbsent(tenantId, item) {
      tenant(tenantId, "addItemIfAbsent");
      if (item.tenantId !== tenantId) throw new Error("answer policy tenant mismatch");
      const { id: _ignored, ...rest } = item; void _ignored;
      const _id = itemId(tenantId, item.kind, item.key);
      try { await items.insertOne({ ...rest, _id: _id as never }); return { item: itemOut({ ...rest, _id }), created: true }; }
      catch (e) {
        if (!isDuplicate(e)) throw e;
        const existing = await items.findOne({ _id: _id as never, tenantId });
        if (!existing) throw e;
        return { item: itemOut(existing), created: false };
      }
    },
    async items(tenantId) { tenant(tenantId, "items"); return (await items.find({ tenantId }).toArray()).map(itemOut); },
    async getItem(tenantId, id) {
      tenant(tenantId, "getItem");
      const doc = await items.findOne({ _id: id as never, tenantId });
      return doc ? itemOut(doc) : null;
    },
    async closeItem(tenantId, id, closed) {
      tenant(tenantId, "closeItem");
      if (closed.tenantId !== tenantId || closed.id !== id) return false;
      const { id: _ignored, tenantId: _t, ...rest } = closed; void _ignored; void _t;
      const r = await items.updateOne({ _id: id as never, tenantId, status: "open" }, { $set: rest });
      return r.matchedCount === 1;
    },
    async reopenSuperseded(tenantId, id, reopened) {
      tenant(tenantId, "reopenSuperseded");
      if (reopened.tenantId !== tenantId || reopened.id !== id || reopened.status !== "open") return false;
      const { id: _ignored, tenantId: _t, resolution: _r, ...rest } = reopened; void _ignored; void _t; void _r;
      const r = await items.updateOne({ _id: id as never, tenantId, status: "superseded" }, { $set: rest, $unset: { resolution: "" } });
      return r.matchedCount === 1;
    },
  };
}
