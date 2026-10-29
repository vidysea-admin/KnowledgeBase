// packages/db/src/collections/auth-events.ts - user-accounts A1 (D-206, UA-25/UA-27). The `auth_events` collection.
// APPEND-ONLY by construction: `authEvents()` returns { insert, list } and nothing else, so the update / delete /
// replace / bulk operations of the scoped collection are not reachable from this module. `buildAuthEvent` is the ONLY
// place a row's shape is decided: a closed key set and CLOSED vocabularies, so no password, token, cookie, free text
// from a client or raw email of an unknown account can reach the log (a salted `subjectHash` stands in for the email).
import { randomUUID } from "node:crypto";
import type { AuthEvents } from "@lkb/core";
import type { Db, Filter } from "mongodb";
import { getDb } from "../client.js";
import { scopedCollection } from "../lib/tenantScope.js";
import { SHA256_HEX } from "./users.js";

export type AuthEventType = AuthEvents["type"];
export type AuthEventOutcome = AuthEvents["outcome"];
export type AuthEventDetail = AuthEvents["detail"];
export const AUTH_EVENT_TYPES: readonly AuthEventType[] = ["signup", "email_verified", "login_ok", "login_failed", "locked", "unlocked", "logout", "session_revoked", "reuse_detected", "approved", "rejected", "role_changed", "disabled", "enabled", "password_changed", "password_reset", "link_issued", "admin_bootstrap"];
export const AUTH_EVENT_OUTCOMES: readonly AuthEventOutcome[] = ["ok", "failed", "denied"];
export const AUTH_EVENT_DETAILS: readonly AuthEventDetail[] = ["none", "new_account", "existing_account", "invalid_credentials", "unknown_account", "locked", "not_active", "token_invalid", "token_reused", "family_revoked", "admin_action", "self_action", "last_admin_guard", "bootstrap", "mail_not_sent", "rate_limited"];
/** Retention (H-3): two years. */
export const AUTH_EVENT_RETENTION_MS = 2 * 365 * 24 * 60 * 60 * 1000;
/** Hard cap on rows one read may return. */
export const AUTH_EVENT_PAGE_MAX = 200;
const IP_PREFIX = /^[0-9A-Fa-f:.]+\/(24|48)$/;
const UA_SUMMARY = /^[A-Za-z0-9 ._+-]*$/;

/** The only inputs a caller supplies. Extra properties on a runtime object are ignored, never copied. */
export interface AuthEventInput {
  type: AuthEventType;
  outcome: AuthEventOutcome;
  detail?: AuthEventDetail;
  actorUserId?: string;
  targetUserId?: string;
  subjectHash?: string;
  ipPrefix?: string;
  userAgentSummary?: string;
}

function idField(value: unknown, what: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 64) throw new Error(`Invalid auth event ${what}`);
  return value;
}

/** Builds exactly the schema fields (minus tenantId). */
export function buildAuthEvent(input: AuthEventInput, now: Date = new Date(), id: string = randomUUID()): Omit<AuthEvents, "tenantId"> {
  if (!AUTH_EVENT_TYPES.includes(input.type)) throw new Error("Invalid auth event type");
  if (!AUTH_EVENT_OUTCOMES.includes(input.outcome)) throw new Error("Invalid auth event outcome");
  const detail = input.detail ?? "none";
  if (!AUTH_EVENT_DETAILS.includes(detail)) throw new Error("Invalid auth event detail: closed vocabulary only");
  const row: Omit<AuthEvents, "tenantId"> = { _id: id, at: now.toISOString(), type: input.type, outcome: input.outcome, detail, purgeAt: new Date(now.getTime() + AUTH_EVENT_RETENTION_MS) };
  if (input.actorUserId !== undefined) row.actorUserId = idField(input.actorUserId, "actorUserId");
  if (input.targetUserId !== undefined) row.targetUserId = idField(input.targetUserId, "targetUserId");
  if (input.subjectHash !== undefined) { if (typeof input.subjectHash !== "string" || !SHA256_HEX.test(input.subjectHash)) throw new Error("Invalid auth event subjectHash: a salted sha256 hex digest is required, never an email"); row.subjectHash = input.subjectHash; }
  if (input.ipPrefix !== undefined) { if (typeof input.ipPrefix !== "string" || input.ipPrefix.length > 64 || !IP_PREFIX.test(input.ipPrefix)) throw new Error("Invalid auth event ipPrefix: a truncated /24 or /48 is required"); row.ipPrefix = input.ipPrefix; }
  if (input.userAgentSummary !== undefined) { if (typeof input.userAgentSummary !== "string" || input.userAgentSummary.length > 80 || !UA_SUMMARY.test(input.userAgentSummary)) throw new Error("Invalid auth event userAgentSummary"); row.userAgentSummary = input.userAgentSummary; }
  return row;
}

/** Cursor for newest-first paging: the last row of the previous page. */
export interface AuthEventCursor { at: string; id: string }
export interface AuthEventPage { rows: AuthEvents[]; next: AuthEventCursor | null }

/** The ONLY access to `auth_events`: insert and read. No update, delete, replace or bulk handle exists. */
export function authEvents(tenantId: string, db: Db = getDb()) {
  const coll = scopedCollection<AuthEvents>(db, "auth_events")(tenantId);
  return {
    insert: (row: Omit<AuthEvents, "tenantId">) => coll.insertOne(row),
    find: (filter: Filter<AuthEvents> = {}) => coll.find(filter),
  };
}

export async function recordAuthEvent(tenantId: string, input: AuthEventInput, db: Db = getDb(), now: Date = new Date()): Promise<void> {
  await authEvents(tenantId, db).insert(buildAuthEvent(input, now));
}

/** One page of this tenant's events, newest first, cursor-paged (`GET /admin/audit`). */
export async function listAuthEvents(tenantId: string, opts: { limit?: number; after?: AuthEventCursor; targetUserId?: string } = {}, db: Db = getDb()): Promise<AuthEventPage> {
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 50), 1), AUTH_EVENT_PAGE_MAX);
  if (opts.after !== undefined && (typeof opts.after.at !== "string" || typeof opts.after.id !== "string")) throw new Error("Invalid auth event cursor");
  const filter: Filter<AuthEvents> = {};
  if (opts.targetUserId !== undefined) filter.targetUserId = idField(opts.targetUserId, "targetUserId");
  if (opts.after !== undefined) filter.$or = [{ at: { $lt: opts.after.at } }, { at: opts.after.at, _id: { $lt: opts.after.id } }];
  const found = await authEvents(tenantId, db).find(filter).sort({ at: -1, _id: -1 }).limit(limit + 1).toArray();
  const rows = found.slice(0, limit);
  const last = rows[rows.length - 1];
  return { rows, next: found.length > limit && last ? { at: last.at, id: last._id } : null };
}
