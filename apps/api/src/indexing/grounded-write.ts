/**
 * T-040 wiring: the write path used ONLY when grounded notes are on (strictWebinar + dropUnverified).
 * The default path in session.ts is delete-then-insert and stays byte-for-byte as it was. ISS-U25DECISIONS-001
 * found that pattern drops human-verified status and is not atomic, so grounded mode does not repeat it:
 *  - INSERT first, then delete only the previous machine-written rows by _id. A crash or insert failure
 *    leaves the old notes intact (the worst case is a duplicate, never a loss).
 *  - Claims with status other than "needs-review" (verified / conflicting = a human or review decision) are
 *    never deleted; a fresh claim whose text equals a preserved one is not inserted again.
 *  - session_pages has no human-review field in schema/session_pages.schema.json (citedItems.verification is
 *    the constant "unverified"), so a page is wholly machine-written; it is replaced insert-first, not preserved.
 * All handles are tenant-scoped (scopedCollection) by the caller.
 */
import type { Claims, SessionPages } from "@lkb/core";
export interface GroundedGenerationWrite {
  assertOwned(): Promise<void>;
  plannedClaims?(fresh: Claims[], preserved: Claims[]): void;
}
function acknowledged(value: unknown): boolean { return value !== null && typeof value === "object" && "acknowledged" in value && value.acknowledged === true; }

interface Coll<T> {
  find(filter: object): { toArray(): Promise<T[]> };
  insertOne(doc: T): Promise<unknown>;
  insertMany(docs: T[]): Promise<unknown>;
  deleteMany(filter: object): Promise<unknown>;
}

export async function replacePageInsertFirst(coll: Coll<SessionPages>, sessionId: string, page: SessionPages, generation?: GroundedGenerationWrite): Promise<void> {
  const oldIds = (await coll.find({ sessionId }).toArray()).map((p) => p._id).filter((id) => id !== page._id);
  await generation?.assertOwned();
  const saved = await coll.insertOne(page);
  if (generation && !acknowledged(saved)) throw new Error("page generation write unconfirmed");
  if (oldIds.length) {
    await generation?.assertOwned();
    const pruned = await coll.deleteMany({ sessionId, _id: { $in: oldIds } });
    if (generation && !acknowledged(pruned)) throw new Error("page generation prune unconfirmed");
  }
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export async function replaceClaimsPreserving(coll: Coll<Claims>, sessionId: string, docs: Claims[], generation?: GroundedGenerationWrite): Promise<{ preserved: number; replaced: number; inserted: number }> {
  const old = await coll.find({ "evidence.sessionId": sessionId }).toArray();
  const keep = old.filter((c) => c.status !== "needs-review");
  const prune = old.filter((c) => c.status === "needs-review");
  const keptText = new Set(keep.map((c) => norm(c.text)));
  const fresh = docs.filter((d) => !keptText.has(norm(d.text)));
  generation?.plannedClaims?.(fresh, keep);
  if (fresh.length) {
    await generation?.assertOwned();
    const saved = await coll.insertMany(fresh);
    if (generation && !acknowledged(saved)) throw new Error("claim generation write unconfirmed");
  }
  // (indexSession only calls this with at least one extracted claim, so a run that yields nothing never reaches a delete.)
  if (prune.length) {
    await generation?.assertOwned();
    const pruned = await coll.deleteMany({ _id: { $in: prune.map((c) => c._id) }, "evidence.sessionId": sessionId });
    if (generation && !acknowledged(pruned)) throw new Error("claim generation prune unconfirmed");
  }
  return { preserved: keep.length, replaced: prune.length, inserted: fresh.length };
}

/** Combined judge accounting for the result (summary + claims sidecars); absent when no judge ran. */
export function judgeTotals(...sidecars: Array<import("@lkb/index").JudgeSidecar | undefined>) {
  const s = sidecars.filter((x): x is import("@lkb/index").JudgeSidecar => !!x);
  if (!s.length) return undefined;
  const sum = (k: "judged" | "kept" | "dropped" | "unsure" | "rulesDropped" | "calls" | "costUsd") => s.reduce((a, x) => a + x[k], 0);
  return { judged: sum("judged"), kept: sum("kept"), dropped: sum("dropped"), unsure: sum("unsure"), rulesDropped: sum("rulesDropped"), calls: sum("calls"), costUsd: sum("costUsd") };
}
