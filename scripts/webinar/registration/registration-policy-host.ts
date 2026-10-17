import { resolveRegistrationPolicy } from "../../../packages/meeting-bot/src/calendar/join-rules/registration-policy-store.js";
import type { RegistrationCandidate } from "../../../packages/meeting-bot/src/calendar/join-rules/registration-policy.js";
export interface RegistrationRuntime { python: string; profileDir: string; browserExecutable?: string; timeoutMs?: number }
/** Use only after the runner verifies its API-key tenant equals this configured tenant. No env JSON grants consent. */
export function createRegistrationPolicyResolver(options: {stateDir: string; tenantId: string; runtime: RegistrationRuntime}) {
  return (candidate: RegistrationCandidate) => {
    const p = resolveRegistrationPolicy(options.stateDir, options.tenantId, candidate);
    return {...options.runtime, operator: p.operator, form: p.form, allowedHosts: p.scope.allowedHosts};
  };
}
