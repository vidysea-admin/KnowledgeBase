/**
 * packages/core/src/domain/sender-authentication.ts — ISS-322 / ISS-333 / ISS-CAPTURE-003.
 * Pure (no I/O). Turns a Gmail message's raw headers into a sender assessment: the strictly parsed
 * From address AND whether the receiving provider authenticated that sender. A From header alone
 * is never trust; this is the single point where a header may become trust (store.ts and
 * auto-join.ts both consume the verdict, nothing else derives it).
 *
 * Which Authentication-Results header counts: only a header whose authserv-id is the receiving
 * provider (RFC 8601; Gmail stamps `mx.google.com`), and only when EXACTLY ONE such header exists.
 * An attacker can inject any Authentication-Results text, including one naming mx.google.com, but
 * cannot stop Gmail adding its own, so a forged copy produces two matching headers and the message
 * is refused. Headers naming other servers (upstream hops) are ignored, never trusted. Anything
 * missing, unparseable, ambiguous or failing is "not authenticated" (fail closed).
 * Alignment is exact-domain: dmarc=pass with header.from == the From domain; only when the header
 * carries no dmarc result at all, a dkim=pass (header.d / header.i) or spf=pass (smtp.mailfrom)
 * whose domain equals the From domain exactly. A pass for any other domain never counts.
 */
export interface MailHeader { name: string; value: string }
export interface SenderAssessment { senderEmail: string; senderDomain: string; senderAuthenticated: boolean }

export const RECEIVER_AUTHSERV_ID = "mx.google.com";

const FROM_RE = /<?([^\s<>]+@[^\s<>]+)>?\s*$/;
const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** Same acceptance as meeting-bot's `parseStrictEmail` (parity is asserted in its tests): bare
 * printable-ASCII `local@domain`, exactly one `@`, multi-label domain, no trailing dot. */
function parseSender(from: string): { email: string; domain: string } | undefined {
  if (/[,;]/.test(from.replace(/"[^"]*"/g, ""))) return undefined; // an address list is ambiguous about who sent it
  const email = (FROM_RE.exec(from.trim())?.[1] ?? from).toLowerCase();
  if (email.length > 320 || !/^[!-~]+$/.test(email) || /[<>(),;:"\\]/.test(email)) return undefined;
  const [local, domain, ...rest] = email.split("@");
  return local && domain && rest.length === 0 && DOMAIN_RE.test(domain) ? { email, domain } : undefined;
}

function stripComments(value: string): string | undefined {
  let depth = 0, out = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    else if (ch === ")") { if (--depth < 0) return undefined; }
    else if (depth === 0) out += ch;
  }
  return depth === 0 ? out : undefined;
}

interface MethodResult { method: string; result: string; props: Map<string, string[]> }

/** Parses one Authentication-Results value; undefined when it is malformed in any way. */
function parseResults(value: string): MethodResult[] | undefined {
  const clean = /[\\"]/.test(value) ? undefined : stripComments(value);
  if (clean === undefined) return undefined;
  const [, ...segments] = clean.split(";").map((s) => s.trim());
  const out: MethodResult[] = [];
  for (const segment of segments) {
    if (segment === "" || segment.toLowerCase() === "none") continue;
    const [head, ...tokens] = segment.split(/\s+/);
    const m = /^([a-z0-9-]+)=([a-z]+)$/i.exec(head ?? "");
    if (!m) return undefined;
    const props = new Map<string, string[]>();
    for (const token of tokens) {
      const p = /^([a-z0-9-]+\.[a-z0-9._-]+)=(.*)$/i.exec(token);
      if (p) props.set(p[1]!.toLowerCase(), [...(props.get(p[1]!.toLowerCase()) ?? []), p[2]!.toLowerCase()]);
    }
    out.push({ method: m[1]!.toLowerCase(), result: m[2]!.toLowerCase(), props });
  }
  return out;
}

/** Domain of a `@d`, `u@d` or `d` property value; undefined when it holds more than one `@`. */
function propDomain(value: string | undefined): string | undefined {
  const parts = (value ?? "").split("@");
  return parts.length > 2 ? undefined : parts[parts.length - 1];
}

function aligned(results: MethodResult[], domain: string): boolean {
  const dmarc = results.filter((r) => r.method === "dmarc");
  if (dmarc.length > 1) return false;
  const only = (r: MethodResult, key: string) => (r.props.get(key)?.length === 1 ? r.props.get(key)![0] : undefined);
  if (dmarc[0]) return dmarc[0].result === "pass" && only(dmarc[0], "header.from") === domain;
  return results.some((r) => r.result === "pass" && (
    (r.method === "dkim" && [only(r, "header.d"), only(r, "header.i")].some((v) => v !== undefined && propDomain(v) === domain)) ||
    (r.method === "spf" && propDomain(only(r, "smtp.mailfrom")) === domain)));
}

export function assessSender(headers: readonly MailHeader[], authservId = RECEIVER_AUTHSERV_ID): SenderAssessment | undefined {
  const named = (name: string) => headers.filter((h) => h.name.toLowerCase() === name);
  const froms = named("from");
  const sender = froms.length === 1 ? parseSender(froms[0]!.value) : undefined;
  if (!sender) return undefined;
  const ours = named("authentication-results").filter((h) => h.value.trim().split(/[;\s]/)[0]?.toLowerCase() === authservId);
  const results = ours.length === 1 ? parseResults(ours[0]!.value) : undefined;
  return { senderEmail: sender.email, senderDomain: sender.domain,
    senderAuthenticated: results !== undefined && aligned(results, sender.domain) };
}
