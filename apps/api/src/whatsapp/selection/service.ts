/**
 * WhatsApp capture-selection service (whatsapp-multiuser W6; spec R-15..R-21). Pure logic over ports: a read-only link lookup,
 * the W3 archiver client and an event sink. The ARCHIVER owns the selection (R-16): every write goes through its service API and
 * the KB stores no copy (no collection, no field, no cache), so there is nothing to drift. This file never touches the archiver
 * database; its only KB write is the `selection.changed` event (counts only, R-21/R-39).
 *
 * Authority (defence in depth beneath the router's scope checks):
 *  - the OWNER of an ACTIVE link reads and changes that link's selection (gate wa-revoked-link-read-access: a link that is
 *    requested, approved, suspended, rejected, unlinked or revoked has no owner selection access);
 *  - an ADMIN may read which groups are marked (marked groups only, R-20) on any link of the tenant, never change them;
 *  - everyone else gets 404, so another person's or another tenant's link id looks exactly like an absent one.
 * The archiver owner id comes from the link row, never from a request. The tenant comes from the Principal only.
 */
import type { ArchiverClient, GroupInfo } from "../archiver/client.js";
import { JID_RE, PERSON_ID_RE } from "../archiver/config.js";
import { isArchiverError } from "../archiver/errors.js";
import { LINK_ID_RE, type Fail, type LinkRow, type Principal, type Result } from "../links/service.js";

export type SelectionArchiver = Pick<ArchiverClient, "listGroups" | "setGroupTracking" | "listPeople" | "setPeople">;
/** R-21 / R-39: ids and counts only. No jid, subject, person label or phone ever enters an event. */
export interface SelectionEvent {
  eventType: "selection.changed"; actorKind: "user" | "key"; linkId: string; actorId?: string;
  data: { groupCount: number; markedCount: number; count?: number };
}
export interface SelectionDeps {
  /** Read-only: the selection service never writes a link row. */
  links: { get(tenantId: string, id: string): Promise<LinkRow | null> };
  archiver: SelectionArchiver | null;
  appendEvent(tenantId: string, e: SelectionEvent): Promise<void>;
  log?: { warn(msg: string, f?: Record<string, unknown>): void; error(msg: string, f?: Record<string, unknown>): void };
}

const EVENT_ID_RE = /^[A-Za-z0-9_.:@-]{1,200}$/;
const MAX_PEOPLE = 1000;
const fail = (status: number, error: string, message: string, extra?: Record<string, unknown>): Fail => ({ ok: false, status, error, message, ...(extra ? { extra } : {}) });
const NOT_FOUND = fail(404, "not_found", "no such link");
const FORBIDDEN = fail(403, "forbidden", "this action is not allowed for this caller");
const ADMIN_READ_ONLY = fail(403, "forbidden", "administrators can see which groups are marked but cannot change a person's selection");
const NOT_ACTIVE = fail(409, "link_not_active", "the link is not active, so its selection is not available");
const NOT_CONNECTED = fail(409, "not_connected", "the link has no archiver session yet");
const GROUP_NOT_FOUND = fail(404, "group_not_found", "no such group on this link");
const NOT_MARKED = fail(409, "group_not_marked", "mark the group before choosing people");
const ARCHIVER_DOWN = fail(503, "archiver_api_unavailable", "the WhatsApp archiver is temporarily unavailable");
const UNAVAILABLE = fail(503, "selection_unavailable", "WhatsApp selection is temporarily unavailable");
const bad = (message: string): Fail => fail(400, "invalid_body", message);

type Access = { link: LinkRow; ownerId: string; owner: boolean };

export function createSelectionService(deps: SelectionDeps) {
  const { archiver } = deps;
  const isOwner = (p: Principal, l: LinkRow): boolean => p.kind === "session" && p.link && p.userId !== null && l.userId !== null && l.userId === p.userId;

  /** Resolve the link and decide what the caller may do with it. `write` never lets an administrator through. */
  async function access(p: Principal, id: string, write: boolean): Promise<Result<Access>> {
    if (!write && !p.admin && !(p.kind === "session" && p.link)) return FORBIDDEN;
    if (write && !(p.kind === "session" && p.link && p.userId)) return FORBIDDEN; // a key never changes a selection, whatever its scopes
    const link = LINK_ID_RE.test(id) ? await deps.links.get(p.tenantId, id) : null; // tenant-scoped lookup: another tenant's id is null
    if (!link) return NOT_FOUND;
    const owner = isOwner(p, link);
    if (!owner && !p.admin) return NOT_FOUND; // another person's link looks absent
    if (!owner && write) return ADMIN_READ_ONLY; // R-20: an administrator reads, never edits
    if (owner && link.state !== "active" && !p.admin) return NOT_ACTIVE; // gate: only an active link has owner selection access
    if (owner && write && link.state !== "active") return NOT_ACTIVE; // an owner who is also an admin still cannot change a dead link
    if (!link.archiverOwnerId) return NOT_CONNECTED;
    // An owner-admin of an active link is treated as the owner; of a non-active link only the admin read applies.
    return { ok: true, value: { link, ownerId: link.archiverOwnerId, owner: owner && link.state === "active" } };
  }

  function archiverFail(e: unknown): Fail {
    if (!isArchiverError(e)) { deps.log?.warn("whatsapp selection call failed", { code: "selection_failed" }); return ARCHIVER_DOWN; }
    deps.log?.warn("whatsapp archiver call failed", { code: e.code, reason: e.reason ?? undefined }); // closed vocabulary only, never the body
    if (e.code === "rate_limited") return fail(429, "archiver_busy", "the archiver is busy, retry shortly", { retryAfterSec: e.retryAfterSec ?? 5 });
    if (e.code === "owner_not_found" || e.code === "owner_unlinked") return fail(409, "archiver_owner_unavailable", "the archiver session for this link is no longer available");
    if (e.code === "group_not_found") return GROUP_NOT_FOUND;
    if (e.code === "person_not_found") return fail(404, "person_not_found", "no such person in this group");
    return ARCHIVER_DOWN;
  }

  /** State is authoritative in the archiver: the event is written after the change and a failed write is logged by code only. */
  async function emit(p: Principal, linkId: string, data: SelectionEvent["data"]): Promise<void> {
    const actorId = p.actor && EVENT_ID_RE.test(p.actor) ? p.actor : undefined;
    try { await deps.appendEvent(p.tenantId, { eventType: "selection.changed", actorKind: p.kind === "session" ? "user" : "key", linkId, ...(actorId ? { actorId } : {}), data }); }
    catch { deps.log?.error("whatsapp selection event write failed", { code: "event_write_failed", eventType: "selection.changed" }); }
  }

  const groupView = (g: GroupInfo) => ({ jid: g.jid, subject: g.subject, participantCount: g.participantCount, marked: g.isTracked, trackAllSenders: g.trackAllSenders });
  const markedOf = (groups: readonly GroupInfo[]): number => groups.filter(g => g.isTracked).length;

  return {
    /** R-17 list / R-20 admin view. The owner sees every group; an administrator sees only the marked ones. */
    async listGroups(p: Principal, id: string): Promise<Result<Record<string, unknown>>> {
      const a = await access(p, id, false); if (!a.ok) return a;
      if (!archiver) return UNAVAILABLE;
      try {
        const r = await archiver.listGroups(a.value.ownerId);
        const shown = a.value.owner ? r.groups : r.groups.filter(g => g.isTracked);
        return { ok: true, value: { view: a.value.owner ? "owner" : "admin", canEdit: a.value.owner, source: r.source, refreshedAt: r.refreshedAt, truncated: r.truncated, groupCount: r.groups.length, markedCount: markedOf(r.groups), groups: shown.map(groupView) } };
      } catch (e) { return archiverFail(e); }
    },

    /** R-17 mark / unmark. Idempotent: a request that matches the current state changes nothing and writes no event (200, changed:false). */
    async setGroup(p: Principal, id: string, jid: string, input: { marked: boolean; trackAllSenders?: boolean }): Promise<Result<Record<string, unknown>>> {
      const a = await access(p, id, true); if (!a.ok) return a;
      if (typeof jid !== "string" || !JID_RE.test(jid)) return bad("jid is not a WhatsApp group id");
      if (typeof input?.marked !== "boolean" || (input.trackAllSenders !== undefined && typeof input.trackAllSenders !== "boolean")) return bad("marked (and trackAllSenders) must be booleans");
      if (!archiver) return UNAVAILABLE;
      try {
        const list = await archiver.listGroups(a.value.ownerId);
        const g = list.groups.find(x => x.jid === jid);
        if (!g) return GROUP_NOT_FOUND; // not in THIS owner's group list: 404 whether or not it exists for someone else
        const want = input.marked ? input.trackAllSenders : undefined;
        const same = g.isTracked === input.marked && (want === undefined || g.trackAllSenders === want);
        if (same) return { ok: true, value: { changed: false, group: { ...groupView(g) } } };
        const r = await archiver.setGroupTracking(a.value.ownerId, jid, { isTracked: input.marked, ...(want === undefined ? {} : { trackAllSenders: want }) });
        const markedCount = markedOf(list.groups) - (g.isTracked ? 1 : 0) + (r.isTracked ? 1 : 0);
        if (r.changed) await emit(p, a.value.link._id, { groupCount: list.groups.length, markedCount });
        return { ok: true, value: { changed: r.changed, group: { ...groupView(g), marked: r.isTracked, trackAllSenders: r.trackAllSenders }, capture: r.capture, markedCount } };
      } catch (e) { return archiverFail(e); }
    },

    /** R-18 read. Owner only (an administrator sees marked groups, not people). The group must be one of the owner's. */
    async listPeople(p: Principal, id: string, jid: string): Promise<Result<Record<string, unknown>>> {
      const a = await access(p, id, true); if (!a.ok) return a; // people are the owner's judgement: same authority as a write
      if (typeof jid !== "string" || !JID_RE.test(jid)) return bad("jid is not a WhatsApp group id");
      if (!archiver) return UNAVAILABLE;
      try {
        const list = await archiver.listGroups(a.value.ownerId);
        if (!list.groups.some(x => x.jid === jid)) return GROUP_NOT_FOUND;
        const r = await archiver.listPeople(a.value.ownerId, jid);
        return { ok: true, value: { source: r.source, people: r.people.map(x => ({ personId: x.personId, label: x.label, selected: x.isSelected, hasName: x.hasName })) } };
      } catch (e) { return archiverFail(e); }
    },

    /** R-18 write: restrict capture of a MARKED group to the chosen people (replaces the set). Idempotent like setGroup. */
    async setPeople(p: Principal, id: string, jid: string, input: { personIds: readonly string[] }): Promise<Result<Record<string, unknown>>> {
      const a = await access(p, id, true); if (!a.ok) return a;
      if (typeof jid !== "string" || !JID_RE.test(jid)) return bad("jid is not a WhatsApp group id");
      const ids = input?.personIds;
      if (!Array.isArray(ids) || ids.length > MAX_PEOPLE || new Set(ids).size !== ids.length || !ids.every(x => typeof x === "string" && PERSON_ID_RE.test(x))) return bad(`personIds must be up to ${MAX_PEOPLE} distinct person ids`);
      if (!archiver) return UNAVAILABLE;
      try {
        const list = await archiver.listGroups(a.value.ownerId);
        const g = list.groups.find(x => x.jid === jid);
        if (!g) return GROUP_NOT_FOUND;
        if (!g.isTracked) return NOT_MARKED;
        const r = await archiver.setPeople(a.value.ownerId, jid, ids);
        if (r.changed) await emit(p, a.value.link._id, { groupCount: list.groups.length, markedCount: markedOf(list.groups), count: r.count });
        return { ok: true, value: { changed: r.changed, count: r.count, capture: r.capture } };
      } catch (e) { return archiverFail(e); }
    },
  };
}
export type SelectionService = ReturnType<typeof createSelectionService>;
