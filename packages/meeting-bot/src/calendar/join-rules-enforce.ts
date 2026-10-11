/**
 * packages/meeting-bot/src/calendar/join-rules-enforce.ts — T-037 unit `t037-scheduler-wiring-behind-flag`.
 * The ONE place that decides whether the scheduler tick applies a tenant's join rules, and what happens when they cannot be read.
 *
 * Setting (read once, in schedule-tick.ts buildRealScheduleTickDeps, from env LKB_JOIN_RULES_ENFORCE; parsed only here):
 *   `off` (DEFAULT; also absent, empty, any other string, any non-string)  -> returns the selection UNTOUCHED (same reference);
 *        the store is never opened, `applyJoinRules` is never called, nothing is logged.
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

/** Test seams; production passes none. */
export interface JoinRulesEnforceIo {
  load?: (stateDir: string, tenantId: string) => StoredJoinRules;
  evaluate?: JoinRuleEvaluator;
  wait?: (ms: number) => Promise<void>;
}
export interface JoinRulesEnforceConfig {
  mode: unknown; tenantId?: string; stateDir: string; log: (msg: string) => void; io?: JoinRulesEnforceIo;
}

const RETRY_WAITS_MS = [150, 300];
const TRANSIENT_CODES = new Set(["locked", "lock-failed", "EBUSY", "EPERM", "EACCES"]);
const DETAIL_FAIL_CLOSED = "join rules could not be read or evaluated; failing closed (see the JOIN RULES log line)";

/** Message safe for a log: control characters removed, path-like text redacted, bounded. */
function clean(s: string): string {
  return s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/[A-Za-z]:[\\/][^\s"']*/g, "<path>")
    .replace(/(?:\/[\w.@-]+){2,}/g, "<path>").trim().slice(0, 300);
}

/** Only these codes carry a message worth showing (a validation/parse problem); the rest could embed a path or another tenant's name. */
function describeFailure(e: unknown): string {
  if (e instanceof JoinRulesStoreError) {
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
  if (mode === "off") return selection;
  const warn = (why: string, effect: string) =>
    c.log(`schedule-tick: JOIN RULES WARNING (${mode}): ${why} — ${effect}`);
  const items = Array.isArray(selection?.toSchedule) ? selection.toSchedule : [];
  const skipped = Array.isArray(selection?.skipped) ? selection.skipped : [];

  const read = typeof c.tenantId === "string" && c.tenantId !== ""
    ? await readRules(c) : { error: "join rules not evaluated: the tick has no tenant id (LKB_TENANT_ID)" };
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
