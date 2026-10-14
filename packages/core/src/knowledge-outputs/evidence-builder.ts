import type { Claims } from "../generated/claims.js";
import type { Turns } from "../generated/turns.js";

/** Evidence-only drafts: no synthesis, persistence, model calls or identity inference. */
export interface EvidenceOutputRequest {
  tenantId: string;
  sessionIds: readonly string[];
  kind: "faq" | "report" | "meeting-brief";
  title: string;
  sections: readonly { title: string; claimIds: readonly string[] }[];
  claims: readonly Claims[];
  turns: readonly Turns[];
}
export interface OutputExcerpt {
  claimId: string;
  turnId: string;
  sessionId: string;
  speakerRef: string;
  speakerLabel?: string;
  start: number;
  end: number;
  unit: "seconds" | "characters";
  quote: string;
  href: string;
}
export interface OutputSection {
  title: string;
  excerpts: OutputExcerpt[];
  withheld: { claimId: string; reason: "claim-unavailable" | "claim-unverified" | "evidence-unavailable" }[];
}
export interface EvidenceOutput {
  kind: EvidenceOutputRequest["kind"];
  status: "ready" | "partial" | "unavailable";
  sections: OutputSection[];
  markdown: string;
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
function validId(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) return false;
  try { encodeURIComponent(value); return true; } catch { return false; }
}
function component(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/gu, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}
function literal(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;")
    .replace(/[\\`*_{}\[\]()#+.!|~\-]/gu, "\\$&");
}
function line(value: string): string { return literal(value.replace(/\s+/gu, " ").trim()); }

/** Duplicate identities are ambiguous: never let array order select evidence. */
function unique<T extends { _id: string }>(rows: readonly T[]): Map<string, T> {
  const result = new Map<string, T>();
  const duplicates = new Set<string>();
  for (const row of rows) {
    if (!record(row) || !validId(row._id)) continue;
    if (result.has(row._id)) duplicates.add(row._id);
    result.set(row._id, row);
  }
  for (const id of duplicates) result.delete(id);
  return result;
}

function excerpt(claimId: string, evidence: unknown, turns: Map<string, Turns>, sessions: Set<string>): OutputExcerpt | null {
  if (!record(evidence) || !validId(evidence.turnId) || !validId(evidence.sessionId)
    || !sessions.has(evidence.sessionId)) return null;
  const turn = turns.get(evidence.turnId);
  if (!turn || turn.sessionId !== evidence.sessionId || !validId(turn.speakerRef)
    || typeof turn.text !== "string" || !turn.text.trim()
    || !Number.isFinite(turn.tStart) || !Number.isFinite(turn.tEnd)
    || turn.tStart < 0 || turn.tEnd < turn.tStart) return null;
  const quote = evidence.quote === undefined ? turn.text : evidence.quote;
  if (typeof quote !== "string" || !quote.trim() || !turn.text.includes(quote)) return null;
  return {
    claimId, turnId: turn._id, sessionId: turn.sessionId, speakerRef: turn.speakerRef,
    ...(typeof turn.speakerLabel === "string" && turn.speakerLabel.trim() ? { speakerLabel: turn.speakerLabel } : {}),
    start: turn.tStart, end: turn.tEnd,
    unit: turn.speakerRef === "url" || turn.speakerRef === "document" ? "characters" : "seconds",
    quote, href: `/sessions/${component(turn.sessionId)}#turn-${component(turn._id)}`,
  };
}

/** Trusted callers supply auth-derived tenant and authorized session scope. Mixed tenants refuse wholesale. */
export function buildEvidenceOutput(request: EvidenceOutputRequest): EvidenceOutput {
  if (!record(request) || !validId(request.tenantId) || !Array.isArray(request.sessionIds)
    || request.sessionIds.length === 0 || !request.sessionIds.every(validId)
    || !["faq", "report", "meeting-brief"].includes(request.kind)
    || typeof request.title !== "string" || !request.title.trim()
    || !Array.isArray(request.sections) || request.sections.length === 0
    || !Array.isArray(request.claims) || !Array.isArray(request.turns)) throw new Error("invalid evidence output request");
  if ([...request.claims, ...request.turns].some((row) => !record(row) || row.tenantId !== request.tenantId)) {
    throw new Error("evidence tenant scope mismatch");
  }
  if (request.sections.some((section) => !record(section) || typeof section.title !== "string"
    || !section.title.trim() || !Array.isArray(section.claimIds) || !section.claimIds.every(validId))) {
    throw new Error("invalid evidence output sections");
  }
  const claims = unique<Claims>(request.claims);
  const turns = unique<Turns>(request.turns);
  const sessions = new Set(request.sessionIds);
  const sections = request.sections.map((section: EvidenceOutputRequest["sections"][number]): OutputSection => {
    const result: OutputSection = { title: section.title, excerpts: [], withheld: [] };
    for (const claimId of new Set(section.claimIds)) {
      const claim = claims.get(claimId);
      if (!claim) { result.withheld.push({ claimId, reason: "claim-unavailable" }); continue; }
      if (claim.status !== "verified") { result.withheld.push({ claimId, reason: "claim-unverified" }); continue; }
      const evidence = Array.isArray(claim.evidence) ? claim.evidence : [];
      const resolved = evidence.map((item) => excerpt(claimId, item, turns, sessions));
      if (resolved.length === 0 || resolved.some((item) => item === null)) {
        result.withheld.push({ claimId, reason: "evidence-unavailable" }); continue;
      }
      const seen = new Set<string>();
      for (const item of resolved) {
        if (!item) continue;
        const key = JSON.stringify([item.turnId, item.quote]);
        if (!seen.has(key)) { result.excerpts.push(item); seen.add(key); }
      }
    }
    return result;
  });
  const available = sections.some((section) => section.excerpts.length > 0);
  const incomplete = sections.some((section) => section.withheld.length > 0 || section.excerpts.length === 0);
  const status = !available ? "unavailable" : incomplete ? "partial" : "ready";
  const heading = { faq: "FAQ evidence draft", report: "Report evidence draft", "meeting-brief": "Meeting preparation evidence draft" }[request.kind];
  const lines = [`# ${line(request.title)}`, "", heading, "", "Literal source excerpts only. These excerpts do not establish an inferred answer, decision or recommendation."];
  for (const section of sections) {
    lines.push("", `## ${line(section.title)}`, "");
    if (section.excerpts.length === 0) lines.push("No verified evidence available for this section.");
    for (const item of section.excerpts) {
      lines.push(...item.quote.split(/\r\n|\r|\n/u).map((text) => `> ${literal(text)}`), "",
        `[Source: ${line(item.sessionId)} / ${line(item.turnId)}](${item.href}) · ${line(item.speakerLabel ?? item.speakerRef)} (${line(item.speakerRef)}) · ${item.start}–${item.end} ${item.unit}`, "");
    }
    if (section.withheld.length > 0) lines.push(`Withheld evidence requests: ${section.withheld.length}. Review their structured reasons before publishing.`);
  }
  return { kind: request.kind, status, sections, markdown: `${lines.join("\n").trimEnd()}\n` };
}
