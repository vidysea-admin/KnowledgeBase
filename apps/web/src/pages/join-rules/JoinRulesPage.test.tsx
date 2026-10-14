import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "../../App.js";
import { ApiError, apiFetch } from "../../api/client.js";
import { AuthProvider } from "../../auth/AuthContext.js";
import { JoinRulesPage } from "./JoinRulesPage.js";
import pageSource from "./JoinRulesPage.tsx?raw";
import approvalsSource from "./ApprovalsPanel.tsx?raw";
import editorSource from "./RuleSetEditor.tsx?raw";

vi.mock("../../api/client.js", async orig => ({ ...(await orig<typeof import("../../api/client.js")>()), apiFetch: vi.fn() }));
const api = vi.mocked(apiFetch);

interface Server { etag: string | null; ruleSet: unknown; state: { approvedSenders: string[]; approvedDomains: string[]; optedOutEventIds: string[] } }
const initial = (): Server => ({
  etag: '"e1"',
  ruleSet: { version: 1, ownDomains: ["corp.example.com"], rules: [
    { id: "allow-asha", effect: "allow", match: { email: "asha@example.com" } },
    { id: "deny-zoom-external", effect: "deny", match: { platform: "zoom", scope: "external" } },
  ] },
  state: { approvedSenders: ["trusted@example.org"], approvedDomains: ["partner.example.net"], optedOutEventIds: ["evt-42"] },
});
let server: Server;
let version = 1;
/** Per "METHOD path" failures: a status number (ApiError) or consumed once per entry. */
let failures: Record<string, { status: number; message?: string; code?: string }[]>;
const calls = () => api.mock.calls.map(c => ({ path: c[0], method: c[2]?.method ?? "GET", body: c[2]?.body }));
const putHeaders = () => api.mock.calls.filter(c => c[2]?.method === "PUT").map(c => c[2]?.headers);
const writes = () => calls().filter(c => c.method !== "GET");

beforeEach(() => {
  server = initial(); failures = {}; version = 1;
  api.mockReset();
  api.mockImplementation((async (path: string, _key: string | null, opts?: { method?: string; body?: unknown; headers?: Record<string, string>; onResponseHeaders?: (h: Headers) => void }) => {
    const id = `${opts?.method ?? "GET"} ${path}`;
    const fail = failures[id]?.shift();
    if (fail) throw new ApiError(fail.status, fail.message ?? `HTTP ${fail.status}`, { code: fail.code });
    const body = opts?.body as Record<string, string> | undefined;
    if (id === "PUT /calendar/join-rules") {
      const ifMatch = opts?.headers?.["If-Match"], ifNone = opts?.headers?.["If-None-Match"];
      if (ifMatch === undefined && ifNone === undefined) throw new ApiError(428, "precondition required", { code: "precondition-required" });
      if (ifMatch !== undefined ? ifMatch !== server.etag : server.etag !== null) throw new ApiError(412, "precondition failed", { code: "precondition-failed" });
      server.ruleSet = body; server.etag = `"e${++version}"`;
      opts?.onResponseHeaders?.(new Headers({ etag: server.etag }));
      return structuredClone(server);
    }
    if (id === "POST /calendar/join-rules/approvals") { server.state[body!.kind === "sender" ? "approvedSenders" : "approvedDomains"].push(body!.value!); return { state: server.state }; }
    if (id === "POST /calendar/join-rules/opt-outs") { server.state.optedOutEventIds.push(body!.eventId!); return { state: server.state }; }
    if (server.etag !== null) opts?.onResponseHeaders?.(new Headers({ etag: server.etag }));
    return structuredClone(server);
  }) as never);
  localStorage.setItem("lkbApiKey", "sample-key");
});
afterEach(() => { cleanup(); localStorage.clear(); window.history.replaceState(null, "", "/"); });
const mount = () => render(<AuthProvider><JoinRulesPage /></AuthProvider>);
const ready = async () => { mount(); await screen.findByLabelText("Rule 1 name"); };
const alerts = () => screen.getAllByRole("alert").map(a => a.textContent).join(" | ");

test("loads and renders rules, approved senders and domains, and opted-out events from GET", async () => {
  await ready();
  expect(calls()).toEqual([{ path: "/calendar/join-rules", method: "GET", body: undefined }]);
  expect(screen.getByLabelText("Rule 1 name")).toHaveValue("allow-asha");
  expect(screen.getByLabelText("Rule 1 sender")).toHaveValue("asha@example.com");
  expect(screen.getByLabelText("Rule 2 effect")).toHaveValue("deny");
  expect(screen.getByLabelText("Rule 2 platform")).toHaveValue("zoom");
  expect(screen.getByLabelText("Rule 2 scope")).toHaveValue("external");
  expect(screen.getByLabelText("Own domains")).toHaveValue("corp.example.com");
  expect(within(screen.getByRole("region", { name: "Approved senders" })).getByText("trusted@example.org")).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Approved domains" })).getByText("partner.example.net")).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Opted-out events" })).getByText("evt-42")).toBeInTheDocument();
});

test("empty tenant shows explicit empty states", async () => {
  server.etag = null; server.ruleSet = { version: 1, ownDomains: [], rules: [] }; server.state = { approvedSenders: [], approvedDomains: [], optedOutEventIds: [] };
  mount(); await screen.findByText(/There are no rules/);
  expect(screen.getByText("No sender is approved.")).toBeInTheDocument(); expect(screen.getByText("No domain is approved.")).toBeInTheDocument(); expect(screen.getByText("No event is opted out.")).toBeInTheDocument();
});

test("edit and save sends ONLY the rule set (no state, no tenant), sends a precondition, then re-fetches and shows the server's answer", async () => {
  await ready();
  fireEvent.change(screen.getByLabelText("Rule 1 name"), { target: { value: "allow-asha-renamed" } });
  fireEvent.change(screen.getByLabelText("Rule 1 domain"), { target: { value: "Example.com" } });
  fireEvent.click(screen.getByLabelText("Rule 1 include subdomains"));
  fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
  fireEvent.change(screen.getByLabelText("Rule 3 platform"), { target: { value: "teams" } });
  fireEvent.click(screen.getByRole("button", { name: "Remove rule 2" }));
  fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
  await screen.findByText(/Saved\. The rules shown are the server's current answer/);
  expect(calls().map(c => `${c.method} ${c.path}`)).toEqual(["GET /calendar/join-rules", "PUT /calendar/join-rules", "GET /calendar/join-rules"]);
  const expected = { version: 1, ownDomains: ["corp.example.com"], rules: [
    { id: "allow-asha-renamed", effect: "allow", match: { email: "asha@example.com", domain: "Example.com", subdomains: false } },
    { id: "rule-3", effect: "allow", match: { platform: "teams" } },
  ] };
  const put = writes()[0]!;
  expect(put.body).toEqual(expected);
  expect(Object.keys(put.body as object)).toEqual(["version", "ownDomains", "rules"]);
  expect(JSON.stringify(put.body)).not.toMatch(/state|tenant|approved|optedOut/i);
  expect(writes()).toHaveLength(1);
  // The page now shows what the SERVER holds (the fake stored the body verbatim), and approvals/opt-outs are untouched.
  expect(screen.getByLabelText("Rule 1 name")).toHaveValue("allow-asha-renamed");
  expect(screen.queryByLabelText("Rule 3 name")).toBeNull();
  expect(screen.getByText("trusted@example.org")).toBeInTheDocument(); expect(screen.getByText("evt-42")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save rules" })).toBeDisabled();
});

test("client validation blocks an invalid rule set and sends nothing", async () => {
  await ready();
  fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
  fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
  expect(await screen.findByLabelText("Problems with the rules")).toHaveTextContent("Rule 3: needs at least one matcher");
  fireEvent.change(screen.getByLabelText("Rule 3 domain"), { target: { value: "*.example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
  expect(await screen.findByLabelText("Problems with the rules")).toHaveTextContent("Wildcards like *.example.com are not allowed");
  expect(calls()).toHaveLength(1); // only the initial GET
});

test("sender approval: confirmation names the sender and says no human click; cancel sends nothing; confirm POSTs and re-fetches", async () => {
  await ready();
  fireEvent.change(screen.getByLabelText("Sender to approve"), { target: { value: " New@Example.com " } });
  fireEvent.click(screen.getByRole("button", { name: "Approve sender…" }));
  const dialog = screen.getByRole("alertdialog", { name: "Confirm change" });
  expect(dialog).toHaveTextContent("Approving New@Example.com records that, once enforcement is switched on, the bot joins future meetings from New@Example.com automatically, with no human click.");
  expect(writes()).toHaveLength(0);
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("alertdialog")).toBeNull(); expect(writes()).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Approve sender…" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm approval" }));
  await screen.findByText("Approved New@Example.com.");
  expect(writes()).toEqual([{ path: "/calendar/join-rules/approvals", method: "POST", body: { kind: "sender", value: "New@Example.com" } }]);
  expect(calls().at(-1)).toMatchObject({ path: "/calendar/join-rules", method: "GET" });
  expect(within(screen.getByRole("region", { name: "Approved senders" })).getByText("New@Example.com")).toBeInTheDocument();
});

test("ISS-T037UI-002: a zero-width / Cyrillic sender is refused in the real panel: no dialog, no POST", async () => {
  await ready();
  for (const v of ["  Foo​@Example.COM ", "foo‮@example.com", "fоo@example.com"]) {
    fireEvent.change(screen.getByLabelText("Sender to approve"), { target: { value: v } });
    fireEvent.click(screen.getByRole("button", { name: "Approve sender…" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText(/plain English letters, digits and ASCII punctuation/)).toBeInTheDocument();
  }
  expect(writes()).toHaveLength(0);
});

test("domain approval shows the stronger warning and needs an explicit acknowledgement", async () => {
  await ready();
  fireEvent.change(screen.getByLabelText("Domain to approve"), { target: { value: "newdomain.example" } });
  fireEvent.click(screen.getByRole("button", { name: "Approve domain…" }));
  const dialog = screen.getByRole("alertdialog", { name: "Confirm change" });
  expect(dialog).toHaveTextContent("Warning: this trusts a whole domain.");
  expect(dialog).toHaveTextContent("EVERY sender at newdomain.example automatically, with no human click");
  expect(dialog).toHaveTextContent("I understand that everyone at newdomain.example will be trusted.");
  const confirm = within(dialog).getByRole("button", { name: "Confirm approval" });
  expect(confirm).toBeDisabled(); fireEvent.click(confirm); expect(writes()).toHaveLength(0);
  fireEvent.click(within(dialog).getByRole("checkbox"));
  fireEvent.click(confirm);
  await screen.findByText("Approved newdomain.example.");
  expect(writes()).toEqual([{ path: "/calendar/join-rules/approvals", method: "POST", body: { kind: "domain", value: "newdomain.example" } }]);
});

test("opt-out goes through confirmation and posts { eventId }", async () => {
  await ready();
  fireEvent.change(screen.getByLabelText("Event id to opt out of"), { target: { value: "evt-99" } });
  fireEvent.click(screen.getByRole("button", { name: "Opt out of event…" }));
  expect(screen.getByRole("alertdialog")).toHaveTextContent("records an opt-out for that event");
  expect(writes()).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Confirm opt-out" }));
  await screen.findByText("Opted out of event evt-99.");
  expect(writes()).toEqual([{ path: "/calendar/join-rules/opt-outs", method: "POST", body: { eventId: "evt-99" } }]);
});

test("an approval made while rule edits are unsaved keeps those edits", async () => {
  await ready();
  fireEvent.change(screen.getByLabelText("Rule 1 name"), { target: { value: "edited-unsaved" } });
  fireEvent.change(screen.getByLabelText("Sender to approve"), { target: { value: "n@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Approve sender…" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm approval" }));
  await screen.findByText("Approved n@example.com.");
  expect(screen.getByLabelText("Rule 1 name")).toHaveValue("edited-unsaved");
  expect(screen.getByText("n@example.com")).toBeInTheDocument();
});

test.each([
  [403, "This API key lacks permission to read join rules."],
  [503, "Rule editing is not available on this server yet."],
  [401, "Your API key was rejected. Sign in again."],
  [500, "Unable to load join rules."],
  [0, "Unable to load join rules."],
])("GET status %i is shown distinctly and renders no rules or write controls", async (status, text) => {
  failures["GET /calendar/join-rules"] = [{ status }];
  mount(); await screen.findByRole("alert");
  expect(alerts()).toBe(text);
  expect(screen.queryByLabelText("Rule 1 name")).toBeNull(); expect(screen.queryByRole("button", { name: "Save rules" })).toBeNull();
  expect(screen.queryByText("No sender is approved.")).toBeNull();
});

test("a failed GET with 500 can be retried", async () => {
  failures["GET /calendar/join-rules"] = [{ status: 500 }];
  mount(); fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
  await screen.findByLabelText("Rule 1 name");
});

test("write 403 makes the page read-only: clear message, every write control disabled, input kept", async () => {
  await ready();
  fireEvent.change(screen.getByLabelText("Rule 1 name"), { target: { value: "mine" } });
  failures["PUT /calendar/join-rules"] = [{ status: 403 }];
  fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
  await waitFor(() => expect(screen.getAllByText(/can view rules but cannot change them/).length).toBeGreaterThan(0));
  expect(alerts()).toContain("This key can view rules but cannot change them.");
  expect(screen.getByLabelText("Rule 1 name")).toHaveValue("mine"); expect(screen.getByLabelText("Rule 1 name")).toBeDisabled();
  for (const name of ["Save rules", "Add rule", "Remove rule 1", "Approve sender…", "Approve domain…", "Opt out of event…"]) expect(screen.getByRole("button", { name })).toBeDisabled();
  expect(screen.getByLabelText("Sender to approve")).toBeDisabled();
  // the rules are still displayed
  expect(screen.getByText("trusted@example.org")).toBeInTheDocument();
});

test("approval 403 also switches to read-only", async () => {
  await ready();
  failures["POST /calendar/join-rules/approvals"] = [{ status: 403 }];
  fireEvent.change(screen.getByLabelText("Sender to approve"), { target: { value: "n@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Approve sender…" })); fireEvent.click(screen.getByRole("button", { name: "Confirm approval" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Save rules" })).toBeDisabled());
  expect(alerts()).toContain("cannot change them");
});

test("write 400 shows the server's message and keeps the form input", async () => {
  await ready();
  fireEvent.change(screen.getByLabelText("Rule 1 name"), { target: { value: "kept-text" } });
  failures["PUT /calendar/join-rules"] = [{ status: 400, message: "invalid join rule set at $.rules[0].match.email: not a valid email" }];
  fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
  await waitFor(() => expect(alerts()).toContain("The server rejected this change: invalid join rule set at $.rules[0].match.email: not a valid email"));
  expect(screen.getByLabelText("Rule 1 name")).toHaveValue("kept-text");
  expect(screen.getByRole("button", { name: "Save rules" })).toBeEnabled();
});

test("approval 400 shows the server's message", async () => {
  await ready();
  failures["POST /calendar/join-rules/approvals"] = [{ status: 400, message: "value is not a valid email" }];
  fireEvent.change(screen.getByLabelText("Sender to approve"), { target: { value: "n@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Approve sender…" })); fireEvent.click(screen.getByRole("button", { name: "Confirm approval" }));
  await waitFor(() => expect(alerts()).toContain("The server rejected this change: value is not a valid email"));
});

test.each([[413, "HTTP 413"], [500, "HTTP 500"], [0, "network error"], [503, ""]])("write status %i is a generic failure that keeps the form", async (status, detail) => {
  await ready();
  fireEvent.change(screen.getByLabelText("Rule 1 name"), { target: { value: "kept-text" } });
  failures["PUT /calendar/join-rules"] = [{ status, message: "internal path C:\\secret should never matter" }];
  fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
  await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
  const text = alerts();
  if (status === 503) expect(text).toBe("Rule editing is not available on this server yet.");
  else { expect(text).toContain("The change could not be saved. Your edits are still in the form"); expect(text).toContain(detail); }
  expect(text).not.toContain("secret");
  expect(screen.getByLabelText("Rule 1 name")).toHaveValue("kept-text");
  expect(screen.getByRole("button", { name: "Save rules" })).toBeEnabled();
});

const someoneElse = () => { server.ruleSet = { version: 1, ownDomains: [], rules: [{ id: "someone-else", effect: "deny", match: { platform: "zoom" } }] }; server.etag = '"theirs"'; };

test("412: someone else saved first. No automatic retry, the edits stay, the message is shown, nothing was overwritten", async () => {
  await ready();
  fireEvent.change(screen.getByLabelText("Rule 1 name"), { target: { value: "my-edit" } });
  someoneElse();
  fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
  const dialog = await screen.findByRole("alertdialog", { name: "Rules changed on the server" });
  expect(dialog).toHaveTextContent("changed by someone else since you opened them");
  expect(writes()).toHaveLength(1); // exactly the one refused PUT
  expect(putHeaders()).toEqual([{ "If-Match": '"e1"' }]);
  expect(screen.getByLabelText("Rule 1 name")).toHaveValue("my-edit");
  expect((server.ruleSet as { rules: { id: string }[] }).rules[0]!.id).toBe("someone-else");
  await new Promise(r => setTimeout(r, 50));
  expect(writes()).toHaveLength(1);
});

test("412: the reload action fetches again, shows the server's rules and adopts the new ETag, so the next save sends it", async () => {
  await ready();
  fireEvent.change(screen.getByLabelText("Rule 1 name"), { target: { value: "my-edit" } });
  someoneElse();
  fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
  fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: /Reload latest rules/ }));
  await waitFor(() => expect(screen.getByLabelText("Rule 1 name")).toHaveValue("someone-else"));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(calls().filter(c => c.method === "GET")).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("Rule 1 name"), { target: { value: "after-reload" } });
  fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
  await screen.findByText(/Saved./);
  expect(putHeaders()).toEqual([{ "If-Match": '"e1"' }, { "If-Match": '"theirs"' }]);
});

test("412: 'Keep editing' dismisses the message and sends nothing", async () => {
  await ready();
  fireEvent.change(screen.getByLabelText("Rule 1 name"), { target: { value: "my-edit" } });
  someoneElse();
  fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
  fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Keep editing" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(screen.getByLabelText("Rule 1 name")).toHaveValue("my-edit");
  expect(writes()).toHaveLength(1);
});

test("a change to approvals only (not the rules) does not trigger the stale warning, and the PUT still omits state", async () => {
  await ready();
  fireEvent.change(screen.getByLabelText("Rule 1 name"), { target: { value: "my-edit" } });
  server.state.approvedSenders.push("added-elsewhere@example.com");
  fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
  await screen.findByText(/Saved\./);
  expect(JSON.stringify(writes()[0]!.body)).not.toContain("added-elsewhere");
  expect(screen.getByText("added-elsewhere@example.com")).toBeInTheDocument();
});

test("API strings render as text: no markup is created, no link, no innerHTML in the sources", async () => {
  const evil = '<img src=x onerror="alert(1)">';
  server.ruleSet = { version: 1, ownDomains: [], rules: [{ id: evil, effect: "allow", match: { email: "<b>x</b>@evil.example" } }] };
  server.state = { approvedSenders: ["<script>alert(1)</script>@evil.example"], approvedDomains: ["javascript:alert(1)"], optedOutEventIds: ['"><a href="http://evil.example">ev</a>'] };
  const { container } = mount(); await screen.findByLabelText("Rule 1 name");
  expect(screen.getByLabelText("Rule 1 name")).toHaveValue(evil);
  expect(screen.getByText("<script>alert(1)</script>@evil.example")).toBeInTheDocument();
  expect(screen.getByText("javascript:alert(1)")).toBeInTheDocument();
  expect(container.querySelector("img, script, b, a")).toBeNull();
  for (const src of [pageSource, approvalsSource, editorSource]) { expect(src).not.toContain("dangerouslySetInnerHTML"); expect(src).not.toMatch(/href=/); }
});

test("a 400 message from the server is rendered as text", async () => {
  await ready();
  fireEvent.change(screen.getByLabelText("Rule 1 name"), { target: { value: "x" } });
  failures["PUT /calendar/join-rules"] = [{ status: 400, message: "<img src=x onerror=alert(1)>" }];
  fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
  await waitFor(() => expect(alerts()).toContain("<img src=x onerror=alert(1)>"));
  expect(document.querySelector("img")).toBeNull();
});

test("without a key nothing is requested", () => {
  localStorage.clear(); mount();
  expect(screen.getByText(/Sign in with an API key/)).toBeInTheDocument(); expect(api).not.toHaveBeenCalled();
});

test("registered in the protected router and the navigation", async () => {
  window.history.replaceState(null, "", "/join-rules"); render(<App />);
  await screen.findByRole("heading", { name: "Join rules" });
  expect(screen.getByRole("link", { name: "Join rules" })).toHaveAttribute("href", "/join-rules");
  expect(screen.getByRole("link", { name: "Join rules" })).toHaveClass("active");
});

test("direct route without a key shows the login gate and requests nothing", () => {
  localStorage.clear(); window.history.replaceState(null, "", "/join-rules"); render(<App />);
  expect(screen.getByLabelText("API key")).toBeInTheDocument(); expect(api).not.toHaveBeenCalled();
});

test("503 join_rules_busy (the API's fixed busy message) shows 'busy, try again', not 'not available'; on save and on load", async () => {
  const busy = "join rules are busy; try again in a few seconds";
  await ready();
  fireEvent.change(screen.getByLabelText("Rule 1 name"), { target: { value: "kept-text" } });
  failures["PUT /calendar/join-rules"] = [{ status: 503, message: busy, code: "join_rules_busy" }];
  fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
  await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
  expect(alerts()).toContain("Join rules are busy");
  expect(alerts()).not.toContain("not available");
});
