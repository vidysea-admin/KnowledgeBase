// ISS-WEBAUTH-002: full ordering table for the 401 handler (real AuthProvider, real apiFetch).
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AuthProvider, useAuth, type AuthContextValue } from "./AuthContext.js";
import { apiFetch, AUTH_INVALIDATED_EVENT } from "../api/client.js";

let auth: AuthContextValue;
function Probe() {
  auth = useAuth();
  return <span data-testid="key">{auth.apiKey ?? "none"}</span>;
}
const mount = () => render(<AuthProvider><Probe /></AuthProvider>);
const shown = () => screen.getByTestId("key").textContent;
const stored = () => localStorage.getItem("lkbApiKey");
const login = (k: string) => act(() => auth.setApiKey(k));
const fire = (detail: unknown) =>
  act(() => {
    window.dispatchEvent(new CustomEvent(AUTH_INVALIDATED_EVENT, { detail }));
  });
const late401 = async (key: string) => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
  await act(async () => {
    await apiFetch("/sessions", key).catch(() => {});
  });
};

describe("AuthProvider 401 ordering table (ISS-WEBAUTH-002)", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  test("tab A, 401 A, storage A: drop tab key, clear storage", async () => {
    localStorage.setItem("lkbApiKey", "A");
    mount();
    await late401("A");
    expect(shown()).toBe("none");
    expect(stored()).toBeNull();
  });

  test("tab A, 401 A, storage B from another tab: drop tab key, keep B, do not adopt B", async () => {
    localStorage.setItem("lkbApiKey", "A");
    mount();
    localStorage.setItem("lkbApiKey", "B");
    await late401("A");
    expect(shown()).toBe("none");
    expect(stored()).toBe("B");
  });

  test("tab A, 401 A, storage empty: drop tab key", async () => {
    localStorage.setItem("lkbApiKey", "A");
    mount();
    localStorage.removeItem("lkbApiKey");
    await late401("A");
    expect(shown()).toBe("none");
    expect(stored()).toBeNull();
  });

  test("CONTROL: tab B (storage B), late 401 A: stays logged in, B kept", async () => {
    localStorage.setItem("lkbApiKey", "A");
    mount();
    login("B");
    await late401("A");
    expect(shown()).toBe("B");
    expect(stored()).toBe("B");
  });

  test("case (a): tab B in memory only because setItem threw, storage empty, late 401 A: stays logged in", async () => {
    localStorage.setItem("lkbApiKey", "A");
    mount();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("private mode");
    });
    localStorage.removeItem("lkbApiKey");
    login("B");
    expect(stored()).toBeNull();
    await late401("A");
    expect(shown()).toBe("B");
  });

  test("case (b): tab B, another tab signed out and cleared storage, late 401 A: stays logged in", async () => {
    localStorage.setItem("lkbApiKey", "A");
    mount();
    login("B");
    localStorage.clear();
    await late401("A");
    expect(shown()).toBe("B");
    expect(stored()).toBeNull();
  });

  test("tab B, late 401 A, stale storage A: stays logged in, stored A (the failed key) is removed", async () => {
    localStorage.setItem("lkbApiKey", "A");
    mount();
    login("B");
    localStorage.setItem("lkbApiKey", "A");
    fire({ apiKey: "A" });
    expect(shown()).toBe("B");
    expect(stored()).toBeNull();
  });

  test("two back-to-back 401s for A (tab A, storage B): prompt, B kept", async () => {
    localStorage.setItem("lkbApiKey", "A");
    mount();
    localStorage.setItem("lkbApiKey", "B");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    await act(async () => {
      await Promise.all([apiFetch("/a", "A").catch(() => {}), apiFetch("/b", "A").catch(() => {})]);
    });
    expect(shown()).toBe("none");
    expect(stored()).toBe("B");
  });

  test("401 for A arriving after explicit sign-out: no crash, a key another tab stored is kept", async () => {
    localStorage.setItem("lkbApiKey", "A");
    mount();
    act(() => auth.clearApiKey());
    localStorage.setItem("lkbApiKey", "B");
    await late401("A");
    expect(shown()).toBe("none");
    expect(stored()).toBe("B");
  });

  test.each([[undefined], [null], [{}], [{ apiKey: 5 }], [{ apiKey: null }], [{ apiKey: "" }], [{ apiKey: { a: 1 } }]])(
    "event with no usable key (%j) is ignored: nothing dropped, nothing cleared",
    (detail) => {
      localStorage.setItem("lkbApiKey", "A");
      mount();
      fire(detail);
      expect(shown()).toBe("A");
      expect(stored()).toBe("A");
    },
  );

  test("current key is seen in the SAME tick as setApiKey (no stale closure)", () => {
    localStorage.setItem("lkbApiKey", "A");
    mount();
    act(() => {
      auth.setApiKey("B");
      window.dispatchEvent(new CustomEvent(AUTH_INVALIDATED_EVENT, { detail: { apiKey: "A" } }));
    });
    expect(shown()).toBe("B");
    expect(stored()).toBe("B");
  });

  test("current key is seen in the NEXT tick, and a 401 for B afterwards still logs out", () => {
    localStorage.setItem("lkbApiKey", "A");
    mount();
    login("B");
    fire({ apiKey: "A" });
    expect(shown()).toBe("B");
    fire({ apiKey: "B" });
    expect(shown()).toBe("none");
    expect(stored()).toBeNull();
  });

  test("a 403 for the tab's key clears nothing", async () => {
    localStorage.setItem("lkbApiKey", "A");
    mount();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));
    await act(async () => {
      await apiFetch("/sessions", "A").catch(() => {});
    });
    expect(shown()).toBe("A");
    expect(stored()).toBe("A");
  });

  test.each(["getItem", "setItem", "removeItem"] as const)("only %s throwing never crashes the provider", (method) => {
    localStorage.setItem("lkbApiKey", "A");
    vi.spyOn(Storage.prototype, method).mockImplementation(() => {
      throw new Error("denied");
    });
    mount();
    login("B");
    fire({ apiKey: "A" });
    expect(shown()).toBe("B");
    fire({ apiKey: "B" });
    expect(shown()).toBe("none");
    act(() => auth.clearApiKey());
    expect(shown()).toBe("none");
  });
});
