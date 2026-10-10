/**
 * apps/api/src/join-rules/test-store.ts — shared TEST helper for t037 tenancy/scope tests: a byte-level
 * in-memory join-rules store that records the tenant argument of EVERY dep call (the spy), so a test can
 * assert WHICH tenant's data was read or changed rather than only the HTTP status.
 */
import type { JoinRulesDeps, JoinRuleSetValue, JoinRuleStateValue, StoredJoinRulesValue } from "./deps.js";

export class StoreError extends Error {
  constructor(public readonly code: string) { super(`join-rules store: ${code}`); this.name = "JoinRulesStoreError"; }
}
export const empty = (): StoredJoinRulesValue => ({ ruleSet: { version: 1, ownDomains: [], rules: [] }, state: { approvedSenders: [], approvedDomains: [], optedOutEventIds: [] } });

export function spyStore() {
  const bytes = new Map<string, string>(); // tenant -> stored JSON (compared byte for byte)
  const calls: { op: string; tenantId: string }[] = [];
  let failNextSave = false;
  const put = (t: string, v: StoredJoinRulesValue) => { bytes.set(t, JSON.stringify(v)); };
  const load = async (t: string): Promise<StoredJoinRulesValue> => {
    calls.push({ op: "load", tenantId: t });
    return JSON.parse(bytes.get(t) ?? JSON.stringify(empty()));
  };
  const save = async (t: string, v: StoredJoinRulesValue): Promise<void> => {
    calls.push({ op: "save", tenantId: t });
    if (failNextSave) { failNextSave = false; throw new Error("injected save failure C:\secret"); }
    put(t, v);
  };
  const deps: JoinRulesDeps = {
    load, save,
    validateRuleSet(input: unknown): JoinRuleSetValue {
      const o = input as Record<string, unknown>;
      const extra = Object.keys(o).filter(k => !["version", "ownDomains", "rules"].includes(k));
      if (extra.length) throw new Error(`unknown field "${extra[0]}"`);
      if (o.version !== 1 || !Array.isArray(o.ownDomains) || !Array.isArray(o.rules)) throw new Error("bad shape");
      return { version: 1, ownDomains: o.ownDomains as string[], rules: o.rules as JoinRuleSetValue["rules"] };
    },
    async recordApproval(t, a): Promise<JoinRuleStateValue> {
      calls.push({ op: "recordApproval", tenantId: t });
      const cur = await load(t);
      const key = a.kind === "sender" ? "approvedSenders" : "approvedDomains";
      const state = { ...cur.state, [key]: [...cur.state[key], a.value] };
      await save(t, { ruleSet: cur.ruleSet, state });
      return state;
    },
    async recordOptOut(t, id): Promise<JoinRuleStateValue> {
      calls.push({ op: "recordOptOut", tenantId: t });
      const cur = await load(t);
      const state = { ...cur.state, optedOutEventIds: [...cur.state.optedOutEventIds, id] };
      await save(t, { ruleSet: cur.ruleSet, state });
      return state;
    },
  };
  return { deps, bytes, calls, put, failNextSave: () => { failNextSave = true; } };
}
