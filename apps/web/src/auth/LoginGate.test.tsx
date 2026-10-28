import { cleanup, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext.js";
import { LoginGate } from "./LoginGate.js";
import { apiFetch } from "../api/client.js";

function renderGate() {
  return render(
    <AuthProvider>
      <LoginGate>
        <div>real protected content</div>
      </LoginGate>
    </AuthProvider>,
  );
}

function SessionLoadProbe() {
  const { apiKey } = useAuth();
  useEffect(() => {
    void apiFetch("/sessions", apiKey).catch(() => {});
  }, [apiKey]);
  return null;
}

describe("LoginGate", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  test("hides children until a key is submitted", () => {
    renderGate();
    expect(screen.queryByText("real protected content")).not.toBeInTheDocument();
    expect(screen.getByLabelText("API key")).toBeInTheDocument();
  });

  test("submitting a key reveals children and persists the key to localStorage", async () => {
    renderGate();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("API key"), "real-key-123");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("real protected content")).toBeInTheDocument();
    expect(localStorage.getItem("lkbApiKey")).toBe("real-key-123");
  });

  test("an already-stored key skips the gate on next render", () => {
    localStorage.setItem("lkbApiKey", "already-there");
    renderGate();
    expect(screen.getByText("real protected content")).toBeInTheDocument();
  });

  test("an invalid stored key returns to login gate after API 401", async () => {
    localStorage.setItem("lkbApiKey", "stale-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "invalid api key" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    render(
      <AuthProvider>
        <LoginGate>
          <SessionLoadProbe />
          <div>real protected content</div>
        </LoginGate>
      </AuthProvider>,
    );

    expect(screen.getByText("real protected content")).toBeInTheDocument();
    expect(await screen.findByLabelText("API key")).toBeInTheDocument();
    expect(localStorage.getItem("lkbApiKey")).toBeNull();
  });
  test("[C1] a rejected key shows the server's 401 message on the login form", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "API key revoked or unknown" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    render(
      <AuthProvider>
        <LoginGate>
          <SessionLoadProbe />
          <div>real protected content</div>
        </LoginGate>
      </AuthProvider>,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("API key"), "wrong-key");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("API key revoked or unknown");
    expect(screen.getByLabelText("API key")).toBeInTheDocument();
  });

  test("[C2] a 401 with no usable body falls back to a plain 'key not accepted' message, and a fresh gate shows no alert", async () => {
    renderGate();
    expect(screen.queryByRole("alert")).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 401 })));
    cleanup();
    render(
      <AuthProvider>
        <LoginGate>
          <SessionLoadProbe />
          <div>real protected content</div>
        </LoginGate>
      </AuthProvider>,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("API key"), "wrong-key");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That API key was not accepted.");
  });
});
