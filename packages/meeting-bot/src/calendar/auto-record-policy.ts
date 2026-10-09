/**
 * packages/meeting-bot/src/calendar/auto-record-policy.ts — U5 (u5-auto-record-scheduler). Split
 * out of auto-join.ts to clear the 300-LOC file budget (structure.config.json), same precedent as
 * `record-finalize.ts` splitting off `record-commands.ts`. Two small, independent policy pieces
 * `selectAutoRecordItems` (auto-join.ts) needs: the config-level trusted-sender allowlist, and
 * join-link redaction for safe logging.
 */

/** Config-level trusted-sender allowlist (distinct from the DB-backed `trusted_senders`
 * 3-approvals mechanism in gmail-meeting-candidates-approval.md — this is a static bootstrap
 * list read from env/settings, see `loadTrustedSenderConfig`). An email is trusted iff it
 * exactly matches `emails`, OR its domain exactly matches an entry in `domains`. Matching is
 * case-insensitive; callers are expected to have already lower-cased both lists (
 * `loadTrustedSenderConfig` does this). */
import { createHash } from "node:crypto";
import { detectPlatform } from "../platform.js";
import type { WebinarReconciliationResult, WebinarReconciliationState, CalendarEvent } from "@lkb/core";
import type { TrustedSenderConfig, AutoRecordCandidateInput, AutoRecordItem, SkippedItem } from "@lkb/core";

export type { TrustedSenderConfig } from "@lkb/core";

/** Strips a `tk=`/`token=`/`access_token=`/`pwd=` query-string value from a join link before it
 * is ever printed or logged — the join token itself must never appear in a log line (unit
 * brief). Leaves the rest of the URL (host, path, non-token params) intact so a human can still
 * tell which meeting it was. Never throws on a malformed URL — falls back to a fixed
 * placeholder. */
export function redactJoinLink(url: string): string {
  try {
    const parsed = new URL(url);
    const tokenKeys = ["tk", "token", "access_token", "pwd"];
    let redacted = false;
    for (const key of tokenKeys) {
      if (parsed.searchParams.has(key)) {
        parsed.searchParams.set(key, "REDACTED");
        redacted = true;
      }
    }
    return redacted ? parsed.toString() : url;
  } catch {
    return "<unparseable-join-link-redacted>";
  }
}

function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).toLowerCase();
}

/** True iff `email`/`domain` matches the config allowlist. `domain` defaults to the part of
 * `email` after `@` when not given separately (calendar `organizer` has no separate domain
 * field). */
export function isTrustedSender(email: string | undefined, domain: string | undefined,
  cfg: TrustedSenderConfig): boolean {
  if (!email && !domain) return false;
  const emailLc = email?.toLowerCase();
  const domainLc = (domain ?? (email ? domainOf(email) : undefined))?.toLowerCase();
  if (emailLc && cfg.emails.includes(emailLc)) return true;
  if (domainLc && cfg.domains.includes(domainLc)) return true;
  return false;
}

// ISS-318 (fix cycle 2): zoho.com/zoom.us were removed from the defaults. They are the
// platform VENDORS' own public, multi-tenant email domains (anyone can register a free
// @zoho.com/@zoom.us address) — categorically different from the two entries that remain, which
// are actual vetted partner organizations. Umesh's approval (qa/feedback-inbox.md
// 2026-09-26T23:54:34+05:30 / 23:56:41+05:30) named "trusted senders", not "any sender on our
// vendors' own domains". umeshsugara@vidysea.com is added to the trusted EMAIL list (not a
// vidysea.com domain entry) because that is the real Gmail account the candidate pipeline reads
// (gws-gmail.ts, OAuth'd as umeshsugara@vidysea.com per gmail-meeting-candidates-approval.md) —
// a self-forwarded invite lands with that address as the From header's sender.
const DEFAULT_TRUSTED_SENDER_EMAILS = ["karunn@vidysea.com", "umeshsugara@vidysea.com"];
const DEFAULT_TRUSTED_SENDER_DOMAINS = ["theoutreachcollective.in", "ashoka.edu.in"];

function parseCsvEnv(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const items = value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return items.length > 0 ? items : undefined;
}

/**
 * Reads the trusted-sender allowlist from env (`AUTO_RECORD_TRUSTED_EMAILS` /
 * `AUTO_RECORD_TRUSTED_DOMAINS`, comma-separated), falling back to the fix-cycle-2 defaults
 * (ISS-318): karunn@vidysea.com, umeshsugara@vidysea.com, theoutreachcollective.in,
 * ashoka.edu.in — vetted partners/known accounts only, never a platform vendor's own public
 * domain. [ASSUMPTION] no existing settings/env key for this list was found in the repo (checked
 * qa/contracts/web-settings-keys.md, .env, config/) — these two new env keys are this unit's own
 * addition, documented here rather than silently invented; see the manifest's Known gaps.
 */
export function loadTrustedSenderConfig(env: NodeJS.ProcessEnv = process.env): TrustedSenderConfig {
  return {
    emails: parseCsvEnv(env.AUTO_RECORD_TRUSTED_EMAILS) ?? DEFAULT_TRUSTED_SENDER_EMAILS,
    domains: parseCsvEnv(env.AUTO_RECORD_TRUSTED_DOMAINS) ?? DEFAULT_TRUSTED_SENDER_DOMAINS,
  };
}

/** Automatic recording is limited to positively identified webinars, never generic meetings. */
export function classifyWebinarInvite(title: string): "webinar" | "meeting" | "uncertain" {
  if (/\b(stand[ -]?up|one[ -]?on[ -]?one|1[: -]1|team meeting|interview|personal|catch[ -]?up)\b/i.test(title)) return "meeting";
  return /\b(webinar|seminar|educator dialogues|in[ -]focus|online workshop|virtual conference)\b/i.test(title)
    ? "webinar" : "uncertain";
}

/** Token rotations do not change a meeting's identity; date/time distinguishes recurring events. */
export function webinarIdentity(url: string, startTime: string): string | undefined {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || detectPlatform(url) === "unknown") return undefined;
    for (const key of [...u.searchParams.keys()]) {
      if (/^(tk|token|access_token|pwd|password|utm_.+)$/i.test(key)) u.searchParams.delete(key);
    }
    u.hash = "";
    u.searchParams.sort();
    return `${u.toString()}|${new Date(startTime).toISOString()}`;
  } catch { return undefined; }
}

export function webinarSessionKey(identity: string): string {
  return `webinar-${createHash("sha256").update(identity).digest("hex").slice(0, 24)}`;
}
/** The lane owns its lock; injected update must durably settle before any browser submission. */
export async function runWebinarRegistrations(input: {
  state: {operations: Record<string, Record<string, any>>}; tenantId: string; candidates: AutoRecordCandidateInput[];
  acquisition?: WebinarReconciliationResult; now: () => string; config?: () => any;
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
      if (proof) await update(id, {registration: proof});
      else if (row.registration.phase === "submitting") await update(id, {registration: {...row.registration, phase: "uncertain"}});
    }
    return;
  }
  for (const candidate of candidates) {
    if (!candidate.registrationOnly || candidate.status === "rejected" || candidate.cancelled || !candidate.registrationUrl ||
        !candidate.messageId || !candidate.threadId || !candidate.startTime || !candidate.endTime || Date.parse(candidate.endTime) <= Date.parse(now())) continue;
    const inventory = input.acquisition.inventory.find(row => row.snapshot.id === candidate.id);
    if (!inventory || input.acquisition.state.occurrences[inventory.occurrenceKey]?.unresolved ||
        Object.values(state.operations).some(row => row.registration?.sourceId === candidate.id)) continue;
    let config; try { config = input.config?.(); } catch { continue; }
    if (!config?.operator?.firstName || !config.operator.lastName || !config.operator.email || !config?.form || !config.python || !config.profileDir ||
        !Array.isArray(config.allowedHosts) || !config.allowedHosts.length || !input.register) continue;
    const baselineMessageIds = [...new Set(candidates.map(row => row.messageId).filter((id): id is string => id !== undefined))];
    if (baselineMessageIds.length > 20000 || baselineMessageIds.some(id => typeof id !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(id))) continue;
    const registration = {tenantId, sourceId: candidate.id, sourceMessageId: candidate.messageId, threadId: candidate.threadId, baselineMessageIds,
      registrationUrl: candidate.registrationUrl, organizerEmail: candidate.senderEmail, startTime: new Date(candidate.startTime).toISOString(),
      endTime: new Date(candidate.endTime).toISOString(), attemptId: input.createUUID(), attemptedAt: new Date(now()).toISOString(), phase: "submitting"};
    input.validate(registration, tenantId, registration.attemptedAt);
    await update(inventory.reviewKey, {status: "action_required", reason: "needs-registration", title: candidate.title, registration});
    let result; try { result = await input.register({url: candidate.registrationUrl, allowedHosts: config.allowedHosts, operator: config.operator, form: config.form}, config); }
    catch { result = {status: "uncertain"}; }
    const phase = result?.status === "submitted" ? "awaiting-confirmation" : result?.status === "action_required" ? "action_required" : "uncertain";
    await update(inventory.reviewKey, {registration: {...registration, phase}});
  }
}

/** Only accepted source lineage can change an in-progress capture's planned boundary. */
export function activeWebinarStopReason(id: string, originalEnd: string, result: Pick<WebinarReconciliationResult, "transitions" | "inventory">): "cancelled" | "rescheduled" | undefined {
  const changed = result.transitions.find(row => row.reason === "cancelled" && row.aliases.includes(id)) ??
    result.transitions.find(row => row.reason === "rescheduled" && row.aliases.includes(id) && (row.currentKey !== id || row.boundaryChanged === true));
  if (changed) return changed.reason as "cancelled" | "rescheduled";
  if (result.inventory.some(row => row.sessionKey === id && !row.reason && row.snapshot.endTime && row.snapshot.endTime !== originalEnd)) return "rescheduled";
  return undefined;
}

/** Source inventory uses the same proven identity/alias policy as capture selection. No I/O. */
export function projectWebinarInventory(previous: Record<string, Record<string, any>>, result: WebinarReconciliationResult,
  tenantId: string, checkedAt: string, series: (CalendarEvent & {recurrence?: string[]})[] = []) {
  const operations = JSON.parse(JSON.stringify(previous)) as typeof previous;
  const terminal = (row: Record<string, any> | undefined) => row &&
    (["ready", "recording", "processing", "failed"].includes(row.status) || (row.status === "action_required" &&
      !["needs-review", "invalid-time", "no-join-link", "unsafe-join-link", "source-discontinuity", "unproven-calendar-history"].includes(row.reason)));
  const put = (id: string, changes: Record<string, any>) => {
    if (terminal(operations[id])) return;
    operations[id] = {...operations[id], ...changes, tenantId, updatedAt: checkedAt};
  };
  for (const transition of result.transitions) {
    for (const alias of transition.aliases) {
      const prior = operations[alias];
      if (transition.reason === "rescheduled" && transition.currentKey && alias !== transition.currentKey && prior) {
        const current = operations[transition.currentKey];
        if (!terminal(current) && terminal(prior)) operations[transition.currentKey] = {...prior, tenantId, updatedAt: checkedAt,
          status: "action_required", reason: prior.status === "ready" ? "rescheduled-completed" : prior.reason ?? "rescheduled",
          priorSessionId: alias};
        else if (!terminal(current) && (prior.attempts ?? 0) > 0) operations[transition.currentKey] = {...current, tenantId, updatedAt: checkedAt,
          status: (prior.attempts ?? 0) >= 3 ? "action_required" : "queued", reason: (prior.attempts ?? 0) >= 3 ? "retry-limit" : undefined,
          attempts: Math.max(current?.attempts ?? 0, prior.attempts), priorSessionId: alias};
        const projected = operations[transition.currentKey];
        if (projected?.priorSessionId === alias) {
          delete projected.stopDisposition; delete projected.monitorGap;
        }
      }
      if (alias !== transition.currentKey || transition.reason !== "rescheduled") {
        if (prior?.status === "queued") put(alias, {status: "action_required", reason: transition.reason === "unresolved" ? "source-discontinuity" : transition.reason});
      }
    }
  }
  const inventory = new Map<string, {entry: WebinarReconciliationResult["inventory"][number]; reason?: string}>();
  for (const entry of result.inventory) {
    const id = entry.sessionKey ?? entry.reviewKey;
    const reason = entry.reason ?? (entry.snapshot.status === "rejected" ? "rejected" : entry.snapshot.registrationOnly ? "needs-registration" :
      entry.classification !== "webinar" ? "needs-review" : undefined);
    if (!inventory.has(id) || reason) inventory.set(id, {entry, reason});
  }
  for (const [id, {entry, reason}] of inventory) {
    const row = operations[id], attempts = row?.attempts ?? 0;
    put(id, {status: reason || !entry.sessionKey ? "action_required" : "queued", reason: reason ?? (!entry.sessionKey ? "needs-review" : undefined),
      title: (entry.snapshot.title ?? "Webinar").replace(/https?:\/\/\S+/gi, "[link removed]"), startTime: entry.snapshot.startTime, endTime: entry.snapshot.endTime, attempts});
  }
  for (const row of series) {
    if (!row.cancelled && classifyWebinarInvite(row.title) === "meeting") continue;
    put(webinarSessionKey(`source-series|${tenantId}|${row.id}`), {status: "action_required", reason: row.cancelled ? "cancelled" : "recurring-series",
      title: row.title.replace(/https?:\/\/\S+/gi, "[link removed]"), sourceKind: "series", sourceId: row.id, attempts: 0});
  }
  return operations;
}


export function isDirectWebinarJoin(url: unknown, startTime: string): url is string {
  if (typeof url !== "string" || !webinarIdentity(url, startTime)) return false;
  try {
    const parsed = new URL(url);
    return !parsed.username && !parsed.password && (
      (parsed.hostname === "meet.google.com" && /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}\/?$/.test(parsed.pathname)) ||
      ((parsed.hostname === "zoom.us" || parsed.hostname.endsWith(".zoom.us")) && /^\/(j|w)\/\d+\/?$/.test(parsed.pathname)) ||
      (parsed.hostname === "teams.microsoft.com" && parsed.pathname.startsWith("/l/meetup-join/")));
  } catch { return false; }
}

export interface WebinarRegistrationAttempt {
  tenantId: string; sourceId: string; sourceMessageId: string; threadId: string; registrationUrl: string;
  organizerEmail: string; startTime: string; endTime: string; attemptId: string; attemptedAt: string;
  phase: "submitting" | "awaiting-confirmation" | "uncertain" | "action_required" | "confirmed";
  confirmationMessageId?: string; confirmedAt?: string; meetingUrl?: string;
  baselineMessageIds?: string[];
}

export function projectWebinarRegistrations(input: {
  registrations: readonly unknown[]; previous?: WebinarReconciliationState; candidates: AutoRecordCandidateInput[];
  reconciled: WebinarReconciliationResult; tenantId: string; checkedAt: string;
  validate: (value: unknown, tenantId: string, checkedAt: string) => WebinarRegistrationAttempt;
  confirm: (attempt: WebinarRegistrationAttempt, tenantId: string, candidates: AutoRecordCandidateInput[], checkedAt: string) => WebinarRegistrationAttempt | undefined;
}) {
  const {reconciled, candidates, tenantId, checkedAt} = input;
  if (!reconciled.newStartsBlocked) for (const rawProof of input.registrations) {
    if (!rawProof) continue;
    const proof = input.validate(rawProof, tenantId, checkedAt);

    const bound = reconciled.candidates.filter(row => row.threadId === proof.threadId && row.messageId !== proof.sourceMessageId &&
      typeof row.messageId === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(row.messageId) && isDirectWebinarJoin(row.meetingUrl, row.startTime ?? "") &&
      (row.messageId === proof.confirmationMessageId || row.senderEmail === proof.organizerEmail ||
        (row.startTime === proof.startTime && row.endTime === proof.endTime)) && row.status !== "rejected" && !row.cancelled);
    reconciled.candidates = reconciled.candidates.filter(row => !bound.includes(row));
    for (const item of reconciled.inventory) if (bound.some(row => row.id === item.snapshot.id)) {
      delete item.sessionKey; item.reason = "registration-confirmation-awaiting-source-validation";
    }
    if (proof.phase !== "confirmed") continue;
    const changed = Object.entries(reconciled.state.occurrences).find(([, row]) => row.source === "gmail" && row.snapshot.id === proof.sourceId);
    const prior = changed && input.previous?.occurrences[changed[0]];
    if (changed && prior?.accepted && !prior.unresolved && prior.snapshot.status !== "rejected" && changed[1].snapshot.status !== "rejected" &&
        changed[1].accepted && !changed[1].unresolved && changed[1].snapshot.messageId === proof.sourceMessageId &&
        changed[1].snapshot.threadId === proof.threadId && changed[1].snapshot.senderEmail === proof.organizerEmail && prior.snapshot.messageId === proof.sourceMessageId &&
        prior.snapshot.threadId === proof.threadId && prior.snapshot.senderEmail === proof.organizerEmail && prior.snapshot.startTime === proof.startTime && prior.snapshot.endTime === proof.endTime) {
      const alias = webinarSessionKey(webinarIdentity(proof.meetingUrl!, proof.startTime)!);
      for (const transition of reconciled.transitions) if (transition.occurrenceKey === changed[0] && ["cancelled", "rescheduled"].includes(transition.reason))
        transition.aliases = [...new Set([...transition.aliases, alias])];
    }
    const originals = candidates.filter(row => row.id === proof.sourceId && row.messageId === proof.sourceMessageId &&
      row.threadId === proof.threadId && row.senderEmail === proof.organizerEmail && row.registrationUrl === proof.registrationUrl &&
      row.startTime === proof.startTime && row.endTime === proof.endTime && row.status !== "rejected" && !row.cancelled);
    const confirmation = input.confirm({...proof, phase: "awaiting-confirmation", confirmationMessageId: undefined,
      confirmedAt: undefined, meetingUrl: undefined}, tenantId, candidates, checkedAt);
    if (originals.length !== 1 || !confirmation || confirmation.confirmationMessageId !== proof.confirmationMessageId || confirmation.meetingUrl !== proof.meetingUrl) continue;
    const projected = reconciled.candidates.find(row => row.id === proof.sourceId);
    const raw = Object.values(reconciled.state.occurrences).find(row => row.source === "gmail" && row.snapshot.id === proof.sourceId);
    if (!projected || !raw?.accepted || raw.unresolved || projected.status === "rejected" || projected.cancelled ||
        projected.startTime !== proof.startTime || projected.endTime !== proof.endTime) continue;
    const resolved = {...projected, meetingUrl: proof.meetingUrl, registrationOnly: false};
    reconciled.candidates[reconciled.candidates.indexOf(projected)] = resolved;
    const item = reconciled.inventory.find(row => row.snapshot.id === proof.sourceId);
    if (item) { item.snapshot = resolved; item.sessionKey = webinarSessionKey(webinarIdentity(proof.meetingUrl!, proof.startTime)!); delete item.reason; }
  }
}
type RegistrationLifecycle = Parameters<typeof runWebinarRegistrations>[0];
export async function reconcileWebinarRegistrationState<S extends RegistrationLifecycle["state"], P extends {state: S}, V>(input: {
  state: S; tenantId: string; candidates: RegistrationLifecycle["candidates"]; now: RegistrationLifecycle["now"];
  validate: RegistrationLifecycle["validate"]; confirm: RegistrationLifecycle["confirm"]; createUUID: RegistrationLifecycle["createUUID"];
  value: V; checkedAt: string; prepare: (state: S, value: V, candidates: RegistrationLifecycle["candidates"], checkedAt: string) => P;
  persist: (state: S) => void | Promise<void>;
}): Promise<P> {
  const draft: S = JSON.parse(JSON.stringify(input.state));
  await runWebinarRegistrations({...input, state: draft,
    update: (id, changes) => {draft.operations[id] = {...draft.operations[id], ...changes};}});
  const prepared = input.prepare(draft, input.value, input.candidates, input.checkedAt);
  await input.persist(prepared.state);
  Object.assign(input.state, prepared.state);
  return prepared;
}
export function projectWebinarSelection(selection: {toSchedule: AutoRecordItem[]; skipped: SkippedItem[]}, run: boolean) {
  return {status: run ? "running" : "preview", toRecord: selection.toSchedule.map(({meetingUrl: _secret, ...item}) => item), skipped: selection.skipped};
}
