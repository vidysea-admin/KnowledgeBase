/** Shared versioned message binding; transaction fences are deliberately not content revisions. */
import { createHash } from "node:crypto";
import type { MessageSourceLocator, Sources, Turns } from "@lkb/core";
import type { WhatsAppReviewCandidate } from "../whatsapp/review/detection.js";
export const messageSHA256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
export function messageRevision(tenantId: string, source: Sources, candidate: WhatsAppReviewCandidate, turn: Turns): string {
  return messageSHA256(JSON.stringify(["whatsapp-message-v1", tenantId, source._id, turn.sessionId, turn._id,
    turn.text, turn.speakerRef, turn.speakerLabel ?? null, turn.occurredAt ?? null,
    candidate._id, candidate.kind, candidate.decision, source.consent]));
}
export function messagePassages(identity: { sourceId: string; revisionHash: string; threadId: string; messageId: string }, text: string) {
  const binding = { sourceId: identity.sourceId, revisionHash: identity.revisionHash, threadId: identity.threadId, messageId: identity.messageId };
  const passages: { text: string; locator: MessageSourceLocator }[] = [];
  for (let start = 0; start < text.length;) {
    let end = start, bytes = 0;
    while (end < text.length) {
      const codepoint = String.fromCodePoint(text.codePointAt(end)!); const size = Buffer.byteLength(codepoint, "utf8");
      if (bytes + size > 1024) break;
      bytes += size; end += codepoint.length;
    }
    const quote = text.slice(start, end);
    passages.push({ text: quote, locator: { kind: "message", ...binding, passage: { start, end, sha256: messageSHA256(quote) } } });
    if (passages.length > 128) throw new Error("whatsapp_native_message_passage_limit");
    start = end;
  }
  return passages;
}

export function messageBranch(tenantId: string, candidateId: string,
  identity: { sourceId: string; revisionHash: string; threadId: string; messageId: string }, text: string) {
  const binding = { sourceId: identity.sourceId, revisionHash: identity.revisionHash, threadId: identity.threadId, messageId: identity.messageId };
  const node_id = `${tenantId}/native-source:${messageSHA256(JSON.stringify(["message", binding]))}`;
  return { node_id, level: "native-source", title: "Approved WhatsApp message", summary: "Approved WhatsApp message",
    evidence: binding, nativePublication: { version: 1, kind: "message", candidateId, ...binding },
    children: messagePassages(binding, text).map(({ text: quote, locator }) => ({ node_id: `${node_id}/passage:${locator.passage.start}`,
      level: "native-passage", title: "Approved WhatsApp message", summary: quote, evidence: { ...binding, sourceLocator: locator }, children: [] })) };
}
