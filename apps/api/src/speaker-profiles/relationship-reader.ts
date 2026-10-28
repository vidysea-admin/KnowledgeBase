import type { Db } from "mongodb";
import { scopedCollection, assertValidTenantId } from "../../../../packages/db/src/lib/tenantScope.js";
import { createSpeakerRelationshipService } from "../speaker-relations/service.js";
import type { RelationshipAuthority, RelationshipRow } from "../speaker-relations/types.js";
import type { AcceptedSpeakerRelationshipReader } from "./store.js";

/** Adapts the existing acceptance validator to the caller's already-open read snapshot.
 * No nested session/client, writes, identity promotion or independent validation policy. */
export const readAcceptedSpeakerRelationships: AcceptedSpeakerRelationshipReader = async (
  snapshotDb: Pick<Db, "collection">, tenantId: string, personId: string, authority: RelationshipAuthority,
) => {
  assertValidTenantId(tenantId, "accepted speaker relationships");
  if (authority.view.tenantId !== tenantId || authority.view.personId !== personId) throw new Error("Invalid speaker authority");
  if (authority.view.identityStatus !== "human-confirmed") return [];
  const rows = scopedCollection<RelationshipRow>(snapshotDb, "speaker_relationships")(tenantId);
  const service = createSpeakerRelationshipService({
    async transaction(requestTenant, run) {
      if (requestTenant !== tenantId) throw new Error("Invalid relationship tenant");
      return run({
        get: id => rows.findOne({ _id: id }),
        async list(requestPerson, status) {
          if (requestPerson !== personId || status !== "accepted") throw new Error("Invalid relationship read");
          const result = await rows.find({ "from.personId": personId, "to.personId": personId, status: "accepted" }).sort({ _id: 1 }).limit(101).toArray();
          if (result.length > 100) throw new Error("Relationship inventory limit exceeded");
          return result;
        },
        async authority(requestPerson) { return requestPerson === personId ? authority : null; },
        async insert() { throw new Error("Read-only relationship capability"); },
        async replaceCAS() { throw new Error("Read-only relationship capability"); },
      });
    },
  });
  return service.accepted({ tenantId, actorId: "system:speaker-profile-reader", canPropose: false, canReview: true, reviewerKind: "automation" }, personId);
};
