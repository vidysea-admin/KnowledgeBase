import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext.js";
import { apiFetch, AUTH_INVALIDATED_EVENT } from "../api/client.js";

function Probe() {
  const { apiKey, setApiKey, clearApiKey } = useAuth();
  return (
    <div>
      <span data-testid="key">{apiKey ?? "none"}</span>
      <button onClick={() => setApiKey("typed")}>set</button>
      <button onClick={clearApiKey}>clear</button>
    </div>
  );
}

function renderProbe() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

function fire(apiKey: string) {
  act(() => {
    window.dispatchEvent(new CustomEvent(AUTH_INVALIDATED_EVENT, { detail: { apiKey } }));
  });
}

describe("AuthProvider 401 handling (ISS-ISS260-001)", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  test("logout and same-key login fence the previous session's in-flight 401", async () => {
    localStorage.setItem("lkbApiKey", "typed"); renderProbe();
    let resolve!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((done) => { resolve = done; })));
    const oldRequest = apiFetch("/sessions", "typed").catch(() => {});
    act(() => { screen.getByText("clear").click(); });
    expect(screen.getByTestId("key")).toHaveTextContent("none");
    act(() => { screen.getByText("set").click(); });
    await act(async () => { resolve(new Response("{}", { status: 401 })); await oldRequest; });
    expect(screen.getByTestId("key")).toHaveTextContent("typed");
    expect(localStorage.getItem("lkbApiKey")).toBe("typed");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    await act(async () => { await apiFetch("/sessions", "typed").catch(() => {}); });
    expect(screen.getByTestId("key")).toHaveTextContent("none");
    expect(localStorage.getItem("lkbApiKey")).toBeNull();
  });

  test("recorded reproduction: tab 1 holds A, tab 2 stores B, late 401 for A leaves B in storage", async () => {
    localStorage.setItem("lkbApiKey", "A");
    renderProbe();
    expect(screen.getByTestId("key")).toHaveTextContent("A");
    localStorage.setItem("lkbApiKey", "B"); // tab 2 pastes key B; tab 1 state is still A
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    await act(async () => {
      await apiFetch("/sessions", "A").catch(() => {});
    });
    expect(localStorage.getItem("lkbApiKey")).toBe("B");
    // this tab returns to the prompt and does not adopt B
    expect(screen.getByTestId("key")).toHaveTextContent("none");
  });

  test("handler alone (event dispatched directly) also leaves a newer stored key", () => {
    localStorage.setItem("lkbApiKey", "A");
    renderProbe();
    localStorage.setItem("lkbApiKey", "B");
    fire("A");
    expect(localStorage.getItem("lkbApiKey")).toBe("B");
    expect(screen.getByTestId("key")).toHaveTextContent("none");
  });

  test("stored key equals the failed key: both storage and state are cleared", () => {
    localStorage.setItem("lkbApiKey", "A");
    renderProbe();
    fire("A");
    expect(localStorage.getItem("lkbApiKey")).toBeNull();
    expect(screen.getByTestId("key")).toHaveTextContent("none");
  });

  test("storage already empty: state is cleared, storage stays empty", () => {
    localStorage.setItem("lkbApiKey", "A");
    renderProbe();
    localStorage.removeItem("lkbApiKey");
    fire("A");
    expect(localStorage.getItem("lkbApiKey")).toBeNull();
    expect(screen.getByTestId("key")).toHaveTextContent("none");
  });

  test("event for a key that is neither this tab's nor the stored one is ignored", () => {
    localStorage.setItem("lkbApiKey", "A");
    renderProbe();
    fire("ZZZ");
    expect(localStorage.getItem("lkbApiKey")).toBe("A");
    expect(screen.getByTestId("key")).toHaveTextContent("A");
  });

  test("a throwing storage cannot crash the provider (mount, set, 401)", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("denied");
    });
    renderProbe();
    expect(screen.getByTestId("key")).toHaveTextContent("none");
    await act(async () => {
      screen.getByText("set").click();
    });
    expect(screen.getByTestId("key")).toHaveTextContent("typed");
    fire("typed");
    expect(screen.getByTestId("key")).toHaveTextContent("none");
  });

  test("a 403 does not clear the key or the state", async () => {
    localStorage.setItem("lkbApiKey", "A");
    renderProbe();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));
    await act(async () => {
      await apiFetch("/sessions", "A").catch(() => {});
    });
    expect(localStorage.getItem("lkbApiKey")).toBe("A");
    expect(screen.getByTestId("key")).toHaveTextContent("A");
  });
});
