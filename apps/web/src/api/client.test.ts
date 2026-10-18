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

