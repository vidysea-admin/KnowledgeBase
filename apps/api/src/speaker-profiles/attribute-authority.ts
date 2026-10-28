import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import { buildSpeakerProfile, type SpeakerProfileInput } from "../../../../packages/index/src/pipeline/speaker-profiles/profile.js";
import type { RelationshipAuthority } from "../speaker-relations/types.js";
import type { AcceptedAttributes, AttributeAuthority } from "../speaker-attributes/types.js";

export type AcceptedSpeakerAttributeReader = (snapshotDb: Pick<Db, "collection">, tenantId: string, personId: string, authority: AttributeAuthority) => Promise<AcceptedAttributes>;

/** Source-only accepted identity blocks, never attribute proposals or relationship edges. */
export function buildSpeakerAttributeAuthority(input: SpeakerProfileInput, authority: RelationshipAuthority): AttributeAuthority {
  if (authority.view.tenantId !== input.tenantId || authority.view.personId !== input.speaker.personId) throw new Error("Invalid attribute authority");
  const profile = buildSpeakerProfile(input);
  const attributedTurns: AttributeAuthority["attributedTurns"] = [];
  const turns = new Map<string, typeof input.turns>();
  for (const t of input.turns) {
    if (t.tenantId !== input.tenantId) continue;
    const key = JSON.stringify([t.sessionId, t._id]); turns.set(key, [...(turns.get(key) ?? []), t]);
  }
  if (profile?.identityStatus === "human-confirmed" && !profile.ambiguity) {
    for (const block of profile.attribution) for (const turnId of block.turnIds) {
      const matches = (turns.get(JSON.stringify([block.sessionId, turnId])) ?? []).filter(t => t.speakerRef === block.speakerRef);
      if (matches.length !== 1) continue;
      const t = matches[0]!;
      attributedTurns.push({ sessionId: t.sessionId, turnId: t._id, text: t.text, speakerRef: t.speakerRef, startTurnIndex: block.startTurnIndex, endTurnIndex: block.endTurnIndex });
    }
  }
  return { ...authority, attributedTurns };
}

/** Canonical accepted projection replaces cached attributes; absence is revocation, not fallback. */
export function applyAcceptedSpeakerAttributes(input: SpeakerProfileInput, accepted: AcceptedAttributes): SpeakerProfileInput {
  const speaker = { ...input.speaker };
  for (const field of ["org", "role"] as const) {
    delete speaker[field]; delete speaker[`${field}Evidence`];
    const value = accepted.fields[field];
    if (!value || accepted.withheldFields.includes(field)) continue;
    speaker[field] = value.value;
    speaker[`${field}Evidence`] = value.evidence.map(e => ({ ...e, status: "accepted" }));
  }
  return { ...input, speaker };
}

export function attributeDerivedRevision(sourceRevision: string, acceptedRevision: string): string {
  return createHash("sha256").update(JSON.stringify([sourceRevision, acceptedRevision])).digest("hex");
}
