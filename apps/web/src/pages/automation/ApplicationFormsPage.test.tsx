import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ApplicationFormsPage } from "./ApplicationFormsPage.js";
const state = vi.hoisted(() => ({ auth: { apiKey: "key-a" as string | null, sessionVersion: 1 }, fetch: vi.fn() }));
vi.mock("../../auth/AuthContext.js", () => ({ useAuth: () => state.auth }));
vi.mock("../../api/client.js", () => ({ apiFetch: state.fetch }));
const target = { id: "configured-target", version: "v1", requiredFields: ["courseRef"], allowedFields: ["courseRef"] };
let operations: { id: string; targetId: string; status: string; version: number; attempts: number; maxAttempts: number; incident: string | null; sideEffectUncertain: boolean; hasReceipt: boolean }[];
beforeEach(() => {
  state.auth = { apiKey: "key-a", sessionVersion: 1 }; state.fetch.mockReset();
  operations = [{ id: "operation-a", targetId: target.id, status: "draft", version: 1, attempts: 0, maxAttempts: 3, incident: null, sideEffectUncertain: false, hasReceipt: false }];
  state.fetch.mockImplementation(async (path: string, _key: string, options?: { body?: unknown }) => {
    if (path.endsWith("/targets")) return { targets: [target] };
    if (path.endsWith("/definitions")) return { definitions: [{ targetId: target.id, version: 1, enabled: true }] };
    if (path.endsWith("/operations")) return { operations: structuredClone(operations) };
    if (path.endsWith("/review")) return { review: { id: operations[0]!.id, version: operations[0]!.version, payloadDigest: "payload-fingerprint", targetFingerprint: "target-fingerprint", evidence: [{ name: "courseRef", source: { documentId: "source-doc", page: 1, start: 0, end: 4, revision: "a".repeat(64) } }] } };
    if (path.endsWith("/approve")) { expect(options?.body).toEqual({ expectedVersion: 1 }); operations[0]!.status = "approved"; operations[0]!.version = 2; return {}; }
    if (path.endsWith("/execute")) { expect(options?.body).toEqual({ expectedVersion: 2 }); operations[0]!.status = "succeeded"; return {}; }
    return {};
  });
});
afterEach(() => cleanup());
test("operator must review provenance before approval and execution stays bound to the current operation version", async () => {
  render(<ApplicationFormsPage />); await screen.findByText(/operation-a/);
  expect(screen.getByRole("button", { name: "Approve reviewed request" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Review source evidence" })); await screen.findByText(/source-doc/);
  fireEvent.click(screen.getByRole("button", { name: "Approve reviewed request" })); await screen.findByRole("button", { name: "Execute approved routine" });
  fireEvent.click(screen.getByRole("button", { name: "Execute approved routine" })); await screen.findByText(/succeeded/);
  expect(state.fetch.mock.calls.filter(([path]) => String(path).endsWith("/execute"))).toHaveLength(1);
});
test("uncertain side effects remain visible and cannot be presented as cancelled or successful", async () => {
  operations[0] = { ...operations[0]!, status: "waiting-for-operator", sideEffectUncertain: true, incident: "uncertain-side-effect", attempts: 1 };
  render(<ApplicationFormsPage />); await screen.findByText(/destination outcome is uncertain/);
  expect(screen.queryByRole("button", { name: "Cancel routine" })).toBeNull();
  expect(screen.getByRole("button", { name: "Verify destination receipt" })).toBeDisabled();
  expect(screen.queryByText(/succeeded/)).toBeNull();
});
test("credential generation changes discard protected field input and stale in-flight action results", async () => {
  const view = render(<ApplicationFormsPage />); await screen.findByText(/operation-a/);
  fireEvent.change(screen.getByLabelText("Application target"), { target: { value: target.id } });
  fireEvent.change(screen.getByLabelText("Value"), { target: { value: "PRIVATE-STUDENT-FIELD" } });
  let resolve!: (value: unknown) => void; const pending = new Promise(r => { resolve = r; });
  state.fetch.mockImplementationOnce(() => pending); fireEvent.click(screen.getByRole("button", { name: "Check stalled routines" }));
  state.auth = { apiKey: "key-b", sessionVersion: 2 }; operations = [];
  view.rerender(<ApplicationFormsPage />); await waitFor(() => expect(screen.queryByDisplayValue("PRIVATE-STUDENT-FIELD")).toBeNull());
  resolve({}); await waitFor(() => expect(screen.queryByText(/operation-a/)).toBeNull());
  expect(screen.queryByDisplayValue("PRIVATE-STUDENT-FIELD")).toBeNull();
});
test("canonical tenant-prefixed document IDs longer than eighty characters reach intake intact", async () => {
  render(<ApplicationFormsPage />); await screen.findByText(/operation-a/);
  fireEvent.change(screen.getByLabelText("Application target"), { target: { value: target.id } });
  const documentId = `${encodeURIComponent("tenant-" + "a".repeat(100))}:${"a".repeat(64)}`;
  const sourceInput = screen.getByLabelText("Source document") as HTMLInputElement;
  expect(documentId.length).toBeGreaterThan(80); expect(sourceInput.maxLength).toBe(2048);
  fireEvent.change(sourceInput, { target: { value: documentId } });
  fireEvent.change(screen.getByLabelText("Value"), { target: { value: "MATH" } });
  fireEvent.change(screen.getByLabelText("Unique request key"), { target: { value: "long-document" } });
  fireEvent.change(screen.getByLabelText("Verified source revision"), { target: { value: "a".repeat(64) } });
  fireEvent.submit(sourceInput.closest("form")!);
  await waitFor(() => expect(state.fetch.mock.calls.some(([path, _key, options]) => String(path).endsWith("/operations") && options?.body?.idempotencyKey === "long-document")).toBe(true));
  const call = state.fetch.mock.calls.find(([path, _key, options]) => String(path).endsWith("/operations") && options?.body?.idempotencyKey === "long-document")!;
  expect(call[2].body.fields[0].source.documentId).toBe(documentId);
});
