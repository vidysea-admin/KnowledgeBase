import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, test, expect } from "vitest";
import { AuthProvider } from "../auth/AuthContext.js";
import { SettingsPage } from "./SettingsPage.js";
import * as keysApi from "../api/keys.js";
import { ApiError } from "../api/client.js";

function renderPage() {
  localStorage.setItem("lkbApiKey", "test-key");
  return render(
    <AuthProvider>
      <SettingsPage />
    </AuthProvider>,
  );
}

describe("SettingsPage", () => {
  test("lists real existing keys, masked (no raw key/hash rendered)", async () => {
    vi.spyOn(keysApi, "listKeys").mockResolvedValue({
      keys: [{ _id: "k1", label: "My integration", scopes: ["ask"], createdAt: "2026-09-01T00:00:00Z", revokedAt: null }],
    });
    renderPage();
    await waitFor(() => expect(screen.getByText("My integration")).toBeInTheDocument());
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.queryByText(/^lkb_/)).not.toBeInTheDocument();
  });

  test("creating a key shows the raw value once, in a dismissible banner", async () => {
    vi.spyOn(keysApi, "listKeys").mockResolvedValue({ keys: [] });
    vi.spyOn(keysApi, "createKey").mockResolvedValue({ id: "k2", key: "lkb_realsecretvalue" });
    renderPage();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Label"), "New key");
    await user.click(screen.getByRole("button", { name: "Create key" }));
    await waitFor(() => expect(screen.getByText("lkb_realsecretvalue")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "I've copied it" }));
    expect(screen.queryByText("lkb_realsecretvalue")).not.toBeInTheDocument();
  });

  test("revoking a key calls the real API and refreshes the list", async () => {
    const listSpy = vi.spyOn(keysApi, "listKeys").mockResolvedValue({
      keys: [{ _id: "k1", label: "To revoke", scopes: ["ask"], createdAt: "2026-09-01T00:00:00Z", revokedAt: null }],
    });
    const revokeSpy = vi.spyOn(keysApi, "revokeKey").mockResolvedValue({ ok: true });
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Revoke" }));
    expect(revokeSpy).toHaveBeenCalledWith("test-key", "k1");
    await waitFor(() => expect(listSpy).toHaveBeenCalledTimes(2));
  });

  test("shows a real error, never silently swallows a failed create", async () => {
    vi.spyOn(keysApi, "listKeys").mockResolvedValue({ keys: [] });
    vi.spyOn(keysApi, "createKey").mockRejectedValue(new ApiError(403, "missing keys scope"));
    renderPage();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Label"), "New key");
    await user.click(screen.getByRole("button", { name: "Create key" }));
    await waitFor(() => expect(screen.getByText("missing keys scope")).toBeInTheDocument());
  });
});


test("jobs permission is explicit opt-in and only selected scopes are submitted", async () => {
  vi.spyOn(keysApi, "listKeys").mockResolvedValue({ keys: [] });
  const createSpy = vi.spyOn(keysApi, "createKey").mockResolvedValue({ id: "job-key", key: "fixture-created-key" });
  renderPage();
  const jobs = screen.getByRole("checkbox", { name: "jobs" });
  expect(jobs).not.toBeChecked();
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Label"), "Provider audit reader");
  await user.click(jobs);
  await user.click(screen.getByRole("checkbox", { name: "ask" }));
  await user.click(screen.getByRole("button", { name: "Create key" }));
  await waitFor(() => expect(createSpy).toHaveBeenCalledWith("test-key", "Provider audit reader", ["jobs"]));
});

test("actual App navigation mounts Provider jobs and calls the real typed client", async () => {
  const { App } = await import("../App.js");
  localStorage.setItem("lkbApiKey", "integration-key");
  window.history.replaceState(null, "", "/settings");
  vi.spyOn(keysApi, "listKeys").mockResolvedValue({ keys: [] });
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
    jobs: [{ _id: "audit-one", kind: "ask", status: "done", createdAt: "2026-10-09T12:00:00Z", provider: "fixture" }],
    limit: 50, truncated: false,
  }), { status: 200, headers: { "content-type": "application/json" } }));
  const rendered = render(<App />);
  try {
    await userEvent.setup().click(screen.getByRole("link", { name: "Provider jobs" }));
    expect(await screen.findByRole("heading", { name: "Provider jobs" })).toBeInTheDocument();
    expect(await screen.findByText(/ID: audit-one/)).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringMatching(/\/jobs\?limit=50$/), expect.objectContaining({
      headers: expect.objectContaining({ authorization: "Bearer integration-key" }),
    }));
    expect(window.location.pathname).toBe("/jobs");
    expect(screen.queryByText("integration-key")).not.toBeInTheDocument();
  } finally { rendered.unmount(); window.history.replaceState(null, "", "/"); }
});
