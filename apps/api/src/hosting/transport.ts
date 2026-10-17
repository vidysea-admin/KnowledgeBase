import { lookup } from "node:dns/promises";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { checkServerIdentity } from "node:tls";
import { isIP } from "node:net";
import { hostingPublicAddress } from "./policy.js";
import { HostingError } from "./types.js";

export interface HostingOutboundRequest {
  url: URL; body: string; headers: Record<string, string>; signal?: AbortSignal;
  /** Invoke socket initialization while the persisted generation/identity fence is locked. */
  connect?: (start: () => Promise<number>) => Promise<number>;
}
export type HostingTransport = (request: HostingOutboundRequest) => Promise<number>;
export interface HostingTransportOptions {
  resolve?: (hostname: string) => Promise<string[]>;
  request?: typeof httpsRequest;
  timeoutMs?: number;
}

export async function validateHostingDestination(url: URL, resolveAddresses = async (host: string) => (await lookup(host, { all: true, verbatim: true })).map((row) => row.address), timeout = 5000): Promise<string[]> {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const addresses = await Promise.race([
      isIP(hostname) ? Promise.resolve([hostname]) : resolveAddresses(hostname),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new HostingError("dns_timeout", 503)), timeout); }),
    ]);
    if (!addresses.length || addresses.length > 32 || addresses.some((address) => !hostingPublicAddress(address))) throw new HostingError("destination_not_allowed");
    return addresses;
  } catch (error) { if (error instanceof HostingError) throw error; throw new HostingError("destination_unavailable", 503); }
  finally { if (timer) clearTimeout(timer); }
}

/** DNS result is the socket hostname; TLS identity remains the original permitted host. No redirects. */
export function createHostingTransport(options: HostingTransportOptions = {}): HostingTransport {
  const resolveAddresses = options.resolve ?? (async (hostname) => (await lookup(hostname, { all: true, verbatim: true })).map((row) => row.address));
  const request = options.request ?? httpsRequest;
  const timeout = options.timeoutMs ?? 5000;
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 5000) throw new HostingError("invalid_transport_timeout");
  return async ({ url, body, headers, signal, connect }) => {
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = await validateHostingDestination(url, resolveAddresses, timeout);
    if (signal?.aborted) throw new HostingError("delivery_aborted", 503);
    const send = () => new Promise<number>((resolve, reject) => {
      if (signal?.aborted) { reject(new HostingError("delivery_aborted", 503)); return; }
      let settled = false;
      const fail = () => { if (!settled) { settled = true; reject(new HostingError("transport_failed", 503)); } };
      const opts: RequestOptions = {
        protocol: "https:", hostname: addresses[0], servername: hostname, port: Number(url.port || 443),
        method: "POST", path: url.pathname, maxHeaderSize: 8192, rejectUnauthorized: true, signal,
        checkServerIdentity: (_host, cert) => checkServerIdentity(hostname, cert),
        headers: { ...headers, Host: url.host, "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) },
      };
      const req = request(opts, (res) => {
        const status = res.statusCode ?? 0;
        // Do not collect/log response content or follow Location; signature is never forwarded.
        res.resume();
        if (!settled) { settled = true; resolve(status); }
      });
      req.on("error", fail);
      req.setTimeout(timeout, () => { req.destroy(); fail(); });
      const total = setTimeout(() => { req.destroy(); fail(); }, timeout);
      req.on("close", () => clearTimeout(total));
      req.end(body);
    });
    return connect ? connect(send) : send();
  };
}
