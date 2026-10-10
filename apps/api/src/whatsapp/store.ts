/**
 * apps/api/src/whatsapp-store.ts — T-007 first slice. A REAL, READ-ONLY connection to
 * `sources/whatsapp_msg`'s OWN, separate Mongo database (its own container, port 27018 by
 * default — confirmed live: `docker ps` shows `whatsapp-msg-mongo`). That submodule keeps its
 * own governance per this repo's CLAUDE.md ("do not duplicate its governance here, reference it
 * instead") — this file only ever reads, never writes, and never imports its source code, only
 * its documented collection shapes (`src/db/types.ts` there: `PersonDoc`/`MessageDoc`/`GroupDoc`).
 */
import { MongoClient, ObjectId, type Db } from "mongodb";
import { getDb as getAppDb } from "@lkb/db";
import type { Sources, Sessions, Turns } from "@lkb/core";
import { createWhatsAppSource, type WhatsAppFetcher, type WhatsAppMessage, type ConsentContext, type Turn } from "@lkb/ingest";
import type { WhatsAppRouteDeps, WhatsAppGroup, WhatsAppIngestResult } from "../routes/whatsapp.js";
import { sha256Hex } from "../hash.js";
import type { BoundIndexer } from "../indexing/session.js";

let client: MongoClient | null = null;
let db: Db | null = null;

async function getWhatsAppDb(): Promise<Db> {
  if (db) return db;
  const url = process.env.WHATSAPP_MONGO_URL ?? "mongodb://127.0.0.1:27018";
  const dbName = process.env.WHATSAPP_MONGO_DB ?? "whatsapp_msg";
  client = new MongoClient(url);
  await client.connect();
  db = client.db(dbName);
  return db;
}

interface PersonDoc { _id: ObjectId; displayName: string | null; savedName: string | null; pushName: string | null; }
interface MessageDoc { messageId: string; groupJid: string; personId: ObjectId; text: string | null; ts: Date; deletedAt: Date | null; }
interface GroupDoc { _id: ObjectId; jid: string; subject: string; ownerUserId: ObjectId; isTracked: boolean; }

function displayNameOf(p: PersonDoc | undefined, fallback: string): string {
  return p?.displayName ?? p?.savedName ?? p?.pushName ?? fallback;
}

/** The real `WhatsAppFetcher` `@lkb/ingest`'s whatsapp adapter needs. Deleted messages and
 * media-only messages (no `text`) are excluded — a claims pipeline has nothing to extract from
 * either, and a deleted message being silently un-deleted into the KB would be a real bug.
 * Sorted `{ ts: 1, _id: 1 }` — real data-engineer review (2026-09-06) found genuine same-second
 * timestamp ties in the live `whatsapp_msg` data; `ts` alone gives Mongo no stable tiebreak, so
 * turn order (and this file's own zip against `messageId` below) could silently reorder between
 * runs without the `_id` tiebreak. */
export const fetchWhatsAppMessages: WhatsAppFetcher = async (groupJid, ownerUserId) => {
  const wadb = await getWhatsAppDb();
  const messages = await wadb.collection<MessageDoc>("messages")
    .find({ groupJid, ownerUserId: new ObjectId(ownerUserId), deletedAt: null, text: { $ne: null } })
    .sort({ ts: 1, _id: 1 })
    .toArray();

  const personIds = [...new Set(messages.map((m) => m.personId.toString()))].map((id) => new ObjectId(id));
  const people = await wadb.collection<PersonDoc>("people").find({ _id: { $in: personIds }, ownerUserId: new ObjectId(ownerUserId) }).toArray();
  const peopleById = new Map(people.map((p) => [p._id.toString(), p]));

  return messages.map((m): WhatsAppMessage => ({
    messageId: m.messageId,
    personId: m.personId.toString(),
    displayName: displayNameOf(peopleById.get(m.personId.toString()), m.personId.toString()),
    text: m.text ?? "",
    ts: m.ts.toISOString(),
  }));
};

export interface TrackableGroup {
  groupJid: string;
  ownerUserId: string;
  subject: string;
  trackedPersonCount: number;
}

/** Real, live-queried list of groups the archiver is actually tracking, so a caller can see
 * what's really capturable before ingesting anything — never a hardcoded/fixture list. */
export async function listTrackableGroups(ownerUserId: string): Promise<TrackableGroup[]> {
  const wadb = await getWhatsAppDb();
  const groups = await wadb.collection<GroupDoc>("groups").find({ isTracked: true, ownerUserId: new ObjectId(ownerUserId) }).toArray();
  const tracking = await wadb.collection<{ groupJid: string }>("tracking").find({ ownerUserId: new ObjectId(ownerUserId) }).toArray();

  const countByGroup = new Map<string, number>();
  for (const t of tracking) countByGroup.set(t.groupJid, (countByGroup.get(t.groupJid) ?? 0) + 1);

  return groups.map((g) => ({
    groupJid: g.jid,
    ownerUserId: g.ownerUserId.toString(),
    subject: g.subject,
    trackedPersonCount: countByGroup.get(g.jid) ?? 0,
  }));
}

/** Real `WhatsAppRouteDeps` (routes/whatsapp.ts). Same persist shape `ingest-store.ts` writes
 * for a URL ingest (sources + sessions + turns), reusing the already-real `GET /sessions/:id`
 * view — no second "ingested content" viewer built for this source kind either.
 *
 * Idempotency (real bug fixed per this session's data-engineer review, 2026-09-06): `source._id`
 * and `sessionId` are both now stable per `(groupJid, ownerUserId)` (the adapter's own `_id` hash
 * — see whatsapp.ts), and every write below is an upsert. A re-ingest of the same group always
 * targets the SAME source/session doc and upserts turns keyed by the real WhatsApp `messageId`
 * (never a positional index), so running this twice with no new messages leaves the corpus
 * byte-identical, and running it after N new messages arrive adds exactly N new turns — never a
 * duplicate-key failure, never a re-write of the group's whole history. */
export interface WhatsAppStoreOptions {
  resolveOwner?: (authenticatedTenantId: string) => Promise<string | null>;
  appDb?: () => Db;
  listGroups?: typeof listTrackableGroups;
  fetchMessages?: WhatsAppFetcher;
}
/** Trusted server-only resolver; omitted mappings fail before upstream/app database access. */
export function createMongoWhatsAppDeps(indexSession?: BoundIndexer, options: WhatsAppStoreOptions = {}): WhatsAppRouteDeps {
  const listGroups = options.listGroups ?? listTrackableGroups;
  const fetchMessages = options.fetchMessages ?? fetchWhatsAppMessages;
  const appDb = options.appDb ?? getAppDb;
  async function ownerFor(tenantId: string): Promise<string> {
    const owner = await options.resolveOwner?.(tenantId);
    if (!owner || !ObjectId.isValid(owner)) throw new Error("WhatsApp owner authorization unavailable");
    return owner;
  }

  return {
    async listGroups(tenantId) { return listGroups(await ownerFor(tenantId)); },

    async ingestGroup(tenantId, groupJid): Promise<WhatsAppIngestResult> {
      // Real bug fixed per this session's data-engineer review: ownerUserId used to come straight
      // from the request body (routes/whatsapp.ts), letting any `whatsapp`-scoped key ingest any
      // archiver owner's private groups. It is now ALWAYS resolved here, from the live trackable-
      // groups list, by the groupJid the caller actually asked to ingest -- never client-supplied.
      const ownerUserId = await ownerFor(tenantId);
      const groups = await listGroups(ownerUserId);
      const group = groups.find((g) => g.groupJid === groupJid && g.ownerUserId === ownerUserId);
      if (!group) throw new Error(`no tracked WhatsApp group with jid "${groupJid}"`);
      // Owner is bound to the authenticated tenant, never selected from an unscoped group.

      // The archiver only captures a sender the account owner explicitly selected for tracking
      // (its own D-002/D-005) -- a deliberate, informed choice, never a background silent
      // capture (D-008 provided-first ordering).
      const consent: ConsentContext = { captureMode: "provided", given: true, recordedBy: `whatsapp-owner:${ownerUserId}` };
      // One authorized request-local snapshot supplies both identities and adapter payloads.
      const messages = Object.freeze((await fetchMessages(groupJid, ownerUserId)).map((m): WhatsAppMessage => Object.freeze({
        messageId: String(m.messageId),
        personId: String(m.personId),
        displayName: m.displayName == null ? "" : String(m.displayName),
        text: String(m.text),
        ts: new Date(m.ts).toISOString(),
      })));
      const whatsAppSource = createWhatsAppSource({ hasher: sha256Hex, fetcher: async () => [...messages] });
      const { source } = await whatsAppSource.fetch({ kind: "whatsapp", groupJid, ownerUserId, tenantId }, consent);
      await appDb().collection<Sources>("sources")
        .replaceOne({ _id: source._id, tenantId }, source, { upsert: true });

      // IDs, session date and turns consume the same frozen authorized message snapshot.
      const turns = await whatsAppSource.toTurns(source);

      const sessionId = source._id; // stable per (groupJid, ownerUserId) -- see whatsapp.ts
      const session: Sessions = {
        _id: sessionId,
        tenantId,
        sourceId: source._id,
        title: `WhatsApp: ${group.subject}`,
        date: (messages[0]?.ts ?? new Date().toISOString()).slice(0, 10),
        status: { transcribe: "done", index: "pending" },
      };
      await appDb().collection<Sessions>("sessions")
        .replaceOne({ _id: sessionId, tenantId }, session, { upsert: true });

      const turnDocs: Turns[] = turns.map((t: Turn, i: number) => ({
        _id: sha256Hex(`${sessionId}:${messages[i]!.messageId}`),
        tenantId,
        sessionId,
        speakerRef: t.speakerRef,
        tStart: t.tStart,
        tEnd: t.tEnd,
        text: t.text,
        // Real bug found live 2026-09-06: `t.speakerLabel` (the real resolved WhatsApp
        // pushName/savedName from `displayNameOf` above) was computed then discarded --
        // every ingested WhatsApp turn showed a raw personId hash in the UI, not who said it.
        ...(t.speakerLabel ? { speakerLabel: t.speakerLabel } : {}),
        ...(t.occurredAt ? { occurredAt: t.occurredAt } : {}),
      }));
      if (turnDocs.length > 0) {
        await appDb().collection<Turns>("turns").bulkWrite(
          turnDocs.map((doc) => ({
            replaceOne: { filter: { _id: doc._id, tenantId }, replacement: doc, upsert: true },
          })),
        );
      }

      if (indexSession) {
        try {
          const res = await indexSession(tenantId, sessionId);
          // ISS-116, same reasoning as ingest-store: a session that indexed but got no vectors is
          // invisible to vector search while every status field says "done".
          if (res.chunks.skipped) {
            console.warn(
              `ingestGroup: session ${sessionId} indexed but has NO vectors (${res.chunks.skipped}) — ` +
                "it will not be reachable by vector search",
            );
          }
        } catch (err) {
          console.error(`ingestGroup: indexing failed for session ${sessionId} (raw content still stored):`, err);
        }
      }

      return { sessionId, sourceId: source._id, turnCount: turnDocs.length };
    },
  };
}
