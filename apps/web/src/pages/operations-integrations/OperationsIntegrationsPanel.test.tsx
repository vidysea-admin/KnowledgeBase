import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { OperationsIntegrationsPanel } from "./OperationsIntegrationsPanel.js";
import { emptyConfiguration } from "./integrationFixtures.js";
const fetchMock = vi.fn();
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
test("actual public clients render disabled prerequisites and never fabricate delivery", async () => {
  fetchMock.mockImplementation((url: string) => Promise.resolve(response(url.endsWith("/preview") ? { exportScope: "session-metadata-only", returned: 0, ready: 0, truncated: false } : emptyConfiguration)));
  render(<OperationsIntegrationsPanel apiKey="fixture-key" />); await screen.findByRole("heading", { name: "Email digest" });
  expect(screen.getByRole("button", { name: "Run Email digest now" })).toBeDisabled(); expect(screen.getByLabelText("Enable Email digest schedule")).toBeDisabled();
  expect(screen.getAllByText(/last verified success: None/)).toHaveLength(2); expect(fetchMock).toHaveBeenCalledTimes(2);
});
test("Save and explicitly confirmed Run consume typed revisions and actual terminal status", async () => {
  const base = { ...emptyConfiguration.schedules[0]!, available: true }; let schedule = { ...base };
  fetchMock.mockImplementation((url: string, options: RequestInit) => {
    if (options.method === "PUT") { const body = JSON.parse(String(options.body)); expect(body).toEqual({ revision: 0, enabled: true, intervalHours: 168 }); schedule = { ...schedule, ...body, revision: 1, nextRunAt: "2026-10-21T00:00:00.000Z" } as typeof schedule; return Promise.resolve(response(schedule)); }
    if (options.method === "POST") { expect(JSON.parse(String(options.body))).toEqual({ revision: 1, confirm: "RUN_DIGEST" }); return Promise.resolve(response({ ...schedule, revision: 3, lastResult: "succeeded", runId: "a".repeat(64), lastAttemptAt: "2026-10-14T00:00:00.000Z", lastSuccessAt: "2026-10-14T00:00:00.000Z" })); }
    return Promise.resolve(response(url.endsWith("/preview") ? { exportScope: "session-metadata-only", returned: 500, ready: 1, truncated: true } : { ...emptyConfiguration, schedules: [base, emptyConfiguration.schedules[1]] }));
  });
  render(<OperationsIntegrationsPanel apiKey="fixture-key" />); await screen.findByLabelText("Enable Email digest schedule");
  fireEvent.click(screen.getByLabelText("Enable Email digest schedule")); fireEvent.change(screen.getByLabelText("Email digest frequency"), { target: { value: "168" } }); fireEvent.click(screen.getByRole("button", { name: "Save Email digest settings" }));
  await screen.findByText(/next run: 2026-10-21/); expect(screen.getByRole("button", { name: "Run Email digest now" })).toBeDisabled();
  fireEvent.click(screen.getByLabelText(/I confirm running Email digest now/)); fireEvent.click(screen.getByRole("button", { name: "Run Email digest now" })); await screen.findByText(/last verified success: 2026-10-14/);
  expect(fetchMock.mock.calls.every(call => String(call[0]).indexOf("fixture-key") === -1)).toBe(true);
});
test("uncertain terminal status is disabled and cannot be treated as success or blindly retried", async () => {
  fetchMock.mockImplementation((url: string) => Promise.resolve(response(url.endsWith("/preview") ? { exportScope: "session-metadata-only", returned: 0, ready: 0, truncated: false } : { ...emptyConfiguration, schedules: [{ ...emptyConfiguration.schedules[0], available: true, revision: 3, lastResult: "uncertain", lastErrorCode: "delivery-failed", runId: "a".repeat(64), lastAttemptAt: "2026-10-14T00:00:00.000Z" }, emptyConfiguration.schedules[1]] })));
  render(<OperationsIntegrationsPanel apiKey="fixture-key" />); await screen.findByText(/Delivery may have happened/); expect(screen.getByRole("button", { name: "Run Email digest now" })).toBeDisabled(); expect(screen.getByLabelText("Enable Email digest schedule")).toBeDisabled();
});
test("partial configuration failure and unmount preserve honest preview without late state", async () => {
  let resolve!: (response: Response) => void; const old = new Promise<Response>(done => { resolve = done; });
  fetchMock.mockImplementation((url: string) => url.endsWith("/preview") ? Promise.resolve(response({ exportScope: "session-metadata-only", returned: 1, ready: 0, truncated: false })) : old);
  const mounted = render(<OperationsIntegrationsPanel apiKey="fixture-key" />); await screen.findByText(/1 returned sessions in export preview/); mounted.unmount();
  await act(async () => resolve(response(emptyConfiguration))); expect(screen.queryByRole("heading", { name: "Email digest" })).not.toBeInTheDocument();
  fetchMock.mockResolvedValue(response({ message: "PRIVATE" }, 403)); render(<OperationsIntegrationsPanel apiKey="new" />); await screen.findAllByRole("alert"); expect(document.body.textContent).not.toContain("PRIVATE");
});
test("confirmed receipt reconciliation never resends and leaves verified schedule disabled", async () => {
  const uncertain = { ...emptyConfiguration.schedules[0]!, available: true, revision: 4, lastResult: "uncertain", runId: "a".repeat(64), lastAttemptAt: "2026-10-14T00:00:00.000Z", lastErrorCode: "delivery-failed" };
  let proof = false; const calls: string[] = [];
  fetchMock.mockImplementation((url: string, options: RequestInit) => {
    if (options.method === "POST") { calls.push(url); expect(url).toContain("/reconcile"); expect(JSON.parse(String(options.body))).toEqual({ revision: 4, confirm: "RECONCILE_DIGEST" }); return Promise.resolve(response(proof ? { ...uncertain, revision: 5, lastResult: "succeeded", lastErrorCode: null, lastSuccessAt: "2026-10-14T00:05:00.000Z" } : uncertain)); }
    return Promise.resolve(response(url.endsWith("/preview") ? { exportScope: "session-metadata-only", returned: 0, ready: 0, truncated: false } : { ...emptyConfiguration, schedules: [uncertain, emptyConfiguration.schedules[1]] }));
  });
  render(<OperationsIntegrationsPanel apiKey="fixture-key" />); await screen.findByText(/Delivery may have happened/); expect(screen.getByRole("button", { name: "Check Email digest receipt" })).toBeDisabled();
  fireEvent.click(screen.getByLabelText(/I confirm checking the prior Email digest receipt/)); fireEvent.click(screen.getByRole("button", { name: "Check Email digest receipt" })); await screen.findByText(/No matching verified receipt/);
  proof = true; fireEvent.click(screen.getByLabelText(/I confirm checking the prior Email digest receipt/)); fireEvent.click(screen.getByRole("button", { name: "Check Email digest receipt" })); await screen.findByText(/prior receipt was verified/);
  expect(screen.getByRole("button", { name: "Run Email digest now" })).toBeDisabled(); expect(calls).toHaveLength(2);
});
