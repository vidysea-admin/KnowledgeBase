/** Shared allowed-layer composition: API and capture host use one canonical engine/store. */
import {
  loadJoinRules, saveJoinRules, loadJoinRulesWithValidator, saveJoinRulesIf, recordTenantApproval, recordTenantOptOut, recordTenantUnOptOut,
  type StoredJoinRules,
} from "./join-rules-store.js";
import { validateJoinRuleSet, type JoinRuleSet, type JoinRuleState } from "./join-rules.js";
import type { OptOutMeeting } from "./join-rules-optout.js";
import { loadRegistrationPolicy, mutateRegistrationPolicy, type RegistrationPolicyView } from "./registration-policy-store.js";

export interface JoinPolicyDeps {
  load(tenantId: string): StoredJoinRules;
  save(tenantId: string, value: StoredJoinRules): void;
  loadWithValidator(tenantId: string): StoredJoinRules & {validator: string};
  saveIf(tenantId: string, expected: string, ruleSet: JoinRuleSet): StoredJoinRules & {validator: string};
  validateRuleSet(input: unknown): JoinRuleSet;
  recordApproval(tenantId: string, approval: {kind: "sender" | "domain"; value: string}): JoinRuleState;
  recordOptOut(tenantId: string, eventId: string, meeting?: OptOutMeeting): JoinRuleState;
  removeOptOut(tenantId: string, eventId: string, meeting?: OptOutMeeting): {state: JoinRuleState; removed: {eventId: boolean; meetings: string[]}};
  registrationPolicy: {
    load(tenantId: string): RegistrationPolicyView;
    mutate(tenantId: string, expected: string, action: "replace" | "approve" | "revoke", policy?: unknown): RegistrationPolicyView;
  };
}

/** No reads, directory creation, lock or capture starts until a bound method is deliberately invoked. */
export function createJoinPolicyDeps({stateDir}: {stateDir: string}): JoinPolicyDeps {
  return {
    registrationPolicy: {
      load: t => loadRegistrationPolicy(stateDir, t),
      mutate: (t, revision, action, policy) => mutateRegistrationPolicy(stateDir, t, revision, action, policy),
    },
    load: t => loadJoinRules(stateDir, t),
    save: (t, v) => saveJoinRules(stateDir, t, v),
    loadWithValidator: t => loadJoinRulesWithValidator(stateDir, t),
    saveIf: (t, expected, rules) => saveJoinRulesIf(stateDir, t, expected, rules),
    validateRuleSet: validateJoinRuleSet,
    recordApproval: (t, a) => recordTenantApproval(stateDir, t, a),
    recordOptOut: (t, id, meeting) => recordTenantOptOut(stateDir, t, id, {}, meeting),
    removeOptOut: (t, id, meeting) => {
      const r = recordTenantUnOptOut(stateDir, t, id, {}, meeting);
      return {state: r.state, removed: {eventId: r.removedEventId, meetings: r.removedMeetings}};
    },
  };
}
