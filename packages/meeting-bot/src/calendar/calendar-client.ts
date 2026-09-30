/** Calendar source seam and pure, tenant-bound webinar occurrence reconciliation. */
import type { AutoRecordCandidateInput } from "./auto-join.js";
import { classifyWebinarInvite, webinarIdentity, webinarSessionKey } from "./auto-record-policy.js";

export interface CalendarEvent {
  id: string;
  title: string;
  /** ISO datetime. */
  startTime: string;
  /** ISO datetime. */
  endTime: string;
  /** Absent when the event has no video-call link (nothing to auto-join). */
  meetingUrl?: string;
  organizer?: string;
  cancelled?: boolean;
  recurringEventId?: string;
  originalStartTime?: { date?: string; dateTime?: string };
  providerUpdated?: string;
}

export interface CalendarClient {
  /** Events starting within the next `windowMinutes` (or already in progress). */
  listUpcomingEvents(windowMinutes: number): Promise<CalendarEvent[]>;
}

export type ReconciliationCalendarEvent = Pick<CalendarEvent, "id"> & Partial<CalendarEvent>;
type Snapshot = ReconciliationCalendarEvent & Partial<AutoRecordCandidateInput>;
type Alias = { key: string; identity: string };
type Occurrence = {
  source: "calendar" | "gmail"; snapshot: Snapshot; providerIds: string[]; aliases: Alias[]; accepted: boolean;
  revision?: string; linkedCalendar?: string; reviewReason?: "invalid-time" | "no-join-link" | "unsafe-join-link";
  unresolved?: "unknown-tombstone" | "ambiguous-provider" | "contradictory-revision" | "missing-revision" | "ambiguous-identity";
};
export interface WebinarReconciliationState {
  version: 1; tenantId: string; checkedAt: string; historyComplete: boolean;
  occurrences: Record<string, Occurrence>;
}
export interface WebinarReconciliationResult {
  state: WebinarReconciliationState; calendarEvents: CalendarEvent[]; candidates: AutoRecordCandidateInput[];
  inventory: { occurrenceKey: string; reviewKey: string; sessionKey?: string; classification: string; snapshot: Snapshot; reason?: string }[];
  transitions: { occurrenceKey: string; reason: "cancelled" | "rescheduled" | "unresolved"; aliases: string[]; currentKey?: string }[];
  newStartsBlocked: boolean;
}
const fail = (): never => { throw new Error("Invalid webinar reconciliation input or state"); };
function shape(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Object.keys(value).some(key => !keys.includes(key))) fail();
}
function text(value: unknown, max: number, required = false): asserts value is string | undefined {
  if (value === undefined && !required) return;
  if (typeof value !== "string" || value.length > max || /[\x00-\x1f\x7f]/.test(value) || (required && !value)) fail();
}
function time(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return undefined;
  const parts = match.slice(1, 7).map(Number), date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
  if (date.getUTCFullYear() !== parts[0] || date.getUTCMonth() + 1 !== parts[1] || date.getUTCDate() !== parts[2] ||
      parts[3]! > 23 || parts[4]! > 59 || parts[5]! > 59 || (match[8] !== "Z" && (Number(match[8]!.slice(1, 3)) > 23 || Number(match[8]!.slice(4)) > 59))) return undefined;
  const parsed = new Date(value); return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
}
function original(snapshot: Snapshot): string | undefined {
  if (snapshot.originalStartTime === undefined && snapshot.recurringEventId === undefined) return undefined;
  text(snapshot.recurringEventId, 1024, true); shape(snapshot.originalStartTime, ["date", "dateTime"]);
  const {date, dateTime} = snapshot.originalStartTime;
  if ((date === undefined) === (dateTime === undefined)) fail();
  if (dateTime !== undefined) { const canonical = time(dateTime); if (!canonical) fail(); return canonical; }
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || time(`${date}T00:00:00Z`)?.slice(0, 10) !== date) fail();
  return `date:${date}`;
}
function sourceKey(tenant: string, source: Occurrence["source"], snapshot: Snapshot): string {
  return webinarSessionKey(JSON.stringify(["source", tenant, source, source === "calendar" ? "primary" : "candidates",
    snapshot.recurringEventId ?? snapshot.id, original(snapshot) ?? "single"]));
}
function identity(snapshot: Snapshot): string | undefined {
  return snapshot.meetingUrl && snapshot.startTime ? webinarIdentity(snapshot.meetingUrl, snapshot.startTime) : undefined;
}
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
}
function semantic(row: Occurrence): string {
  const snapshot = {...row.snapshot}; delete snapshot.providerUpdated;
  if (row.source === "gmail") { delete snapshot.status; delete snapshot.registrationOnly; }
  const key = identity(snapshot); if (key) snapshot.meetingUrl = key.slice(0, key.lastIndexOf("|"));
  return stable(snapshot);
}
function normalizeOccurrence(source: Occurrence["source"], input: Snapshot): Occurrence {
  const common = ["id", "title", "startTime", "endTime", "meetingUrl", "cancelled", "providerUpdated"];
  shape(input, [...common, ...(source === "calendar" ? ["organizer", "recurringEventId", "originalStartTime"] : ["senderEmail", "senderDomain", "status", "kind", "registrationOnly"])]);
  text(input.id, 1024, true); text(input.title, 2000); text(input.meetingUrl, 8192);
  text(input.startTime, 128); text(input.endTime, 128); text(input.organizer, 320);
  if (input.cancelled !== undefined && typeof input.cancelled !== "boolean") fail();
  if (source === "gmail" && (!["pending", "approved", "rejected", "auto_approved"].includes(input.status ?? "") ||
      (input.kind !== undefined && !["upcoming", "past-recording"].includes(input.kind)) ||
      (input.registrationOnly !== undefined && typeof input.registrationOnly !== "boolean"))) fail();
  if (source === "gmail") { text(input.senderEmail, 320, true); text(input.senderDomain, 320, true); }
  const snapshot: Snapshot = {id: input.id, title: input.title ?? "", cancelled: input.cancelled ?? false};
  for (const key of source === "calendar" ? ["meetingUrl", "organizer", "recurringEventId"] : ["meetingUrl", "senderEmail", "senderDomain", "status", "kind", "registrationOnly"]) {
    const value = input[key as keyof Snapshot];
    if (value !== undefined) Object.assign(snapshot, {[key]: value});
  }
  const origin = original(input);
  if (origin) snapshot.originalStartTime = origin.startsWith("date:") ? {date: origin.slice(5)} : {dateTime: origin};
  if (input.providerUpdated !== undefined) { const revision = time(input.providerUpdated); if (!revision) fail(); snapshot.providerUpdated = revision; }
  const start = time(input.startTime), end = time(input.endTime);
  if (start) snapshot.startTime = start; if (end) snapshot.endTime = end;
  const key = identity(snapshot);
  const reviewReason = snapshot.cancelled ? undefined : !start || !end || end <= start ? "invalid-time"
    : !snapshot.meetingUrl ? "no-join-link" : !key ? "unsafe-join-link" : undefined;
  return {source, snapshot, accepted: true, revision: snapshot.providerUpdated, providerIds: [snapshot.id], aliases: key ? [{key: webinarSessionKey(key), identity: key}] : [], reviewReason};
}
function validateReconciliationState(previous: unknown, tenantId: string, checkedAt: string): WebinarReconciliationState {
  if (previous === undefined) return {version: 1, tenantId, checkedAt, historyComplete: false, occurrences: {}};
  shape(previous, ["version", "tenantId", "checkedAt", "historyComplete", "occurrences"]);
  if (previous.version !== 1 || previous.tenantId !== tenantId || time(previous.checkedAt) !== previous.checkedAt ||
      typeof previous.checkedAt !== "string" || previous.checkedAt > checkedAt || typeof previous.historyComplete !== "boolean") fail();
  shape(previous.occurrences, Object.keys(previous.occurrences ?? {}));
  if (Object.keys(previous.occurrences).length > 20000 || Buffer.byteLength(JSON.stringify(previous)) > 8 * 1024 * 1024) fail();
  for (const [key, value] of Object.entries(previous.occurrences)) {
    shape(value, ["source", "snapshot", "providerIds", "aliases", "accepted", "revision", "linkedCalendar", "reviewReason", "unresolved"]);
    if (value.source !== "calendar" && value.source !== "gmail") fail();
    const row = value as unknown as Occurrence, normalized = normalizeOccurrence(row.source, row.snapshot);
    if (sourceKey(tenantId, row.source, row.snapshot) !== key || stable(normalized.snapshot) !== stable(row.snapshot) ||
        normalized.reviewReason !== row.reviewReason || typeof row.accepted !== "boolean" || row.revision !== row.snapshot.providerUpdated ||
        (row.revision !== undefined && (time(row.revision) !== row.revision || Date.parse(row.revision) > Date.parse(checkedAt) + 60000)) ||
        !Array.isArray(row.providerIds) || row.providerIds.length > 64 || (row.accepted ? !row.providerIds.includes(row.snapshot.id) : row.providerIds.length !== 0) ||
        new Set(row.providerIds).size !== row.providerIds.length || !Array.isArray(row.aliases) || row.aliases.length > 128 ||
        (row.unresolved !== undefined && !["unknown-tombstone", "ambiguous-provider", "contradictory-revision", "missing-revision", "ambiguous-identity"].includes(row.unresolved))) fail();
    row.providerIds.forEach(id => text(id, 1024, true));
    const aliasKeys = new Set<string>();
    for (const alias of row.aliases) {
      shape(alias, ["key", "identity"]); text(alias.identity, 8321, true);
      const split = alias.identity.lastIndexOf("|"), stamp = alias.identity.slice(split + 1);
      if (time(stamp) !== stamp || webinarIdentity(alias.identity.slice(0, split), stamp) !== alias.identity || webinarSessionKey(alias.identity) !== alias.key || aliasKeys.has(alias.key)) fail();
      aliasKeys.add(alias.key);
    }
    if (row.accepted ? normalized.aliases.some(alias => !aliasKeys.has(alias.key)) : row.aliases.length || !row.unresolved || row.linkedCalendar !== undefined) fail();
    if (row.linkedCalendar !== undefined) {
      const target = previous.occurrences[row.linkedCalendar] as Occurrence | undefined;
      if (row.source !== "gmail" || target?.source !== "calendar" || !target.accepted || !row.accepted || !row.aliases.some(alias => target.aliases?.some(other => other.identity === alias.identity))) fail();
    }
  }
  return JSON.parse(JSON.stringify(previous)) as WebinarReconciliationState;
}
function mergeOccurrence(prior: Occurrence | undefined, incoming: Occurrence[]): Occurrence {
  incoming.sort((a, b) => (a.revision ?? "").localeCompare(b.revision ?? "") || semantic(a).localeCompare(semantic(b)) || stable(a.snapshot).localeCompare(stable(b.snapshot)));
  const revisions = new Map<string, Set<string>>();
  for (const next of incoming) revisions.set(next.revision ?? "", new Set([...(revisions.get(next.revision ?? "") ?? []), semantic(next)]));
  const disputed = new Set([...revisions].filter(([, values]) => values.size > 1).map(([revision]) => revision));
  let row = prior ? JSON.parse(JSON.stringify(prior)) as Occurrence : JSON.parse(JSON.stringify(incoming[0])) as Occurrence;
  if (!prior && disputed.has(row.revision ?? "")) { row.accepted = false; row.aliases = []; row.providerIds = []; }
  const rejected = prior?.snapshot.status === "rejected" || incoming.some(value => value.snapshot.status === "rejected");
  const registration = Boolean(prior?.snapshot.registrationOnly || incoming.some(value => value.snapshot.registrationOnly));
  for (const next of incoming) {
    if (row.source === "gmail") { if (rejected) next.snapshot.status = "rejected"; if (registration) next.snapshot.registrationOnly = true; }
    if (disputed.has(next.revision ?? "")) {
      if (!row.revision || !next.revision || next.revision >= row.revision) row.unresolved = next.revision ? "contradictory-revision" : "missing-revision";
      continue;
    }
    const same = semantic(row) === semantic(next), newer = Boolean(next.revision && (!row.revision || next.revision > row.revision));
    const minimalCancel = next.source === "calendar" && next.snapshot.cancelled && (!next.snapshot.startTime || !next.snapshot.endTime || !next.snapshot.meetingUrl);
    if (next.revision && row.revision && next.revision < row.revision) continue;
    let accepted = false;
    if (!same && !newer && !minimalCancel) row.unresolved = next.revision && row.revision ? "contradictory-revision" : "missing-revision";
    else if (row.snapshot.cancelled && !next.snapshot.cancelled && !newer) row.unresolved ??= "missing-revision";
    else {
      accepted = true;
      const snapshot = minimalCancel ? {...row.snapshot, cancelled: true, providerUpdated: next.snapshot.providerUpdated ?? row.snapshot.providerUpdated} : next.snapshot;
      row = {...row, snapshot, accepted: row.accepted || next.accepted, reviewReason: minimalCancel ? undefined : next.reviewReason, revision: snapshot.providerUpdated};
      if (newer && row.unresolved !== "unknown-tombstone" && row.unresolved !== "ambiguous-provider") delete row.unresolved;
    }
    if (accepted) {
      row.providerIds = [...new Set([...row.providerIds, ...next.providerIds])].sort();
      row.aliases = [...new Map([...row.aliases, ...next.aliases].map(alias => [alias.key, alias])).values()].sort((a, b) => a.key.localeCompare(b.key));
    }
  }
  if (row.source === "gmail") { if (rejected) row.snapshot.status = "rejected"; if (registration) row.snapshot.registrationOnly = true; }
  return row;
}
/** Caller supplies complete acquisitions, never infers historyComplete from a bounded window.
 * checkedAt is canonical request-start time; no transport, persistence, capture or indexing here. */
export function reconcileWebinarSources(input: {
  tenantId: string; checkedAt: string; acquisition: {complete: boolean; historyComplete: boolean}; previous?: unknown;
  calendarEvents: readonly ReconciliationCalendarEvent[]; candidates: readonly (AutoRecordCandidateInput & {providerUpdated?: string})[];
}): WebinarReconciliationResult {
  text(input.tenantId, 100, true);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(input.tenantId) || time(input.checkedAt) !== input.checkedAt) fail();
  shape(input.acquisition, ["complete", "historyComplete"]);
  if (input.acquisition.complete !== true || typeof input.acquisition.historyComplete !== "boolean" || !Array.isArray(input.calendarEvents) || !Array.isArray(input.candidates) || input.calendarEvents.length + input.candidates.length > 20000) fail();
  const previous = validateReconciliationState(input.previous, input.tenantId, input.checkedAt);
  let state = JSON.parse(JSON.stringify(previous)) as WebinarReconciliationState;
  const groups = new Map<string, Occurrence[]>();
  for (const [source, values] of [["calendar", input.calendarEvents], ["gmail", input.candidates]] as const) {
    for (const value of values) {
      const row = normalizeOccurrence(source, value), key = sourceKey(input.tenantId, source, row.snapshot);
      if (row.revision && Date.parse(row.revision) > Date.parse(input.checkedAt) + 60000) fail();
      let targets = [key];
      if (source === "calendar" && row.snapshot.cancelled && !row.snapshot.recurringEventId) {
        const matches = Object.entries(previous.occurrences).filter(([, prior]) => prior.source === "calendar" && prior.providerIds.includes(row.snapshot.id));
        const children = Object.entries(previous.occurrences).filter(([, prior]) => prior.source === "calendar" && prior.accepted && prior.snapshot.recurringEventId === row.snapshot.id);
        if (matches.length <= 1 && (matches.length || children.length)) targets = [...new Set([...matches, ...children].map(([target]) => target))];
        else row.unresolved = matches.length ? "ambiguous-provider" : "unknown-tombstone";
      } else if (source === "calendar" && row.snapshot.cancelled && !previous.occurrences[key]?.accepted) row.unresolved = "unknown-tombstone";
      if (row.unresolved) { row.accepted = false; row.providerIds = []; row.aliases = []; }
      for (const target of targets) {
        const current = JSON.parse(JSON.stringify(row)) as Occurrence;
        if (target !== key) current.snapshot = {...current.snapshot, id: previous.occurrences[target]!.snapshot.id,
          recurringEventId: previous.occurrences[target]!.snapshot.recurringEventId, originalStartTime: previous.occurrences[target]!.snapshot.originalStartTime};
        if (previous.occurrences[target]?.snapshot.recurringEventId === row.snapshot.id) current.providerIds = [...previous.occurrences[target]!.providerIds];
        groups.set(target, [...(groups.get(target) ?? []), current]);
      }
    }
  }
  for (const [key, rows] of [...groups].sort(([a], [b]) => a.localeCompare(b))) state.occurrences[key] = mergeOccurrence(state.occurrences[key], rows);
  const calendar = Object.entries(state.occurrences).filter(([, row]) => row.source === "calendar"), aliasOwners = new Map<string, string[]>();
  for (const [key, row] of calendar) for (const alias of row.aliases) aliasOwners.set(alias.key, [...new Set([...(aliasOwners.get(alias.key) ?? []), key])]);
  for (const keys of aliasOwners.values()) if (keys.length > 1) keys.forEach(key => { state.occurrences[key]!.unresolved = "ambiguous-identity"; });
  for (const row of Object.values(state.occurrences)) {
    if (row.source !== "gmail") continue;
    const targets = [...new Set(row.aliases.flatMap(alias => aliasOwners.get(alias.key) ?? []))];
    if (targets.length > 1) row.unresolved = "ambiguous-identity";
    else if (!row.linkedCalendar && targets.length === 1) row.linkedCalendar = targets[0];
    else if (row.linkedCalendar && targets.length && targets[0] !== row.linkedCalendar) row.unresolved = "ambiguous-identity";
  }
  state.checkedAt = input.checkedAt; state.historyComplete = input.acquisition.historyComplete;
  state = validateReconciliationState(state, input.tenantId, input.checkedAt);
  const calendarEvents: CalendarEvent[] = [], candidates: AutoRecordCandidateInput[] = [], inventory: WebinarReconciliationResult["inventory"] = [], transitions: WebinarReconciliationResult["transitions"] = [];
  for (const [key, row] of Object.entries(state.occurrences).sort(([a], [b]) => a.localeCompare(b))) {
    const linked = row.linkedCalendar ? state.occurrences[row.linkedCalendar] : undefined;
    const snapshot: Snapshot = linked ? {...row.snapshot, title: linked.snapshot.title, startTime: linked.snapshot.startTime, endTime: linked.snapshot.endTime,
      meetingUrl: linked.snapshot.meetingUrl, cancelled: linked.snapshot.cancelled} : row.snapshot;
    const current = row.accepted ? identity(snapshot) : undefined, prior = previous.occurrences[key];
    const priorIdentity = prior && identity(prior.linkedCalendar ? previous.occurrences[prior.linkedCalendar]!.snapshot : prior.snapshot);
    if (row.unresolved || snapshot.cancelled || (priorIdentity && current !== priorIdentity)) transitions.push({occurrenceKey: key,
      reason: row.unresolved ? "unresolved" : snapshot.cancelled ? "cancelled" : "rescheduled", aliases: row.aliases.map(alias => alias.key), currentKey: current ? webinarSessionKey(current) : undefined});
    const classification = classifyWebinarInvite(snapshot.title ?? ""), future = !snapshot.endTime || snapshot.endTime > input.checkedAt;
    if ((classification !== "meeting" && future) || row.unresolved) inventory.push({occurrenceKey: key, reviewKey: webinarSessionKey(`source-review|${key}`),
      sessionKey: current ? webinarSessionKey(current) : undefined, classification, snapshot, reason: row.unresolved ?? row.reviewReason ?? (snapshot.cancelled ? "cancelled" : undefined)});
    if (row.source === "calendar") calendarEvents.push({...snapshot, title: snapshot.title ?? "", startTime: snapshot.startTime ?? "", endTime: snapshot.endTime ?? ""} as CalendarEvent);
    else candidates.push(snapshot as AutoRecordCandidateInput);
  }
  const newStartsBlocked = !state.historyComplete || Object.values(state.occurrences).some(row => Boolean(row.unresolved));
  return {state, inventory, transitions, newStartsBlocked, calendarEvents: newStartsBlocked ? [] : calendarEvents, candidates: newStartsBlocked ? [] : candidates};
}
