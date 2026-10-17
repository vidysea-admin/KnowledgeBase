import type { OutputDraft } from "./types.js";
export const markdownLiteral = (value: string): string => value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/[\\`*_{}\[\]()#+.!|~\-]/gu, "\\$&");
const line = (value: string) => markdownLiteral(value.replace(/\s+/gu, " ").trim());
export function renderOutputMarkdown(draft: OutputDraft): string {
  const lines = [`# ${line(draft.title)}`, "", "AI draft — requires human review. Grounding checks are model assessments, not human verification.", "",
    `Purpose: ${line(draft.purpose)}`, `Revision: ${draft.revision}`, `Generated using ${line(draft.provider)} / ${line(draft.model)}.`,
    `Source coverage: ${draft.sourceCoverage.status}; ${draft.sourceCoverage.withheldClaims} claims excluded from eligible evidence.`,
    `Policy: ${draft.policy ? `${line(draft.policy.policyId)} v${draft.policy.version}` : "No matching policy; conservative internal-only default."}`, ""];
  for (const section of draft.sections) {
    lines.push(`## ${line(section.title)}`, "");
    if (!section.items.length) lines.push("No supported material found for this section.", "");
    for (const item of section.items) {
      if (item.validation !== "ai-supported") { lines.push("Item withheld — needs grounding review.", ""); continue; }
      lines.push(`${item.kind === "suggestion" ? "Suggestion: " : item.kind === "question" ? "Question: " : ""}${markdownLiteral(item.text)}`, "");
      for (const id of item.citationIds) {
        const source = draft.citations.find((c) => c.id === id)!;
        lines.push(...source.quote.split(/\r\n|\r|\n/u).map((q) => `> ${markdownLiteral(q)}`), "",
          `[${line(source.sessionId)} / ${line(source.turnId)}](${source.href}) · ${line(source.speakerLabel ?? source.speakerRef)} (${line(source.speakerRef)}) · ${source.occurredAt ? `Occurred at ${line(source.occurredAt)}` : `${source.start}–${source.end} ${source.unit}`}`, "");
      }
    }
    if (section.missing) lines.push(line(section.missing), "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
