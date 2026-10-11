import { afterEach, expect, test, vi } from "vitest";
import { ApiError, apiFetch } from "../../api/client.js";

afterEach(() => vi.unstubAllGlobals());
const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers })));
const fail = async (): Promise<ApiError> => { try { await apiFetch("/x", "k"); } catch (e) { return e as ApiError; } throw new Error("did not throw"); };

test("apiFetch keeps the structured error code and a numeric Retry-After from a busy response", async () => {
  respond(503, { error: "join_rules_busy", message: "join rules are busy; try again in a few seconds" }, { "Retry-After": "5" });
  const e = await fail();
  expect([e.status, e.code, e.retryAfterSeconds, e.message]).toEqual([503, "join_rules_busy", 5, "join rules are busy; try again in a few seconds"]);
});

test("apiFetch: no code for a non-JSON body or a non-string error; Retry-After only as delta-seconds", async () => {
  respond(503, "<html>", { "Retry-After": "Wed, 21 Oct 2026 07:28:00 GMT" });
  let e = await fail(); expect([e.code, e.retryAfterSeconds, e.message]).toEqual([undefined, undefined, "HTTP 503"]);
  respond(503, { error: { x: 1 }, message: "m" }); e = await fail(); expect(e.code).toBeUndefined();
  respond(503, { error: "join_rules_unavailable" }, { "Retry-After": "-3" }); e = await fail(); expect([e.code, e.retryAfterSeconds]).toEqual(["join_rules_unavailable", undefined]);
});
