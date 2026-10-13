/**
 * packages/meeting-bot/src/calendar/state/skipped-state.ts - ISS-ALERTID-001 / -007 (D-134, pending append).
 * Persists one small, tenant-tagged record per SKIPPED session so `lkb alert-who <id>` can resolve a skipped-session alert id
 * (no-join-link, overlap-lost, untrusted-sender, ...) even when operations.json has never seen the item.
 *
 * File: <stateDir>/skipped-sessions.json = {version, tenantId, entries: {<sessionKey>: {sessionKey, startTime?, recordedAt, source, tenantId}}}.
 * Retention (Approver, D-134): accumulate keyed by sessionKey; a row whose start is older than 30 days is dropped on write.
 * A row with no known start is aged from `recordedAt` instead. NO title, NO join URL, NO detail text is ever stored. Alert ids are not computed here.
 * Same tenant discipline as schedule-state.json: an untagged / other-tenant file is refused (StateTenantRefusal) and never overwritten.
 *
 * Write safety (ISS-ALERTWHO-001):
 *  - ATOMIC: temp file in the same directory (wx, fsync) then rename over the target, so a crash leaves the old file whole.
 *  - CORRUPT FILE: a read never mutates and never returns {} for an unparseable / non-object file; it throws SkippedStateCorrupt
 *    (the join-rules / run-state precedent: loud, data kept). A WRITE moves the bad file aside to skipped-sessions.json.corrupt-<ts>
 *    (never deleted), reports it through `onQuarantine`, and starts a fresh file, so recording self-heals without losing evidence.
 *  - CONCURRENCY: schedule-tick has NO run lock (Task Scheduler can overlap invocations), so it is not single-writer by construction.
 *    The read-modify-write runs under the existing cross-process file lock (join-rules-store-lock.ts acquireLock), <stateDir>/skipped-sessions.lock.
 *  - Mode 0600 is POSIX-only: it is applied at creation on POSIX and is IGNORED on Windows, where it protects nothing. The file holds
 *    no secret (key, start, source, tenant only); do not rely on the mode for confidentiality.
 */
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { acquireLock, lockStillOwned, releaseLock, sleep } from "../join-rules/join-rules-store-lock.js";
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

/** The file exists but is not valid JSON / not an object. Left untouched by reads. */
export class SkippedStateCorrupt extends Error {
  constructor(readonly file: string) { super("skipped-sessions.json is unreadable or corrupt (not valid JSON, or not an object); it was not changed"); this.name = "SkippedStateCorrupt"; }
}

/** Missing file -> {}. Unparseable / non-object -> throws SkippedStateCorrupt (never {}). Untagged or other-tenant -> throws StateTenantRefusal. */
export function readSkippedRecords(stateDir: string, tenantId: string): Record<string, SkippedRecord> {
  requireStateTenant(tenantId);
  const p = skippedStateFilePath(stateDir);
  if (!existsSync(p)) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(p, "utf8")); } catch { throw new SkippedStateCorrupt(p); }
  if (!isPlain(parsed)) throw new SkippedStateCorrupt(p);
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

export interface RecordSkippedOptions {
  /** Called with the quarantine file name when a corrupt file was moved aside. */
  onQuarantine?: (movedTo: string) => void;
  lockWaitMs?: number;
  /** Test seams (production leaves these unset). */
  rename?: typeof renameSync; afterRead?: () => void;
}

function renameReplacing(rename: typeof renameSync, from: string, to: string): void {
  const start = Date.now(); // Windows refuses a rename over a file a reader has open at that instant; transient
  for (;;) {
    try { rename(from, to); return; }
    catch (e: any) { if (!["EPERM", "EACCES", "EBUSY"].includes(e?.code) || Date.now() - start > 3000) throw e; sleep(2 + Math.floor(Math.random() * 8)); }
  }
}

export function writeAtomic(file: string, bytes: string, rename: typeof renameSync, owns: () => void): void {
  const temporary = `${file}.${randomUUID()}.tmp`;
  let fd: number | undefined, created = false;
  try {
    fd = openSync(temporary, "wx", 0o600); created = true; // 0600: POSIX only, see the header
    writeFileSync(fd, bytes); fsyncSync(fd); closeSync(fd); fd = undefined;
    owns();
    renameReplacing(rename, temporary, file);
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (created && existsSync(temporary)) unlinkSync(temporary);
  }
}

/** Merges this tick's skipped items into the file (accumulating by sessionKey) and drops rows past retention. `startOf` maps an item to its start. */
export function recordSkipped(stateDir: string, tenantId: string, items: readonly SkippedItem[], nowIso: string,
  startOf: (item: SkippedItem) => string | undefined, opts: RecordSkippedOptions = {}): number {
  requireStateTenant(tenantId);
  const file = skippedStateFilePath(stateDir);
  mkdirSync(stateDir, { recursive: true });
  const lockPath = path.join(stateDir, "skipped-sessions.lock");
  const token = acquireLock(lockPath, { waitMs: opts.lockWaitMs });
  try {
    let entries: Record<string, SkippedRecord>;
    try { entries = readSkippedRecords(stateDir, tenantId); } // refuses a foreign / untagged file BEFORE any write
    catch (e) {
      if (!(e instanceof SkippedStateCorrupt)) throw e;
      const aside = `${file}.corrupt-${nowIso.replace(/[^0-9A-Za-z]/g, "")}-${randomUUID().slice(0, 8)}`;
      renameSync(file, aside); // quarantine, never delete
      opts.onQuarantine?.(path.basename(aside));
      entries = {};
    }
    opts.afterRead?.();
    for (const it of items) {
      if (typeof it?.sessionKey !== "string" || !it.sessionKey || it.sessionKey === "__proto__" || (it.source !== "calendar" && it.source !== "gmail")) continue;
      const startTime = iso(startOf(it)) ?? entries[it.sessionKey]?.startTime;
      entries[it.sessionKey] = { sessionKey: it.sessionKey, ...(startTime ? { startTime } : {}),
        recordedAt: entries[it.sessionKey]?.recordedAt ?? nowIso, source: it.source, tenantId };
    }
    for (const [k, r] of Object.entries(entries)) if (isExpiredSkipped(r, nowIso)) delete entries[k];
    writeAtomic(file, JSON.stringify({ version: VERSION, tenantId, entries }, null, 2) + "\n", opts.rename ?? renameSync,
      () => { if (!lockStillOwned(lockPath, token)) throw new Error("skipped-sessions lock was lost before the write; nothing written"); });
    return Object.keys(entries).length;
  } finally { releaseLock(lockPath, token); }
}
