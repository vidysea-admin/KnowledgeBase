/**
 * packages/meeting-bot/src/calendar/join-rules/join-rules-enforce.ts — T-037 unit `t037-scheduler-wiring-behind-flag`.
 * The ONE place that decides whether the scheduler tick applies a tenant's join rules, and what happens when they cannot be read.
 *
 * Setting (read once, in schedule-tick.ts buildRealScheduleTickDeps, from env LKB_JOIN_RULES_ENFORCE; parsed only here):
 *   `off` (DEFAULT; also absent, empty, any other string, any non-string)  -> returns the selection UNTOUCHED (same reference);
 *        the store is never opened, `applyJoinRules` is never called. Nothing is logged for absent/empty/`off`; a non-empty STRING that is
 *        not exactly an accepted value logs ONE warning per process (ISS-T037WIRE-002) and stays off.
 *   `fail-closed` -> rules enforced; rules that cannot be evaluated => NONE of the tenant's meetings are scheduled (`rules-unevaluable`).
 *   `fail-open`   -> rules enforced when evaluable; otherwise the selection is left exactly as today's, with a loud warning.
 *   `last-valid` -> verified tenant's full validated rules/state snapshot for <1 hour after primary failure; otherwise refuse.
 * Enabling is a separate operational step. `last-valid` never treats an absent primary as empty rules.
 *
 * VETO ONLY: the result is always built from the INPUT selection by removing items (fail-closed / veto) or by putting back an
 * item the input already scheduled (fail-open); nothing the input did not schedule can be scheduled.
 * TENANCY (W4): a tick serves one tenant (its API key); rules are loaded for that tenant id only. A missing/invalid tenant id is
 * "cannot be evaluated", never a guess. Legacy modes retain missing rules FILE = "no rules"; last-valid does not.
 * TRANSIENT (`locked` / `lock-failed` / EBUSY-class read errors): the store's load takes NO lock (temp+rename writes), so it should not
 * occur on the read path; if it does it is retried within a small bounded budget, then treated as unevaluable (never as "no rules").
 */
import type { AutoRecordItem, SelectAutoRecordItemsResult, SkippedItem } from "@lkb/core";
import { applyJoinRules, type JoinRuleEvaluator } from "./join-rules-select.js";
import { loadJoinRules, JoinRulesStoreError, type StoredJoinRules } from "./join-rules-store.js";
import { joinRulesFilePath } from "./join-rules-store.js";
import { JoinRulesSnapshotError, loadPrimaryJoinRules, loadLastValidJoinRules, saveLastValidJoinRules } from "./join-rules-last-valid.js";
import type { ApprovedTrustContext } from "./join-rules-approved-trust.js";

export type JoinRulesEnforceMode = "off" | "fail-closed" | "fail-open" | "last-valid";
export const JOIN_RULES_ENFORCE_ENV = "LKB_JOIN_RULES_ENFORCE";

export function parseJoinRulesEnforce(raw: unknown): JoinRulesEnforceMode {
  return raw === "fail-closed" || raw === "fail-open" || raw === "last-valid" ? raw : "off";
}

/**
 * ISS-T037WIRE-002: exact parsing; unrecognised non-empty values are made LOUD once per process per distinct value.
 */
let warnedValues = new Set<string>();
/** Test seam: forget which unrecognised values were already reported in this process. */
export function resetJoinRulesEnforceWarnings(): void { warnedValues = new Set(); }
function warnUnrecognised(raw: unknown, log: (msg: string) => void): void {
  if (typeof raw !== "string" || raw === "" || raw === "off") return;
  const shown = JSON.stringify(raw.slice(0, 40).replace(/[\x00-\x1f\x7f-\x9f]+|[\p{Zl}\p{Zp}]+/gu, " ")) +
    (raw.length > 40 ? ` (+${raw.length - 40} more characters)` : "");
  if (warnedValues.has(shown)) return;
  warnedValues.add(shown);
  log(`schedule-tick: JOIN RULES WARNING: ${JOIN_RULES_ENFORCE_ENV} has an unrecognised value ${shown} — enforcement is OFF, ` +
    "join-rule opt-outs and deny rules are NOT being applied. Accepted values: off, fail-closed, fail-open, last-valid (exact, case-sensitive; empty = off)");
}

/** Test seams; production passes none. */
export interface JoinRulesEnforceIo {
  load?: (stateDir: string, tenantId: string) => StoredJoinRules;
  evaluate?: JoinRuleEvaluator;
  wait?: (ms: number) => Promise<void>;
}
export interface JoinRulesEnforceConfig {
  mode: unknown; tenantId?: string; stateDir: string; log: (msg: string) => void; io?: JoinRulesEnforceIo;
  /** The tenant of the API key whose candidates are filtered. A string different from `tenantId` => `tenant-mismatch`; `null` = the key's
   * tenant could not be verified => `tenant-unverified` (same handling per policy); `undefined` = not supplied (test seam). Production
   * supplies it every enforcing tick from the `X-LKB-Tenant` header (join-rules-wiring/key-tenant.ts). */
  keyTenantId?: unknown;
  /** Snapshot clock is read once per enforcement call. Production uses Date.now. */
  now?: () => number;
  /** Dry-run: no snapshot writes and no alert delivery. */
  readOnly?: boolean;
  onDegraded?: (event: JoinRulesDegradation) => Promise<unknown> | unknown;
  /** Clear the active degradation outage after current primary validation and successful snapshot persistence. */
  onHealthy?: () => Promise<unknown> | unknown;
  /** Server-local preselection using the exact authenticated document subsequently vetoed here. */
  selectWithRules?: (authority: ApprovedTrustContext) => SelectAutoRecordItemsResult;
}
/** Fixed/sanitized fields only; never includes rule contents, paths, sender identities or meeting URLs. */
export interface JoinRulesDegradation {
  tenantId?: string; reason: string; usingSnapshot: boolean; snapshotValidatedAt?: number; snapshotExpiresAt?: number;
}

const RETRY_WAITS_MS = [150, 300];
const TRANSIENT_CODES = new Set(["locked", "lock-failed", "EBUSY", "EPERM", "EACCES"]);
const REASON_TENANT_UNSET = "tenant-unset: LKB_TENANT_ID is absent or not a valid tenant id (no default tenant); join rules not evaluated";
const REASON_TENANT_MISMATCH = "tenant-mismatch: the API key's tenant differs from LKB_TENANT_ID; join rules not applied";
const REASON_TENANT_UNVERIFIED = "tenant-unverified: the API key's tenant could not be verified against LKB_TENANT_ID; join rules not applied";
const DETAIL_FAIL_CLOSED = "join rules could not be read or evaluated; failing closed (see the JOIN RULES log line)";

/** Message safe for a log: control characters removed, path-like text redacted, bounded. */
function clean(s: string): string {
  return s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/[A-Za-z]:[\\/][^\s"']*/g, "<path>")
    .replace(/(?:\/[\w.@-]+){2,}/g, "<path>").trim().slice(0, 300);
}

/** Only these codes carry a message worth showing (a validation/parse problem); the rest could embed a path or another tenant's name. */
function describeFailure(e: unknown): string {
  if (e instanceof JoinRulesStoreError) {
    if (e.code === "bad-tenant") return REASON_TENANT_UNSET; // the store's own tenant validator rejected it; its message echoes the raw value, so not used
    return ["invalid", "corrupt", "too-large"].includes(e.code) ? clean(e.message) : `join-rules store: ${e.code}`;
  }
  const code = (e as { code?: unknown })?.code;
  return `join rules unreadable${typeof code === "string" ? ` (${clean(code)})` : ""}`;
}

const isTransient = (e: unknown): boolean => {
  const code = e instanceof JoinRulesStoreError ? e.code : (e as { code?: unknown })?.code;
  return typeof code === "string" && TRANSIENT_CODES.has(code);
};

interface ReadRulesSuccess { stored: StoredJoinRules; healthy?: boolean; snapshot?: { validatedAt: number; expiresAt: number } }
async function readRules(c: JoinRulesEnforceConfig): Promise<ReadRulesSuccess | { error: string; noFallback?: boolean }> {
  const load = c.io?.load ?? (c.mode === "last-valid" ? loadPrimaryJoinRules : loadJoinRules);
  const wait = c.io?.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    try { return { stored: load(c.stateDir, c.tenantId as string) }; }
    catch (e) {
      if (!isTransient(e) || attempt >= RETRY_WAITS_MS.length) return { error: describeFailure(e),
        noFallback: e instanceof JoinRulesStoreError && ["bad-tenant", "tenant-mismatch"].includes(e.code) };
      await wait(RETRY_WAITS_MS[attempt]!);
    }
  }
}

const skipAll = (items: readonly AutoRecordItem[]): SkippedItem[] => items.map((i) => ({
  sessionKey: i.sessionKey, source: i.source, sourceId: i.sourceId, title: i.title, reason: "rules-unevaluable", detail: DETAIL_FAIL_CLOSED,
}));

async function degraded(c: JoinRulesEnforceConfig, event: JoinRulesDegradation): Promise<void> {
  if (c.readOnly || !c.onDegraded) return;
  try { await c.onDegraded(event); }
  catch { c.log("schedule-tick: JOIN RULES WARNING: degradation alert delivery failed; rules policy remains enforced"); }
}
async function healthy(c: JoinRulesEnforceConfig): Promise<void> {
  if (c.readOnly) return;
  try { await c.onHealthy?.(); } catch { c.log("schedule-tick: JOIN RULES WARNING: recovery alert state not cleared; current rules remain enforced"); }
}

async function boundedRules(c: JoinRulesEnforceConfig): Promise<ReadRulesSuccess | { error: string }> {
  const now = (c.now ?? Date.now)();
  const reject = async (reason: string) => {
    await degraded(c, { reason, usingSnapshot: false });
    return { error: reason };
  };
  if (typeof c.tenantId !== "string" || !c.tenantId) return reject(REASON_TENANT_UNSET);
  try { joinRulesFilePath(c.stateDir, c.tenantId); } catch { return reject(REASON_TENANT_UNSET); }
  if (c.keyTenantId === undefined || c.keyTenantId === null) return reject(REASON_TENANT_UNVERIFIED);
  if (c.keyTenantId !== c.tenantId) return reject(REASON_TENANT_MISMATCH);
  const read = await readRules(c);
  if ("stored" in read) {
    let saved = false;
    if (!c.readOnly) {
      try {
        saveLastValidJoinRules(c.stateDir, c.tenantId, read.stored, now);
        saved = true;
      }
      catch (e) {
        if (e instanceof JoinRulesSnapshotError && ["primary-changed", "primary-revalidation-failed"].includes(e.code)) {
          await degraded(c, { tenantId: c.tenantId, reason: "primary-changed", usingSnapshot: false });
          return { error: "primary changed or became unavailable during snapshot refresh; refusing the stale selection" };
        }
        await degraded(c, { tenantId: c.tenantId, reason: "snapshot-write-failed", usingSnapshot: false });
        c.log("schedule-tick: JOIN RULES WARNING: last-valid snapshot not saved; current primary rules remain enforced"); }
    }
    return { ...read, healthy: saved };
  }
  if (!read.noFallback) {
    try {
      const snapshot = loadLastValidJoinRules(c.stateDir, c.tenantId, now);
      await degraded(c, { tenantId: c.tenantId, reason: "primary-unavailable", usingSnapshot: true,
        snapshotValidatedAt: snapshot.validatedAt, snapshotExpiresAt: snapshot.expiresAt });
      c.log("schedule-tick: JOIN RULES WARNING: primary unavailable; applying validated tenant snapshot within its one-hour lifetime");
      return { stored: snapshot.stored, snapshot: { validatedAt: snapshot.validatedAt, expiresAt: snapshot.expiresAt } };
    } catch { /* No trusted unexpired snapshot: refuse, never renew. */ }
  }
  await degraded(c, { tenantId: c.tenantId, reason: read.noFallback ? "primary-identity-invalid" : "no-valid-snapshot", usingSnapshot: false });
  return { error: read.error };
}

export async function enforceJoinRules(selection: SelectAutoRecordItemsResult, c: JoinRulesEnforceConfig): Promise<SelectAutoRecordItemsResult> {
  const mode = parseJoinRulesEnforce(c.mode);
  if (mode === "off") { warnUnrecognised(c.mode, c.log); return selection; }
  const warn = (why: string, effect: string) =>
    c.log(`schedule-tick: JOIN RULES WARNING (${mode}): ${why} — ${effect}`);
  const items = Array.isArray(selection?.toSchedule) ? selection.toSchedule : [];
  const skipped = Array.isArray(selection?.skipped) ? selection.skipped : [];

  const read = mode === "last-valid" ? await boundedRules(c)
    : typeof c.tenantId !== "string" || c.tenantId === "" ? { error: REASON_TENANT_UNSET }
    : c.keyTenantId === null ? { error: REASON_TENANT_UNVERIFIED }
    : c.keyTenantId !== undefined && c.keyTenantId !== c.tenantId ? { error: REASON_TENANT_MISMATCH }
    : await readRules(c);
  if ("error" in read) {
    if (mode === "fail-open") { warn(read.error, "rules NOT applied, selection unchanged"); return selection; }
    warn(read.error, `${items.length} meeting(s) NOT scheduled this tick`);
    return items.length === 0 ? selection : { toSchedule: [], skipped: [...skipped, ...skipAll(items)] };
  }

  // Granting persisted trust requires the real current key binding, including in legacy modes.
  // Reuse this read for selection and veto; never reopen the primary between those operations.
  const tickNow = c.selectWithRules ? (c.now ?? Date.now)() : NaN;
  if (c.selectWithRules && c.keyTenantId === c.tenantId && typeof c.tenantId === "string" &&
    Number.isSafeInteger(tickNow) && tickNow >= 0) {
    selection = c.selectWithRules({configuredTenantId: c.tenantId, keyTenantId: c.tenantId,
      verifiedAt: tickNow, now: tickNow, document: {tenantId: c.tenantId,
        source: "snapshot" in read && read.snapshot ? "last-valid" : "primary",
        validatedAt: "snapshot" in read && read.snapshot ? read.snapshot.validatedAt : tickNow, stored: read.stored}});
  }
  const selectedItems = Array.isArray(selection?.toSchedule) ? selection.toSchedule : [];
  const selectedSkipped = Array.isArray(selection?.skipped) ? selection.skipped : [];
  const out = applyJoinRules(selection, read.stored.ruleSet, { state: read.stored.state, log: (m) => c.log(`schedule-tick: JOIN RULES WARNING (${mode}): ${m}`) }, c.io?.evaluate);
  const recover = mode === "last-valid" && "healthy" in read && read.healthy === true;
  if (out === selection) { if (recover) await healthy(c); return selection; }
  const removed = out.skipped.slice(selectedSkipped.length);
  const gone = selectedItems.filter((i) => !out.toSchedule.includes(i)); // removed[k] belongs to gone[k] (applyJoinRules appends in order)
  const unevaluable = gone.filter((_, k) => removed[k]?.reason === "rules-unevaluable");
  if (unevaluable.length === 0) { if (recover) await healthy(c); return out; }
  if (mode === "last-valid") {
    const snapshot = "snapshot" in read ? read.snapshot : undefined;
    await degraded(c, { tenantId: c.tenantId, reason: "evaluation-failed", usingSnapshot: !!snapshot,
      snapshotValidatedAt: snapshot?.validatedAt, snapshotExpiresAt: snapshot?.expiresAt });
  }
  else await degraded(c, { tenantId: c.tenantId, reason: "evaluation-failed", usingSnapshot: false }); // ISS-T037VETO-003: alert in every enforcing mode
  if (mode !== "fail-open") {
    warn(`${unevaluable.length} meeting(s) could not be evaluated`, "NOT scheduled this tick");
    return out;
  }
  warn(`${unevaluable.length} meeting(s) could not be evaluated`, "left scheduled, other rules still applied");
  const back = new Set<AutoRecordItem>(unevaluable);
  return {
    toSchedule: selectedItems.filter((i) => out.toSchedule.includes(i) || back.has(i)),
    skipped: [...selectedSkipped, ...removed.filter((_, k) => removed[k]?.reason !== "rules-unevaluable")],
  };
}
