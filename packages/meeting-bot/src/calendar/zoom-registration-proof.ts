/** INACTIVE candidate. Produces a private reviewable proof, never changes active D-079 policy or submits. */
import { assessSender, type MailHeader } from "@lkb/core";
import { privateEvidenceHash, type ResolvedRegistrationLink } from "./registration-link-resolver.js";

export const ZOOM_PROVIDER_CORRELATION_ENABLED = false;
export interface VerifiedZoomEvent {
  providerEventId: string; startTime: string; endTime: string; registrationUrlHash: string;
  registrationBodyHash: string; metadataHash: string; method: "zoom-native-registration-and-calendar";
}
export interface BoundZoomAttempt {
  tenantId: string; sourceId: string; sourceMessageId: string; sourceThreadId: string; sourceHash: string;
  policyHash: string; policyRevision: number; recipient: string; providerEventId: string; startTime: string; endTime: string;
  registrationUrlHash: string; metadataHash: string; attemptId: string; attemptedAt: string;
  phase: "awaiting-confirmation" | "uncertain" | "submitting" | "action_required" | "confirmed"; bindingHash: string;
}
export interface ZoomConfirmationMail {messageId: string; threadId: string; internalDate: string; headers: MailHeader[]; html: string}
export interface NativeConfirmationEvent {
  providerEventId: string; startTime: string; endTime: string; recipient: string; contentHash: string;
  metadataHash: string; method: "zoom-native-confirmation-and-calendar";
}
export interface ZoomProofInput {
  tenantId: string; mailbox: string; checkedAt: string; complete: boolean; attempts: BoundZoomAttempt[];
  messages: ZoomConfirmationMail[]; consumedMessageIds: string[]; baselineMessageIds: string[];
  sourceState: {sourceId: string; sourceHash: string; policyHash: string; policyRevision: number;
    approved: boolean; rejected: boolean; cancelled: boolean; unresolved: boolean; optedOut: boolean; denied: boolean};
}
export interface ProofAuthorization {tenantId: string; sourceId: string; bindingHash: string; policyHash: string; policyRevision: number; hostScopeHash: string; decisionId: string}
export const zoomConfirmationHostScopeHash = (hosts: string[]) => privateEvidenceHash(JSON.stringify([...hosts].sort()));
export interface ZoomProofOptions {
  enabled?: boolean;
  /** Trusted current approved-policy lookup; metadata/approval supplied by a public request cannot authorize. */
  authorize?: (attempt: BoundZoomAttempt) => ProofAuthorization | undefined;
  /** Trusted provider-specific adapter must independently verify native event/ICS fields and their bytes. */
  readNativeEvent?: (mail: ZoomConfirmationMail) => NativeConfirmationEvent | undefined;
  allowedZoomHosts?: string[];
}
const stamp = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const id = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9._-]{1,256}$/.test(value);
const eventId = (value: unknown): value is string => typeof value === "string" && /^[1-9][0-9]{5,31}$/.test(value);
const email = (value: unknown): value is string => typeof value === "string" && value.length <= 256 &&
  assessSender([{name: "From", value}])?.senderEmail === value;

export function zoomAttemptBindingHash(attempt: Omit<BoundZoomAttempt, "bindingHash"> | BoundZoomAttempt): string {
  return privateEvidenceHash(JSON.stringify([attempt.tenantId, attempt.sourceId, attempt.sourceMessageId, attempt.sourceThreadId,
    attempt.sourceHash, attempt.policyHash, attempt.policyRevision, attempt.recipient, attempt.providerEventId, attempt.startTime,
    attempt.endTime, attempt.registrationUrlHash, attempt.metadataHash, attempt.attemptId, attempt.attemptedAt]));
}
/** An opaque registration code is not interpreted as an event ID. Mapping must already be independently verified. */
export function bindZoomRegistrationAttempt(attempt: Omit<BoundZoomAttempt, "bindingHash" | "providerEventId" | "metadataHash" | "registrationUrlHash">,
  resolution: ResolvedRegistrationLink, event: VerifiedZoomEvent): BoundZoomAttempt | undefined {
  if (resolution.tenantId !== attempt.tenantId || resolution.sourceId !== attempt.sourceId || resolution.messageId !== attempt.sourceMessageId ||
    resolution.sourceHash !== attempt.sourceHash || resolution.policyHash !== attempt.policyHash || !eventId(event.providerEventId) ||
    event.method !== "zoom-native-registration-and-calendar" || event.registrationUrlHash !== resolution.finalUrlHash ||
    event.registrationBodyHash !== resolution.bodyHash || privateEvidenceHash(resolution.body) !== resolution.bodyHash ||
    privateEvidenceHash(resolution.finalUrl) !== resolution.finalUrlHash || !hash(event.metadataHash) ||
    event.startTime !== attempt.startTime || event.endTime !== attempt.endTime || !stamp(event.startTime) || !stamp(event.endTime) ||
    event.endTime <= event.startTime || !email(attempt.recipient) || !stamp(attempt.attemptedAt) || attempt.phase !== "awaiting-confirmation") return undefined;
  const result = {...attempt, providerEventId: event.providerEventId, metadataHash: event.metadataHash, registrationUrlHash: event.registrationUrlHash};
  return {...result, bindingHash: zoomAttemptBindingHash(result)};
}
function nativeZoomJoin(html: string, hosts: string[], expectedId: string): string | undefined {
  if (typeof html !== "string" || Buffer.byteLength(html) > 1024 * 1024 || /<script\b/i.test(html)) return undefined;
  const visibleFields = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  if (/<!--/.test(visibleFields)) return undefined;
  const allIds = new Set<string>(), nativeButtons: string[] = [];
  for (const match of visibleFields.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attributes = new Map<string, string>(), text = match[1]!;
    let offset = 0;
    while (offset < text.length) {
      const whitespace = /^\s+/.exec(text.slice(offset));
      if (!whitespace) return undefined; offset += whitespace[0].length;
      if (offset === text.length) break;
      const token = /^([a-z][a-z0-9:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(text.slice(offset));
      if (!token || attributes.has(token[1]!.toLowerCase())) return undefined;
      attributes.set(token[1]!.toLowerCase(), token[2] ?? token[3]!); offset += token[0].length;
    }
    const href = attributes.get("href"); if (!href) continue;
    const raw = href.replace(/&amp;/g, "&"); if (/[\s\\\x00-\x1f\x7f]/.test(raw)) return undefined; let url: URL;
    try {url = new URL(raw);} catch {continue;}
    const path = /^\/(?:j|w)\/([1-9][0-9]{5,31})\/?$/.exec(url.pathname);
    const label = match[2]!.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/\s+/g, " ").trim();
    // Provider IDs from ANY zoom.us host count, so a conflicting ID on an unlisted host fails closed.
    if ((url.hostname === "zoom.us" || url.hostname.endsWith(".zoom.us")) && path) allIds.add(path[1]!);
    if (/^join webinar$/i.test(label) && attributes.has("type")) {
      if (attributes.get("type")!.toLowerCase() !== "button") return undefined;
      if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash ||
        !hosts.includes(url.hostname) || !path || path[1] !== expectedId) return undefined;
      nativeButtons.push(url.href);
    }
  }
  return allIds.size === 1 && allIds.has(expectedId) && nativeButtons.length === 1 ? nativeButtons[0] : undefined;
}
/** Activation needs BOTH the module constant and an explicit caller opt-in. */
export function inspectZoomRegistrationConfirmation(input: ZoomProofInput, options: ZoomProofOptions = {}) {
  return inspectWithConstant(input, options, ZOOM_PROVIDER_CORRELATION_ENABLED);
}
/** TEST SEAM ONLY: lets tests exercise the active path while the shipped constant stays false. No production caller may use it. */
export const inspectZoomRegistrationConfirmationWithConstantForTest = inspectWithConstant;
function inspectWithConstant(input: ZoomProofInput, options: ZoomProofOptions, constantEnabled: boolean) {
  const refuse = (reason: string) => ({status: "refused" as const, reason});
  if (constantEnabled !== true || options.enabled !== true || !options.authorize || !options.readNativeEvent)
    return {status: "inactive" as const, reason: "approval-required"};
  if (!input || input.complete !== true || !id(input.tenantId) || !email(input.mailbox) || !stamp(input.checkedAt) ||
    ![input.attempts, input.messages, input.baselineMessageIds, input.consumedMessageIds].every(Array.isArray) ||
    input.attempts.length > 20000 || input.messages.length > 20000 || input.baselineMessageIds.length > 20000 ||
    input.consumedMessageIds.length > 20000 || [...input.baselineMessageIds, ...input.consumedMessageIds].some(value => !id(value)) ||
    input.messages.some(mail => !mail || !id(mail.messageId) || !id(mail.threadId)) ||
    new Set(input.messages.map(mail => mail.messageId)).size !== input.messages.length)
    return refuse("acquisition-invalid");
  const state = input.sourceState;
  if (!state || state.approved !== true || [state.rejected, state.cancelled, state.unresolved, state.optedOut, state.denied].some(value => value !== false))
    return refuse("source-veto");
  const hosts = options.allowedZoomHosts ?? ["zoom.us"];
  if (!Array.isArray(hosts) || !hosts.length || hosts.length > 20 || hosts.some(host => typeof host !== "string" || host.length > 253 ||
    !host.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ||
    (host !== "zoom.us" && !host.endsWith(".zoom.us")))) return refuse("scope-invalid");
  const candidates: {attempt: BoundZoomAttempt; mail: ZoomConfirmationMail; join: string; receiptAt: string; native: NativeConfirmationEvent; decisionId: string}[] = [];
  try { for (const attempt of input.attempts) {
    if (attempt.tenantId !== input.tenantId || attempt.sourceId !== state.sourceId || attempt.sourceHash !== state.sourceHash ||
      attempt.policyHash !== state.policyHash || attempt.policyRevision !== state.policyRevision || attempt.phase !== "awaiting-confirmation" ||
      !Number.isSafeInteger(attempt.policyRevision) || attempt.policyRevision < 1 || !hash(attempt.sourceHash) || !hash(attempt.policyHash) ||
      !hash(attempt.metadataHash) || !hash(attempt.registrationUrlHash) || !eventId(attempt.providerEventId) ||
      ![attempt.sourceId, attempt.sourceMessageId, attempt.sourceThreadId, attempt.attemptId].every(id) || !email(attempt.recipient) ||
      attempt.recipient !== input.mailbox || !stamp(attempt.startTime) || !stamp(attempt.endTime) || !stamp(attempt.attemptedAt) ||
      attempt.endTime <= attempt.startTime || attempt.attemptedAt > input.checkedAt || attempt.bindingHash !== zoomAttemptBindingHash(attempt)) continue;
    const authorization = options.authorize(attempt);
    if (!authorization || !id(authorization.decisionId) || authorization.tenantId !== attempt.tenantId || authorization.sourceId !== attempt.sourceId ||
      authorization.bindingHash !== attempt.bindingHash || authorization.policyHash !== attempt.policyHash || authorization.policyRevision !== attempt.policyRevision ||
      authorization.hostScopeHash !== zoomConfirmationHostScopeHash(hosts)) continue;
    for (const mail of input.messages) {
      if (!id(mail.messageId) || !id(mail.threadId) || mail.messageId === attempt.sourceMessageId || input.baselineMessageIds.includes(mail.messageId) ||
        input.consumedMessageIds.includes(mail.messageId) || !/^(0|[1-9][0-9]{0,15})$/.test(mail.internalDate)) continue;
      const arrival = Number(mail.internalDate), cutoff = Math.min(Date.parse(attempt.attemptedAt) + 86400000, Date.parse(attempt.endTime));
      if (!Number.isSafeInteger(arrival) || arrival < Date.parse(attempt.attemptedAt) || arrival > Date.parse(input.checkedAt) || arrival > cutoff) continue;
      const sender = assessSender(mail.headers), delivered = mail.headers.filter(header => header.name.toLowerCase() === "delivered-to");
      if (sender?.senderEmail !== "no-reply@zoom.us" || !sender.senderAuthenticated || delivered.length !== 1 ||
        delivered[0]!.value.trim().toLowerCase() !== attempt.recipient) continue;
      const native = options.readNativeEvent(mail), join = nativeZoomJoin(mail.html, hosts, attempt.providerEventId);
      if (!join || !native || native.method !== "zoom-native-confirmation-and-calendar" || native.contentHash !== privateEvidenceHash(mail.html) ||
        !hash(native.metadataHash) || native.providerEventId !== attempt.providerEventId || native.recipient !== attempt.recipient ||
        native.startTime !== attempt.startTime || native.endTime !== attempt.endTime) continue;
      candidates.push({attempt, mail, join, receiptAt: new Date(arrival).toISOString(), native, decisionId: authorization.decisionId});
    }
  }} catch {return refuse("proof-unavailable");}
  if (candidates.length !== 1) return refuse(candidates.length ? "ambiguous-proof" : "no-bound-confirmation");
  const {attempt, mail, join, receiptAt, native, decisionId} = candidates[0]!;
  if (input.attempts.filter(row => row.tenantId === attempt.tenantId && row.phase === "awaiting-confirmation" &&
    row.providerEventId === attempt.providerEventId && row.recipient === attempt.recipient &&
    row.startTime === attempt.startTime && row.endTime === attempt.endTime).length !== 1) return refuse("ambiguous-attempt");
  return {status: "candidate" as const, proof: {tenantId: attempt.tenantId, sourceId: attempt.sourceId,
    sourceMessageId: attempt.sourceMessageId, sourceThreadId: attempt.sourceThreadId, confirmationMessageId: mail.messageId,
    confirmationThreadId: mail.threadId, providerEventId: attempt.providerEventId, bindingHash: attempt.bindingHash,
    policyHash: attempt.policyHash, policyRevision: attempt.policyRevision, registrationMetadataHash: attempt.metadataHash,
    confirmationMetadataHash: native.metadataHash, receivedAt: receiptAt, checkedAt: input.checkedAt, meetingUrl: join, decisionId}};
}
