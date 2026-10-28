/** Registration decisions contain finite public reasons, never profile values or private URLs. */
import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";
import type { AutoRecordCandidateInput, WebinarReconciliationResult } from "@lkb/core";

export const REGISTRATION_REASONS = [
  "approval-required", "sender-unverified", "not-webinar", "source-unresolved", "source-incomplete",
  "configuration-required", "configuration-invalid", "profile-required", "scope-denied", "form-required",
  "confirmation-pending", "submission-uncertain", "browser-failure", "browser-timeout", "owned-cleanup-failed",
  "request-policy-refused", "request-policy-unproved", "script-isolation-unproved", "redirect-refused",
  "form-mismatch", "captcha-required", "payment-required", "consent-required", "unsupported-form",
  "challenge-payment-login", "missing-required-data", "invalid-profile-values", "form-changed",
] as const;
export type RegistrationReason = typeof REGISTRATION_REASONS[number];
export interface RegistrationIdentity { sourceOccurrenceKey: string; sourceIds: string[]; sessionKeys: string[] }
type RegistrationCandidate = AutoRecordCandidateInput & {registrationIdentity?: RegistrationIdentity};

/** Proven acquisition aliases are private veto evidence; none can grant registration permission. */
export function registrationIdentityForSource(candidate: AutoRecordCandidateInput, sourceOccurrenceKey: string,
  occurrences: WebinarReconciliationResult["state"]["occurrences"]): RegistrationIdentity | undefined {
  const source = occurrences[sourceOccurrenceKey];
  if (!source?.accepted || source.unresolved) return undefined;
  const linked = source.linkedCalendar ? occurrences[source.linkedCalendar] : undefined;
  const rows = [source, ...(linked?.accepted && !linked.unresolved ? [linked] : [])];
  const sourceIds = [...new Set([candidate.id, ...rows.flatMap(row => [row.snapshot.id, ...row.providerIds])])];
  const sessionKeys = [...new Set(rows.flatMap(row => [
    `${row.source === "calendar" ? "cal" : "gmail"}:${row.snapshot.id}`, ...row.aliases.map(alias => alias.key)]))];
  const valid = (value: unknown, max: number) => typeof value === "string" && value.length > 0 && value.length <= max && !/\s|[\x00-\x1f\x7f]/.test(value);
  if (!valid(sourceOccurrenceKey, 200) || sourceIds.length + sessionKeys.length > 200 ||
    sourceIds.some(id => !valid(id, 1024)) || sessionKeys.some(key => !valid(key, 200))) return undefined;
  return {sourceOccurrenceKey, sourceIds, sessionKeys};
}

export function registrationSourceReason(candidate: AutoRecordCandidateInput,
  inventory: {classification: string; occurrenceKey: string} | undefined,
  occurrences: Record<string, {unresolved?: string; accepted?: boolean}>): RegistrationReason | undefined {
  if (candidate.status !== "approved" && candidate.status !== "auto_approved") return "approval-required";
  if (candidate.status === "auto_approved" && candidate.senderAuthenticated !== true) return "sender-unverified";
  if (!inventory || inventory.classification !== "webinar") return "not-webinar";
  const source = occurrences[inventory.occurrenceKey];
  if (!source || source.accepted !== true || source.unresolved) return "source-unresolved";
  if (!candidate.messageId || !candidate.threadId || !candidate.registrationUrl || !candidate.startTime || !candidate.endTime)
    return "source-incomplete";
  return undefined;
}

const bounded = (value: unknown, max = 256): value is string => typeof value === "string" &&
  value.trim().length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
/** Validate before the durable submitting marker: correcting missing data must remain retryable. */
export function registrationConfigurationReason(config: any, candidate: AutoRecordCandidateInput): RegistrationReason | undefined {
  if (!config) return "configuration-required";
  if (!bounded(config.python, 4096) || !bounded(config.profileDir, 4096) || !isAbsolute(config.python) || !isAbsolute(config.profileDir))
    return "profile-required";
  const keys = ["firstName", "lastName", "email", "organization"];
  if (!config.operator || typeof config.operator !== "object" || Array.isArray(config.operator) ||
    Object.keys(config.operator).some(key => !keys.includes(key)) ||
    ["firstName", "lastName", "email"].some(key => !bounded(config.operator[key])) ||
    (config.operator.organization !== undefined && !bounded(config.operator.organization)) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.operator.email)) return "profile-required";
  const form = config.form;
  if (form && form.mode !== "native-html") return "unsupported-form";
  if (!form || !bounded(form.formSelector) || !bounded(form.submitSelector) ||
    !form.fields || typeof form.fields !== "object" || Array.isArray(form.fields) ||
    Object.keys(form.fields).some(key => !keys.includes(key)) ||
    ["firstName", "lastName", "email"].some(key => !bounded(form.fields[key])) ||
    (config.operator.organization === undefined) !== (form.fields.organization === undefined) ||
    (form.fields.organization !== undefined && !bounded(form.fields.organization)) ||
    new Set(Object.values(form.fields)).size !== Object.values(form.fields).length) return "form-required";
  if (config.timeoutMs !== undefined && (!Number.isInteger(config.timeoutMs) || config.timeoutMs < 1000 || config.timeoutMs > 300000))
    return "configuration-invalid";
  if (config.browserExecutable !== undefined && (!bounded(config.browserExecutable, 4096) ||
    (config.browserExecutable !== "cft" && !isAbsolute(config.browserExecutable))))
    return "configuration-invalid";
  let url: URL; try { url = new URL(candidate.registrationUrl!); } catch { return "scope-denied"; }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || !Array.isArray(config.allowedHosts) ||
    config.allowedHosts.length < 1 || config.allowedHosts.length > 20 ||
    config.allowedHosts.some((host: unknown) => !bounded(host, 253) || !/^[a-z0-9.-]+$/.test(host)) ||
    !config.allowedHosts.includes(url.hostname)) return "scope-denied";
  return undefined;
}

export function registrationConfigurationFailure(error: unknown): RegistrationReason {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  return code === "denied" ? "scope-denied" : code === "unapproved" ? "profile-required" :
    code === "unavailable" ? "configuration-required" : "configuration-invalid";
}

const BROWSER_REASONS: Record<string, RegistrationReason> = {
  browser_failure: "browser-failure", browser_timeout: "browser-timeout", owned_cleanup_failed: "owned-cleanup-failed",
  request_policy_refused: "request-policy-refused", request_policy_unproved: "request-policy-unproved",
  persistent_policy_unproved: "request-policy-unproved", script_isolation_unproved: "script-isolation-unproved",
  redirect_host: "redirect-refused", form_mismatch: "form-mismatch", captcha: "captcha-required",
  payment: "payment-required", consent: "consent-required", unsupported_form: "unsupported-form",
  challenge_payment_login: "challenge-payment-login", field_mismatch: "missing-required-data",
  unknown_required: "missing-required-data", submit_mismatch: "form-mismatch", required_consent: "consent-required",
  unconfigured_consent: "consent-required", invalid_values: "invalid-profile-values", changed_after_validation: "form-changed",
};
export function registrationResultReason(result: unknown): RegistrationReason {
  if (!result || typeof result !== "object") return "submission-uncertain";
  const {status, reason} = result as {status?: unknown; reason?: unknown};
  if (status === "submitted") return "confirmation-pending";
  return typeof reason === "string" && Object.hasOwn(BROWSER_REASONS, reason) ? BROWSER_REASONS[reason]! :
    status === "action_required" ? "unsupported-form" : "submission-uncertain";
}

/** Only the provider acquisition timestamp can prove a newly seen mail is newer than submission. */
export function freshRegistrationConfirmation(candidate: AutoRecordCandidateInput, attemptedAt: string, checkedAt: string): boolean {
  const receivedAt = (candidate as AutoRecordCandidateInput & {receivedAt?: string}).receivedAt;
  if (typeof receivedAt !== "string" || !Number.isFinite(Date.parse(receivedAt)) || new Date(receivedAt).toISOString() !== receivedAt)
    return false;
  return receivedAt >= attemptedAt && receivedAt <= checkedAt &&
    (candidate.senderAuthenticated === true || candidate.status === "approved");
}

/** Equality guard only: current candidate-bound policy remains the authority. Never expose this private hash. */
function registrationConfigurationHash(config: any): string {
  const fields = ["firstName", "lastName", "email", "organization"];
  return createHash("sha256").update(JSON.stringify([
    config.python, config.profileDir, config.browserExecutable ?? null, [...config.allowedHosts].sort(),
    fields.map(key => config.operator[key] ?? null), config.form.mode, config.form.formSelector,
    config.form.submitSelector, fields.map(key => config.form.fields[key] ?? null),
  ])).digest("hex");
}

/** The caller owns the lane lock and commits every update before any external execution. */
export async function runWebinarRegistrations(input: {
  state: {operations: Record<string, Record<string, any>>}; tenantId: string; candidates: AutoRecordCandidateInput[];
  acquisition?: WebinarReconciliationResult; now: () => string; config?: (candidate: RegistrationCandidate) => any;
  register?: (input: any, config: any) => Promise<any>; update: (id: string, changes: Record<string, any>) => void | Promise<void>;
  validate: (value: any, tenantId: string, checkedAt: string) => any;
  confirm: (attempt: any, tenantId: string, candidates: AutoRecordCandidateInput[], checkedAt: string) => any;
  createUUID: () => string;
}) {
  const {state, tenantId, candidates, now, update} = input;
  if (!input.acquisition) {
    for (const [id, row] of Object.entries(state.operations)) {
      if (!row.registration || row.registration.phase === "confirmed") continue;
      const proof = input.confirm(row.registration, tenantId, candidates, new Date(now()).toISOString());
      if (proof) await update(id, {registration: proof, registrationReason: undefined});
      else if (row.registration.phase === "submitting") await update(id, {
        registration: {...row.registration, phase: "uncertain"}, registrationReason: "submission-uncertain"});
    }
    return;
  }
  for (const candidate of candidates) {
    if (!candidate.registrationOnly || candidate.status === "rejected" || candidate.cancelled ||
      (candidate.endTime && Date.parse(candidate.endTime) <= Date.parse(now()))) continue;
    const priorRows = Object.entries(state.operations).filter(([, row]) => row.registration?.sourceId === candidate.id);
    const prior = priorRows[0]?.[1].registration;
    if (priorRows.length > 1 || (prior && (prior.phase !== "action_required" || !prior.preSubmitEvidence))) continue;
    if (prior) {
      input.validate(prior, tenantId, new Date(now()).toISOString());
      if (prior.sourceMessageId !== candidate.messageId || prior.threadId !== candidate.threadId ||
        prior.organizerEmail !== candidate.senderEmail || prior.registrationUrl !== candidate.registrationUrl ||
        prior.startTime !== candidate.startTime || prior.endTime !== candidate.endTime) continue;
    }
    const inventory = input.acquisition.inventory.find(row => row.snapshot.id === candidate.id);
    if (!inventory || (priorRows.length && priorRows[0]![0] !== inventory.reviewKey)) continue;
    const title = candidate.title.replace(/https?:\/\/\S+/gi, "[link removed]");
    const blocked = async (registrationReason: RegistrationReason) => update(inventory.reviewKey, {
      status: "action_required", reason: "needs-registration", title, registrationReason});
    const sourceReason = registrationSourceReason(candidate, inventory, input.acquisition.state.occurrences);
    if (sourceReason) { await blocked(sourceReason); continue; }
    const registrationIdentity = registrationIdentityForSource(candidate, inventory.occurrenceKey, input.acquisition.state.occurrences);
    if (!registrationIdentity) { await blocked("source-incomplete"); continue; }
    let config;
    try { config = input.config?.({...candidate, registrationIdentity}); }
    catch (error) { await blocked(registrationConfigurationFailure(error)); continue; }
    const configReason = registrationConfigurationReason(config, candidate);
    if (configReason || !input.register) { await blocked(configReason ?? "configuration-invalid"); continue; }
    const configurationHash = registrationConfigurationHash(config);
    if (prior?.preSubmitEvidence.configurationHash === configurationHash) continue;
    const baselineMessageIds = [...new Set(candidates.map(row => row.messageId).filter((id): id is string => id !== undefined))];
    if (baselineMessageIds.length > 20000 || baselineMessageIds.some(id => typeof id !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(id))) {
      await blocked("source-incomplete"); continue;
    }
    const registration = {tenantId, sourceId: candidate.id, sourceMessageId: candidate.messageId, threadId: candidate.threadId, baselineMessageIds,
      registrationUrl: candidate.registrationUrl, organizerEmail: candidate.senderEmail, startTime: new Date(candidate.startTime!).toISOString(),
      endTime: new Date(candidate.endTime!).toISOString(), attemptId: input.createUUID(), attemptedAt: new Date(now()).toISOString(), phase: "submitting"};
    input.validate(registration, tenantId, registration.attemptedAt);
    await update(inventory.reviewKey, {status: "action_required", reason: "needs-registration", title,
      registration, registrationReason: "confirmation-pending"});
    let result;
    try { result = await input.register({url: candidate.registrationUrl, allowedHosts: config.allowedHosts, operator: config.operator, form: config.form}, config); }
    catch { result = {status: "uncertain", reason: "browser_failure"}; }
    const phase = result?.status === "submitted" ? "awaiting-confirmation" : result?.status === "action_required" ? "action_required" : "uncertain";
    const preSubmitEvidence = phase === "action_required" && result?.submissionDisposition === "not-attempted"
      ? {disposition: "not-attempted", configurationHash} : undefined;
    await update(inventory.reviewKey, {registration: {...registration, phase, ...(preSubmitEvidence ? {preSubmitEvidence} : {})},
      registrationReason: registrationResultReason(result)});
  }
}

/** Three-way field merge: a delayed source draft must not replace active-child writes. */
export function mergeRegistrationOperationDraft(before: Record<string, Record<string, any>>,
  draft: Record<string, Record<string, any>>, live: Record<string, Record<string, any>>) {
  const merged = JSON.parse(JSON.stringify(live)) as typeof live;
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  for (const [id, proposed] of Object.entries(draft)) {
    if (before[id] && !live[id]) continue;
    const original = before[id] ?? {}, current = live[id] ?? {};
    merged[id] ??= {};
    for (const key of new Set([...Object.keys(original), ...Object.keys(proposed)])) {
      if (same(original[key], proposed[key]) || !same(original[key], current[key])) continue;
      if (Object.hasOwn(proposed, key)) merged[id]![key] = proposed[key];
      else delete merged[id]![key];
    }
  }
  return merged;
}
