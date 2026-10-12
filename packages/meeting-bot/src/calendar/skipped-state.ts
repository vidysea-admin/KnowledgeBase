/**
 * packages/meeting-bot/src/calendar/skipped-state.ts - ISS-ALERTID-001 / -007 (D-134, pending append).
 * Persists one small, tenant-tagged record per SKIPPED session so `lkb alert-who <id>` can resolve a skipped-session alert id
 * (no-join-link, overlap-lost, untrusted-sender, ...) even when operations.json has never seen the item.
 *
 * File: <stateDir>/skipped-sessions.json = {version, tenantId, entries: {<sessionKey>: {sessionKey, startTime?, recordedAt, source, tenantId}}}.
 * Retention (Approver, D-134): accumulate keyed by sessionKey; a row whose start is older than 30 days is dropped on write.
 * A row with no known start is aged from `recordedAt` instead. NO title, NO join URL, NO detail text is ever stored. Alert ids are not computed here.
 * Same tenant discipline as schedule-state.json: an untagged / other-tenant file is refused (StateTenantRefusal) and never overwritten.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { SkippedItem } from "@lkb/core";
import { assertTenantTag, requireStateTenant } from "./state-tenant-tag.js";

export const SKIPPED_RETENTION_DAYS = 30;
const VERSION = 1;

export interface SkippedRecord { sessionKey: string; startTime?: string; recordedAt: string; source: "calendar" | "gmail"; tenantId: string }

export const skippedStateFilePath = (stateDir: string): string => path.join(stateDir, "skipped-sessions.json");

const isPlain = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const iso = (v: unknown): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
};

/** Missing / unparseable file -> {}. Untagged or other-tenant file -> throws StateTenantRefusal. */
export function readSkippedRecords(stateDir: string, tenantId: string): Record<string, SkippedRecord> {
  requireStateTenant(tenantId);
  const p = skippedStateFilePath(stateDir);
  if (!existsSync(p)) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(p, "utf8")); } catch { return {}; }
  if (!isPlain(parsed)) return {};
  const tagged = assertTenantTag(parsed, tenantId, "skipped-sessions.json");
  const out: Record<string, SkippedRecord> = {};
  for (const [k, v] of Object.entries(isPlain(tagged.entries) ? tagged.entries : {})) {
    if (k === "__proto__" || !isPlain(v) || v.sessionKey !== k || (v.source !== "calendar" && v.source !== "gmail")) continue;
    const recordedAt = iso(v.recordedAt); if (!recordedAt) continue;
    out[k] = { sessionKey: k, ...(iso(v.startTime) ? { startTime: iso(v.startTime)! } : {}), recordedAt, source: v.source, tenantId };
  }
  return out;
}

/** True when the row is older than the retention window at `nowIso` (start, or recordedAt when no start). */
export function isExpiredSkipped(r: Pick<SkippedRecord, "startTime" | "recordedAt">, nowIso: string): boolean {
  const ref = Date.parse(r.startTime ?? r.recordedAt);
  return Date.parse(nowIso) - ref > SKIPPED_RETENTION_DAYS * 86_400_000;
}

/** Merges this tick's skipped items into the file (accumulating by sessionKey) and drops rows past retention. `startOf` maps an item to its start. */
export function recordSkipped(stateDir: string, tenantId: string, items: readonly SkippedItem[], nowIso: string,
  startOf: (item: SkippedItem) => string | undefined): number {
  const entries = readSkippedRecords(stateDir, tenantId); // refuses a foreign / untagged file BEFORE any write
  for (const it of items) {
    if (typeof it?.sessionKey !== "string" || !it.sessionKey || it.sessionKey === "__proto__" || (it.source !== "calendar" && it.source !== "gmail")) continue;
    const startTime = iso(startOf(it)) ?? entries[it.sessionKey]?.startTime;
    entries[it.sessionKey] = { sessionKey: it.sessionKey, ...(startTime ? { startTime } : {}),
      recordedAt: entries[it.sessionKey]?.recordedAt ?? nowIso, source: it.source, tenantId };
  }
  for (const [k, r] of Object.entries(entries)) if (isExpiredSkipped(r, nowIso)) delete entries[k];
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(skippedStateFilePath(stateDir), JSON.stringify({ version: VERSION, tenantId, entries }, null, 2) + "\n", { mode: 0o600 });
  return Object.keys(entries).length;
}
