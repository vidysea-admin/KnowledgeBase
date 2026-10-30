// packages/db/src/collections/meeting-candidates.ts — T-028. `coll(tenantId)` accessor matching
// the sources/sessions/gaps pattern, plus the lifecycle operations the Gmail scan + approval
// routes need: dedup-by-messageId insert, list pending/decided, and a status transition.
import type { MeetingCandidates } from "@lkb/core";
import type { Db, Filter } from "mongodb";
import { getDb } from "../client.js";
import { scopedCollection } from "../lib/tenantScope.js";

export function meetingCandidates(tenantId: string, db: Db = getDb()) {
  return scopedCollection<MeetingCandidates>(db, "meeting_candidates")(tenantId);
}

const PROVENANCE = ["evidenceIssue", "senderAuthenticated", "receivedAt", "youtubeWatch", "youtubeWatchIssue", "meetingLinkIssue"] as const;
const PRESERVED = ["_id", "messageId", "senderEmail", "senderDomain", "subject", "threadId", "status",
  "decidedAt", "detectedAt", "meetingUrl", "registrationUrl", "registrationOnly", "recordingUrl", "kind",
  "startTime", "endTime", "eventDate", "occurrenceId", "occurrenceKey", "sourceId", "sessionId"] as const;

function refreshProvenance(existing: MeetingCandidates, doc: Omit<MeetingCandidates, "tenantId">) {
  const set: Record<string, unknown> = {};
  if (doc.evidenceIssue !== undefined) {
    if (typeof doc.evidenceIssue !== "string" || !["unresolved-body", "unsupported-attachment"].includes(doc.evidenceIssue)) throw new Error("Invalid candidate evidence refusal");
    set.evidenceIssue = existing.evidenceIssue ?? doc.evidenceIssue;
  }
  if (doc.senderAuthenticated !== undefined) {
    if (typeof doc.senderAuthenticated !== "boolean") throw new Error("Invalid candidate authentication provenance");
    set.senderAuthenticated = doc.senderAuthenticated;
  }
  if (doc.receivedAt !== undefined) {
    const date = typeof doc.receivedAt === "string" ? new Date(doc.receivedAt) : undefined;
    if (!date || !Number.isFinite(date.getTime()) || date.toISOString() !== doc.receivedAt || date.getTime() > Date.now() ||
        (existing.receivedAt !== undefined && existing.receivedAt !== doc.receivedAt)) {
      throw new Error("Invalid or conflicting candidate receipt provenance");
    }
    set.receivedAt = doc.receivedAt;
  }
  if (doc.youtubeWatchIssue !== undefined) {
    if (doc.youtubeWatchIssue !== "ambiguous") throw new Error("Invalid candidate watch issue");
    set.youtubeWatchIssue = doc.youtubeWatchIssue;
  }
  if (doc.meetingLinkIssue !== undefined) {
    if (typeof doc.meetingLinkIssue !== "string" || !["ambiguous", "registration-only", "host-start-link"].includes(doc.meetingLinkIssue)) {
      throw new Error("Invalid candidate meeting issue");
    }
    // An older refusal is never relaxed by a later scan's weaker or missing issue.
    set.meetingLinkIssue = existing.meetingLinkIssue ?? doc.meetingLinkIssue;
  }
  if (doc.youtubeWatch !== undefined) {
    if (!doc.youtubeWatch || typeof doc.youtubeWatch !== "object" || Array.isArray(doc.youtubeWatch)) {
      throw new Error("Invalid candidate watch provenance");
    }
    const watch = doc.youtubeWatch as Record<string, unknown>;
    if (typeof watch.videoId !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(watch.videoId) ||
        watch.url !== `https://www.youtube.com/watch?v=${watch.videoId}` ||
        (watch.source !== "body" && watch.source !== "snippet") ||
        Object.keys(watch).some(key => !["url", "videoId", "source"].includes(key))) {
      throw new Error("Invalid candidate watch provenance");
    }
    if (existing.youtubeWatch && (existing.youtubeWatch.url !== watch.url || existing.youtubeWatch.videoId !== watch.videoId)) {
      throw new Error("Conflicting candidate watch provenance");
    }
    if (!existing.youtubeWatchIssue && !doc.youtubeWatchIssue) set.youtubeWatch = watch;
  }
  return Object.fromEntries(Object.entries(set).filter(([key, value]) =>
    JSON.stringify(existing[key]) !== JSON.stringify(value)));
}

/** Inserts a new candidate iff no row with this `messageId` already exists for the tenant
 * (real Gmail messages never duplicate this way naturally, but a re-scan must not re-insert
 * one). Existing rows may refresh acquired provenance, never decisions or occurrence fields.
 * Returns true only for insertion, preserving the scan's created/autoApproved counters. */
export async function createIfNew(tenantId: string, doc: Omit<MeetingCandidates, "tenantId">, db: Db = getDb()): Promise<boolean> {
  const collection = meetingCandidates(tenantId, db);
  if (doc.tenantId !== undefined && doc.tenantId !== tenantId) throw new Error("Candidate owner mismatch");
  if (doc.evidenceIssue !== undefined && (typeof doc.evidenceIssue !== "string" || !["unresolved-body", "unsupported-attachment"].includes(doc.evidenceIssue))) throw new Error("Invalid candidate evidence refusal");
  const existing = await collection.findOne({ messageId: doc.messageId as string });
  if (existing) {
    if (existing.tenantId !== tenantId || existing.messageId !== doc.messageId ||
        existing.senderEmail !== doc.senderEmail || existing.senderDomain !== doc.senderDomain ||
        existing.subject !== doc.subject ||
        (existing.threadId !== undefined && existing.threadId !== doc.threadId) ||
        (doc.threadId !== undefined && (typeof doc.threadId !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(doc.threadId)))) {
      throw new Error("Candidate source identity mismatch");
    }
    const set = refreshProvenance(existing, doc);
    if (Object.keys(set).length) {
      // Compare-and-set the observed decisions, source identity, occurrence and provenance.
      // Missing fields require physical absence, not Mongo's null-or-missing equality.
      const keys = new Set([...Object.keys(existing), ...PRESERVED, ...PROVENANCE]);
      const filter = Object.fromEntries([...keys].map(key => [key,
        existing[key] === undefined ? {$exists: false} : {$eq: existing[key]}])) as Filter<MeetingCandidates>;
      // Query equality may match an array element; aggregation equality compares the
      // entire field. Literal field/value expressions also avoid interpreting stored data.
      filter.$expr = {$and: [...keys].filter(key => existing[key] !== undefined).map(key => ({$eq: [
        {$getField: {field: {$literal: key}, input: "$$ROOT"}}, {$literal: existing[key]},
      ]}))};
      const result = await collection.updateOne(filter, {$set: set});
      if (result.matchedCount !== 1) throw new Error("Candidate changed during provenance refresh");
    }
    return false;
  }
  await collection.insertOne(doc);
  return true;
}

/** Every candidate still awaiting a human decision. */
export async function listPending(tenantId: string): Promise<MeetingCandidates[]> {
  return meetingCandidates(tenantId).find({ status: "pending" }).toArray();
}

/** Every candidate, most recently detected first — the full review list (pending + decided). */
export async function listAll(tenantId: string): Promise<MeetingCandidates[]> {
  return meetingCandidates(tenantId).find({}).sort({ detectedAt: -1 }).toArray();
}

/** Moves one candidate to a decided status, stamping `decidedAt`. Returns false if the id
 * doesn't belong to this tenant or was already decided. */
export async function decide(
  tenantId: string,
  id: string,
  status: "approved" | "rejected" | "auto_approved",
): Promise<boolean> {
  const result = await meetingCandidates(tenantId).updateOne(
    { _id: id, status: "pending" },
    { $set: { status, decidedAt: new Date().toISOString() } },
  );
  return result.matchedCount > 0;
}
