import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { advanceAuthSession, apiFetch, AUTH_INVALIDATED_EVENT, AUTH_KEY_STORAGE_KEY, ApiError } from "./client.js";

describe("apiFetch", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("ISS-RULESWEB-002: caller-supplied headers cannot override Authorization or Content-Type", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await apiFetch("/x", "real-key", { method: "POST", body: { a: 1 }, headers: { authorization: "Bearer evil", Authorization: "Bearer evil2", "content-type": "text/plain", "If-Match": '"e1"' } });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    const h = new Headers(init.headers);
    expect(h.get("authorization")).toBe("Bearer real-key");
    expect(h.get("content-type")).toBe("application/json");
    expect(h.get("if-match")).toBe('"e1"');
  });

  test("ISS-RULESWEB-002: a Headers object and a tuple array are normalised; authorization / content-type are dropped, others kept", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const seen = () => new Headers((fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit])[1].headers);
    await apiFetch("/x", "real-key", { method: "POST", body: {}, headers: new Headers({ Authorization: "Bearer evil", "Content-Type": "text/plain", "If-Match": '"e1"' }) });
    expect(seen().get("authorization")).toBe("Bearer real-key"); expect(seen().get("content-type")).toBe("application/json"); expect(seen().get("if-match")).toBe('"e1"');
    await apiFetch("/x", "real-key", { method: "POST", body: {}, headers: [["AUTHORIZATION", "Bearer evil"], ["authorization", "Bearer evil2"], ["Content-Type", "text/plain"], ["If-None-Match", "*"]] });
    expect(seen().get("authorization")).toBe("Bearer real-key"); expect(seen().get("content-type")).toBe("application/json"); expect(seen().get("if-none-match")).toBe("*");
  });

  test("ISS-RULESWEB-002: without a body the caller's content-type is still dropped", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await apiFetch("/x", "real-key", { headers: { "Content-Type": "text/plain" } });
    expect(new Headers((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers).get("content-type")).toBeNull();
  });

  test("an in-flight 401 from a previous login cannot invalidate a new login using the same key", async () => {
    localStorage.setItem(AUTH_KEY_STORAGE_KEY, "same-key");
    let resolve!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((done) => { resolve = done; })));
    const dispatch = vi.spyOn(window, "dispatchEvent");
    const request = apiFetch("/sessions", "same-key").catch((error: unknown) => error);
    advanceAuthSession();
    resolve(new Response("{}", { status: 401 }));
    expect(await request).toMatchObject({ status: 401 });
    expect(localStorage.getItem(AUTH_KEY_STORAGE_KEY)).toBe("same-key");
    expect(dispatch).not.toHaveBeenCalled();
    // A new request in this session still handles a genuine current-key 401.
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    await expect(apiFetch("/sessions", "same-key")).rejects.toMatchObject({ status: 401 });
    expect(localStorage.getItem(AUTH_KEY_STORAGE_KEY)).toBeNull();
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  test("clears cached API key and emits AUTH_INVALIDATED_EVENT for 401", async () => {
    localStorage.setItem(AUTH_KEY_STORAGE_KEY, "invalid-key");
    const dispatchEventSpy = vi.spyOn(window, "dispatchEvent");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "invalid api key" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(apiFetch("/sessions", "invalid-key")).rejects.toBeInstanceOf(ApiError);
    expect(localStorage.getItem(AUTH_KEY_STORAGE_KEY)).toBeNull();
    expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
    const event = dispatchEventSpy.mock.calls[0]?.[0];
    expect(event).toBeInstanceOf(CustomEvent);
    expect((event as CustomEvent).type).toBe(AUTH_INVALIDATED_EVENT);
    expect((event as CustomEvent<{ apiKey: string }>).detail.apiKey).toBe("invalid-key");
  });

  test("does not clear cached API key for 403", async () => {
    localStorage.setItem(AUTH_KEY_STORAGE_KEY, "forbidden-key");
    const dispatchEventSpy = vi.spyOn(window, "dispatchEvent");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "forbidden" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(apiFetch("/sessions", "forbidden-key")).rejects.toBeInstanceOf(ApiError);
    expect(localStorage.getItem(AUTH_KEY_STORAGE_KEY)).toBe("forbidden-key");
    expect(dispatchEventSpy).not.toHaveBeenCalled();
  });

  test("a late 401 for the old key does not delete its replacement key", async () => {
    // The recorded reproduction (2026-09-19 HUMAN_GATE session-auth repair): an in-flight
    // request made with old key A resolves 401 AFTER the user has already stored key B.
    // Storage must keep B; the event still fires so React state can reconcile.
    localStorage.setItem(AUTH_KEY_STORAGE_KEY, "new-key-b");
    const dispatchEventSpy = vi.spyOn(window, "dispatchEvent");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "invalid api key" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(apiFetch("/sessions", "old-key-a")).rejects.toBeInstanceOf(ApiError);
    expect(localStorage.getItem(AUTH_KEY_STORAGE_KEY)).toBe("new-key-b");
    const event = dispatchEventSpy.mock.calls[0]?.[0];
    expect((event as CustomEvent<{ apiKey: string }>).detail.apiKey).toBe("old-key-a");
  });

  test("a 401 still clears storage when the failed key IS the stored key", async () => {
    localStorage.setItem(AUTH_KEY_STORAGE_KEY, "same-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "invalid api key" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(apiFetch("/sessions", "same-key")).rejects.toBeInstanceOf(ApiError);
    expect(localStorage.getItem(AUTH_KEY_STORAGE_KEY)).toBeNull();
  });
});



describe("Gmail work database handshake", () => {
  afterEach(() => vi.unstubAllGlobals());
  test("scan obtains the authenticated work binding before POST and never reuses another login", async () => {
    const {scanGmail} = await import("./meeting-candidates.js");
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => init.method === "POST" ?
      new Response('{"created":1,"autoApproved":0}') : new Response('{"candidates":[]}', {headers: {"X-LKB-Work-DB": new Headers(init.headers).get("authorization") === "Bearer a" ? "lkb_work_a" : "lkb_work_b", "X-LKB-Tenant": "toc"}}));
    vi.stubGlobal("fetch", fetchMock);
    await scanGmail("a"); await scanGmail("b");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(new Headers(fetchMock.mock.calls[1]![1].headers).get("X-LKB-Work-DB")).toBe("lkb_work_a");
    expect(new Headers(fetchMock.mock.calls[3]![1].headers).get("X-LKB-Work-DB")).toBe("lkb_work_b");
  });
  test("missing work binding refuses before any scan write", async () => {
    const {scanGmail} = await import("./meeting-candidates.js");
    const fetchMock = vi.fn(async () => new Response('{"candidates":[]}'));
    vi.stubGlobal("fetch", fetchMock);
    await expect(scanGmail("a")).rejects.toMatchObject({status: 503});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

import { scanGmail, listMeetingCandidates } from "./meeting-candidates.js";
test("cycle1 Gmail scan binds work DB from authorized inventory and preserves summary",async()=>{
  const summary={listed:2,fetched:2,candidates:1,excludedNonMeeting:1,excludedInternal:0,refusedSender:0,incompleteMessages:0,complete:true};
  const request=vi.fn(async(_url:string,init?:RequestInit)=>new Response(JSON.stringify(init?.method === "POST"?{created:1,autoApproved:0,gmailSummary:summary}:{candidates:[],gmailSummary:summary}),{status:200,headers:{"X-LKB-Work-DB":"fixture-work","X-LKB-Tenant":"owner"}}));vi.stubGlobal("fetch",request);
  expect(await listMeetingCandidates("key")).toEqual({candidates:[],gmailSummary:summary});expect((await scanGmail("key")).gmailSummary).toEqual(summary);
  const [url,init]=request.mock.calls.at(-1)!;expect(url).toContain("/gmail/scan");expect(new Headers(init?.headers).get("X-LKB-Work-DB")).toBe("fixture-work");expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer key");
});
