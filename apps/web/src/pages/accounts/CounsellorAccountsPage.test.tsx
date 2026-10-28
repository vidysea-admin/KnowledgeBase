import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CounsellorAccountsPage } from "./CounsellorAccountsPage.js";
const state = vi.hoisted(() => ({ key: "owner-token", accounts: [] as any[], calls: [] as any[], failure: "", auditGate: null as Promise<void> | null }));
vi.mock("../../auth/AuthContext.js", () => ({ useAuth: () => ({ apiKey: state.key }) }));
vi.mock("../../api/client.js", () => {
  class ApiError extends Error { constructor(public status: number, message: string, public code?: string) { super(message); } }
  return { ApiError, apiFetch: async (path: string, key: string, options: any = {}) => {
    state.calls.push({ path, key, options });
    if (state.failure && options.method) throw new ApiError(409, state.failure, state.failure);
    if (path === "/counsellor-accounts/identities") return { keyIds: ["identity-1"] };
    if (path === "/counsellor-accounts/audit") { if (state.auditGate) await state.auditGate; return { audit: [{ sequence: 1, at: "2026-10-14", actorId: "owner-id", operation: "account.create", target: "a", outcome: "committed" }] }; }
    if (path === "/hosting/audit") return { records: [{ sequence: 1, at: "2026-10-14", actorId: "owner-id", operation: "role.set", target: "identity-1", outcome: "success" }] };
    if (path === "/counsellor-accounts" && options.method === "POST") {
      state.accounts.push({ id: "a", ...options.body, revision: 1, status: "active", role: null }); return { account: state.accounts[0] };
    }
    if (path.endsWith("/role")) { state.accounts = state.accounts.map(a => ({ ...a, role: options.body.role })); return { ok: true }; }
    if (path.endsWith("/deactivate")) { state.accounts = state.accounts.map(a => ({ ...a, revision: a.revision + 1, status: "inactive", role: null })); return { account: state.accounts[0] }; }
    return { accounts: [...state.accounts] };
  } };
});
beforeEach(() => { state.key = "owner-token"; state.accounts = []; state.calls = []; state.failure = ""; state.auditGate = null; });
afterEach(cleanup);
describe("accounts workflow", () => {
  it("creates linked profile, grants current revision, deactivates with live refresh and reads both audits", async () => {
    render(<CounsellorAccountsPage />);
    await screen.findByText("Create account", { selector: "h2" });
    fireEvent.change(screen.getByLabelText("Name", { exact: true }), { target: { value: "Counsellor" } });
    fireEvent.change(screen.getByLabelText("Email", { exact: true }), { target: { value: "c@example.com" } });
    fireEvent.change(screen.getByLabelText("Existing identity"), { target: { value: "identity-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await screen.findByRole("heading", { name: "Counsellor" });
    fireEvent.change(screen.getByLabelText("Role for Counsellor"), { target: { value: "viewer" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply access" }));
    await screen.findByText(/Current access: viewer/);
    expect(state.calls.find(c => c.path.endsWith("/role")).options.body).toEqual({ expectedRevision: 1, role: "viewer" });
    fireEvent.click(screen.getByRole("button", { name: "Deactivate and revoke access" }));
    await screen.findByText(/inactive · Current access: no role/);
    expect(screen.getByRole("button", { name: "Apply access" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Load profile and access audit" }));
    await screen.findByText(/owner-id · role.set/); expect(screen.getByText(/owner-id · account.create/)).toBeTruthy();
    expect(state.calls.every(c => c.key === "owner-token")).toBe(true);
    expect(state.calls.every(c => !("tenantId" in (c.options.body ?? {})))).toBe(true);
  });
  it("surfaces stale revision error without claiming saved mutation", async () => {
    state.accounts = [{ id: "a", keyId: "identity-1", displayName: "Counsellor", email: "c@example.com", revision: 2, status: "active", role: "viewer" }];
    render(<CounsellorAccountsPage />); await screen.findByRole("heading", { name: "Counsellor" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Apply access" })).not.toBeDisabled());
    state.failure = "account_revision_conflict";
    fireEvent.click(screen.getByRole("button", { name: "Apply access" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("account_revision_conflict");
    expect(screen.queryByText("Change saved.")).toBeNull();
  });
  it("discards delayed tenant audit after an identity change and releases old busy state", async () => {
    const ui = render(<CounsellorAccountsPage />); await screen.findByText("No counsellor accounts for this tenant.");
    let release!: () => void; state.auditGate = new Promise<void>(resolve => { release = resolve; });
    fireEvent.click(screen.getByRole("button", { name: "Load profile and access audit" }));
    state.key = "other-tenant-token"; ui.rerender(<CounsellorAccountsPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Refresh accounts" })).not.toBeDisabled());
    release();
    await waitFor(() => expect(state.calls.some(c => c.path === "/hosting/audit")).toBe(true));
    expect(screen.queryByText(/owner-id · account.create/)).toBeNull();
    expect(screen.queryByText(/owner-id · role.set/)).toBeNull();
  });
});
