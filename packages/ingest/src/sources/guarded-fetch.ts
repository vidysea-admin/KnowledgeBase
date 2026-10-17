/**
 * packages/ingest/src/sources/guarded-fetch.ts — a `UrlFetcher` that refuses to reach inside the
 * network. ISS-C-UNRUN-WRITERS-002 (high); contract invariant [I3] of watched-sources-entrypoint.
 *
 * Watched Sources fetches a stored URL on a timer, unattended, from inside the perimeter. That is
 * a textbook SSRF surface, and the cycle-1 checker ruled on where the control belongs and why:
 *
 *   NOT at registration. A store-time hostname check cannot survive DNS rebinding -- a name that
 *   resolved to a public address when a user registered it can resolve to 169.254.169.254 by the
 *   time the timer fires. Blocking a literal metadata IP in the route would LOOK like a control
 *   while leaving the actual path open, which is worse than having none.
 *
 * So the check is here, on the RESOLVED ADDRESSES, immediately before each request, and every
 * redirect hop is re-resolved and re-checked. `lookup` and `request` are injected so the whole
 * thing is testable without a network.
 *
 * HONEST LIMIT (ISS-C-UNRUN-WRITERS-007). An earlier version of this comment claimed "the
 * resolution the guard checks is the same one the caller will use". **That was false**, and an
 * overclaim in a security docstring is worse than the gap it papers over: `request` takes a URL and
 * re-resolves independently, so a check->connect window remains that only connect-time address
 * pinning closes. What this module does guarantee is that EVERY address the resolver returns is
 * checked, so a host publishing one public and one private record cannot win a coin flip. Closing
 * the remaining window needs a transport that accepts a pinned address.
 *
 * It fails CLOSED throughout: an address that cannot be parsed is treated as blocked, because the
 * alternative is a parser disagreement becoming an exfiltration path.
 */

export interface GuardedFetchDeps {
  /**
   * Resolve a hostname to EVERY address it currently answers with. All of them must pass.
   *
   * ISS-C-UNRUN-WRITERS-007 / cycle-1 ruling: a single address is not enough, and the reason is
   * sharper than rebinding. A host publishing one public and one private A record gives the
   * resolver a coin flip on every fetch -- no rebinding required, no timing needed. Judging one
   * returned address and connecting to another is not a control.
   */
  lookup(hostname: string): Promise<string[]>;
  /**
   * Issue one request. `opts` carries the caps rather than leaving them to be checked afterwards:
   * a transport that knows `maxBytes` can abort the stream, where measuring `body.length` only
   * proves the oversized response was already allocated (ISS-C-UNRUN-WRITERS-009).
   */
  request(
    url: string,
    opts: { maxBytes: number; timeoutMs: number; address: string },
  ): Promise<{ status: number; location: string | null; body: string }>;
  maxRedirects?: number;
  /** Refuse a response larger than this. */
  maxBytes?: number;
  /**
   * TOTAL wall-clock budget for the whole fetch, redirects included -- not per request. N hops must
   * not buy N timeouts, or a redirect chain reinstates the unbounded wait this exists to close.
   */
  timeoutMs?: number;
}

const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_MAX_BYTES = 5_000_000;
const DEFAULT_TIMEOUT_MS = 30_000;

function parseIpv4(value: string): number[] | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets;
}

function blockedIpv4(o: number[]): boolean {
  const [a, b] = o as [number, number, number, number];
  if (a === 0) return true;                               // 0.0.0.0/8 unspecified
  if (a === 10) return true;                              // private
  if (a === 127) return true;                             // loopback
  if (a === 169 && b === 254) return true;                // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;       // private
  if (a === 192 && b === 168) return true;                // private
  if (a === 192 && o[1] === 0 && o[2] === 0) return true;  // IETF protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true;      // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true;   // benchmarking
  if (a >= 224) return true;                              // multicast + reserved + broadcast
  return false;
}

/**
 * Expand an IPv6 literal into exactly 8 16-bit groups, or `null` if it is not one.
 *
 * ISS-C-UNRUN-WRITERS-006. The first version matched TEXT: it took the substring after the last
 * colon and unwrapped it only when that looked like dotted-quad. So `64:ff9b::127.0.0.1` blocked
 * while `64:ff9b::7f00:1` -- THE SAME ADDRESS -- was allowed, as were `2002:7f00:0001::1` (6to4 to
 * loopback) and `::ffff:7f00:1` (mapped loopback in hex). Blocking one spelling of an address while
 * allowing another is not a control, so the address is now parsed into numbers and judged there.
 */
function parseIpv6Groups(value: string): number[] | null {
  let text = value;
  if (text.startsWith("[") && text.endsWith("]")) text = text.slice(1, -1);
  text = text.split("%")[0] ?? text;                       // strip a zone id
  if (!text.includes(":")) return null;

  // A dotted tail is just two more groups; convert it before splitting.
  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIpv4(tail);
    if (!v4) return null;
    const [a, b, c, d] = v4 as [number, number, number, number];
    text = `${text.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;
  const toGroups = (part: string): number[] | null => {
    if (part === "") return [];
    const out: number[] = [];
    for (const g of part.split(":")) {
      if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };
  const head = toGroups(halves[0] ?? "");
  const back = halves.length === 2 ? toGroups(halves[1] ?? "") : [];
  if (head === null || back === null) return null;

  if (halves.length === 2) {
    const fill = 8 - head.length - back.length;
    if (fill < 0) return null;
    return [...head, ...Array<number>(fill).fill(0), ...back];
  }
  return head.length === 8 ? head : null;
}

/** The v4 address embedded in `g[i]`/`g[i+1]`, as octets. */
function embeddedV4(g: number[], i: number): number[] {
  const hi = g[i] ?? 0;
  const lo = g[i + 1] ?? 0;
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff];
}

/**
 * Is this address one we refuse to talk to?
 *
 * Exported because the honesty of this module depends on it being inspectable and testable on its
 * own. **Anything unparseable returns `true`** -- fail closed.
 */
export function isBlockedAddress(address: string): boolean {
  const value = address.trim().toLowerCase();
  if (value === "") return true;

  const v4 = parseIpv4(value);
  if (v4) return blockedIpv4(v4);

  const g = parseIpv6Groups(value);
  if (g === null) return true;                              // not v4, not v6 -> blocked

  const [g0, g1] = g as [number, number, ...number[]];

  // Transition/translation prefixes carry a v4 address inside them. Each must be judged on the
  // address it actually reaches, in whatever notation it was written.
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return blockedIpv4(embeddedV4(g, 6)); // ::ffff:0:0/96
  if (g.slice(0, 6).every((x) => x === 0)) {
    const v = embeddedV4(g, 6);
    if (v.every((x) => x === 0)) return true;               // ::
    if (v[0] === 0 && v[1] === 0 && v[2] === 0 && v[3] === 1) return true; // ::1 loopback
    return blockedIpv4(v);                                  // ::/96 v4-compatible
  }
  if (g0 === 0x2002) return blockedIpv4(embeddedV4(g, 1));   // 6to4
  if (g0 === 0x0064 && g1 === 0xff9b) return blockedIpv4(embeddedV4(g, 6)); // NAT64

  if (g0 === 0x2001 && g1 === 0x0000) return true;           // Teredo 2001::/32
  if (g0 === 0x3fff && g1 < 0x1000) return true;             // RFC 9637 documentation 3fff::/20
  if ((g0 & 0xfe00) === 0xfc00) return true;                 // fc00::/7 unique-local
  if ((g0 & 0xffc0) === 0xfe80) return true;                 // fe80::/10 link-local
  if ((g0 & 0xffc0) === 0xfec0) return true;                 // fec0::/10 site-local (deprecated)
  if ((g0 & 0xff00) === 0xff00) return true;                 // ff00::/8 multicast
  return false;
}

function httpUrlOrNull(value: string, base?: string): URL | null {
  try {
    const u = base ? new URL(value, base) : new URL(value);
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

/**
 * Marks a fetcher as having come from `createGuardedFetcher`.
 *
 * ISS-C-UNRUN-WRITERS-017: `store.ts` is this feature's SSRF boundary, and swapping its one line
 * for a bare `fetch` left every test green — the composition was asserted nowhere. A brand makes
 * "is this the guarded fetcher?" a question code can ask, so the boundary is checkable instead of
 * merely documented. It is a marker, not a security control: anyone can set it. Its job is to make
 * an accidental swap fail a test, not to stop a deliberate one.
 */
export const GUARDED = Symbol.for("lkb.guarded-fetcher");

export type GuardedFetcher = ((url: string) => Promise<string>) & { readonly [GUARDED]: true };

/** Is this fetcher the guarded one, rather than a bare transport? */
export function isGuardedFetcher(fn: unknown): fn is GuardedFetcher {
  return typeof fn === "function" && (fn as unknown as Record<symbol, unknown>)[GUARDED] === true;
}

/** A `UrlFetcher` that resolves and checks every hop before issuing it. */
export function createGuardedFetcher(deps: GuardedFetchDeps): GuardedFetcher {
  const maxRedirects = deps.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const maxBytes = deps.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const guardedFetch = async function guardedFetch(startUrl: string): Promise<string> {
    let current = httpUrlOrNull(startUrl);
    if (!current) throw new Error(`guarded-fetch: not an http(s) url: ${startUrl}`);

    // ONE deadline for the whole fetch. This module runs unattended on a timer, so an unbounded
    // wait does not fail loudly -- it silently occupies the scheduler forever. D-020 exists in this
    // repo because exactly that killed the test suite.
    const deadline = Date.now() + timeoutMs;

    for (let hop = 0; hop <= maxRedirects; hop++) {
      // Resolve and check IMMEDIATELY before the request, every hop, no caching. Caching the
      // verdict is what reintroduces the rebinding window this guard exists to close.
      let addresses: string[];
      try {
        addresses = await deps.lookup(current.hostname);
      } catch (err) {
        throw new Error(`guarded-fetch: cannot resolve ${current.hostname}: ${err instanceof Error ? err.message : String(err)}`);
      }
      // Fail closed on an empty answer: "no addresses" must never read as "nothing to object to".
      if (addresses.length === 0) {
        throw new Error(`guarded-fetch: blocked -- ${current.hostname} resolved to no addresses`);
      }
      const bad = addresses.find((a) => isBlockedAddress(a));
      if (bad !== undefined) {
        throw new Error(`guarded-fetch: blocked -- ${current.hostname} resolves to a private or reserved address (${bad})`);
      }

      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`guarded-fetch: timed out after ${timeoutMs}ms (deadline reached before ${current.href})`);

      // Race the transport against the remaining budget: a transport that ignores its timeoutMs, or
      // hangs before honouring it, must not be able to hang this caller.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const res = await Promise.race([
        // The APPROVED address travels with the request. Without this the transport re-resolves
        // and the check->connect window reopens: the guard vets one address and the OS may connect
        // to another (ISS-C-UNRUN-WRITERS-011). Passing it is what makes the check binding rather
        // than advisory.
        deps.request(current.href, { maxBytes, timeoutMs: left, address: addresses[0]! }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error(`guarded-fetch: timed out after ${timeoutMs}ms`)), left);
        }),
      ]).finally(() => { if (timer !== undefined) clearTimeout(timer); });

      // Size is checked on EVERY hop, redirects included. ISS-C-UNRUN-WRITERS-009: it used to be
      // asserted only on the final response, so a redirect chain could stream unbounded bodies.
      if (res.body.length > maxBytes) {
        throw new Error(`guarded-fetch: response too large (${res.body.length} > ${maxBytes} bytes)`);
      }

      if (res.status >= 300 && res.status < 400 && res.location) {
        const next = httpUrlOrNull(res.location, current.href);
        if (!next) throw new Error(`guarded-fetch: blocked redirect to a non-http(s) scheme: ${res.location}`);
        current = next;
        continue;
      }

      if (res.body.length > maxBytes) {
        throw new Error(`guarded-fetch: response too large (${res.body.length} > ${maxBytes} bytes)`);
      }
      return res.body;
    }

    throw new Error(`guarded-fetch: too many redirects (> ${maxRedirects})`);
  };

  Object.defineProperty(guardedFetch, GUARDED, { value: true, enumerable: false });
  return guardedFetch as GuardedFetcher;
}
