/**
 * packages/index/src/pipeline/speaker-docs.ts — U2.4 apply step, the PURE half.
 *
 * Everything upstream of this file could only ever REFUSE to name someone. This one writes
 * identities down, so its failure mode is different in kind: it can assert that two different
 * human beings are the same person.
 *
 * That risk is concrete and was carried here as a blocking item from three checker cycles.
 * `personId` is derived from the spoken name (`personIdFor` in `speakers.ts`), so two people
 * legitimately called "Ruby" in different sessions produce the same id. No amount of pattern work
 * upstream fixes that — it is an identity question, not a text question.
 *
 * The rule this module adopts: **merge, but never silently.**
 *   - Same session, same name -> one person. Diarization splitting one voice across `spk:N` labels
 *     is the common case, and treating those as two people would be the worse error.
 *   - Different sessions, same name -> merged into one document, but recorded as a COLLISION and
 *     the document's confidence is lowered. A caller cannot report a clean write over an
 *     ambiguous one, because the collisions come back alongside the docs.
 *
 * What it deliberately does NOT do: decide that two same-named speakers are different people. There
 * is no evidence in the corpus that could settle it, and inventing a disambiguator ("person:ruby-2")
 * would fabricate a distinction as confidently as merging fabricates an identity.
 */
import type { Speakers } from "@lkb/core";
import type { ResolvedSpeaker } from "./speakers.js";

export interface SessionResolution {
  sessionId: string;
  resolved: ResolvedSpeaker[];
}

/** A `personId` claimed by evidence from more than one session. Reported, never hidden. */
export interface SpeakerCollision {
  personId: string;
  sessionIds: string[];
  aliases: string[];
}

export interface SpeakerDocsResult {
  docs: Speakers[];
  collisions: SpeakerCollision[];
}

/** Observed in a single session: the name was spoken there and cited there. */
const CONFIDENCE_SINGLE_SESSION = 0.9;
/** Merged across sessions on a name match alone: an inference, and priced as one. */
const CONFIDENCE_CROSS_SESSION = 0.6;

/**
 * `Speakers` documents from per-session resolutions.
 *
 * Pure and synchronous — it does not touch Mongo, so the decision of what to write is reviewable
 * separately from the act of writing it. A speaker with no surviving evidence is dropped rather
 * than written with an empty `evidence` array, which `speakers.schema.json` forbids anyway
 * (`minItems: 1`) — the same posture as `claims.ts`.
 */
export function buildSpeakerDocs(tenantId: string, sessions: SessionResolution[]): SpeakerDocsResult {
  const byPerson = new Map<string, {
    aliases: string[];
    evidence: { turnId: string; sessionId: string }[];
    sessionIds: Set<string>;
  }>();

  for (const session of sessions) {
    for (const speaker of session.resolved) {
      if (speaker.evidence.length === 0) continue; // never write empty evidence
      const entry = byPerson.get(speaker.personId) ?? { aliases: [], evidence: [], sessionIds: new Set() };
      if (!entry.aliases.includes(speaker.displayName)) entry.aliases.push(speaker.displayName);
      for (const e of speaker.evidence) {
        if (!entry.evidence.some((x) => x.turnId === e.turnId)) entry.evidence.push(e);
        entry.sessionIds.add(e.sessionId);
      }
      byPerson.set(speaker.personId, entry);
    }
  }

  const docs: Speakers[] = [];
  const collisions: SpeakerCollision[] = [];

  for (const [personId, entry] of byPerson) {
    const sessionIds = [...entry.sessionIds].sort();
    const crossSession = sessionIds.length > 1;
    if (crossSession) collisions.push({ personId, sessionIds, aliases: [...entry.aliases] });

    const alias0 = entry.aliases[0];
    if (alias0 === undefined) continue; // unreachable in practice; the schema needs minItems 1
    docs.push({
      _id: `${tenantId}-${personId}`,
      tenantId,
      personId,
      aliases: [alias0, ...entry.aliases.slice(1)],
      confidence: crossSession ? CONFIDENCE_CROSS_SESSION : CONFIDENCE_SINGLE_SESSION,
      evidence: [entry.evidence[0]!, ...entry.evidence.slice(1)],
    });
  }

  docs.sort((a, b) => a.personId.localeCompare(b.personId));
  collisions.sort((a, b) => a.personId.localeCompare(b.personId));
  return { docs, collisions };
}

/**
 * The subset of the tenant-scoped accessor this write is allowed to use.
 *
 * Named explicitly rather than typed as the whole accessor, because that is the guard. ISS-102:
 * the first version of this logic lived in `scripts/sync-speakers.mjs` and called `replaceOne`,
 * which `scopedCollection` does not expose — `raw` was removed under ISS-065 — so the live write
 * threw `TypeError` on its first document and the "separately approved step" could not run at all.
 *
 * It survived review because every `tsconfig.json` is `include: ["src/**\/*.ts"]`, leaving `.mjs`
 * entrypoints outside `pnpm -r typecheck` entirely, and nothing exercised the non-dry-run branch.
 * That is the third recurrence of one shape (ISS-060, ISS-065, ISS-068), so the remedy is
 * structural: the logic lives in typechecked source and the entrypoint only wires it up. Reaching
 * for a method that is not on this interface is now a compile error.
 */
export interface SpeakerWriteTarget {
  findOne(filter: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  countDocuments(filter?: Record<string, unknown>): Promise<number>;
  deleteMany(filter: Record<string, unknown>): Promise<{ deletedCount: number }>;
  insertOne(doc: Omit<Speakers, "tenantId">): Promise<unknown>;
}

export interface SpeakerWriteResult {
  before: number;
  written: number;
  after: number;
  /** Rows left exactly as they were because a human confirmed them (D-141). Never overwritten, never downgraded. */
  preserved: number;
}

/** A row a human confirmed (U2.4 suggestions, D-141). Re-indexing must not touch it. */
export function isHumanConfirmed(row: Record<string, unknown> | null | undefined): boolean {
  if (!row) return false;
  return row.provenance === "human-confirmed" || (Array.isArray(row.confirmations) && row.confirmations.length > 0);
}

/**
 * Upserts speaker documents by `personId`, using delete-then-insert.
 *
 * That pair is the precedent (`scripts/sync-real-turns.mjs`) and it is what makes the `tenantId`
 * strip safe: `insertOne` on the scoped accessor re-attaches the tenant, so the stored document
 * always satisfies `speakers.schema.json`'s `required: ["tenantId"]`. A bare `replaceOne`
 * passthrough would have persisted tenant-less documents — the ISS-060 shape — which is why the
 * obvious-looking repair is the wrong one.
 */
export async function writeSpeakerDocs(
  target: SpeakerWriteTarget,
  docs: Speakers[],
): Promise<SpeakerWriteResult> {
  const before = await target.countDocuments({});
  let written = 0;
  let preserved = 0;
  for (const doc of docs) {
    // D-141: a human-confirmed row survives any re-index. Skip BEFORE the delete, so there is no window where it is gone.
    if (isHumanConfirmed(await target.findOne({ personId: doc.personId }))) { preserved++; continue; }
    const { tenantId: _tenantId, ...rest } = doc;
    await target.deleteMany({ personId: doc.personId });
    await target.insertOne(rest as Omit<Speakers, "tenantId">);
    written++;
  }
  const after = await target.countDocuments({});
  return { before, written, after, preserved };
}
