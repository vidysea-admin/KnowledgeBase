import { apiFetch } from "./client.js";

export interface WhatsAppGroup {
  groupJid: string;
  ownerUserId: string;
  subject: string;
  trackedPersonCount: number;
}

export interface WhatsAppIngestResult {
  sessionId: string;
  sourceId: string;
  turnCount: number;
}

export function listWhatsAppGroups(apiKey: string | null): Promise<{ groups: WhatsAppGroup[] }> {
  return apiFetch("/whatsapp/groups", apiKey);
}

// ownerUserId is intentionally NOT sent -- the real backend resolves it itself from the live
// trackable-groups list (2026-09-06 data-engineer review: a client-supplied owner id would let
// any whatsapp-scoped key ingest a different archiver owner's private groups).
export function ingestWhatsAppGroup(apiKey: string | null, groupJid: string): Promise<WhatsAppIngestResult> {
  return apiFetch("/whatsapp/ingest", apiKey, { method: "POST", body: { groupJid } });
}

// HTTP response shape, matching the schema-generated backend candidate without a domain import.
export interface WhatsAppCandidate {
  _id: string;
  sessionId: string;
  groupJid: string;
  kind: "claim" | "topic" | "decision" | "attachment";
  text: string;
  status: "needs-review" | "approved" | "rejected";
  attachment?: { name: string; mimeType?: string };
  evidence: { turnId: string; sessionId: string; speakerRef: string; speakerLabel?: string; quote: string; occurredAt: string }[];
  flags: { kind: "sensitive" | "duplicate" | "personal-excluded"; reason: string; turnId: string; duplicateOf?: string }[];
  decision?: { action: "approved" | "rejected"; actor: string; at: string };
}

export function listWhatsAppCandidates(apiKey: string | null): Promise<{ candidates: WhatsAppCandidate[] }> {
  return apiFetch("/whatsapp/review", apiKey);
}

export function decideWhatsAppCandidate(apiKey: string | null, id: string, action: "approve" | "reject"): Promise<{ candidate: WhatsAppCandidate; changed: boolean }> {
  return apiFetch(`/whatsapp/review/${encodeURIComponent(id)}/${action}`, apiKey, { method: "POST", body: {} });
}
