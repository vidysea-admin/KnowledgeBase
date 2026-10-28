// D-015: verbatim replays of ISS-WEBAUTH-002's two recorded reproductions (real AuthProvider + LoginGate).
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AuthProvider, useAuth, type AuthContextValue } from "./AuthContext.js";
import { LoginGate } from "./LoginGate.js";
import { AUTH_INVALIDATED_EVENT } from "../api/client.js";

let auth: AuthContextValue;
function Probe() {
  auth = useAuth();
  return <span data-testid="key">{auth.apiKey}</span>;
}
const late401ForA = () =>
  act(() => {
    window.dispatchEvent(new CustomEvent(AUTH_INVALIDATED_EVENT, { detail: { apiKey: "A" } }));
  });
async function typeB() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("API key"), "B");
  await user.click(screen.getByRole("button", { name: "Continue" }));
}

describe("ISS-WEBAUTH-002 recorded reproductions", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  test("(1) setItem throws, key B typed at the gate, late 401 for A: tab keeps B", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("x");
    });
    render(<AuthProvider><LoginGate><Probe /></LoginGate></AuthProvider>);
    await typeB();
    expect(screen.getByTestId("key")).toHaveTextContent("B");
    late401ForA();
    expect(screen.getByTestId("key")).toHaveTextContent("B");
  });

  test("(2) storage A, sign out, log in B, localStorage.clear() (other tab), late 401 for A: tab keeps B", async () => {
    localStorage.setItem("lkbApiKey", "A");
    render(<AuthProvider><LoginGate><Probe /></LoginGate></AuthProvider>);
    act(() => auth.clearApiKey());
    await typeB();
    expect(screen.getByTestId("key")).toHaveTextContent("B");
    localStorage.clear();
    late401ForA();
    expect(screen.getByTestId("key")).toHaveTextContent("B");
    expect(localStorage.getItem("lkbApiKey")).toBeNull();
  });
});
