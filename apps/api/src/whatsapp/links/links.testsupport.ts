/**
 * Test doubles for the WhatsApp links service (W5): an in-memory LinksStore that emulates the Mongo behaviours the service
 * relies on (one live link per (tenant, user), archiverOwnerId unique across tenants, CAS guards, closed event shapes), and
 * a recording archiver port. No real-Mongo claim: see links.mongo.test.ts for the gated real-database run.
 */
import { randomBytes } from "node:crypto";
import { LIVE_STATES, LiveLinkExistsError, type LinkDataPort, type LinkRow, type LinksStore, type NewEvent, type Transition } from "./service.js";
import { parseNotice } from "./notice.js";

export const NOTICE = parseNotice("# Notice\n\n- You are linking your own WhatsApp.\n- The KB archives groups you pick.\n");
export const T1 = "tenant-1", T2 = "tenant-2";
export const NOW = "2026-11-01T00:00:00.000Z";

export interface MemStore extends LinksStore {
  rows: Map<string, LinkRow>;
  events: Array<NewEvent & { tenantId: string }>;
  failEvents: boolean;
}

const GUARD: Record<string, (r: LinkRow) => boolean> = {
  owner_id: r => typeof r.archiverOwnerId === "string", activated: r => typeof r.activatedAt === "string",
  needs_relink: r => (r.health?.flags ?? []).includes("needs-relink"), legacy: r => r.userId === null,
};

export function memoryLinksStore(): MemStore {
  const rows = new Map<string, LinkRow>(), events: MemStore["events"] = [];
  const mine = (t: string, id: string): LinkRow | undefined => { const r = rows.get(id); return r && r.tenantId === t ? r : undefined; };
  const liveClash = (t: string, userId: string | null, except?: string): boolean =>
    userId !== null && [...rows.values()].some(r => r.tenantId === t && r.userId === userId && r.live && r._id !== except);
  const store: MemStore = {
    rows, events, failEvents: false,
    async insert(tenantId, row) {
      if (row.userId !== null && row.state !== "rejected" && liveClash(tenantId, row.userId)) throw new LiveLinkExistsError();
      const full = { ...row, _id: randomBytes(12).toString("hex"), tenantId, live: LIVE_STATES.includes(row.state) } as LinkRow;
      rows.set(full._id, full); return structuredClone(full);
    },
    async get(t, id) { const r = mine(t, id); return r ? structuredClone(r) : null; },
    async listForUser(t, userId) { return [...rows.values()].filter(r => r.tenantId === t && r.userId === userId).map(r => structuredClone(r)); },
    async listAll(t, limit) { return [...rows.values()].filter(r => r.tenantId === t).slice(0, limit).map(r => structuredClone(r)); },
    async hasBlockingLink(t, userId) { return [...rows.values()].some(r => r.tenantId === t && r.userId === userId && r.state === "revoked" && r.blocksNewRequests === true); },
    async transition(t, id, tr: Transition) {
      const r = mine(t, id);
      if (!r || !tr.from.includes(r.state) || (tr.require ?? []).some(g => !GUARD[g]!(r))) return null;
      const next = tr.set && "userId" in tr.set ? (tr.set.userId as string) : r.userId;
      if (next !== r.userId && liveClash(t, next, r._id)) throw new LiveLinkExistsError();
      Object.assign(r, tr.set ?? {}, { state: tr.to, live: LIVE_STATES.includes(tr.to), updatedAt: NOW });
      for (const k of tr.unset ?? []) delete (r as unknown as Record<string, unknown>)[k];
      return structuredClone(r);
    },
    async setOwnerId(t, id, ownerId) {
      const r = mine(t, id);
      if (!r || !["approved", "active", "suspended"].includes(r.state)) return "gone";
      if ([...rows.values()].some(x => x._id !== id && x.archiverOwnerId === ownerId)) return "conflict";
      if (r.archiverOwnerId) return r.archiverOwnerId === ownerId ? "same" : "conflict";
      r.archiverOwnerId = ownerId; return "set";
    },
    async touch(t, id, from) { const r = mine(t, id); if (!r || !from.includes(r.state)) return false; r.updatedAt = NOW; return true; },
    async ownerInUseByOther(t, ownerId, except) { return [...rows.values()].some(r => r.tenantId === t && r._id !== except && r.archiverOwnerId === ownerId); },
    async appendEvent(t, e) {
      if (store.failEvents) throw new Error("mongo down");
      for (const v of Object.values(e.data ?? {})) if (typeof v !== "string" && typeof v !== "number") throw new Error("closed event data: scalars only");
      events.push({ ...structuredClone(e), tenantId: t });
    },
  };
  return store;
}

/** Seeds a row directly (bypasses the service) so a test can start from any state. */
export function seed(store: MemStore, over: Partial<LinkRow> & Pick<LinkRow, "tenantId" | "state">): LinkRow {
  const row = { _id: randomBytes(12).toString("hex"), userId: "u-member", label: "Mine", live: LIVE_STATES.includes(over.state), studentData: "no", createdAt: NOW, updatedAt: NOW, ...over } as LinkRow;
  store.rows.set(row._id, row); return row;
}

export interface MemData extends LinkDataPort {
  calls: Array<{ op: "quarantine" | "withdraw"; tenantId: string; linkId: string; ownerId: string | undefined; recordedBy?: string }>;
  fail: { quarantine: boolean; withdraw: boolean };
}
/** Recording LinkDataPort double: the real Mongo port is exercised in review/link-data.test.ts (fixture db) and unlink.mongo.test.ts (real Mongo, gated). */
export function memoryLinkData(): MemData {
  const d: MemData = {
    calls: [], fail: { quarantine: false, withdraw: false },
    async quarantineCandidates(tenantId, linkId, ownerId) { d.calls.push({ op: "quarantine", tenantId, linkId, ownerId }); if (d.fail.quarantine) throw new Error("mongo down"); return 0; },
    async withdrawSources(tenantId, linkId, ownerId, recordedBy) { d.calls.push({ op: "withdraw", tenantId, linkId, ownerId, recordedBy }); if (d.fail.withdraw) throw new Error("mongo down"); return 0; },
  };
  return d;
}
