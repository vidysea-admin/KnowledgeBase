/** INACTIVE HTTPS resolver candidate. The opaque URL may identify its recipient; no extra fields/cookies are sent. */
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";

export const REGISTRATION_LINK_RESOLUTION_ENABLED = false;
export const privateEvidenceHash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
export interface LinkResolutionInput {
  tenantId: string; sourceId: string; messageId: string; sourceHash: string; policyHash: string;
  link: string; anchor: "Register Now"; initialHost: "b64wc.r.a.d.sendibm1.com";
  allowedHosts: string[]; finalZoomHosts: string[];
}
export interface ResolutionAuthorization {
  tenantId: string; sourceId: string; messageId: string; sourceHash: string; policyHash: string; linkHash: string; scopeHash: string; decisionId: string;
}
export const registrationResolutionScopeHash = (input: LinkResolutionInput) => privateEvidenceHash(JSON.stringify([
  input.anchor, input.initialHost, [...input.allowedHosts].sort(), [...input.finalZoomHosts].sort()]));
export interface PinnedResponse {status: number; locations: string[]; peerAddress: string; body: Uint8Array}
export interface ResolverOptions {
  enabled?: boolean;
  /** Trusted host approval lookup; never use a request body or a synthetic fixture as live authority. */
  authorize?: (input: LinkResolutionInput) => ResolutionAuthorization | undefined;
  dns?: (host: string) => Promise<{address: string; family: number}[]>;
  get?: (url: URL, pinned: {address: string; family: number}, remainingMs: number, remainingBytes: number) => Promise<PinnedResponse>;
  now?: () => number;
}
export interface ResolvedRegistrationLink {
  tenantId: string; sourceId: string; messageId: string; sourceHash: string; policyHash: string;
  originalLinkHash: string; finalUrl: string; finalUrlHash: string; bodyHash: string; body: Uint8Array;
  chain: {host: string; urlHash: string; peerAddress: string}[]; decisionId: string;
}
const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const identifier = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9._-]{1,256}$/.test(value);
const exactHost = (value: unknown): value is string => typeof value === "string" && value.length <= 253 &&
  value.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
export function publicRegistrationAddress(address: string): boolean {
  if (typeof address !== "string") return false;
  if (address.includes("%")) return false;
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a! >= 224 || (a === 100 && b! >= 64 && b! <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 &&
        (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) !== 6) return false;
  if (address.includes(".")) return false;
  const [firstText, secondText] = address.split(":"), first = parseInt(firstText!, 16), second = parseInt(secondText || "0", 16);
  return first >= 0x2000 && first < 0x4000 && first !== 0x2002 &&
    !(first === 0x2001 && (second < 0x200 || second === 0xdb8)) && !(first === 0x3fff && second < 0x1000);
}
const addressIdentity = (address: string) => isIP(address) === 6 ? new URL(`https://[${address}]/`).hostname : address;
async function bounded<T>(pending: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([pending, new Promise<T>((_, reject) => {timer = setTimeout(() => reject(new Error("deadline")), ms);})]); }
  finally {clearTimeout(timer!);}
}
/** Real transport: TLS verifies hostname, DNS is pinned, cookies/credentials are absent, redirects are manual. */
export function pinnedRegistrationGet(url: URL, pinned: {address: string; family: number}, remainingMs: number,
  remainingBytes = 1024 * 1024): Promise<PinnedResponse> {
  return new Promise((resolve, reject) => {
    const req = request(url, {method: "GET", agent: false, rejectUnauthorized: true, servername: url.hostname,
      family: pinned.family, autoSelectFamily: false,
      headers: {accept: "text/html,application/json", "accept-encoding": "identity", connection: "close"},
      lookup: ((_host: string, lookupOptions: {all?: boolean}, callback: any) => lookupOptions.all
        ? callback(null, [pinned]) : callback(null, pinned.address, pinned.family)) as any,
    }, response => {
      const chunks: Buffer[] = []; let size = 0;
      const peerAddress = response.socket.remoteAddress ?? "";
      if (addressIdentity(peerAddress) !== addressIdentity(pinned.address)) {req.destroy(new Error("peer")); return;}
      const locations: string[] = [];
      for (let i = 0; i < response.rawHeaders.length; i += 2)
        if (response.rawHeaders[i]!.toLowerCase() === "location") locations.push(response.rawHeaders[i + 1]!);
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > remainingBytes) req.destroy(new Error("bytes")); else chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("aborted", () => reject(new Error("aborted")));
      response.on("end", () => resolve({status: response.statusCode ?? 0, locations, peerAddress, body: Buffer.concat(chunks)}));
    });
    const timer = setTimeout(() => req.destroy(new Error("deadline")), remainingMs);
    req.on("close", () => clearTimeout(timer)); req.on("error", reject); req.end();
  });
}
export async function resolveRegistrationLink(input: LinkResolutionInput, options: ResolverOptions = {}): Promise<
  {status: "inactive" | "refused"; reason: string} | {status: "candidate"; proof: ResolvedRegistrationLink}> {
  if ((options.enabled ?? REGISTRATION_LINK_RESOLUTION_ENABLED) !== true || !options.authorize) return {status: "inactive", reason: "approval-required"};
  if (!input || typeof input.link !== "string" || input.link.length > 8192 || ![input.tenantId, input.sourceId, input.messageId].every(identifier) ||
    !hash(input.sourceHash) || !hash(input.policyHash)) return {status: "refused", reason: "input-invalid"};
  let authorization: ResolutionAuthorization | undefined;
  try {authorization = options.authorize(input);} catch {return {status: "refused", reason: "approval-unavailable"};}
  if (!authorization || !identifier(authorization.decisionId) || ["tenantId", "sourceId", "messageId", "sourceHash", "policyHash"].some(
    key => authorization![key as keyof ResolutionAuthorization] !== input[key as keyof LinkResolutionInput]) ||
    authorization.linkHash !== privateEvidenceHash(input.link)) return {status: "refused", reason: "approval-binding"};
  if (![input.tenantId, input.sourceId, input.messageId].every(identifier) || !hash(input.sourceHash) || !hash(input.policyHash) ||
    input.anchor !== "Register Now" || input.initialHost !== "b64wc.r.a.d.sendibm1.com" ||
    !Array.isArray(input.allowedHosts) || !Array.isArray(input.finalZoomHosts) || input.allowedHosts.length > 20 ||
    !input.finalZoomHosts.length || input.finalZoomHosts.length > 20 || ![...input.allowedHosts, ...input.finalZoomHosts].every(exactHost) ||
    !input.allowedHosts.includes(input.initialHost) || input.finalZoomHosts.some(host => !input.allowedHosts.includes(host) ||
      (host !== "zoom.us" && !host.endsWith(".zoom.us")))) return {status: "refused", reason: "scope-invalid"};
  if (authorization.scopeHash !== registrationResolutionScopeHash(input)) return {status: "refused", reason: "approval-binding"};
  const now = options.now ?? Date.now, deadline = now() + 15000;
  const dns = options.dns ?? (host => lookup(host, {all: true, verbatim: true})), get = options.get ?? pinnedRegistrationGet;
  const seen = new Set<string>(), chain: ResolvedRegistrationLink["chain"] = [];
  let target = input.link, totalBytes = 0;
  try {
    for (let hop = 0; hop <= 5; hop++) {
      if (typeof target !== "string" || target.length > 8192 || /[\s\\\x00-\x1f\x7f]/.test(target)) throw new Error("url");
      const url = new URL(target);
      if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash || isIP(url.hostname) ||
        !input.allowedHosts.includes(url.hostname) || (hop === 0 && url.hostname !== input.initialHost) || seen.has(url.href)) throw new Error("url");
      seen.add(url.href);
      const remaining = deadline - now(); if (remaining <= 0) throw new Error("deadline");
      const addresses = await bounded(dns(url.hostname), remaining);
      if (!addresses.length || addresses.length > 20 || addresses.some(row => !publicRegistrationAddress(row.address) ||
        isIP(row.address) !== row.family)) throw new Error("address");
      const timeLeft = deadline - now(); if (timeLeft <= 0) throw new Error("deadline");
      const response = await bounded(get(url, addresses[0]!, timeLeft, 1024 * 1024 - totalBytes), timeLeft);
      totalBytes += response.body.byteLength;
      if (now() > deadline || totalBytes > 1024 * 1024 ||
        addressIdentity(response.peerAddress) !== addressIdentity(addresses[0]!.address)) throw new Error("response");
      chain.push({host: url.hostname, urlHash: privateEvidenceHash(url.href), peerAddress: response.peerAddress});
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (hop === 5 || response.locations.length !== 1 || !response.locations[0] || response.locations[0].length > 8192 ||
          /[\s\\\x00-\x1f\x7f]/.test(response.locations[0])) throw new Error("redirect");
        target = new URL(response.locations[0], url).href; continue;
      }
      if (response.status !== 200 || response.locations.length || !input.finalZoomHosts.includes(url.hostname) ||
        !/^\/webinar\/register\/[A-Za-z0-9_-]{1,512}\/?$/.test(url.pathname)) throw new Error("target");
      return {status: "candidate", proof: {tenantId: input.tenantId, sourceId: input.sourceId, messageId: input.messageId,
        sourceHash: input.sourceHash, policyHash: input.policyHash, originalLinkHash: privateEvidenceHash(input.link), finalUrl: url.href,
        finalUrlHash: privateEvidenceHash(url.href), bodyHash: privateEvidenceHash(response.body), body: response.body,
        chain, decisionId: authorization.decisionId}};
    }
  } catch {return {status: "refused", reason: "resolution-refused"};}
  return {status: "refused", reason: "resolution-refused"};
}
