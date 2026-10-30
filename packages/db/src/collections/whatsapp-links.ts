// packages/db/src/collections/whatsapp-links.ts — whatsapp-multiuser W1 (R-2, R-29, R-33, R-36, R-39).
// Tenant-scoped accessors for whatsapp_links, whatsapp_sync_runs and the append-only whatsapp_events.
// Every query takes a tenantId (scopedCollection forces it); there is no raw handle. Schemas:
// schema/whatsapp_{links,sync_runs,events}.schema.json. Indexes: schema/index.json, applied by
// migrations/20261029120000-whatsapp-links.cjs.
import { randomBytes } from "node:crypto";
import { ObjectId, type Db } from "mongodb";
import type { WhatsappEvents, WhatsappLinks, WhatsappSyncRuns } from "@lkb/core";
import { getDb } from "../client.js";
import { scopedCollection } from "../lib/tenantScope.js";

export const LIVE_LINK_STATES = ["requested", "approved", "active", "suspended"] as const;
export const TERMINAL_LINK_STATES = ["rejected", "unlinked", "revoked"] as const;
/** D-206 owner exception: WhatsApp-derived knowledge may reach external AI paths by default. Kept as a field so it can be tightened. */
export const DEFAULT_STUDENT_DATA = "no" as const;

/** `live` is derived from `state` and keyed by the unique partial index (one non-terminal link per user, R-2). */
export const isLiveLinkState = (state: string): boolean => (LIVE_LINK_STATES as readonly string[]).includes(state);
export const newWhatsAppId = (): string => new ObjectId().toHexString();

/**
 * Event ids are the feed's paging key (ISS-WAEF-001): `list` orders and pages by `_id`, never by the writer-supplied `at`.
 * Shape: 12 bytes, written as the 24 lowercase hex the schema requires and still a valid ObjectId:
 * 4 bytes epoch seconds (so it orders with the ObjectId ids already stored) + 2 bytes millisecond-in-second (0-999) +
 * 3 bytes random per generator (process) + 3 bytes counter. A stock ObjectId orders other processes' ids inside the
 * same second by their random bytes, which would let a second writer sort before an event a consumer already read;
 * the millisecond field shrinks that tie to one millisecond. Inside one generator ids strictly increase even if the clock steps back.
 * Honest bound: the id is taken just before the insert, so the order is generation order, not commit order. See docs/whatsapp/events.md.
 */
export function createEventIdGenerator(clock: () => number = Date.now, random: (n: number) => Buffer = randomBytes): () => string {
  const processBytes = random(3); let counter = random(3).readUIntBE(0, 3); let last = 0;
  return () => {
    last = Math.max(last, Math.trunc(clock())); counter = (counter + 1) & 0xffffff;
    const buf = Buffer.alloc(12);
    buf.writeUInt32BE(Math.floor(last / 1000), 0); buf.writeUInt16BE(last % 1000, 4); processBytes.copy(buf, 6); buf.writeUIntBE(counter, 9, 3);
    return buf.toString("hex");
  };
}
export const newWhatsAppEventId: () => string = createEventIdGenerator();

/** R-39: the only keys an event payload may carry (ids, codes, counts). Mirrors schema/whatsapp_events.schema.json data.properties; a test pins the two together. */
export const EVENT_DATA_KEYS = [
  "fromState", "toState", "reason", "errorCode", "requesterId", "approverId", "targetUserId", "runId", "candidateId",
  "groupCount", "markedCount", "fetched", "newTurns", "candidatesCreated", "count",
] as const;
/** Named so a rejection is explicit and greppable; anything outside EVENT_DATA_KEYS is refused anyway. */
export const FORBIDDEN_EVENT_FIELDS = [
  "text", "body", "message", "name", "displayName", "phone", "jid", "groupJid", "subject", "groupSubject", "qr", "qrData",
  "archiverOwnerId", "ownerUserId", "ownerRef",
] as const;

export type NewWhatsAppLink = Omit<WhatsappLinks, "_id" | "tenantId" | "live" | "studentData" | "createdAt" | "updatedAt"> &
  Partial<Pick<WhatsappLinks, "_id" | "studentData" | "createdAt" | "updatedAt">>;
export type NewWhatsAppEvent = Pick<WhatsappEvents, "eventType" | "actorKind"> & Partial<Pick<WhatsappEvents, "_id" | "at" | "linkId" | "actorId" | "data">>;

export function whatsAppLinkStores(db: Pick<Db, "collection">) {
  const links = scopedCollection<WhatsappLinks>(db, "whatsapp_links");
  const syncRuns = scopedCollection<WhatsappSyncRuns>(db, "whatsapp_sync_runs");
  const events = scopedCollection<WhatsappEvents>(db, "whatsapp_events");

  return {
    /** Full scoped accessor (find/findOne/updateOne/...). Lifecycle writes are owned by later units. */
    links,
    syncRuns,
    getLink: (tenantId: string, linkId: string) => links(tenantId).findOne({ _id: linkId }),
    /** The single live (non-terminal) link of a person, or null. userId is matched literally; null never matches (legacy links have no person). */
    findLiveLinkForUser: (tenantId: string, userId: string) => {
      if (typeof userId !== "string" || userId.length === 0) throw new Error("findLiveLinkForUser: userId is required");
      return links(tenantId).findOne({ userId, live: true });
    },
    /** Inserts a link; `live` is always derived from `state` (a caller cannot set it) and studentData defaults per D-206. */
    insertLink(tenantId: string, input: NewWhatsAppLink): Promise<WhatsappLinks> {
      const now = new Date().toISOString();
      const doc = {
        ...input, _id: input._id ?? newWhatsAppId(), live: isLiveLinkState(String(input.state)),
        studentData: input.studentData ?? DEFAULT_STUDENT_DATA, createdAt: input.createdAt ?? now, updatedAt: input.updatedAt ?? now,
      };
      return links(tenantId).insertOne(doc as Omit<WhatsappLinks, "tenantId">).then(() => ({ ...doc, tenantId }) as WhatsappLinks);
    },

    /** Append-only (R-29): this accessor has insert and read helpers and nothing else. */
    events: (tenantId: string) => {
      const coll = events(tenantId);
      return Object.freeze({
        async insert(event: NewWhatsAppEvent): Promise<WhatsappEvents> {
          assertEventPayloadSafe(event);
          const doc = { ...event, _id: event._id ?? newWhatsAppEventId(), at: event.at ?? new Date().toISOString() };
          await coll.insertOne(doc as Omit<WhatsappEvents, "tenantId">);
          return { ...doc, tenantId } as WhatsappEvents;
        },
        get: (eventId: string) => coll.findOne({ _id: eventId }),
        /**
         * Cursor-paged in `_id` order (the commit-order key, ISS-WAEF-001), NOT by `at`: `at` is stamped by the writer and the api and
         * scripts/whatsapp/sync-links.mjs both write, so an event with an earlier `at` can commit after a consumer read past it, and an
         * `at` order would never deliver it. `afterId` is the last event id the caller saw; an unknown or other-tenant id throws "unknown cursor".
         * Residual window (docs/whatsapp/events.md): an id is taken just before its insert, so an event whose insert is still in flight
         * (a stalled writer, or host clocks that disagree) when a consumer reads a LATER id can still be passed over; consumers dedupe on id.
         */
        async list(opts: { afterId?: string; linkId?: string; limit?: number } = {}): Promise<WhatsappEvents[]> {
          const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 100), 1), 500);
          const filter: Record<string, unknown> = opts.linkId ? { linkId: opts.linkId } : {};
          if (opts.afterId) {
            const cursor = await coll.findOne({ _id: opts.afterId });
            if (!cursor) throw new Error("whatsapp_events: unknown cursor");
            filter._id = { $gt: cursor._id };
          }
          return coll.find(filter).sort({ _id: 1 }).limit(limit).toArray();
        },
      });
    },
  };
}

/** R-39 defence in depth (the collection validator is the other layer): refuses unknown/forbidden payload keys and non-scalar values. */
export function assertEventPayloadSafe(event: NewWhatsAppEvent): void {
  const allowedTop = new Set(["_id", "eventType", "actorKind", "at", "linkId", "actorId", "data"]);
  for (const key of Object.keys(event)) if (!allowedTop.has(key)) throw new Error(`whatsapp_events: field ${key} is not allowed`);
  for (const [key, value] of Object.entries(event.data ?? {})) {
    if ((FORBIDDEN_EVENT_FIELDS as readonly string[]).includes(key) || !(EVENT_DATA_KEYS as readonly string[]).includes(key)) {
      throw new Error(`whatsapp_events: payload field ${key} is not allowed (ids, counts and codes only)`);
    }
    if (typeof value !== "string" && !Number.isInteger(value)) throw new Error(`whatsapp_events: payload field ${key} must be a code, id or count`);
  }
}

/** Default stores over the connected Db (client.connect first). Accessor functions take tenantId first. */
export const whatsAppLinks = (tenantId: string) => whatsAppLinkStores(getDb()).links(tenantId);
export const whatsAppSyncRuns = (tenantId: string) => whatsAppLinkStores(getDb()).syncRuns(tenantId);
export const whatsAppEvents = (tenantId: string) => whatsAppLinkStores(getDb()).events(tenantId);
export const getWhatsAppLink = (tenantId: string, linkId: string) => whatsAppLinkStores(getDb()).getLink(tenantId, linkId);
export const findLiveWhatsAppLinkForUser = (tenantId: string, userId: string) => whatsAppLinkStores(getDb()).findLiveLinkForUser(tenantId, userId);
export const insertWhatsAppLink = (tenantId: string, input: NewWhatsAppLink) => whatsAppLinkStores(getDb()).insertLink(tenantId, input);
