/**
 * packages/ingest/src/sources/node-transport.ts — the real transport behind `createGuardedFetcher`,
 * and the layer that makes the guard's decision BINDING.
 *
 * ISS-C-UNRUN-WRITERS-011. The first version called `fetch(url)`, so the OS resolved the hostname
 * again, independently of the addresses the guard had just vetted. That is the check-to-connect
 * window: the guard approves 93.184.216.34 and the connection can still land on 169.254.169.254,
 * because nothing carried the decision across. A control that the next layer is free to ignore is
 * advice, not a control.
 *
 * So this uses `node:http`/`node:https` rather than `fetch`, for one reason: they accept a custom
 * `lookup`, which is the supported way to say "connect to THIS address". The hostname still travels
 * in the `Host` header and in `servername` for SNI and certificate validation, so the server sees a
 * normal request and TLS still verifies against the name — only the address is pinned.
 *
 * The other three properties the guard depends on are unchanged and equally load-bearing:
 *   - redirects are NOT followed here; the guard re-resolves and re-checks every hop.
 *   - `maxBytes` aborts the stream mid-flight rather than measuring an allocated string.
 *   - `timeoutMs` destroys the socket rather than leaving a handle running.
 */
import { request as httpRequestRaw } from "node:http";
import { request as httpsRequestRaw } from "node:https";
import { lookup as dnsLookup, Resolver } from "node:dns/promises";
import type { LookupAddress } from "node:dns";

/** Every address a hostname currently answers with — all of them must pass the guard. */
export async function resolveAll(hostname: string, bounded?: {timeoutMs: number; resolver?: {
  resolve4(host: string): Promise<string[]>; resolve6(host: string): Promise<string[]>; cancel(): void;
}}): Promise<string[]> {
  if (bounded) {
    if (!Number.isFinite(bounded.timeoutMs) || bounded.timeoutMs <= 0) throw new Error("Invalid DNS deadline");
    const resolver = bounded.resolver ?? new Resolver();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.allSettled([resolver.resolve4(hostname), resolver.resolve6(hostname)]).then(results => {
          const addresses: string[] = [];
          for (const result of results) {
            if (result.status === "fulfilled") addresses.push(...result.value);
            else if (!["ENODATA", "ENOTFOUND"].includes(result.reason?.code)) throw new Error("DNS acquisition unavailable");
          }
          if (!addresses.length) throw new Error("DNS acquisition unavailable");
          return [...new Set(addresses)];
        }),
        new Promise<string[]>((_resolve, reject) => {timer = setTimeout(() => {resolver.cancel(); reject(new Error("DNS acquisition timed out"));}, bounded.timeoutMs);}),
      ]);
    } finally {if (timer) clearTimeout(timer); resolver.cancel();}
  }
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map((r: LookupAddress) => r.address);
}

export interface HttpTransportResponse {
  status: number;
  location: string | null;
  body: string;
}

/**
 * One HTTP(S) request to a PINNED address, bounded in time and size, never following redirects.
 *
 * `opts.address` is the address the guard approved. It is injected through `lookup`, so the socket
 * connects there and nowhere else — no second resolution, no rebinding window.
 */
export function httpRequest(
  url: string,
  opts: { maxBytes: number; timeoutMs: number; address: string },
): Promise<HttpTransportResponse> {
  const target = new URL(url);
  const isHttps = target.protocol === "https:";
  const send = isHttps ? httpsRequestRaw : httpRequestRaw;

  return new Promise<HttpTransportResponse>((resolve, reject) => {
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const clearDeadline = () => { if (deadline !== undefined) {clearTimeout(deadline); deadline = undefined;} };
    const req = send(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (isHttps ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method: "GET",
        headers: { host: target.host, accept: "text/html,text/plain,*/*" },
        // TLS still verifies against the NAME; only the address is pinned.
        ...(isHttps ? { servername: target.hostname } : {}),
        // The pin itself. Node calls this instead of resolving, so the connection can only go to
        // the address the guard approved.
        lookup: (_hostname: string, options: { all?: boolean }, cb: (...args: never[]) => void) => {
          const family = opts.address.includes(":") ? 6 : 4;
          // Node calls this with `all: true` from net.connect and then expects an ARRAY; the
          // single-address form is the legacy shape. Getting this wrong yields
          // "Invalid IP address: undefined", not a fallback to real DNS -- it fails closed, which
          // is the right direction for a pin but a confusing error to read.
          const done = cb as unknown as (
            err: Error | null,
            address: string | { address: string; family: number }[],
            family?: number,
          ) => void;
          if (options?.all) done(null, [{ address: opts.address, family }]);
          else done(null, opts.address, family);
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = (res.headers.location as string | undefined) ?? null;

        if (status >= 300 && status < 400) {
          // Do not read a redirect's body: the guard has not vetted the next hop yet.
          res.destroy();
          resolve({ status, location, body: "" });
          return;
        }

        let bytes = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          bytes += chunk.byteLength;
          if (bytes > opts.maxBytes) {
            res.destroy();
            req.destroy();
            reject(new Error(`node-transport: response too large (> ${opts.maxBytes} bytes)`));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {clearDeadline(); resolve({ status, location, body: Buffer.concat(chunks).toString("utf8") });});
        res.on("error", error => {clearDeadline(); req.destroy(); reject(error);});
        res.on("close", () => {clearDeadline(); if (!res.complete) req.destroy(new Error("node-transport: response interrupted"));});
      },
    );

    // Inactivity alone does not stop a peer that drips bytes forever. This timer also closes the
    // owned socket at the absolute deadline, including connection/TLS and a continuously active body.
    deadline = setTimeout(() => {
      const error = new Error(`node-transport: timed out after ${opts.timeoutMs}ms`);
      reject(error); req.destroy(error);
    }, opts.timeoutMs);
    req.once("close", clearDeadline);
    req.setTimeout(opts.timeoutMs, () => {
      const error = new Error(`node-transport: timed out after ${opts.timeoutMs}ms`);
      reject(error); req.destroy(error);
    });
    req.on("error", error => {clearDeadline(); reject(error);});
    req.end();
  });
}
