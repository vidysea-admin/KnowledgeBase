/**
 * packages/meeting-bot/src/calendar/join-rules-select.ts — T-037 unit `t037-join-rules-veto-select`.
 * Pure VETO layer over `selectAutoRecordItems`: the join-rules engine may only REMOVE scheduled items.
 *
 * SAFETY PROPERTY: for every input, output.toSchedule is a subsequence of input.toSchedule (a subset,
 * no duplicates, survivors keep input order) and output.skipped = input.skipped followed by one entry per
 * removed item. Nothing skipped can become scheduled; nothing absent can appear.
 *
 * Nothing calls this yet. It does not decide ISS-376: "no matching rule", engine allow/approval and sender
 * authentication are all ignored here; only an explicit refusal (or an unevaluable rule set) removes an item.
 *
 * Items carry no tenant: the caller passes ONE tenant's rules/state, and the function holds no state.
 */
import type { AutoRecordItem, SelectAutoRecordItemsResult, SkippedItem, SkipReason } from "@lkb/core";
import { evaluateJoinRules, type JoinDecision, type JoinRuleEvent, type JoinRuleSet, type JoinRuleState } from "./join-rules.js";

export interface JoinRulesVetoContext { state?: JoinRuleState }
/** Test seam: production callers pass three arguments and get the real engine. */
export type JoinRuleEvaluator = (event: JoinRuleEvent, rules: JoinRuleSet, state?: JoinRuleState) => JoinDecision;

const UNEVALUABLE = "join-rules veto: rules could not be evaluated (failing closed)";

function toEvent(item: AutoRecordItem, id: string): JoinRuleEvent {
  return { id, organizer: item.sender, meetingUrl: item.meetingUrl };
}

/** Returns a skip entry when the rules refuse this item, else undefined (keep it scheduled). */
function veto(item: AutoRecordItem, rules: JoinRuleSet, state: JoinRuleState | undefined,
  evaluate: JoinRuleEvaluator): SkippedItem | undefined {
  const base = { sessionKey: item.sessionKey, source: item.source, sourceId: item.sourceId, title: item.title };
  const out = (reason: SkipReason, detail: string): SkippedItem => ({ ...base, reason, detail });
  try {
    // Opt-outs may be recorded under the source id or the session key; either removes (can only narrow).
    const decisions = [evaluate(toEvent(item, item.sourceId), rules, state)];
    if (decisions[0]!.reason !== "meeting-opt-out") decisions.push(evaluate(toEvent(item, item.sessionKey), rules, state));
    for (const d of decisions) {
      if (d.reason === "invalid-rule-set") return out("untrusted-sender", UNEVALUABLE);
    }
    for (const d of decisions) {
      if (d.action !== "skip") continue; // join / needs-approval never remove
      const detail = `join-rules veto: ${d.reason} (rule ${d.ruleId})`;
      const reason: SkipReason = d.reason === "cancelled" ? "cancelled" : d.reason === "no-meeting-url" ? "no-join-link" : "untrusted-sender";
      return out(reason, detail);
    }
    return undefined;
  } catch {
    return out("untrusted-sender", UNEVALUABLE);
  }
}

export function applyJoinRules(selection: SelectAutoRecordItemsResult, rules: JoinRuleSet | undefined,
  context: JoinRulesVetoContext = {}, evaluate: JoinRuleEvaluator = evaluateJoinRules): SelectAutoRecordItemsResult {
  if (rules === undefined) return selection; // no rule file: identity (same reference)
  try {
    if (!selection || !Array.isArray(selection.toSchedule)) return selection;
    const kept: AutoRecordItem[] = [];
    const removed: SkippedItem[] = [];
    for (const item of selection.toSchedule) {
      const s = veto(item, rules, context?.state, evaluate);
      if (s) removed.push(s); else kept.push(item);
    }
    if (removed.length === 0) return selection;
    return { toSchedule: kept, skipped: [...selection.skipped, ...removed] };
  } catch {
    return selection; // unreachable in practice; a malformed selection holds nothing the rules could add
  }
}
