/** T-007 candidate proposals only. This module never writes trusted knowledge. */
import type { Sources, Sessions, Turns, WhatsappCandidates } from "@lkb/core";
import { assertValidTenantId } from "@lkb/db";
import { sha256Hex } from "../../hash.js";

export type WhatsAppReviewCandidate = WhatsappCandidates;
export interface KnownWhatsAppContent { tenantId: string; id: string; text: string; }
export interface WhatsAppReviewInput {
  source: Pick<Sources, "_id" | "tenantId" | "kind" | "path">;
  session: Pick<Sessions, "_id" | "tenantId" | "sourceId">;
  turns: readonly Turns[];
  attachments?: readonly { turnId: string; name: string; mimeType?: string }[];
  /** Trusted tenant knowledge supplied by the integration layer, never by a review client. */
  knownContent?: readonly KnownWhatsAppContent[];
}

export function whatsAppReviewContentHash(text: string): string {
  return sha256Hex(text.normalize("NFC").trim().replace(/\s+/gu, " ").toLowerCase());
}

export function whatsAppReviewCandidateId(row: Pick<WhatsAppReviewCandidate, "tenantId" | "sourceId" | "sessionId" | "kind" | "text" | "contentHash" | "attachment" | "evidence">): string {
  // Duplicate comparison is normalized; identity includes exact content/provenance so edited
  // text, attribution, occurrence time or attachment metadata cannot inherit an old approval.
  return `wa-review:${sha256Hex(JSON.stringify([row.tenantId, row.sourceId, row.sessionId, row.kind, row.text,
    row.contentHash, row.attachment?.name, row.attachment?.mimeType,
    row.evidence.map(e => [e.turnId, e.sessionId, e.speakerRef, e.speakerLabel, e.quote, e.occurredAt])]))}`;
}

function required(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`WhatsApp review: missing ${name}`);
}

/** Conservative, visible deterministic signals; absence of a flag is not a safety clearance. */
function flagsFor(turn: Turns, duplicateOf: string | undefined): WhatsAppReviewCandidate["flags"] {
  const flags: WhatsAppReviewCandidate["flags"] = [];
  const text = turn.text;
  if (/(?:password|otp|api[_ -]?key|secret|token)\s*[:=]\s*\S+/iu.test(text)
      || /[\w.+-]+@[\w.-]+\.[a-z]{2,}/iu.test(text)
      || /(?:\+?\d[\s()-]*){10,}/u.test(text)) {
    flags.push({ kind: "sensitive", reason: "Credential, email or phone/account-number pattern in source content or attachment metadata", turnId: turn._id });
  }
  if (/\b(?:(?:private|personal)\s+(?:(?:medical|family|financial|health|contact|account|bank)\s+)?(?:details?|messages?|information|data)|private\s*:\s*|private\s+family|my\s+(?:family|medical)|confidential|do not publish|don't publish)\b|निजी|गोपनीय/iu.test(text)) {
    flags.push({ kind: "personal-excluded", reason: "Source marks personal/private or excluded material; publication is blocked", turnId: turn._id });
  }
  if (duplicateOf) flags.push({ kind: "duplicate", reason: "Normalized text matches this import or existing same-tenant knowledge", turnId: turn._id, duplicateOf });
  return flags;
}

export function detectWhatsAppReviewCandidates(tenantId: string, input: WhatsAppReviewInput, createdAt: string = new Date().toISOString()): WhatsAppReviewCandidate[] {
  assertValidTenantId(tenantId, "detectWhatsAppReviewCandidates");
  if (!Number.isFinite(Date.parse(createdAt))) throw new Error("WhatsApp review: invalid createdAt");
  if (input.source.tenantId !== tenantId || input.session.tenantId !== tenantId
      || input.source.kind !== "whatsapp-batch" || input.session.sourceId !== input.source._id) {
    throw new Error("WhatsApp review: source/session authorization mismatch");
  }
  required(input.source._id, "source id"); required(input.source.path, "group jid"); required(input.session._id, "session id");
  const byId = new Map<string, Turns>();
  for (const turn of input.turns) {
    if (turn.tenantId !== tenantId || turn.sessionId !== input.session._id) throw new Error("WhatsApp review: turn authorization mismatch");
    required(turn._id, "turn id"); required(turn.text, "turn text"); required(turn.speakerRef, "speaker reference");
    if (!turn.occurredAt || !Number.isFinite(Date.parse(turn.occurredAt))) throw new Error("WhatsApp review: missing real occurrence time");
    if (byId.has(turn._id)) throw new Error("WhatsApp review: duplicate turn identity");
    byId.set(turn._id, turn);
  }
  for (const attachment of input.attachments ?? []) {
    if (!byId.has(attachment.turnId)) throw new Error("WhatsApp review: attachment evidence turn missing");
    required(attachment.name, "attachment name");
    if (attachment.mimeType !== undefined) required(attachment.mimeType, "attachment MIME type");
  }
  const known = new Map<string, string>();
  for (const row of input.knownContent ?? []) {
    if (row.tenantId === tenantId) { required(row.id, "known content id"); required(row.text, "known content text"); known.set(whatsAppReviewContentHash(row.text), row.id); }
  }
  const output: WhatsAppReviewCandidate[] = [];
  const attachmentSeen = new Map<string, string>();
  for (const turn of input.turns) {
    const contentHash = whatsAppReviewContentHash(turn.text);
    const flags = flagsFor(turn, known.get(contentHash));
    known.set(contentHash, turn._id);
    const kinds: WhatsAppReviewCandidate["kind"][] = ["claim"];
    if (/\b(?:topic|subject|agenda)\s*:|विषय\s*:/iu.test(turn.text)) kinds.push("topic");
    if (/\b(?:decided|agreed|approved|we will|decision\s*:)|तय किया|निर्णय/iu.test(turn.text)) kinds.push("decision");
    const evidence: WhatsAppReviewCandidate["evidence"] = [{ turnId: turn._id, sessionId: turn.sessionId, speakerRef: turn.speakerRef,
      ...(turn.speakerLabel ? { speakerLabel: turn.speakerLabel } : {}), quote: turn.text, occurredAt: turn.occurredAt! }];
    const propose = (kind: WhatsAppReviewCandidate["kind"], text: string, attachment?: WhatsAppReviewCandidate["attachment"]): void => {
      const candidateFlags = structuredClone(flags);
      if (attachment) {
        const attachmentHash = whatsAppReviewContentHash(text);
        const previous = attachmentSeen.get(attachmentHash) ?? known.get(attachmentHash);
        for (const flag of flagsFor({ ...turn, text }, undefined)) {
          if (!candidateFlags.some(existing => existing.kind === flag.kind)) candidateFlags.push(flag);
        }
        if (previous && !candidateFlags.some(flag => flag.kind === "duplicate")) {
          candidateFlags.push({ kind: "duplicate", reason: "Attachment name/MIME metadata matches this import or same-tenant knowledge; file bytes have not been compared", turnId: turn._id, duplicateOf: previous });
        }
        attachmentSeen.set(attachmentHash, turn._id);
      }
      const body = { tenantId, sourceId: input.source._id, groupJid: input.source.path!, sessionId: input.session._id,
        kind, text, contentHash: whatsAppReviewContentHash(text), evidence, flags: candidateFlags, status: "needs-review" as const, createdAt,
        ...(attachment ? { attachment } : {}) };
      output.push({ _id: whatsAppReviewCandidateId(body), ...body });
    };
    for (const kind of kinds) propose(kind, turn.text);
    for (const attachment of (input.attachments ?? []).filter(a => a.turnId === turn._id)) {
      propose("attachment", `Attachment: ${attachment.name}${attachment.mimeType ? ` (${attachment.mimeType})` : ""}`, { name: attachment.name, ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}) });
    }
  }
  return output;
}
