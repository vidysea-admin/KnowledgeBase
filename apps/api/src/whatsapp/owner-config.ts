/** Owner resolution for WhatsApp archive reads (whatsapp-multiuser W4, R-24/R-25). Grants come from active `whatsapp_links` rows; `WHATSAPP_TENANT_OWNER_MAP` is only a boot seed. Never client input. */
import type { Db } from "mongodb";
import { assertValidTenantId, whatsAppLinkStores, withTenant } from "@lkb/db";
import type { Sessions, Sources, WhatsappCandidates } from "@lkb/core";
import type { Request } from "express";
import { actorId, type VerifiedKey } from "../auth.js";
import { sha256Hex } from "../hash.js";

/** Expected missing owner/source availability. Never carries private provider diagnostics. */
export class WhatsAppUnavailableError extends Error {
  constructor() { super("WhatsApp source unavailable"); this.name = "WhatsAppUnavailableError"; }
}

/** The caller has no permitted owner (no link, no seed, or an empty permitted set): a configuration gap, reported as `not_configured` (G-A1). */
export class WhatsAppNotConfiguredError extends WhatsAppUnavailableError {
  constructor() { super(); this.name = "WhatsAppNotConfiguredError"; }
}

/** A group jid is marked by more than one permitted link and the caller named none (R-25 / W4 acceptance 2). HTTP mapping to 409 belongs to the route unit. */
export class WhatsAppAmbiguousLinkError extends Error {
  readonly status = 409; readonly code = "ambiguous_link";
  constructor() { super("ambiguous_link: group is marked by more than one permitted link; linkId is required"); this.name = "WhatsAppAmbiguousLinkError"; }
}

/** The named group is absent from the caller's permitted owners (never marked, other owner, other tenant): one outcome for all, so existence is not revealed. HTTP 404. */
export class WhatsAppGroupNotFoundError extends Error {
  readonly status = 404; readonly code = "not_found";
  constructor(groupJid: string) { super(`no tracked WhatsApp group with jid "${groupJid}"`); this.name = "WhatsAppGroupNotFoundError"; }
}

/** Who is asking, derived from the verified principal only (never from request data). */
export type WhatsAppCaller = { kind: "session"; userId: string; admin: boolean } | { kind: "key"; admin: boolean };
/** Optional narrowing passed by the route layer; `linkId` selects one of several permitted links. */
export interface WhatsAppResolveScope { caller?: WhatsAppCaller; linkId?: string }
/** One permitted archiver owner; `linkId` is null only for a value that did not come from a link row (legacy single-owner resolver). */
export interface WhatsAppOwnerGrant { readonly linkId: string | null; readonly ownerUserId: string }
export type WhatsAppOwnersResolver = (authenticatedTenantId: string, caller?: WhatsAppCaller) => Promise<readonly WhatsAppOwnerGrant[]>;

/** `whatsapp-admin` is read from the exact scope. A session principal without a userId fails closed to a plain, non-admin key caller. */
export function whatsAppCallerFromAuth(auth: VerifiedKey | undefined): WhatsAppCaller {
  const admin = Array.isArray(auth?.scopes) && auth.scopes.some(s => s === "whatsapp-admin");
  if (auth?.principal === "session" && typeof auth.userId === "string" && auth.userId.length > 0) return { kind: "session", userId: auth.userId, admin };
  return { kind: "key", admin: admin && auth?.principal !== "session" };
}

/** Verified actor string for the audit trail and review decisions: the stored principal id (UA-29), else (key fixtures without one) a fingerprint of the presented bearer. Never the bearer itself. */
function actorBase(req: Request): string | null {
  const id = actorId(req.auth);
  if (id) return id;
  const match = /^Bearer\s+(.+)$/iu.exec(req.header("authorization") ?? "");
  return match ? `api-key-sha256:${sha256Hex(match[1]!)}` : null;
}
export { actorBase };
/** Identity written into `admin.raw_read` (R-29): kind plus verified actor id, or null when no stable identity exists (the read is then refused). */
export function auditWho(req: Request): { actorKind: "user" | "key"; actorId: string } | null {
  const base = actorBase(req);
  return base ? { actorKind: req.auth?.principal === "session" ? "user" : "key", actorId: base } : null;
}
export const callerOf = (req: Request): WhatsAppCaller => whatsAppCallerFromAuth(req.auth);

export interface ActiveLinkRow { _id?: unknown; tenantId?: unknown; userId?: unknown; state?: unknown; archiverOwnerId?: unknown }
const OWNER_ID = /^[0-9a-f]{24}$/;

/** R-24/R-25. Returns the owners the caller may read: admin session or whatsapp-admin key -> every active link of the tenant; member session -> its own
 * link only; plain key or no caller -> legacy links (userId null) only. An empty set is refused, never widened. */
export function createLinkBackedWhatsAppOwnerResolver(readActiveLinks: (tenantId: string) => Promise<readonly ActiveLinkRow[]>): WhatsAppOwnersResolver {
  return async (tenantId, caller) => {
    const grants = new Map<string, WhatsAppOwnerGrant>();
    for (const link of await readActiveLinks(tenantId)) {
      if (link.tenantId !== tenantId || link.state !== "active" || typeof link._id !== "string" || typeof link.archiverOwnerId !== "string" || !OWNER_ID.test(link.archiverOwnerId)) continue;
      const mine = caller?.kind === "session" && typeof link.userId === "string" && link.userId === caller.userId;
      const permitted = caller?.admin === true || (caller?.kind === "session" ? mine : link.userId === null);
      if (permitted && !grants.has(link.archiverOwnerId)) grants.set(link.archiverOwnerId, Object.freeze({ linkId: link._id, ownerUserId: link.archiverOwnerId }));
    }
    if (grants.size === 0) throw new WhatsAppNotConfiguredError();
    return Object.freeze([...grants.values()]);
  };
}

export type WhatsAppOwnerResolver = (authenticatedTenantId: string) => Promise<string | null>;
const INVALID_MAP = "Invalid WHATSAPP_TENANT_OWNER_MAP configuration";
/** Parses the deployment env map. An unset/blank value is an empty list; anything malformed throws (boot fails). */
export function parseWhatsAppOwnerMap(raw: string | undefined): Array<{ tenantId: string; ownerUserId: string }> {
  if (raw === undefined || raw.trim() === "") return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error(INVALID_MAP); }
  const fail = (): never => { throw new Error(INVALID_MAP); };
  if (!Array.isArray(parsed)) return fail();
  const tenants = new Set<string>();
  const owners = new Set<string>();
  const entries: Array<{ tenantId: string; ownerUserId: string }> = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return fail();
    const row = item as Record<string, unknown>;
    if (Object.keys(row).length !== 2 || !Object.hasOwn(row, "tenantId") || !Object.hasOwn(row, "ownerUserId")) return fail();
    if (typeof row.tenantId !== "string" || row.tenantId.length === 0 || row.tenantId !== row.tenantId.trim()) return fail();
    if (typeof row.ownerUserId !== "string" || !/^[0-9a-fA-F]{24}$/.test(row.ownerUserId)) return fail();
    const owner = row.ownerUserId.toLowerCase();
    // One archiver owner per tenant; sharing an owner would collide with current source IDs.
    if (tenants.has(row.tenantId) || owners.has(owner)) return fail();
    tenants.add(row.tenantId); owners.add(owner);
    entries.push({ tenantId: row.tenantId, ownerUserId: owner });
  }
  return entries;
}

/** Env-map-only resolver (the pre-W4 behaviour). Kept for callers and tests that have no link store. */
export function createConfiguredWhatsAppOwnerResolver(raw: string | undefined): WhatsAppOwnerResolver {
  const grants = new Map(parseWhatsAppOwnerMap(raw).map(e => [e.tenantId, e.ownerUserId] as const));
  return async tenantId => grants.get(tenantId) ?? null;
}

export interface SeedLog { info(message: string): void; warn(message: string): void }
export interface LegacySeedStore {
  listLinks(tenantId: string): Promise<ReadonlyArray<{ archiverOwnerId?: unknown }>>;
  insertLegacyLink(tenantId: string, ownerUserId: string): Promise<{ linkId: string }>;
}
const isDuplicateKey = (error: unknown): boolean => typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000;

/** R-24 boot seed: one `active` legacy link (userId null) per map entry, only for a tenant that has no link rows at all. A map that disagrees with
 * existing links is ignored with a warning (links are authoritative). Owner ids are never logged. Returns the number created. */
export async function seedLegacyWhatsAppLinks(entries: ReadonlyArray<{ tenantId: string; ownerUserId: string }>, store: LegacySeedStore, log: SeedLog): Promise<number> {
  let created = 0;
  for (const { tenantId, ownerUserId } of entries) {
    const existing = await store.listLinks(tenantId);
    if (existing.length > 0) {
      if (!existing.some(l => l.archiverOwnerId === ownerUserId)) log.warn(`WHATSAPP_TENANT_OWNER_MAP entry for tenant "${tenantId}" disagrees with existing whatsapp_links and is ignored; links are authoritative`);
      continue;
    }
    try {
      const { linkId } = await store.insertLegacyLink(tenantId, ownerUserId);
      created++;
      log.info(`seeded legacy WhatsApp link ${linkId} for tenant "${tenantId}" from WHATSAPP_TENANT_OWNER_MAP`);
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      log.warn(`WHATSAPP_TENANT_OWNER_MAP entry for tenant "${tenantId}" is ignored: its owner is already linked`);
    }
  }
  return created;
}

/** Production resolver: reads active links from the app database; seeds legacy links from the env map once (lazily, memoised, idempotent). An invalid map throws here, at composition. */
export function createDbBackedWhatsAppOwners(options: { rawMap: string | undefined; db: Pick<Db, "collection">; log?: SeedLog; now?: () => string }): WhatsAppOwnersResolver {
  const entries = parseWhatsAppOwnerMap(options.rawMap);
  const log = options.log ?? console;
  const stores = () => whatsAppLinkStores(options.db); // lazily: the lazy Db handle must not be touched at composition time
  const seedStore: LegacySeedStore = {
    listLinks: (tenantId) => stores().links(tenantId).find({}).toArray(),
    async insertLegacyLink(tenantId, ownerUserId) {
      const at = (options.now ?? (() => new Date().toISOString()))();
      const link = await stores().insertLink(tenantId, { userId: null, label: "legacy", state: "active", archiverOwnerId: ownerUserId, approvedBy: "system:env-seed", approvedAt: at, activatedAt: at });
      return { linkId: link._id };
    },
  };
  let seeded: Promise<unknown> | undefined;
  const ensureSeeded = (): Promise<unknown> => entries.length === 0 ? Promise.resolve() : (seeded ??= seedLegacyWhatsAppLinks(entries, seedStore, log).catch((error: unknown) => { seeded = undefined; throw error; }));
  return createLinkBackedWhatsAppOwnerResolver(async tenantId => {
    try { await ensureSeeded(); return await stores().links(tenantId).find({ state: "active" }).toArray(); }
    catch (error) {
      // The cause (host names, driver text) is never surfaced to the caller or the log.
      log.warn(`WhatsApp link store unavailable (${error instanceof Error ? error.name : "error"})`);
      throw new WhatsAppUnavailableError();
    }
  });
}


/** W7 / R-26, R-27, R-29: who may read or act on a WhatsApp source's RAW content. Owner = the session whose userId equals the source's link userId;
 * admin (whatsapp-admin session or key) = every link in the tenant; a plain key, a viewer, another member, a legacy link (no owner) or an unresolvable
 * link = denied. Fails closed: any doubt (missing source, tenant mismatch, link/owner disagreement) is `allowed: false`. */
export type WhatsAppRawDecision = { allowed: false } | { allowed: true; linkId: string | null; sourceId: string; ownerView: boolean };
export interface WhatsAppRawAccess {
  forSource(tenantId: string, sourceId: string, caller: WhatsAppCaller): Promise<WhatsAppRawDecision>;
  /** Reads only the candidate row's sourceId (no evidence validation), so a probe of someone else's candidate id costs and reveals nothing. */
  forCandidate(tenantId: string, candidateId: string, caller: WhatsAppCaller): Promise<WhatsAppRawDecision>;
  /** Session read path: tells a WhatsApp session (decision = owner-or-admin) apart from any other session (`whatsapp: false`, the existing trusted path decides).
   * A session whose source cannot be classified is treated as WhatsApp and denied. */
  forSession(tenantId: string, sessionId: string, caller: WhatsAppCaller): Promise<{ whatsapp: false } | { whatsapp: true; decision: WhatsAppRawDecision }>;
  /** R-29: an admin reading content that is not theirs writes an append-only `admin.raw_read` event (ids and counts only). Throws on failure so the caller can refuse the read. */
  auditAdminRead(tenantId: string, who: { actorKind: "user" | "key"; actorId: string }, read: { linkId: string | null; candidateId?: string; count?: number }): Promise<void>;
}
const LINK_ID = /^[0-9a-f]{24}$/;

export function createWhatsAppRawAccess(db: Pick<Db, "collection">): WhatsAppRawAccess {
  const deny: WhatsAppRawDecision = { allowed: false };
  async function forSource(tenantId: string, sourceId: string, caller: WhatsAppCaller): Promise<WhatsAppRawDecision> {
    try {
      assertValidTenantId(tenantId, "whatsapp.rawAccess");
      if (typeof sourceId !== "string" || sourceId.length === 0) return deny;
      const source = await db.collection<Sources>("sources").findOne(withTenant<Sources>(tenantId, { _id: sourceId }));
      if (!source || source.tenantId !== tenantId || source._id !== sourceId || source.kind !== "whatsapp-batch") return deny;
      const stores = whatsAppLinkStores(db);
      const stamped = (source.sourceMeta as Record<string, unknown> | undefined)?.whatsappLinkId;
      const sourceOwner: unknown = (source as unknown as { ownerUserId?: unknown }).ownerUserId; // set by the WhatsApp source adapter
      let link: ActiveLinkRow | null = null;
      if (typeof stamped === "string" && LINK_ID.test(stamped)) link = await stores.getLink(tenantId, stamped);
      else if (typeof sourceOwner === "string" && OWNER_ID.test(sourceOwner)) link = await stores.links(tenantId).findOne({ archiverOwnerId: sourceOwner });
      // A stamp that disagrees with the source's own archiver owner is a broken binding: nobody is the owner.
      if (link && typeof sourceOwner === "string" && link.archiverOwnerId !== sourceOwner) link = null;
      if (link && link.tenantId !== tenantId) link = null;
      const linkId = link && typeof link._id === "string" ? link._id : null;
      const ownerView = caller.kind === "session" && link !== null && typeof link.userId === "string" && link.userId.length > 0 && link.userId === caller.userId;
      if (ownerView || caller.admin === true) return { allowed: true, linkId, sourceId, ownerView };
      return deny;
    } catch { return deny; }
  }
  return {
    forSource,
    async forSession(tenantId, sessionId, caller) {
      try {
        assertValidTenantId(tenantId, "whatsapp.rawAccess");
        if (typeof sessionId !== "string" || sessionId.length === 0) return { whatsapp: false };
        const session = await db.collection<Sessions>("sessions").findOne(withTenant<Sessions>(tenantId, { _id: sessionId }));
        if (!session || session.tenantId !== tenantId || session._id !== sessionId) return { whatsapp: false }; // nothing to protect; the trusted path answers 404
        const source = await db.collection<Sources>("sources").findOne(withTenant<Sources>(tenantId, { _id: session.sourceId }));
        if (source && source.tenantId === tenantId && source._id === session.sourceId && source.kind !== "whatsapp-batch") return { whatsapp: false };
        if (!source) return { whatsapp: true, decision: deny };
        // A source whose capture consent was withdrawn is not shown raw to anyone (fail closed; the consent machinery itself is untouched).
        if (source.consent?.given === false) return { whatsapp: true, decision: deny };
        return { whatsapp: true, decision: await forSource(tenantId, session.sourceId, caller) };
      } catch { return { whatsapp: true, decision: deny }; }
    },
    async forCandidate(tenantId, candidateId, caller) {
      try {
        assertValidTenantId(tenantId, "whatsapp.rawAccess");
        if (typeof candidateId !== "string") return deny;
        const row = await db.collection<WhatsappCandidates>("whatsapp_candidates").findOne(withTenant<WhatsappCandidates>(tenantId, { _id: candidateId }));
        if (!row || row.tenantId !== tenantId || row._id !== candidateId || typeof row.sourceId !== "string") return deny;
        return await forSource(tenantId, row.sourceId, caller);
      } catch { return deny; }
    },
    async auditAdminRead(tenantId, who, read) {
      await whatsAppLinkStores(db).events(tenantId).insert({
        eventType: "admin.raw_read", actorKind: who.actorKind, actorId: who.actorId,
        ...(read.linkId && LINK_ID.test(read.linkId) ? { linkId: read.linkId } : {}),
        ...(read.candidateId !== undefined || read.count !== undefined ? { data: { ...(read.candidateId !== undefined ? { candidateId: read.candidateId } : {}), ...(read.count !== undefined ? { count: read.count } : {}) } } : {}),
      });
    },
  };
}
