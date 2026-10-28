import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { apiFetch, ApiError } from "../../api/client.js";
import { RegistrationPolicyPanel } from "./RegistrationPolicyPanel.js";
vi.mock("../../api/client.js", async () => { const m = await vi.importActual<typeof import("../../api/client.js")>("../../api/client.js"); return {...m, apiFetch: vi.fn()}; });
const api = vi.mocked(apiFetch), base = "/calendar/join-rules/registration-policy";
const policy = {version: 1, operator: {firstName: "Operator", lastName: "Test", email: "operator@example.org"},
  form: {mode: "native-html", formSelector: "#registration", submitSelector: "#submit", fields: {firstName: "#first", lastName: "#last", email: "#email"}},
  scope: {organizers: ["host@example.org"], domains: [], platforms: ["unknown"], allowedHosts: ["events.example.org"]},
  relevance: {includeTerms: ["career"], excludeTerms: ["sales"]}};
afterEach(() => {cleanup(); api.mockReset();});
test("operator explicitly loads, edits, saves then approves exact saved revision; dirty profile cannot be approved", async () => {
  let saved = {policy, approved: false, revision: "1".repeat(64)};
  api.mockImplementation((async (url: string, _key: string, opts?: any) => {
    if (opts?.method === "PUT") saved = {policy: opts.body.policy, approved: false, revision: "2".repeat(64)};
    if (url.endsWith("/approve")) saved = {...saved, approved: true, revision: "3".repeat(64)};
    return structuredClone(saved);
  }) as never);
  render(<RegistrationPolicyPanel apiKey="scope-key" />); expect(api).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", {name: "Load registration policy"}));
  await screen.findByLabelText("Registration email");
  fireEvent.change(screen.getByLabelText("First name"), {target: {value: "Updated"}});
  fireEvent.change(screen.getByLabelText("Organization (optional)"), {target: {value: "Fixture organization"}});
  fireEvent.change(screen.getByLabelText("Organization field selector"), {target: {value: "#organization"}});
  expect(screen.getByRole("button", {name: "Approve this saved profile and scope"})).toBeDisabled();
  fireEvent.click(screen.getByRole("button", {name: "Save profile and scope"}));
  await waitFor(() => expect(screen.getByRole("button", {name: "Approve this saved profile and scope"})).toBeEnabled());
  fireEvent.click(screen.getByRole("button", {name: "Approve this saved profile and scope"}));
  await screen.findByText("Approved for registration within this scope.");
  expect(saved.policy.operator).toMatchObject({organization: "Fixture organization"});
  expect(saved.policy.form.fields).toMatchObject({organization: "#organization"});
  expect(api.mock.calls.at(-1)).toEqual([`${base}/approve`, "scope-key", {method: "POST", body: {expectedRevision: "2".repeat(64)}}]);
  expect(screen.getByText(/it does not mean registration succeeded/)).toBeInTheDocument();
});
test("missing scope and unavailable policy give honest refusal without showing profile fields", async () => {
  api.mockRejectedValue(new ApiError(403, "forbidden"));
  render(<RegistrationPolicyPanel apiKey="read-only-key" />);
  fireEvent.click(screen.getByRole("button", {name: "Load registration policy"}));
  await screen.findByText(/needs the join-rules scope/);
  expect(screen.queryByLabelText("Registration email")).not.toBeInTheDocument();
});
test("stale approval shows reload requirement and never claims approved", async () => {
  api.mockResolvedValueOnce({policy, approved: false, revision: "1".repeat(64)});
  api.mockRejectedValueOnce(new ApiError(412, "changed"));
  render(<RegistrationPolicyPanel apiKey="scope-key" />);
  fireEvent.click(screen.getByRole("button", {name: "Load registration policy"})); await screen.findByLabelText("Registration email");
  fireEvent.click(screen.getByRole("button", {name: "Approve this saved profile and scope"}));
  await screen.findByText(/Reload before approving/);
  expect(screen.queryByText("Approved for registration within this scope.")).not.toBeInTheDocument();
});
test("key switch immediately hides old operator PII and late old response cannot pin new session busy", async () => {
  let finish!: (value: unknown) => void;
  api.mockResolvedValueOnce({policy, approved: false, revision: "1".repeat(64)});
  const {rerender} = render(<RegistrationPolicyPanel apiKey="tenant-a" />);
  fireEvent.click(screen.getByRole("button", {name: "Load registration policy"})); await screen.findByLabelText("Registration email");
  api.mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}) as never);
  fireEvent.click(screen.getByRole("button", {name: "Reload registration policy"}));
  rerender(<RegistrationPolicyPanel apiKey="tenant-b" />);
  expect(screen.queryByDisplayValue("operator@example.org")).not.toBeInTheDocument();
  expect(screen.getByRole("button", {name: "Load registration policy"})).toBeEnabled();
  await act(async () => {finish({policy, approved: true, revision: "2".repeat(64)});});
  expect(screen.queryByDisplayValue("operator@example.org")).not.toBeInTheDocument();
  expect(screen.getByRole("button", {name: "Load registration policy"})).toBeEnabled();
});
