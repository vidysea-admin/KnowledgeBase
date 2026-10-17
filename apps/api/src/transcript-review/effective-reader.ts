import type { Db } from "mongodb";
import { scopedCollection } from "@lkb/db";
import { effectiveTurns } from "./service.js";
import { headId, type ReviewHead } from "./store.js";
import type { ReviewTurn } from "./planner.js";

/** Read-side overlay. Call after the ordinary tenant-scoped query; never write original turns.
 * A failed review lookup fails the reader rather than silently serving known-obsolete originals. */
export async function readEffectiveTurns<T extends ReviewTurn>(db: Pick<Db, "collection">, tenantId: string, rows: readonly T[], expectedSessionId?: string): Promise<T[]> {
  if (rows.some((r) => r.tenantId !== tenantId)) throw new Error("Transcript tenant mismatch");
  if (expectedSessionId && rows.some((r) => r.sessionId !== expectedSessionId)) throw new Error("Transcript session mismatch");
  const heads = scopedCollection<ReviewHead>(db as Db, "transcript_reviews")(tenantId);
  const sessions = new Map<string, ReviewHead | null>();
  for (const sessionId of new Set([...rows.map((r) => r.sessionId), ...(expectedSessionId ? [expectedSessionId] : [])])) {
    const head = await heads.findOne({ _id: headId(tenantId, sessionId), sessionId });
    if (head && (head.tenantId !== tenantId || head.sessionId !== sessionId)) throw new Error("Transcript review scope mismatch");
    if (head) {
      const originals = await db.collection("turns").find({ tenantId, sessionId }, { projection: { _id: 1 } }).toArray();
      const ids = new Set(originals.map((t) => String(t._id)));
      if (head.overlay.some((o) => !ids.has(o.turnId))) throw new Error("Reviewed source passages disappeared; source reconciliation required");
      // Reconcile immutable physical visual provenance, even when input rows were already
      // projected through an older overlay. Load only reviewed IDs, not every source text.
      if (head.overlay.length) {
        const reviewed = await db.collection<ReviewTurn>("turns").find({ tenantId, sessionId, _id: { $in: head.overlay.map((o) => o.turnId) } },
          { projection: { _id: 1, speakerRef: 1, text: 1, screenEvidence: 1 } }).toArray();
        const physical = new Map(reviewed.map((turn) => [turn._id, turn]));
        for (const overlay of head.overlay) {
          const source = physical.get(overlay.turnId);
          if (!source) throw new Error("Reviewed source passage changed; source reconciliation required");
          if (source.speakerRef !== "screen" && source.screenEvidence === undefined) continue;
          const prefix = typeof source.text === "string" && ["[Screen OCR; unverified]", "[Visual observation; unverified]"].find((marker) => source.text.startsWith(marker));
          if (overlay.speakerRef !== "screen" || !prefix || !overlay.text.startsWith(prefix)) {
            throw new Error("Screen review origin conflicts with immutable source; reconciliation required");
          }
        }
      }
    }
    sessions.set(sessionId, head);
  }
  return rows.map((r) => effectiveTurns([r], sessions.get(r.sessionId) ?? null)[0] as T);
}
