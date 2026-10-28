/** Deterministic text extraction for the guarded HTTP snapshot; no second request or script execution. */
export function connectorSnapshotText(snapshot: string): string {
  if (!/<(?:!doctype\s+html|html\b|body\b)/i.test(snapshot)) return snapshot;
  const content = snapshot.replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, "")
    .replace(/<head\b[^>]*>[\s\S]*?(?:<\/head\s*>|$)/gi, "")
    .replace(/<(?:br|hr)\b[^>]*>|<\/(?:p|div|article|section|li|h[1-6]|tr)\s*>/gi, "\n\n")
    .replace(/<[^>]*>/g, "");
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return content.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code: string) => {
    if (!code.startsWith("#")) return entities[code.toLowerCase()] ?? entity;
    const value = code.toLowerCase().startsWith("#x") ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff) ? String.fromCodePoint(value) : "";
  }).replace(/[\t ]+/g, " ").replace(/\n\s*\n(?:\s*\n)+/g, "\n\n").trim();
}
