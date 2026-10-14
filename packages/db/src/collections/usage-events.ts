// packages/db/src/collections/usage-events.ts - T-057 D4 usage analytics (ISS-T057OPS-001).
// One content-free row per answered /ask or /search call. Every operation goes through
// `scopedCollection()` (tenantId forced at the call site, merged into every filter); there is no raw
// handle. `buildUsageEvent` is the ONLY place a row's shape is decided: an exact, closed key set, so
// nothing a caller passes (query text, answer text, key id, IP, headers) can reach the database.
import { randomUUID } from "node:crypto";
import type { UsageEvents } from "@lkb/core";
import type { Db } from "mongodb";
import { getDb } from "../client.js";
import { scopedCollection } from "../lib/tenantScope.js";

export type UsageKind = UsageEvents["kind"];
export type UsageOutcome = UsageEvents["outcome"];
/** The only inputs a caller supplies. Extra properties on a runtime object are ignored, never copied. */
export interface UsageEventInput { kind: UsageKind; outcome: UsageOutcome; latencyMs: number }
/** The projection GET /usage aggregates - three fields, never a whole row. */
export interface UsageEventRow { day: string; kind: UsageKind; outcome: UsageOutcome }

export const USAGE_KINDS: readonly UsageKind[] = ["ask", "search"];
export const USAGE_OUTCOMES: readonly UsageOutcome[] = ["ok", "error"];
/** Hard cap on rows one read may pull; the (cap + 1)th row only proves truncation. */
export const USAGE_READ_ROW_CAP = 50_000;

export function usageEvents(tenantId: string, db: Db = getDb()) {
  return scopedCollection<UsageEvents>(db, "usage_events")(tenantId);
}

/** UTC calendar day (YYYY-MM-DD) of an instant. */
export function usageDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** Builds exactly the schema fields (minus tenantId, which the scoped accessor adds). */
export function buildUsageEvent(input: UsageEventInput, now: Date = new Date(), id: string = randomUUID()): Omit<UsageEvents, "tenantId"> {
  if (!USAGE_KINDS.includes(input.kind)) throw new Error("Invalid usage kind");
  if (!USAGE_OUTCOMES.includes(input.outcome)) throw new Error("Invalid usage outcome");
  if (typeof input.latencyMs !== "number" || !Number.isFinite(input.latencyMs)) throw new Error("Invalid usage latency");
  return { _id: id, kind: input.kind, at: now.toISOString(), day: usageDay(now), outcome: input.outcome, latencyMs: Math.max(0, Math.round(input.latencyMs)) };
}

export async function recordUsageEvent(tenantId: string, input: UsageEventInput, db: Db = getDb(), now: Date = new Date()): Promise<void> {
  await usageEvents(tenantId, db).insertOne(buildUsageEvent(input, now));
}

/** This tenant's events on or after `sinceDay` (YYYY-MM-DD), projected to day/kind/outcome, bounded. */
export async function listUsageEvents(tenantId: string, sinceDay: string, db: Db = getDb()): Promise<{ rows: UsageEventRow[]; truncated: boolean }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sinceDay)) throw new Error("Invalid usage sinceDay");
  const found = await usageEvents(tenantId, db).find({ day: { $gte: sinceDay } })
    .project<UsageEventRow>({ _id: 0, day: 1, kind: 1, outcome: 1 }).limit(USAGE_READ_ROW_CAP + 1).toArray();
  return { rows: found.slice(0, USAGE_READ_ROW_CAP), truncated: found.length > USAGE_READ_ROW_CAP };
}
