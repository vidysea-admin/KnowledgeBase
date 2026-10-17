/**
 * packages/meeting-bot/src/calendar/join-rules/join-rules-select.ts — T-037 units `t037-join-rules-veto-select` and
 * `t037-veto-skip-reasons-and-optout-identity`.
 * Pure VETO layer over `selectAutoRecordItems`: the join-rules engine may only REMOVE scheduled items.
 *
 * SAFETY PROPERTY: for every input, output.toSchedule is a subsequence of input.toSchedule (a subset,
 * no duplicates, survivors keep input order) and output.skipped = input.skipped followed by one entry per
 * removed item. Nothing skipped can become scheduled; nothing absent can appear.
 *
 * Nothing calls this yet. It does not decide ISS-376: "no matching rule", engine allow/approval and sender
 * authentication are all ignored here; only an explicit refusal (or an unevaluable rule set) removes an item.
 *
 * Opt-outs follow the MEETING (ISS-T037VETO-002): an item is also tested under the ids of every record in the
 * same selection that shares its sessionKey or its platform meeting identity (`meetingIdentity`, send-now.ts).
 * Matching itself stays in `evaluateJoinRules`; this only widens the ids offered to it, so it can only remove.
 * A sibling that is NOT in the selection is covered by the stored meeting identity/sessionKey of the opt-out
 * (`state.optedOutMeetings`, join-rules-optout.ts; ISS-T037W1-001), matched inside `evaluateJoinRules`. Opt-outs recorded
 * without a meeting URL/sessionKey (older documents, or a client that sent none) still follow ids only.
 *
 * Items carry no tenant: the caller passes ONE tenant's rules/state, and the function holds no state.
 */
import type { AutoRecordItem, SelectAutoRecordItemsResult, SkippedItem, SkipReason } from "@lkb/core";
import { evaluateJoinRules, validateJoinRuleSet, validateJoinRuleState, type JoinDecision, type JoinRuleEvent, type JoinRuleSet, type JoinRuleState } from "./join-rules.js";
import { meetingIdentity } from "../../send-now.js";

export interface JoinRulesVetoContext {
  state?: JoinRuleState;
  /** ISS-T037VETO-003: receives the validation error message ONCE per applyJoinRules call (= once per tick) when the rule set or
   * state is invalid. Optional; absent = no logging (today's behaviour). The skip detail itself stays fixed. */
  log?: (msg: string) => void;
}
/** Test seam: production callers pass three arguments and get the real engine. */
export type JoinRuleEvaluator = (event: JoinRuleEvent, rules: JoinRuleSet, state?: JoinRuleState) => JoinDecision;

const UNEVALUABLE = "join-rules veto: rules could not be evaluated (failing closed)";

/** Why the rule set/state is invalid (the JoinRuleSetValidationError message), cleaned for a log line. */
export function describeInvalidRules(rules: unknown, state: unknown): string {
  const clean = (m: string) => m.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/[A-Za-z]:[\\/][^\s"']*/g, "<path>")
    .replace(/(?:\/[\w.@-]+){2,}/g, "<path>").trim().slice(0, 300);
  for (const [what, check] of [["rule set", () => validateJoinRuleSet(rules)], ["state", () => validateJoinRuleState(state)]] as const) {
    try { check(); } catch (e) { return `${what}: ${clean(e instanceof Error ? e.message : String(e))}`; }
  }
  return "evaluator failure (rule set and state validate)";
}

function toEvent(item: AutoRecordItem, id: string): JoinRuleEvent {
  return { id, organizer: item.sender, meetingUrl: item.meetingUrl };
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const identityOf = (url: unknown): string | undefined => {
  try { return typeof url === "string" ? meetingIdentity(url) : undefined; } catch { return undefined; }
};

/** For each scheduled item: the ids (sourceId, sessionKey) of every record in the selection that is the same
 * meeting (shares a sessionKey, or - scheduled items only, skipped ones carry no URL - a meeting identity). */
function siblingIds(selection: SelectAutoRecordItemsResult): Map<AutoRecordItem, string[]> {
  const entries: Record<string, unknown>[] = [];
  const scheduled = new Set<unknown>();
  for (const e of selection.toSchedule) if (isRec(e)) { entries.push(e); scheduled.add(e); }
  if (Array.isArray(selection.skipped)) for (const e of selection.skipped) if (isRec(e)) entries.push(e);
  const parent = entries.map((_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]!]!; i = parent[i]!; } return i; };
  const firstByKey = new Map<string, number>();
  entries.forEach((e, i) => {
    const keys: string[] = [];
    if (typeof e.sessionKey === "string" && e.sessionKey.trim() !== "") keys.push(`k:${e.sessionKey}`); // empty key must not group unrelated records
    const m = scheduled.has(e) ? identityOf(e.meetingUrl) : undefined;
    if (m) keys.push(`m:${m}`);
    for (const k of keys) {
      const at = firstByKey.get(k);
      if (at === undefined) firstByKey.set(k, i); else parent[find(i)] = find(at);
    }
  });
  const ids = new Map<number, Set<string>>();
  entries.forEach((e, i) => {
    const set = ids.get(find(i)) ?? new Set<string>();
    for (const id of [e.sourceId, e.sessionKey]) if (typeof id === "string" && id !== "") set.add(id);
    ids.set(find(i), set);
  });
  const out = new Map<AutoRecordItem, string[]>();
  entries.forEach((e, i) => { if (scheduled.has(e)) out.set(e as unknown as AutoRecordItem, [...(ids.get(find(i)) ?? [])]); });
  return out;
}

/** Returns a skip entry when the rules refuse this item, else undefined (keep it scheduled). */
function veto(item: AutoRecordItem, rules: JoinRuleSet, state: JoinRuleState | undefined,
  evaluate: JoinRuleEvaluator, siblings: readonly string[], onInvalid?: () => void): SkippedItem | undefined {
  const base = { sessionKey: item.sessionKey, source: item.source, sourceId: item.sourceId, title: item.title };
  const out = (reason: SkipReason, detail: string): SkippedItem => ({ ...base, reason, detail });
  try {
    // Own ids first, then the ids of the same meeting seen through another source; an opt-out on any removes.
    const own = [item.sourceId, item.sessionKey];
    const ids = [...own, ...siblings.filter((id) => !own.includes(id))];
    const decisions: JoinDecision[] = [];
    let via = "";
    for (const id of ids) {
      const d = evaluate(toEvent(item, id), rules, state);
      decisions.push(d);
      if (d.reason === "meeting-opt-out") { via = own.includes(id) ? "" : " [same meeting, recorded under another source id]"; break; }
    }
    for (const d of decisions) {
      if (d.reason === "invalid-rule-set") { onInvalid?.(); return out("rules-unevaluable", UNEVALUABLE); }
    }
    for (const d of decisions) {
      if (d.action !== "skip") continue; // join / needs-approval never remove
      const detail = `join-rules veto: ${d.reason} (rule ${d.ruleId})${d.reason === "meeting-opt-out" ? via : ""}`;
      const reason: SkipReason = d.reason === "cancelled" ? "cancelled" : d.reason === "no-meeting-url" ? "no-join-link"
        : d.reason === "meeting-opt-out" ? "opted-out" : "rule-denied";
      return out(reason, detail);
    }
    return undefined;
  } catch {
    return out("rules-unevaluable", UNEVALUABLE);
  }
}

export function applyJoinRules(selection: SelectAutoRecordItemsResult, rules: JoinRuleSet | undefined,
  context: JoinRulesVetoContext = {}, evaluate: JoinRuleEvaluator = evaluateJoinRules): SelectAutoRecordItemsResult {
  if (rules === undefined) return selection; // no rule file: identity (same reference)
  try {
    if (!selection || !Array.isArray(selection.toSchedule)) return selection;
    let siblings = new Map<AutoRecordItem, string[]>();
    try { siblings = siblingIds(selection); } catch { /* own ids only: still sound, never adds */ }
    const kept: AutoRecordItem[] = [];
    const removed: SkippedItem[] = [];
    let invalid = false;
    for (const item of selection.toSchedule) {
      const s = veto(item, rules, context?.state, evaluate, siblings.get(item) ?? [], () => { invalid = true; });
      if (s) removed.push(s); else kept.push(item);
    }
    if (invalid && context?.log) {
      try { context.log(`join-rules: invalid rule set, failing closed for every item this tick (${removed.length} removed): ${describeInvalidRules(rules, context?.state)}`); } catch { /* logging never changes the veto */ }
    }
    if (removed.length === 0) return selection;
    return { toSchedule: kept, skipped: [...(Array.isArray(selection.skipped) ? selection.skipped : []), ...removed] };
  } catch {
    return selection; // unreachable in practice; a malformed selection holds nothing the rules could add
  }
}
