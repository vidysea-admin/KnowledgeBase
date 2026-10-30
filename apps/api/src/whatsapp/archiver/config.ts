/**
 * Archiver client configuration (spec R-42, R-45, plan W3). URL and token come ONLY from the environment, are
 * validated once at load, and never from request data. Error messages name the setting, never a value.
 *
 * URL policy (SSRF): origin only (no userinfo, path, query or fragment); https always allowed; plain http only
 * when WHATSAPP_ARCHIVER_API_ALLOW_PRIVATE_HTTP=1 AND the host is a loopback/private IP literal or `localhost`
 * (a DNS name cannot be proven private, so it needs https). Link-local (cloud metadata), unspecified, multicast and
 * reserved ranges are refused for every scheme. Redirects are never followed (client.ts).
 */
import { isIP } from "node:net";
import { inspect } from "node:util";

export const URL_ENV = "WHATSAPP_ARCHIVER_API_URL";
export const TOKEN_ENV = "WHATSAPP_ARCHIVER_API_TOKEN";
export const ALLOW_PRIVATE_HTTP_ENV = "WHATSAPP_ARCHIVER_API_ALLOW_PRIVATE_HTTP";

/** Wire patterns of contract section 2. */
export const OWNER_ID_RE = /^[0-9a-f]{24}$/;
export const PERSON_ID_RE = OWNER_ID_RE;
export const JID_RE = /^[0-9]{5,40}(-[0-9]{1,20})?@g\.us$/;
export const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const TOKEN_RE = /^[\x21-\x7e]{32,512}$/;

export class ArchiverConfigError extends Error {
  constructor(setting: string) { super(`${setting} is missing or invalid`); this.name = "ArchiverConfigError"; }
}

export interface ArchiverConfig {
  /** `scheme://host[:port]`, no trailing slash. */
  readonly baseUrl: string;
  readonly allowPrivateHttp: boolean;
  readonly timeoutMs: number;
  readonly listTimeoutMs: number;
  /** The only accessor of the token; not enumerable in JSON or util.inspect. */
  bearer(): string;
}
export interface ArchiverConfigOverrides { timeoutMs?: number; listTimeoutMs?: number }

type Range = "loopback" | "private" | "blocked" | "public";
function classifyV4(b: readonly number[]): Range {
  const [a = 0, c = 0] = b;
  if (a === 0 || a >= 224 || (a === 169 && c === 254)) return "blocked";
  if (a === 127) return "loopback";
  if (a === 10 || (a === 172 && c >= 16 && c <= 31) || (a === 192 && c === 168) || (a === 100 && c >= 64 && c <= 127)) return "private";
  return "public";
}
function v6Bytes(host: string): number[] | null {
  let h = host;
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(h);
  if (tail) { const q = tail[1]!.split(".").map(Number); h = h.slice(0, -tail[1]!.length) + ((q[0]! << 8) | q[1]!).toString(16) + ":" + ((q[2]! << 8) | q[3]!).toString(16); }
  const halves = h.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - left.length - right.length : 0;
  const groups = [...left, ...Array(Math.max(fill, 0)).fill("0"), ...right];
  if (groups.length !== 8) return null;
  const out: number[] = [];
  for (const g of groups) { if (!/^[0-9a-f]{1,4}$/i.test(g)) return null; const n = parseInt(g, 16); out.push(n >> 8, n & 255); }
  return out;
}
function classifyHost(hostname: string): Range {
  const host = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
  const kind = isIP(host);
  if (kind === 4) return classifyV4(host.split(".").map(Number));
  if (kind === 6) {
    const b = v6Bytes(host.toLowerCase());
    if (!b) return "blocked";
    if (b.every(x => x === 0)) return "blocked";
    if (b.slice(0, 15).every(x => x === 0) && b[15] === 1) return "loopback";
    if (b.slice(0, 10).every(x => x === 0) && b[10] === 255 && b[11] === 255) return classifyV4(b.slice(12)); // ::ffff:a.b.c.d
    if (b[0] === 0xfe && (b[1]! & 0xc0) === 0x80) return "blocked"; // fe80::/10
    if (b[0] === 0xff) return "blocked";
    if ((b[0]! & 0xfe) === 0xfc) return "private"; // fc00::/7
    return "public";
  }
  return host === "localhost" ? "loopback" : "public"; // "public" here means "a DNS name"
}

/** Validate the base URL and return its origin. Throws ArchiverConfigError (no value in the message). */
export function validateArchiverUrl(raw: string, allowPrivateHttp: boolean): string {
  const bad = (): never => { throw new ArchiverConfigError(URL_ENV); };
  if (raw.length === 0 || raw.length > 2048 || /[\s\x00-\x1f\x7f]/.test(raw)) return bad();
  let u: URL;
  try { u = new URL(raw); } catch { return bad(); }
  if (u.protocol !== "https:" && u.protocol !== "http:") return bad();
  if (u.username || u.password || u.search || u.hash || u.pathname !== "/" || !u.hostname) return bad();
  const range = classifyHost(u.hostname);
  if (range === "blocked") return bad();
  if (u.protocol === "http:") {
    const literalOrLocalhost = range === "loopback" || range === "private";
    if (!allowPrivateHttp || !literalOrLocalhost) return bad();
  }
  return u.origin;
}

function boundedMs(v: number | undefined, dflt: number): number {
  if (v === undefined) return dflt;
  if (!Number.isInteger(v) || v < 50 || v > 60_000) throw new ArchiverConfigError("archiver timeout");
  return v;
}

/**
 * `null` when neither setting is present (the live screens then answer 503 `archiver_api_unavailable`); throws when
 * only one is present or either is invalid, so a half-configured deployment fails loudly at boot.
 */
export function loadArchiverConfig(
  env: Record<string, string | undefined> = process.env, overrides: ArchiverConfigOverrides = {},
): ArchiverConfig | null {
  const url = (env[URL_ENV] ?? "").trim();
  const token = env[TOKEN_ENV] ?? "";
  if (url === "" && token === "") return null;
  if (url === "") throw new ArchiverConfigError(URL_ENV);
  if (!TOKEN_RE.test(token)) throw new ArchiverConfigError(TOKEN_ENV);
  const allowPrivateHttp = env[ALLOW_PRIVATE_HTTP_ENV] === "1";
  const baseUrl = validateArchiverUrl(url, allowPrivateHttp);
  const timeoutMs = boundedMs(overrides.timeoutMs, 10_000);
  const listTimeoutMs = boundedMs(overrides.listTimeoutMs, Math.max(20_000, timeoutMs));
  const header = `Bearer ${token}`;
  const cfg = {
    baseUrl, allowPrivateHttp, timeoutMs, listTimeoutMs, bearer: () => header,
    toJSON: () => ({ baseUrl, allowPrivateHttp, timeoutMs, listTimeoutMs }),
    [inspect.custom]: () => `ArchiverConfig { baseUrl: '${baseUrl}', token: '[redacted]' }`,
  };
  return Object.freeze(cfg) as ArchiverConfig;
}
