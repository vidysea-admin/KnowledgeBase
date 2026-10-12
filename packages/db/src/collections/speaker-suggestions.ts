// packages/db/src/collections/speaker-suggestions.ts - U2.4 suggested speaker names (D-141, pending append).
// Every operation goes through `scopedCollection()` (tenantId forced at the call site, merged into every filter); there is
// no raw handle. A suggestion lives HERE and never in `speakers`: the only path from a suggestion to a final name is
// `confirmSpeakerSuggestion`, which a human triggers. A rejection is a durable tombstone (never expired, never overwritten
// by a later suggest). Confirm and reject are idempotent; confirming a rejected row (or the reverse) is a conflict.
import type { SpeakerSuggestions, Speakers } from "@lkb/core";
import type { Db } from "mongodb";
import { getDb } from "../client.js";
import { scopedCollection } from "../lib/tenantScope.js";

export type SuggestionStatus = SpeakerSuggestions["status"];
export const HUMAN_CONFIRMED = "human-confirmed" as const;

export function speakerSuggestions(tenantId: string, db: Db = getDb()) {
  return scopedCollection<SpeakerSuggestions>(db, "speaker_suggestions")(tenantId);
}
function finalSpeakers(tenantId: string, db: Db) {
  return scopedCollection<Speakers>(db, "speakers")(tenantId);
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,399}$/;
export function isValidSuggestionKey(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

/** What the API may serve: the suggestion itself, with its quote and kind. No `speakers`-shaped fields (aliases, personId confidence). */
export interface SuggestionView {
  id: string; sessionId: string; speakerRef: string; suggestedName: string;
  status: SuggestionStatus;
  quotes: { turnId: string; quote: string; kind: string }[];
  suggestedAt: string; decidedAt?: string; finalProvenance?: typeof HUMAN_CONFIRMED;
}
export function toSuggestionView(d: SpeakerSuggestions): SuggestionView {
  return {
    id: d._id, sessionId: d.sessionId, speakerRef: d.speakerRef, suggestedName: d.displayName, status: d.status,
    quotes: d.provenance.map((p) => ({ turnId: p.turnId, quote: p.evidenceQuote, kind: p.evidenceKind })),
    suggestedAt: d.suggestedAt,
    ...(d.decidedAt ? { decidedAt: d.decidedAt } : {}),
    ...(d.status === "confirmed" && d.finalProvenance === HUMAN_CONFIRMED ? { finalProvenance: HUMAN_CONFIRMED } : {}),
  };
}

/**
 * Stores NEW suggestions only. `$setOnInsert` + upsert on the deterministic _id: a row that already exists in ANY state
 * (suggested, confirmed, rejected) is left exactly as it is, so re-indexing can neither resurrect a rejected name nor
 * reset a decision. Returns how many rows were actually inserted.
 */
export async function insertSuggestionsIfAbsent(tenantId: string, sessionId: string, docs: readonly SpeakerSuggestions[], db: Db = getDb()): Promise<number> {
  const coll = speakerSuggestions(tenantId, db);
  let inserted = 0;
  for (const doc of docs) {
    if (doc.sessionId !== sessionId || doc.status !== "suggested") throw new Error("insertSuggestionsIfAbsent: only status=suggested rows of this session may be inserted");
    const { _id, tenantId: _t, ...rest } = doc;
    const r = await coll.updateOne({ _id }, { $setOnInsert: rest } as never, { upsert: true });
    if (r.upsertedCount > 0) inserted++;
  }
  return inserted;
}

/** Pending and confirmed suggestions of one session (rejected ones are not served). */
export async function listSessionSuggestions(tenantId: string, sessionId: string, db: Db = getDb()): Promise<SuggestionView[]> {
  if (!isValidSuggestionKey(sessionId)) return [];
  const rows = await speakerSuggestions(tenantId, db).find({ sessionId, status: { $in: ["suggested", "confirmed"] } }).toArray();
  return rows.filter((r) => r.tenantId === tenantId && r.sessionId === sessionId).map(toSuggestionView).sort((a, b) => a.id.localeCompare(b.id));
}

/** The (label, person) pairs a human rejected in this session: feed to `extractSpeakersGrounded({ rejected })`. */
export async function listRejected(tenantId: string, sessionId: string, db: Db = getDb()): Promise<{ speakerRef: string; personId: string }[]> {
  const rows = await speakerSuggestions(tenantId, db).find({ sessionId, status: "rejected" }).toArray();
  return rows.map((r) => ({ speakerRef: r.speakerRef, personId: r.personId }));
}

export type DecisionResult =
  | { result: "ok"; changed: boolean; suggestion: SuggestionView }
  | { result: "not_found" }
  | { result: "conflict"; status: SuggestionStatus };

async function load(tenantId: string, sessionId: string, id: string, db: Db): Promise<SpeakerSuggestions | null> {
  if (!isValidSuggestionKey(id) || !isValidSuggestionKey(sessionId)) return null;
  const row = await speakerSuggestions(tenantId, db).findOne({ _id: id, sessionId });
  // Belt and braces on top of the scoped filter: the row must be this tenant's and this session's.
  return row && row.tenantId === tenantId && row.sessionId === sessionId ? row : null;
}

/** Makes the name final: a `speakers` row (created, or extended with this alias/evidence) carrying the human-confirmed provenance. Idempotent. */
async function writeFinalSpeaker(tenantId: string, row: SpeakerSuggestions, decidedAt: string, db: Db): Promise<void> {
  await finalSpeakers(tenantId, db).updateOne(
    { personId: row.personId },
    {
      $setOnInsert: { _id: `${tenantId}-${row.personId}`, personId: row.personId, confidence: 1, provenance: HUMAN_CONFIRMED },
      $addToSet: {
        aliases: row.displayName,
        evidence: { $each: row.evidence.map((e) => ({ turnId: e.turnId, sessionId: e.sessionId })) },
        confirmations: { sessionId: row.sessionId, speakerRef: row.speakerRef, suggestionId: row._id, provenance: HUMAN_CONFIRMED, decidedAt },
      },
    } as never,
    { upsert: true },
  );
}

export async function confirmSpeakerSuggestion(tenantId: string, sessionId: string, id: string, db: Db = getDb(), now: Date = new Date()): Promise<DecisionResult> {
  const row = await load(tenantId, sessionId, id, db);
  if (!row) return { result: "not_found" };
  if (row.status === "rejected") return { result: "conflict", status: "rejected" };
  let changed = false;
  let current = row;
  if (row.status === "suggested") {
    const decidedAt = now.toISOString();
    const r = await speakerSuggestions(tenantId, db).updateOne({ _id: id, sessionId, status: "suggested" }, { $set: { status: "confirmed", decidedAt, finalProvenance: HUMAN_CONFIRMED } });
    changed = r.modifiedCount > 0;
    const again = await load(tenantId, sessionId, id, db);
    if (!again) return { result: "not_found" };
    if (again.status === "rejected") return { result: "conflict", status: "rejected" };   // lost a race with a reject
    current = again;
  }
  // Idempotent repair: a retry after a crash between the flip and this write still ends with the final row present.
  await writeFinalSpeaker(tenantId, current, current.decidedAt ?? now.toISOString(), db);
  return { result: "ok", changed, suggestion: toSuggestionView(current) };
}

export async function rejectSpeakerSuggestion(tenantId: string, sessionId: string, id: string, db: Db = getDb(), now: Date = new Date()): Promise<DecisionResult> {
  const row = await load(tenantId, sessionId, id, db);
  if (!row) return { result: "not_found" };
  if (row.status === "confirmed") return { result: "conflict", status: "confirmed" };
  let changed = false;
  let current = row;
  if (row.status === "suggested") {
    const r = await speakerSuggestions(tenantId, db).updateOne({ _id: id, sessionId, status: "suggested" }, { $set: { status: "rejected", decidedAt: now.toISOString() } });
    changed = r.modifiedCount > 0;
    const again = await load(tenantId, sessionId, id, db);
    if (!again) return { result: "not_found" };
    if (again.status === "confirmed") return { result: "conflict", status: "confirmed" };
    current = again;
  }
  return { result: "ok", changed, suggestion: toSuggestionView(current) };
}
