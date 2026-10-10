/**
 * apps/api/src/indexing/promote-entities.ts — U2.1. Persists the entities the tree already implies.
 *
 * DEGRADE-SAFE AND NEVER THROWS, for the reason ISS-121 taught the hard way one unit earlier: this
 * runs inside `indexSession`, and bookkeeping that can throw is bookkeeping that can strand a
 * session at `status.index: "pending"` while ingest reports success. Promotion failing costs some
 * entity rows; promotion *throwing* would cost the session.
 *
 * UPSERT, NEVER DELETE-THEN-INSERT. The chunks path can clean-replace because chunks belong to one
 * session. Topics and orgs are corpus-wide: a topic row's `sessionRefs` spans sessions, so deleting
 * before writing would drop every other session's contribution on any single-session re-index. The
 * risk this trades for is a stale row surviving after its last session is re-indexed away — real,
 * but strictly better than actively destroying live cross-session evidence, which is the ISS-056
 * shape this project has already paid for once.
 */
import type { Db } from "mongodb";
import { scopedCollection } from "@lkb/db";
import type { Claims, Orgs, Topics } from "@lkb/core";
import { promoteTreeEntities, topicRefsForSession, type PromotedTopic } from "@lkb/index";
import type { TreeIndexNode } from "@lkb/core";

/**
 * Tenant-namespaced entity id (C6, and the SECOND time this project has paid for this shape).
 *
 * `scopedCollection` merges `tenantId` into the FILTER, but Mongo's `_id_` index is unique per
 * COLLECTION, not per tenant. So a bare slug means tenant B's upsert of a slug tenant A already
 * holds matches nothing, attempts an insert, and is rejected `E11000`. Reproduced live before
 * fixing (two scratch tenants, same slug `uk`: A inserted, B failed, cleanup verified).
 *
 * This is exactly ISS-121, whose fix was `vectorGapId(tenantId, sessionId)` — written by me, one
 * unit earlier, and then not applied here. Worse than the first instance: `recordVectorGap`'s throw
 * stranded one session, whereas this sits inside a catch that swallows it, so tenant B would lose
 * ALL entity promotion silently and permanently while the log reads `promotion-failed`.
 */
export function entityId(tenantId: string, slug: string): string {
  return `${tenantId}:${slug}`;
}

/**
 * ISS-155. One dry-run preview line for a promoted topic. `backfill.mjs entities --dry-run` is the
 * only path C8 allows, so it must print the id the live path (promoteAndPersistEntities) would
 * WRITE -- the namespaced one -- not the bare slug `promoteTreeEntities` returns.
 */
export function topicPreviewLine(tenantId: string, t: Pick<PromotedTopic, "_id" | "sessionRefs">): string {
  return `topic ${entityId(tenantId, t._id)} <- ${t.sessionRefs.length} session(s)`;
}

export interface PromotionResult {
  topics: number;
  orgs: number;
  claimsTagged: number;
  skipped: "promotion-failed" | null;
}

/**
 * @param sessionId the session just indexed — only ITS claims are re-tagged, so a single-session
 *        re-index does not rewrite the whole `claims` collection on every ingest.
 */
export async function promoteAndPersistEntities(
  tenantId: string,
  sessionId: string,
  root: TreeIndexNode,
  db: Pick<Db, "collection">,
  options: { tagClaims?: boolean } = {},
): Promise<PromotionResult> {
  const topicsColl = scopedCollection<Topics>(db as never, "topics");
  const orgsColl = scopedCollection<Orgs>(db as never, "orgs");
  const claimsColl = scopedCollection<Claims>(db as never, "claims");

  try {
    const { topics, orgs } = promoteTreeEntities(root);

    for (const t of topics) {
      await topicsColl(tenantId).updateOne(
        { _id: entityId(tenantId, t._id) } as never,
        { $set: { tenantId, name: t.name, sessionRefs: t.sessionRefs } } as never,
        { upsert: true },
      );
    }
    for (const o of orgs) {
      await orgsColl(tenantId).updateOne(
        { _id: entityId(tenantId, o._id) } as never,
        { $set: { tenantId, name: o.name } } as never,
        { upsert: true },
      );
    }

    // ISS-056's invariant is deliberately broad — "no claims write of ANY kind may happen on a
    // degraded run" — and an existing test caught this new code violating it. Tagging is not
    // destructive (a `$set` of `topicRefs`, never a delete), so it was tempting to argue the
    // invariant does not apply. Respecting it instead: a run whose claims extraction degraded is
    // operating on STALE claims, and tagging stale claims with topics derived from a fresh tree
    // silently mixes two vintages of data. The caller passes `tagClaims: false` in that case.
    const claimsTagged = options.tagClaims === false
      ? 0
      : await tagClaimsForSession(tenantId, sessionId, topics, claimsColl);
    return { topics: topics.length, orgs: orgs.length, claimsTagged, skipped: null };
  } catch (err) {
    console.warn(
      `promoteAndPersistEntities(${tenantId}/${sessionId}): promotion failed, indexing continues: ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
    return { topics: 0, orgs: 0, claimsTagged: 0, skipped: "promotion-failed" };
  }
}

/**
 * Writes `claims.topicRefs`, which has been `[]` on every real claim since T-002 because nothing
 * has ever written it.
 *
 * Scoped to this session's claims via `evidence.sessionId`, matching how `claims` rows are already
 * addressed elsewhere. Writing `[]` when a session surfaced no topics is correct and deliberate:
 * it CLEARS a stale tagging from a previous build rather than leaving a claim pointing at a topic
 * the tree no longer contains.
 */
async function tagClaimsForSession(
  tenantId: string,
  sessionId: string,
  topics: PromotedTopic[],
  claimsColl: ReturnType<typeof scopedCollection<Claims>>,
): Promise<number> {
  // Namespaced through the SAME helper the rows are written with, so a topicRef always resolves to
  // a real `topics._id`. A bare slug here would point at nothing once the ids carry a tenant.
  const refs = topicRefsForSession(sessionId, topics).map((slug) => entityId(tenantId, slug));
  const claims = await claimsColl(tenantId).find({ "evidence.sessionId": sessionId } as never).toArray();
  for (const c of claims) {
    await claimsColl(tenantId).updateOne({ _id: c._id } as never, { $set: { topicRefs: refs } } as never);
  }
  return claims.length;
}
