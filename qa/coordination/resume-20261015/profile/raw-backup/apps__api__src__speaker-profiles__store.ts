import type { Claims, Sessions, Speakers, SpeakerSuggestions, Topics, Turns } from "@lkb/core";
import type { Db, Filter, WithId } from "mongodb";
import { getDb } from "../../../../packages/db/src/client.js";
import { scopedCollection } from "../../../../packages/db/src/lib/tenantScope.js";
import { buildSpeakerProfile, speakerTranscriptHash, type SpeakerProfileInput } from "../../../../packages/index/src/pipeline/speaker-profiles/profile.js";
import { buildSpeakerKnowledgeView, type SpeakerKnowledgeRelation } from "../../../../packages/index/src/graph/speaker-knowledge.js";
import type { RelationshipAuthority } from "../speaker-relations/types.js";
import type { AttributeAuthority } from "../speaker-attributes/types.js";
import { buildSpeakerAttributeAuthority, applyAcceptedSpeakerAttributes, attributeDerivedRevision, type AcceptedSpeakerAttributeReader } from "./attribute-authority.js";
import type { SpeakerProfileDeps } from "./router.js";
import { createKnowledgeMetadataVisibility } from "../knowledge/metadata-visibility.js";
import { readEffectiveTurns } from "../transcript-review/effective-reader.js";
import { withKnowledgeReadSnapshot } from "../visibility/read-snapshot.js";

/** Limits are refusal bounds: no partial turn list may reinterpret stored block indexes. */
const MAX_ROWS = 10_000;
export type AcceptedSpeakerRelationshipReader = (snapshotDb: Pick<Db, "collection">, tenantId: string, personId: string, authority: RelationshipAuthority) => Promise<SpeakerKnowledgeRelation[]>;
export function createMongoSpeakerProfileDeps(db?: Db, acceptedReader?: AcceptedSpeakerRelationshipReader, attributesReader?: AcceptedSpeakerAttributeReader): SpeakerProfileDeps {
  return {
    async get(tenantId, personId) {
      const database = db ?? getDb();
      if (!database.client || typeof database.client.startSession !== "function") throw new Error("Knowledge snapshot unavailable");
      // The live pass can only restrict the result. It preserves withdrawal detection before
      // the final authority phase; none of its rows or cached labels may authorize output.
      const preflight = await readSpeakerProfile(database, tenantId, personId);
      return withKnowledgeReadSnapshot(database, async snapshotDb => {
        if (!preflight) return null;
        if (!attributesReader) return readSpeakerProfile(snapshotDb, tenantId, personId);
        const input = await readSpeakerProfileInput(snapshotDb, tenantId, personId);
        const authority = input ? knowledgeAuthority(input) : null;
        if (!input || !authority) return null;
        const accepted = await attributesReader(snapshotDb, tenantId, personId, buildSpeakerAttributeAuthority(input, authority));
        const profile = buildSpeakerProfile(applyAcceptedSpeakerAttributes(input, accepted));
        return profile ? { ...profile, revision: attributeDerivedRevision(authority.view.revision, accepted.revision) } : null;
      });
    },
    async getKnowledge(tenantId, personId) {
      const database = db ?? getDb();
      if (!database.client || typeof database.client.startSession !== "function") throw new Error("Knowledge snapshot unavailable");
      const preflight = await readSpeakerKnowledgeAuthority(database, tenantId, personId);
      return withKnowledgeReadSnapshot(database, async snapshotDb => {
        if (!preflight) return null;
        const input = await readSpeakerProfileInput(snapshotDb, tenantId, personId);
        if (!input) return null;
        const authority = knowledgeAuthority(input);
        if (!authority) return null;
        if (!acceptedReader && !attributesReader) return authority.view;
        const relationships = acceptedReader ? await acceptedReader(snapshotDb, tenantId, personId, authority) : [];
        const accepted = attributesReader ? await attributesReader(snapshotDb, tenantId, personId, buildSpeakerAttributeAuthority(input, authority)) : null;
        const view = buildSpeakerKnowledgeView({ ...(accepted ? applyAcceptedSpeakerAttributes(input, accepted) : input), visibleSessionIds: input.sessions.map(s => s._id), relationships });
        return view && accepted ? { ...view, revision: attributeDerivedRevision(view.revision, accepted.revision) } : view;
      });
    },
  };
}

/** Re-derive the whole projection from one supplied capability. The final caller supplies
 * the shared read-only Mongo snapshot facade, so all authorities use its ClientSession. */
async function readSpeakerProfile(database: Pick<Db, "collection">, tenantId: string, personId: string) {
  const input = await readSpeakerProfileInput(database, tenantId, personId);
  return input ? buildSpeakerProfile(input) : null;
}

/** Source-only authority: never opens a session or reads relationship rows. Suitable for a
 * caller's existing read or review transaction without recursively authorizing its own edges. */
export async function readSpeakerKnowledgeAuthority(snapshotDb: Pick<Db, "collection">, tenantId: string, personId: string): Promise<RelationshipAuthority | null> {
  const input = await readSpeakerProfileInput(snapshotDb, tenantId, personId);
  return input ? knowledgeAuthority(input) : null;
}

export async function readSpeakerAttributeAuthority(snapshotDb: Pick<Db, "collection">, tenantId: string, personId: string): Promise<AttributeAuthority | null> {
  const input = await readSpeakerProfileInput(snapshotDb, tenantId, personId);
  const authority = input ? knowledgeAuthority(input) : null;
  return input && authority ? buildSpeakerAttributeAuthority(input, authority) : null;
}

function knowledgeAuthority(input: SpeakerProfileInput): RelationshipAuthority | null {
  const view = buildSpeakerKnowledgeView({ ...input, visibleSessionIds: input.sessions.map(s => s._id) });
  if (!view) return null;
  const transcriptHashes = Object.fromEntries(input.sessions.map(s => [s._id, speakerTranscriptHash(input.turns
    .filter(t => t.tenantId === input.tenantId && t.sessionId === s._id)
    .sort((a, b) => a.tStart - b.tStart || a._id.localeCompare(b._id)))]));
  return { view, transcriptHashes };
}

async function readSpeakerProfileInput(database: Pick<Db, "collection">, tenantId: string, personId: string): Promise<SpeakerProfileInput | null> {
      const { visibility, allSessions, memberVisible } = createKnowledgeMetadataVisibility(database);
      const coll = <T extends { _id: string; tenantId: string }>(name: string) => scopedCollection<T>(database, name)(tenantId);
      const read = async <T extends { _id: string; tenantId: string }>(name: string, filter: Filter<T>): Promise<WithId<T>[]> => {
        const rows = await coll<T>(name).find(filter).limit(MAX_ROWS + 1).toArray();
        if (rows.length > MAX_ROWS) throw new Error("Profile read limit exceeded");
        return rows;
      };
      const speaker = await coll<Speakers>("speakers").findOne({ personId });
      if (!speaker || speaker.tenantId !== tenantId || speaker.personId !== personId) return null;
      const own = await read<SpeakerSuggestions>("speaker_suggestions", { personId, status: "confirmed", finalProvenance: "human-confirmed" });
      const ids = [...new Set([...speaker.evidence.map(e => e.sessionId), ...own.map(s => s.sessionId)])];
      if (ids.length > 100) throw new Error("Profile session limit exceeded");
      if (!ids.length) return null;
      const sessions = await read<Sessions>("sessions", { _id: { $in: ids } });
      const valid: string[] = [];
      for (const s of sessions) if (s.tenantId === tenantId && await visibility.sessionVisible(tenantId, s._id)) valid.push(s._id);
      if (!valid.length) return null;
      // Mongo transaction operations stay serial; no parallel reads on one ClientSession.
      const turns = await read<Turns>("turns", { sessionId: { $in: valid } });
      const suggestions = await read<SpeakerSuggestions>("speaker_suggestions", { sessionId: { $in: valid }, status: "confirmed", finalProvenance: "human-confirmed" });
      const claims = await read<Claims>("claims", { "evidence.sessionId": { $in: valid }, status: "verified" });
      const effective = await readEffectiveTurns(database, tenantId, turns);
      const visibleClaims: Claims[] = [];
      for (const claim of claims) if (await visibility.claimVisible(tenantId, claim)) visibleClaims.push(claim);
      const refs = [...new Set(visibleClaims.flatMap(c => c.topicRefs ?? []))];
      const topics = refs.length ? await read<Topics>("topics", { _id: { $in: refs } }) : [];
      const visibleTopics: Topics[] = [];
      for (const topic of topics) if (await allSessions(tenantId, topic.sessionRefs)) visibleTopics.push(topic);
      // Recheck after reads: a withdrawn source cannot survive as an earlier allowed snapshot.
      const currentSessions: Sessions[] = [];
      for (const s of sessions) if (valid.includes(s._id) && await visibility.sessionVisible(tenantId, s._id)) currentSessions.push(s);
      if (!currentSessions.length) return null;
      // Confidence and attribute presence are cached across the speaker's contributing
      // sources. Ineligible contributors must not affect either values or withheld counts.
      // Keep eligible identity/claim evidence so a mixed row still yields a useful profile.
      const projectedSpeaker: Speakers = { ...speaker };
      if (!await memberVisible(tenantId, "speaker", speaker)) {
        delete projectedSpeaker.confidence;
        delete projectedSpeaker.org;
        delete projectedSpeaker.role;
      }
      return { tenantId, speaker: projectedSpeaker, suggestions, turns: effective, sessions: currentSessions, claims: visibleClaims, topics: visibleTopics };
}
