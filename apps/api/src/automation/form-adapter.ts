import https from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { hostingPublicAddress } from "../hosting/policy.js";
import { isAutomationReference } from "../../../../packages/core/src/domain/automation-monitor.js";
import type { ApplicationAdapter } from "./form-types.js";

export interface FormTransportRequest { url: URL; method: "POST" | "GET"; body?: string; headers: Record<string, string>; signal: AbortSignal }
export type FormTransport = (request: FormTransportRequest) => Promise<{ status: number; body: unknown }>;
/** Fixed trusted target, pinned public DNS address, TLS host verification, bounded response, no redirects. */
export const boundedFormTransport: FormTransport = async input => {
  input.signal.throwIfAborted();
  const addresses = await Promise.race([lookup(input.url.hostname.replace(/^\[|\]$/g, ""), { all: true, verbatim: true }), new Promise<never>((_, reject) => input.signal.addEventListener("abort", () => reject(new Error("form_aborted")), { once: true }))]);
  if (!addresses.length || addresses.some(a => !hostingPublicAddress(a.address))) throw new Error("form_destination_unavailable");
  input.signal.throwIfAborted(); const address = addresses[0]!;
  return new Promise((resolve, reject) => {
    const req = https.request(input.url, { method: input.method, headers: input.headers, signal: input.signal, family: address.family,
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family), timeout: 10000 }, res => {
      const chunks: Buffer[] = []; let bytes = 0;
      res.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > 8192) { res.destroy(); reject(new Error("form_response_too_large")); } else chunks.push(chunk); });
      res.on("error", () => reject(new Error("form_response_unavailable")));
      res.on("end", () => { try { resolve({ status: res.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }); } catch { reject(new Error("form_response_invalid")); } });
    });
    req.on("timeout", () => req.destroy(new Error("form_timeout"))); req.on("error", () => reject(new Error("form_transport_unavailable")));
    if (input.body) req.write(input.body); req.end();
  });
};
export interface ConfiguredFormAdapterOptions {
  endpoint: string; allowedOrigins: ReadonlySet<string>; token: string;
  duplicateGuarantee: ApplicationAdapter["duplicateGuarantee"]; transport?: FormTransport;
}
/** The remote must implement the explicit receipt protocol. Configuring a guarantee is not proof it does. */
export function createConfiguredFormAdapter(options: ConfiguredFormAdapterOptions): ApplicationAdapter {
  const endpoint = new URL(options.endpoint);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !options.allowedOrigins.has(endpoint.origin) || /[\u0000-\u0020\u007f]/.test(options.endpoint) || !options.token || /[\u0000-\u001f\u007f]/.test(options.token) || !["operation-id", "none"].includes(options.duplicateGuarantee)) throw new Error("form_configuration_invalid");
  const host = endpoint.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || isIP(host) && !hostingPublicAddress(host)) throw new Error("form_configuration_invalid");
  const transport = options.transport ?? boundedFormTransport;
  const receipt = (body: unknown, operationId: string, tenantId: string, expectedReceipt?: string): string => {
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).sort().join(",") !== "operationId,receiptId,status,tenantId") throw new Error("form_receipt_invalid");
    const r = body as { operationId: unknown; tenantId: unknown; receiptId: unknown; status: unknown };
    if (r.operationId !== operationId || r.tenantId !== tenantId || r.status !== "accepted" || !isAutomationReference(r.receiptId) || expectedReceipt !== undefined && r.receiptId !== expectedReceipt) throw new Error("form_receipt_invalid"); return r.receiptId;
  };
  const headers = { authorization: `Bearer ${options.token}`, "content-type": "application/json" };
  return {
    duplicateGuarantee: options.duplicateGuarantee,
    async submit(input) {
      if (!isAutomationReference(input.operationId)) throw new Error("form_operation_invalid");
      const body = JSON.stringify({ operationId: input.operationId, tenantId: input.tenantId, fields: input.fields.map(({ name, value }) => ({ name, value })) });
      if (Buffer.byteLength(body) > 16384) throw new Error("form_payload_too_large");
      const response = await transport({ url: new URL(endpoint), method: "POST", body, headers: { ...headers, "idempotency-key": input.operationId }, signal: input.signal });
      if (![200, 201].includes(response.status)) throw new Error("form_submission_uncertain"); return { receiptId: receipt(response.body, input.operationId, input.tenantId) };
    },
    async verifyReceipt(input) {
      if (!isAutomationReference(input.operationId) || !isAutomationReference(input.receiptId)) return false;
      const url = new URL(endpoint); url.pathname = `${url.pathname.replace(/\/$/, "")}/operations/${encodeURIComponent(input.operationId)}`;
      const response = await transport({ url, method: "GET", headers: { ...headers, "x-lkb-tenant-id": encodeURIComponent(input.tenantId) }, signal: input.signal });
      if (response.status !== 200) return false; try { receipt(response.body, input.operationId, input.tenantId, input.receiptId); return true; } catch { return false; }
    },
  };
}
