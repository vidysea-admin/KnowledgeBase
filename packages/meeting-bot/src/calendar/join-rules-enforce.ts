/**
 * packages/meeting-bot/src/calendar/join-rules-enforce.ts — T-037 unit `t037-scheduler-wiring-behind-flag`.
 * The ONE place that decides whether the scheduler tick applies a tenant's join rules, and what happens when they cannot be read.
 *
 * Setting (read once, in schedule-tick.ts buildRealScheduleTickDeps, from env LKB_JOIN_RULES_ENFORCE; parsed only here):
 *   `off` (DEFAULT; also absent, empty, any other string, any non-string)  -> returns the selection UNTOUCHED (same reference);
 *        the store is never opened, `applyJoinRules` is never called. Nothing is logged for absent/empty/`off`; a non-empty STRING that is
 *        not exactly one of the three accepted values logs ONE warning per process (ISS-T037WIRE-002) and stays off.
 *   `fail-closed` -> rules enforced; rules that cannot be evaluated => NONE of the tenant's meetings are scheduled (`rules-unevaluable`).
 *   `fail-open`   -> rules enforced when evaluable; otherwise the selection is left exactly as today's, with a loud warning.
 * Only the exact strings `fail-closed` / `fail-open` enable anything. Which one to use is the Approver's decision (W3).
 *
 * VETO ONLY: the result is always built from the INPUT selection by removing items (fail-closed / veto) or by putting back an
 * item the input already scheduled (fail-open); nothing the input did not schedule can be scheduled.
 * TENANCY (W4): a tick serves one tenant (its API key); rules are loaded for that tenant id only. A missing/invalid tenant id is
 * "cannot be evaluated", never a guess. Missing rules FILE = "no rules" (store returns an empty set): nothing removed.
 * TRANSIENT (`locked` / `lock-failed` / EBUSY-class read errors): the store's load takes NO lock (temp+rename writes), so it should not
 * occur on the read path; if it does it is retried within a small bounded budget, then treated as unevaluable (never as "no rules").
 */
import type { AutoRecordItem, SelectAutoRecordItemsResult, SkippedItem } from "@lkb/core";
import { applyJoinRules, type JoinRuleEvaluator } from "./join-rules-select.js";
import { loadJoinRules, JoinRulesStoreError, type StoredJoinRules } from "./join-rules-store.js";

export type JoinRulesEnforceMode = "off" | "fail-closed" | "fail-open";
export const JOIN_RULES_ENFORCE_ENV = "LKB_JOIN_RULES_ENFORCE";

export function parseJoinRulesEnforce(raw: unknown): JoinRulesEnforceMode {
  return raw === "fail-closed" || raw === "fail-open" ? raw : "off";
}

/**
 * ISS-T037WIRE-002: strict parsing stays (only the two exact strings enable), but a non-empty value that is not exactly
 * `off` / `fail-closed` / `fail-open` is made LOUD: one warning per process (per distinct value), echo bounded and sanitised.
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
    "join-rule opt-outs and deny rules are NOT being applied. Accepted values: off, fail-closed, fail-open (exact, case-sensitive; empty = off)");
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

async function readRules(c: JoinRulesEnforceConfig): Promise<{ stored: StoredJoinRules } | { error: string }> {
  const load = c.io?.load ?? loadJoinRules;
  const wait = c.io?.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    try { return { stored: load(c.stateDir, c.tenantId as string) }; }
    catch (e) {
      if (!isTransient(e) || attempt >= RETRY_WAITS_MS.length) return { error: describeFailure(e) };
      await wait(RETRY_WAITS_MS[attempt]!);
    }
  }
}

const skipAll = (items: readonly AutoRecordItem[]): SkippedItem[] => items.map((i) => ({
  sessionKey: i.sessionKey, source: i.source, sourceId: i.sourceId, title: i.title, reason: "rules-unevaluable", detail: DETAIL_FAIL_CLOSED,
}));

export async function enforceJoinRules(selection: SelectAutoRecordItemsResult, c: JoinRulesEnforceConfig): Promise<SelectAutoRecordItemsResult> {
  const mode = parseJoinRulesEnforce(c.mode);
  if (mode === "off") { warnUnrecognised(c.mode, c.log); return selection; }
  const warn = (why: string, effect: string) =>
    c.log(`schedule-tick: JOIN RULES WARNING (${mode}): ${why} — ${effect}`);
  const items = Array.isArray(selection?.toSchedule) ? selection.toSchedule : [];
  const skipped = Array.isArray(selection?.skipped) ? selection.skipped : [];

  const read = typeof c.tenantId !== "string" || c.tenantId === "" ? { error: REASON_TENANT_UNSET }
    : c.keyTenantId === null ? { error: REASON_TENANT_UNVERIFIED }
    : c.keyTenantId !== undefined && c.keyTenantId !== c.tenantId ? { error: REASON_TENANT_MISMATCH }
    : await readRules(c);
  if ("error" in read) {
    if (mode === "fail-open") { warn(read.error, "rules NOT applied, selection unchanged"); return selection; }
    warn(read.error, `${items.length} meeting(s) NOT scheduled this tick`);
    return items.length === 0 ? selection : { toSchedule: [], skipped: [...skipped, ...skipAll(items)] };
  }

  const out = applyJoinRules(selection, read.stored.ruleSet, { state: read.stored.state }, c.io?.evaluate);
  if (out === selection) return selection;
  const removed = out.skipped.slice(skipped.length);
  const gone = items.filter((i) => !out.toSchedule.includes(i)); // removed[k] belongs to gone[k] (applyJoinRules appends in order)
  const unevaluable = gone.filter((_, k) => removed[k]?.reason === "rules-unevaluable");
  if (unevaluable.length === 0) return out;
  if (mode === "fail-closed") {
    warn(`${unevaluable.length} meeting(s) could not be evaluated`, "NOT scheduled this tick");
    return out;
  }
  warn(`${unevaluable.length} meeting(s) could not be evaluated`, "left scheduled, other rules still applied");
  const back = new Set<AutoRecordItem>(unevaluable);
  return {
    toSchedule: items.filter((i) => out.toSchedule.includes(i) || back.has(i)),
    skipped: [...skipped, ...removed.filter((_, k) => removed[k]?.reason !== "rules-unevaluable")],
  };
}
