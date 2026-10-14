/**
 * U2.5: persist extracted decisions for one session. Called by indexSession ONLY when the
 * LKB_EXTRACT_DECISIONS flag (or deps.extractDecisions) is on; flag-off never imports a collection
 * handle from here. Mirrors the claims write: a degraded extraction leaves existing decisions
 * untouched (ISS-056 shape), a clean one replaces the session's decisions. Tenant-scoped through
 * scopedCollection on the same injected db handle.
 */
import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import { scopedCollection } from "@lkb/db";
import type { Decisions, Turns } from "@lkb/core";
import { extractDecisions, type DecisionsCompleteFn } from "@lkb/index";

export async function extractAndPersistDecisions(
  tenantId: string, sessionId: string, turns: Turns[], complete: DecisionsCompleteFn, db: Pick<Db, "collection">,
): Promise<{ count: number; degraded: string | null }> {
  const { decisions, degraded } = await extractDecisions(turns, complete);
  if (degraded) {
    console.warn(`indexSession(${tenantId}/${sessionId}): decisions left unchanged — ${degraded.reason}`);
    return { count: 0, degraded: degraded.reason };
  }
  const coll = scopedCollection<Decisions>(db as never, "decisions")(tenantId);
  await coll.deleteMany({ "evidence.sessionId": sessionId } as never);
  if (decisions.length > 0) {
    const docs: Decisions[] = decisions.map((d) => ({
      _id: randomUUID(),
      tenantId,
      text: d.text,
      status: "proposed",
      ...(d.owner ? { owner: d.owner } : {}),
      tStart: d.tStart,
      tEnd: d.tEnd,
      evidence: d.evidenceTurnIds.map((turnId) => ({ turnId, sessionId })) as Decisions["evidence"],
    }));
    await coll.insertMany(docs);
  }
  return { count: decisions.length, degraded: null };
}
