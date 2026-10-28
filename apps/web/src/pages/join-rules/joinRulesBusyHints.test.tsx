import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ApiError, apiFetch } from "../../api/client.js";
import { AuthProvider } from "../../auth/AuthContext.js";
import { JoinRulesPage } from "./JoinRulesPage.js";
import { BUSY_ERROR_CODE, classify, optOutBody, postPending } from "./joinRulesClient.js";

vi.mock("../../api/client.js", async orig => ({ ...(await orig<typeof import("../../api/client.js")>()), apiFetch: vi.fn() }));
const api = vi.mocked(apiFetch);
const VIEW = { ruleSet: { version: 1, ownDomains: [], rules: [{ id: "r1", effect: "allow", match: { platform: "zoom" } }] }, state: { approvedSenders: [], approvedDomains: [], optedOutEventIds: [] } };
const BUSY_MSG = "Join rules are busy (another change is in progress). Wait a few seconds and try again.";
const UNAVAILABLE_MSG = "Rule editing is not available on this server yet.";
let getFail: ApiError[]; let putFail: ApiError[];
const writes = () => api.mock.calls.filter(c => c[2]?.method !== undefined && c[2].method !== "GET");

beforeEach(() => {
  getFail = []; putFail = []; api.mockReset();
  api.mockImplementation((async (_path: string, _k: string | null, opts?: { method?: string; onResponseHeaders?: (h: Headers) => void }) => {
    const f = (opts?.method === "PUT" ? putFail : opts?.method === "POST" ? [] : getFail).shift();
    if (f) throw f;
    if (opts?.method !== "POST") opts?.onResponseHeaders?.(new Headers({ etag: '"e1"' }));
    return opts?.method === "POST" ? { state: VIEW.state } : structuredClone(VIEW);
  }) as never);
  localStorage.setItem("lkbApiKey", "sample-key");
});
afterEach(() => { cleanup(); localStorage.clear(); vi.useRealTimers(); });
const mount = () => render(<AuthProvider><JoinRulesPage /></AuthProvider>);
const alerts = () => screen.getAllByRole("alert").map(a => a.textContent).join(" | ");
const optOut = (id: string) => {
  fireEvent.change(screen.getByLabelText("Event id to opt out of"), { target: { value: id } });
  fireEvent.click(screen.getByRole("button", { name: "Opt out of event…" })); fireEvent.click(screen.getByRole("button", { name: "Confirm opt-out" }));
};

// ---- ISS-T037OPT-002: what the opt-out request carries
test("hints present: the opt-out body carries meetingUrl and sessionKey under the router's key names, trimmed", () => {
  expect(optOutBody("evt-1", { meetingUrl: " https://meet.example.com/abc ", sessionKey: "sess-9" })).toEqual({ eventId: "evt-1", meetingUrl: "https://meet.example.com/abc", sessionKey: "sess-9" });
  void postPending("k", "optout", "evt-1", { meetingUrl: "https://meet.example.com/abc" });
  expect(api).toHaveBeenLastCalledWith("/calendar/join-rules/opt-outs", "k", { method: "POST", body: { eventId: "evt-1", meetingUrl: "https://meet.example.com/abc" } });
});

test("hints absent, empty, blank or non-string: the keys are omitted, never fabricated", () => {
  for (const h of [undefined, {}, { meetingUrl: "", sessionKey: "  " }, { meetingUrl: 5 as never, sessionKey: null as never }]) expect(optOutBody("evt-1", h)).toEqual({ eventId: "evt-1" });
});

test("the body contains only allow-listed keys even when extra properties are passed", () => {
  const body = optOutBody("evt-1", { meetingUrl: "https://m.example.com/x", sessionKey: "s", token: "leak", eventId: "other" } as never);
  expect(Object.keys(body).sort()).toEqual(["eventId", "meetingUrl", "sessionKey"]);
  expect(body.eventId).toBe("evt-1");
});

test("approvals never carry meeting hints", () => {
  void postPending("k", "sender", "a@example.com", { meetingUrl: "https://m.example.com/x" });
  expect(api).toHaveBeenLastCalledWith("/calendar/join-rules/approvals", "k", { method: "POST", body: { kind: "sender", value: "a@example.com" } });
});

test("the page's opt-out (event id only, the editor has no URL or session key) sends exactly { eventId }", async () => {
  mount(); await screen.findByLabelText("Rule 1 name");
  optOut("evt-77"); await screen.findByText("Opted out of event evt-77.");
  expect(writes()).toHaveLength(1);
  expect(writes()[0]![0]).toBe("/calendar/join-rules/opt-outs");
  expect(writes()[0]![2]!.body).toEqual({ eventId: "evt-77" });
});

// ---- ISS-WEBHINTS-001: the opt-out UI supplies meetingUrl
const link = (v: string) => fireEvent.change(screen.getByLabelText("Meeting link for the opt-out (optional)"), { target: { value: v } });
test("ISS-WEBHINTS-001: a typed meeting link is sent as meetingUrl with the opt-out and shown in the confirmation", async () => {
  mount(); await screen.findByLabelText("Rule 1 name");
  link(" https://meet.example.com/abc ");
  fireEvent.change(screen.getByLabelText("Event id to opt out of"), { target: { value: "evt-5" } });
  fireEvent.click(screen.getByRole("button", { name: "Opt out of event…" }));
  expect(screen.getByRole("alertdialog").textContent).toContain("https://meet.example.com/abc");
  fireEvent.click(screen.getByRole("button", { name: "Confirm opt-out" })); await screen.findByText("Opted out of event evt-5.");
  expect(writes()[0]![2]!.body).toEqual({ eventId: "evt-5", meetingUrl: "https://meet.example.com/abc" });
});

test.each(["not a url", "javascript:alert(1)", "ftp://x.example/a", "https://x.example/" + "a".repeat(2048), "https://user:pw@host/", "https://user@host/", "https://host/a\u0001b", "https://host/a\u0085b"])("ISS-WEBHINTS-001: an unusable meeting link %# is refused before anything is sent", async bad => {
  mount(); await screen.findByLabelText("Rule 1 name");
  link(bad); fireEvent.change(screen.getByLabelText("Event id to opt out of"), { target: { value: "evt-5" } });
  fireEvent.click(screen.getByRole("button", { name: "Opt out of event…" }));
  expect(screen.getByRole("alert").textContent).toContain("meeting link");
  expect(screen.queryByRole("button", { name: "Confirm opt-out" })).toBeNull(); expect(writes()).toHaveLength(0);
});

test("ISS-WEBHINTS-001: a link typed for the opt-out never rides on an approval", async () => {
  mount(); await screen.findByLabelText("Rule 1 name");
  link("https://meet.example.com/abc");
  fireEvent.change(screen.getByLabelText("Sender to approve"), { target: { value: "a@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Approve sender…" })); fireEvent.click(screen.getByRole("button", { name: "Confirm approval" }));
  await screen.findByText("Approved a@example.com.");
  expect(writes()[0]![2]!.body).toEqual({ kind: "sender", value: "a@example.com" });
});

// ---- ISS-WEBHINTS-002: the 60 s cap and timer cleanup
test("ISS-WEBHINTS-002: Retry-After 999999 is capped: Retry disabled at 59 s, enabled by 61 s", async () => {
  getFail = [new ApiError(503, "busy", { code: "join_rules_busy", retryAfterSeconds: 999999 })];
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mount(); await screen.findByRole("button", { name: "Retry" });
  await act(async () => { vi.advanceTimersByTime(59000); });
  expect(screen.getByRole("button", { name: "Retry" })).toBeDisabled();
  await act(async () => { vi.advanceTimersByTime(2000); });
  expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
});

test("ISS-WEBHINTS-002: unmounting during the wait leaves no timer behind", async () => {
  getFail = [new ApiError(503, "busy", { code: "join_rules_busy", retryAfterSeconds: 30 })];
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const baseline = vi.getTimerCount();
  const view = mount(); await screen.findByRole("button", { name: "Retry" });
  expect(vi.getTimerCount()).toBeGreaterThan(baseline);
  view.unmount();
  expect(vi.getTimerCount()).toBe(baseline);
});

// ---- ISS-JRLOCK-002: busy is the status + code, never the message text
test("busy (503 + join_rules_busy) on save shows the busy message", async () => {
  mount(); await screen.findByLabelText("Rule 1 name");
  fireEvent.change(screen.getByLabelText("Rule 1 name"), { target: { value: "kept" } });
  putFail = [new ApiError(503, "join rules are busy; try again in a few seconds", { code: "join_rules_busy" })];
  fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
  await waitFor(() => expect(alerts()).toBe(BUSY_MSG));
});

test("ISS-JRLOCK-002 recorded reproduction: api message changed to 'join rules are busy, retry shortly' still shows busy, not 'not available'", async () => {
  mount(); await screen.findByLabelText("Rule 1 name");
  fireEvent.change(screen.getByLabelText("Rule 1 name"), { target: { value: "kept" } });
  putFail = [new ApiError(503, "join rules are busy, retry shortly", { code: "join_rules_busy" })];
  fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
  await waitFor(() => expect(alerts()).toBe(BUSY_MSG));
  expect(alerts()).not.toContain("not available");
});

test("ISS-JRLOCK-002 (c)/(d): busy on initial LOAD shows the busy text and an enabled Retry button", async () => {
  getFail = [new ApiError(503, "anything", { code: "join_rules_busy" })];
  mount(); await screen.findByRole("alert");
  expect(alerts()).toBe(BUSY_MSG);
  expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
});

test("ISS-JRLOCK-002 (a): the busy code literal the web compares against is the api's literal", () => {
  expect(BUSY_ERROR_CODE).toBe("join_rules_busy");
});

test("the old busy message text WITHOUT the code is not busy", () => {
  expect(classify(new ApiError(503, "join rules are busy; try again in a few seconds")).failure).toBe("unavailable");
});

test("503 with the other code (no store configured) shows the unavailable message and no retry", async () => {
  getFail = [new ApiError(503, "x", { code: "join_rules_unavailable" })];
  mount(); await screen.findByRole("alert");
  expect(alerts()).toBe(UNAVAILABLE_MSG); expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
});

test("the busy code is compared exactly: upper-case or padded variants are not busy", () => {
  expect(classify(new ApiError(503, "m", { code: "JOIN_RULES_BUSY" })).failure).toBe("unavailable");
  expect(classify(new ApiError(503, "m", { code: "join_rules_busy " })).failure).toBe("unavailable");
});

test("the busy code on a non-503 status is not busy", () => {
  expect(classify(new ApiError(500, "m", { code: "join_rules_busy" })).failure).toBe("failed");
});

test("500 is the generic failure on load and on save", async () => {
  getFail = [new ApiError(500, "boom", { code: "join_rules_busy" })];
  mount(); await screen.findByRole("alert");
  expect(alerts()).toBe("Unable to load join rules.");
  fireEvent.click(screen.getByRole("button", { name: "Retry" })); await screen.findByLabelText("Rule 1 name");
  fireEvent.change(screen.getByLabelText("Rule 1 name"), { target: { value: "kept" } });
  putFail = [new ApiError(500, "boom")];
  fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
  await waitFor(() => expect(alerts()).toContain("The change could not be saved."));
});

test("Retry-After is a minimum delay for the Retry control: disabled until it elapses, no automatic retry", async () => {
  getFail = [new ApiError(503, "busy", { code: "join_rules_busy", retryAfterSeconds: 5 })];
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mount(); const retry = await screen.findByRole("button", { name: "Retry" });
  expect(retry).toBeDisabled();
  await act(async () => { vi.advanceTimersByTime(4900); });
  expect(screen.getByRole("button", { name: "Retry" })).toBeDisabled();
  await act(async () => { vi.advanceTimersByTime(200); });
  expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  expect(api).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Retry" })); await screen.findByLabelText("Rule 1 name");
});
