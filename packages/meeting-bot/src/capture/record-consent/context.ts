import { createHash,randomUUID } from "node:crypto";
import type { ConsentContext } from "@lkb/ingest";
import { assertProvidedFirst } from "@lkb/ingest";
import type { TimeWindow } from "../../live-monitor.js";

export interface RecordConsentReceipt {
  version: 1;
  tenantId: string;
  sessionId: string;
  /** Immutable actual attempt identity; never permission/timing proof. Missing only for historical receipts. */
  generation?: string;
  meetingHash: string;
  captureMode: "silent";
  operationalApproval: { approvedBy: string; reference: string; appliedAt: string };
  organizerConsent: "given" | "unknown" | "refused";
  consent: Omit<ConsentContext, "captureMode">;
  privateWindows: TimeWindow[];
  /** Actual producer wall-clock origin; this does not assert frame/PTS calibration. */
  mediaStartedAt?: number;
}
const safeId = (value: unknown, max: number): value is string => typeof value === "string" &&
  value.length <= max && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) && value !== "." && value !== "..";
function text(value: unknown, max: number): value is string {
  return typeof value === "string" && !!value.trim() && value.trim() === value && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
}
export function recordMeetingHash(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("Capture requires an HTTPS meeting URL without userinfo");
  parsed.hash = "";
  return createHash("sha256").update(parsed.href).digest("hex");
}
export function validatePrivateCaptureWindows(value: unknown): TimeWindow[] {
  if (!Array.isArray(value) || value.length > 256) throw new Error("Invalid private capture windows");
  return value.map(window => {
    if (!window || typeof window !== "object" || Array.isArray(window) ||
      Object.keys(window).some(key => !["tStart", "tEnd"].includes(key)) ||
      !Number.isFinite(window.tStart) || !Number.isFinite(window.tEnd) || window.tStart < 0 || window.tEnd <= window.tStart) {
      throw new Error("Invalid private capture windows");
    }
    return { tStart: window.tStart, tEnd: window.tEnd };
  });
}
export function validateRecordConsent(value: unknown, owner: {tenantId: string; sessionId: string; meetingHash?: string}): RecordConsentReceipt {
  const row = value as RecordConsentReceipt;
  if (!row || typeof row !== "object" || Array.isArray(row) || row.version !== 1 ||
    Object.keys(row).some(key => !["version", "tenantId", "sessionId", "generation", "meetingHash", "captureMode", "operationalApproval", "organizerConsent", "consent", "privateWindows", "mediaStartedAt"].includes(key)) ||
    !safeId(owner.tenantId, 100) || !safeId(owner.sessionId, 150) || row.tenantId !== owner.tenantId || row.sessionId !== owner.sessionId ||
    !/^[a-f0-9]{64}$/.test(row.meetingHash ?? "") || (owner.meetingHash !== undefined && row.meetingHash !== owner.meetingHash) ||
    (row.generation !== undefined && !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(row.generation)) ||
    row.captureMode !== "silent" || !row.operationalApproval || !text(row.operationalApproval.approvedBy, 200) ||
    Object.keys(row.operationalApproval).some(key => !["approvedBy", "reference", "appliedAt"].includes(key)) ||
    !text(row.operationalApproval.reference, 128) || !Number.isFinite(Date.parse(row.operationalApproval.appliedAt)) ||
    new Date(row.operationalApproval.appliedAt).toISOString() !== row.operationalApproval.appliedAt ||
    !["given", "unknown", "refused"].includes(row.organizerConsent) || !row.consent ||
    Object.keys(row.consent).some(key => !["given", "recordedBy", "note", "confirmedNoAlternative"].includes(key)) ||
    typeof row.consent.given !== "boolean" || row.consent.given !== (row.organizerConsent === "given") ||
    !text(row.consent.recordedBy, 200) || (row.consent.note !== undefined && !text(row.consent.note, 2000)) ||
    (row.consent.confirmedNoAlternative !== undefined && typeof row.consent.confirmedNoAlternative !== "boolean") ||
    (row.mediaStartedAt !== undefined && (!Number.isSafeInteger(row.mediaStartedAt) ||
      !Number.isFinite(new Date(row.mediaStartedAt).getTime()) || row.mediaStartedAt < Date.parse(row.operationalApproval.appliedAt)))) {
    throw new Error("Invalid or mismatched live capture consent receipt");
  }
  return {version: 1, tenantId: row.tenantId, sessionId: row.sessionId, meetingHash: row.meetingHash,
    captureMode: "silent", operationalApproval: {...row.operationalApproval}, organizerConsent: row.organizerConsent,
    consent: {...row.consent}, privateWindows: validatePrivateCaptureWindows(row.privateWindows),
    ...(row.generation === undefined ? {} : {generation:row.generation}),
    ...(row.mediaStartedAt === undefined ? {} : {mediaStartedAt: row.mediaStartedAt})};
}
function flag(args: string[], name: string): string | undefined {
  const indices = args.flatMap((arg, index) => arg === name ? [index] : []);
  if (indices.length > 1) throw new Error(`Duplicate ${name}`);
  const index = indices[0];
  if (index === undefined) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}
/** Operational approval never establishes organizer permission or checked alternatives. */
export function createRecordConsent(args: string[], owner: {tenantId: string; sessionId: string; meetingUrl: string},
  env: NodeJS.ProcessEnv = process.env, now: Date = new Date()): RecordConsentReceipt {
  const organizerConsent = flag(args, "--organizer-consent") ?? env.LKB_CAPTURE_ORGANIZER_CONSENT ?? "unknown";
  const note = flag(args, "--consent-note") ?? env.LKB_CAPTURE_CONSENT_NOTE;
  const alternative = env.LKB_CAPTURE_CONFIRMED_NO_ALTERNATIVE;
  if (alternative !== undefined && !["true", "false"].includes(alternative)) throw new Error("LKB_CAPTURE_CONFIRMED_NO_ALTERNATIVE must be true or false");
  const receipt = validateRecordConsent({version: 1, tenantId: owner.tenantId, sessionId: owner.sessionId,
    generation: env.LKB_CAPTURE_CONTROL_GENERATION ?? randomUUID(),
    meetingHash: recordMeetingHash(owner.meetingUrl), captureMode: "silent", organizerConsent,
    operationalApproval: {approvedBy: flag(args, "--capture-approved-by") ?? env.LKB_CAPTURE_APPROVED_BY,
      reference: flag(args, "--capture-approval-ref") ?? env.LKB_CAPTURE_APPROVAL_REF, appliedAt: now.toISOString()},
    consent: {given: organizerConsent === "given", recordedBy: flag(args, "--recorded-by") ?? env.LKB_CAPTURE_RECORDED_BY,
      ...(note !== undefined ? {note} : {}),
      ...(args.includes("--confirmed-no-alternative") || alternative !== undefined ?
        {confirmedNoAlternative: args.includes("--confirmed-no-alternative") || alternative === "true"} : {})},
    privateWindows: []}, owner);
  if (receipt.organizerConsent === "refused") throw new Error("Recorded organizer refusal requires operator review before capture");
  return receipt;
}
export function recordProvidedFirstWarning(receipt: RecordConsentReceipt): string | undefined {
  return assertProvidedFirst({...receipt.consent, captureMode: receipt.captureMode});
}
/** Same schema shape used by recording adapters, with honest additional operational provenance. */
export function recordConsentSourceFields(receipt: RecordConsentReceipt) {
  const checked = validateRecordConsent(receipt, receipt);
  return {captureMode: checked.captureMode, consent: checked.consent, operationalApproval: checked.operationalApproval,
    organizerConsent: checked.organizerConsent, privateWindows: checked.privateWindows,
    ...(checked.generation === undefined ? {} : {captureGeneration:checked.generation}),
    ...(checked.mediaStartedAt === undefined ? {} : {mediaStartedAt: checked.mediaStartedAt})};
}
