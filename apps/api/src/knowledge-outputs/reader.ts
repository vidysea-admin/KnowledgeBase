import type { Db } from "mongodb";
import type { Claims, Sessions, Turns } from "@lkb/core";
import { scopedCollection } from "../../../../packages/db/src/lib/tenantScope.js";
import type { OutputDeps } from "./types.js";
import { OutputError } from "./types.js";
import { createKnowledgeVisibility } from "../visibility/knowledge.js";
import { readEffectiveTurns } from "../transcript-review/effective-reader.js";
export function createMongoOutputReader(db: Db): OutputDeps["readSources"] {
  const sessions = scopedCollection<Sessions>(db, "sessions"), claims = scopedCollection<Claims>(db, "claims"), turns = scopedCollection<Turns>(db, "turns");
  return async (tenantId, sessionIds) => {
    // A fresh capability per read; T007 owns approval/revocation checks, never a caller-supplied flag.
    const visibility = createKnowledgeVisibility(db);
    const authorized = await sessions(tenantId).find({ _id: { $in: sessionIds } }).limit(11).toArray();
    if (authorized.length !== sessionIds.length) throw new OutputError("not_found", 404);
    const safe = await Promise.all(sessionIds.map((id) => visibility.safeCitationSession(tenantId, id)));
    if (safe.some((session) => session === null)) throw new OutputError("not_found", 404);
    const candidateClaims = await claims(tenantId).find({ "evidence.sessionId": { $in: sessionIds } }).sort({ _id: 1 }).limit(201).toArray();
    if (candidateClaims.length > 200) throw new OutputError("unavailable", 422);
    const selectedClaims: Claims[] = [];
    const ordinary = new Set<string>();
    for (const session of safe) if (session && await visibility.sourceVisible(tenantId, session.sourceId)) ordinary.add(session._id);
    let withheldVisibleClaims = 0;
    // Keep DB concurrency bounded; eligibility itself always checks current authoritative state.
    for (let index = 0; index < candidateClaims.length; index += 8) {
      const batch = candidateClaims.slice(index, index + 8);
      const eligible = await Promise.all(batch.map((claim) => visibility.claimVisible(tenantId, claim)));
      selectedClaims.push(...batch.filter((_claim, i) => eligible[i]));
      withheldVisibleClaims += batch.filter((claim, i) => !eligible[i] && claim.source === undefined && claim.waReview === undefined
        && claim.evidence.length > 0 && claim.evidence.every((ref) => ordinary.has(ref.sessionId))).length;
    }
    const references = [...new Set(selectedClaims.flatMap((claim) => claim.evidence.map((ref) => ref.turnId)))];
    if (references.length > 4000) throw new OutputError("unavailable", 422);
    const selectedTurns = references.length ? await turns(tenantId).find({ _id: { $in: references }, sessionId: { $in: sessionIds } }).sort({ _id: 1 }).limit(4001).toArray() : [];
    if (selectedTurns.length > 4000) throw new OutputError("unavailable", 422);
    // Consume the authoritative correction projection before the fresh visibility comparison.
    // Originals remain immutable; a stale overlay or quote still fails the current eligibility gate.
    const effectiveTurns = await readEffectiveTurns(db, tenantId, selectedTurns);
    return { sessions: safe as Sessions[], claims: selectedClaims, turns: await visibility.filterTurns(tenantId, effectiveTurns), withheldVisibleClaims };
  };
}
