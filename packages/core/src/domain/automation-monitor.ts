/** T-061: bounded application routine and persisted operations monitor. No I/O or clock reads. */
export const applicationDocuments = ["transcript", "identity", "statement"] as const;
import type { StoredAutomationRun } from "../generated/automation_runs.js";
export type ApplicationDocument = typeof applicationDocuments[number];
export type ApplicationReadinessInput = StoredAutomationRun["payload"];
export type AutomationStatus = "queued" | "running" | "waiting-for-operator" | "succeeded" | "failed" | "cancelled";
export const automationKinds = ["application-readiness"] as const;
export type AutomationKind = typeof automationKinds[number];
const documentNames: readonly string[] = applicationDocuments;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export function isAutomationReference(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(v);
}
export function parseApplicationReadiness(value: unknown): ApplicationReadinessInput {
  if (!object(value) || Object.keys(value).sort().join(",") !== "applicationRef,availableDocuments,requiredDocuments" || !isAutomationReference(value.applicationRef)) throw new Error("invalid_application_input");
  const parse = (v: unknown): ApplicationDocument[] => {
    if (!Array.isArray(v) || v.length > 3 || v.some(x => typeof x !== "string" || !documentNames.includes(x)) || new Set(v).size !== v.length) throw new Error("invalid_application_input");
    return [...v].sort() as ApplicationDocument[];
  };
  const requiredDocuments = parse(value.requiredDocuments), availableDocuments = parse(value.availableDocuments);
  if (!requiredDocuments.length) throw new Error("invalid_application_input");
  // The parser above proves the schema's bounded tuple lengths and nonempty required list.
  return { applicationRef: value.applicationRef, requiredDocuments, availableDocuments } as ApplicationReadinessInput;
}
export type ApplicationReadinessOutcome = NonNullable<StoredAutomationRun["outcome"]>;
export function checkApplicationReadiness(input: ApplicationReadinessInput): ApplicationReadinessOutcome {
  const validated = parseApplicationReadiness(input);
  const missingDocuments = validated.requiredDocuments.filter(x => !validated.availableDocuments.some(available => available === x));
  return { ready: missingDocuments.length === 0, missingDocuments } as ApplicationReadinessOutcome;
}
export interface AutomationMonitorInput {
  status: AutomationStatus; leaseUntil: number | null; attempts: number; maxAttempts: number; retrySafe: boolean;
}
export type AutomationMonitorDecision = "unchanged" | "retry" | "reconcile" | "exhausted";
export function planAutomationMonitor(run: AutomationMonitorInput, now: number): AutomationMonitorDecision {
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(run.attempts) || run.attempts < 0 || !Number.isSafeInteger(run.maxAttempts) || run.maxAttempts < 1 || run.maxAttempts > 3) throw new Error("invalid_monitor_input");
  if (run.status !== "running") return "unchanged";
  if (!Number.isSafeInteger(run.leaseUntil) || run.leaseUntil! < 0) throw new Error("invalid_monitor_input");
  if (run.leaseUntil! > now) return "unchanged";
  if (!run.retrySafe) return "reconcile";
  return run.attempts < run.maxAttempts ? "retry" : "exhausted";
}
