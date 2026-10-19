/** From-header and Authentication-Results parsing for the OnAir sender gate. Fail closed: anything ambiguous yields undefined/false. */

/** Single mailbox of an RFC 5322 From value: respects quoted display names, comments and the angle-addr form. */
export function parseFromAddress(from: string): { email: string; domain: string } | undefined {
  if (typeof from !== "string" || from.length > 998) return undefined;
  let inQuote = false, depth = 0, display = "", angle = "";
  const angles: string[] = [];
  let cur: string | null = null;
  for (let i = 0; i < from.length; i++) {
    const ch = from[i]!;
    if (inQuote) { if (ch === "\\") { i++; continue; } if (ch === '"') inQuote = false; if (cur !== null) cur += ch; continue; }
    if (depth > 0) { if (ch === "\\") { i++; continue; } if (ch === "(") depth++; else if (ch === ")") depth--; continue; }
    if (ch === '"') { inQuote = true; if (cur !== null) cur += ch; else display += ch; continue; }
    if (ch === "(") { depth++; continue; }
    if (ch === "<") { if (cur !== null) return undefined; cur = ""; continue; }
    if (ch === ">") { if (cur === null) return undefined; angles.push(cur); cur = null; continue; }
    if (ch === ",") return undefined; // group or multiple mailboxes
    if (cur !== null) cur += ch; else display += ch;
  }
  if (inQuote || depth !== 0 || cur !== null || angles.length > 1) return undefined;
  angle = angles.length === 1 ? angles[0]! : display.trim();
  if (angles.length === 0 && /[\s"]/.test(angle)) return undefined;
  const m = /^([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64})@([A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?)$/.exec(angle.trim());
  if (!m) return undefined;
  return { email: `${m[1]!.toLowerCase()}@${m[2]!.toLowerCase()}`, domain: m[2]!.toLowerCase() };
}

const GOOGLE_AUTHSERV = "mx.google.com";
const googleDomain = (d: string) => d === "google.com" || d.endsWith(".google.com");

/**
 * True only when a Google-added (authserv-id mx.google.com) Authentication-Results header has ONE dmarc clause whose result is exactly
 * pass and whose header.from is exactly google.com or a subdomain of it, and that header.from equals the From domain.
 */
export function dmarcPassesFor(authResults: string[], fromDomain: string): boolean {
  const want = fromDomain.toLowerCase();
  if (!googleDomain(want)) return false;
  for (const header of authResults) {
    const clauses = header.replace(/\([^)]*\)/g, " ").split(";");
    if (clauses[0]!.trim().split(/\s+/)[0]?.toLowerCase() !== GOOGLE_AUTHSERV) continue;
    for (const clause of clauses.slice(1)) {
      const tokens = clause.trim().split(/\s+/);
      if (!/^dmarc=pass$/i.test(tokens[0] ?? "")) continue;
      const hf = tokens.slice(1).map(t => /^header\.from=([^\s]+)$/i.exec(t)?.[1]?.toLowerCase()).filter(Boolean);
      if (hf.length === 1 && hf[0] === want) return true;
    }
  }
  return false;
}
