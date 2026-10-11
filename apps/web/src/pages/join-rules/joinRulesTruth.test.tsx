/**
 * apps/web/src/pages/join-rules/joinRulesTruth.test.tsx - the join-rules page does not claim that rules, approvals or opt-outs
 * stop or start the bot while JOIN_RULES_ENFORCED is false. Scans the rendered text of every state, so a future string cannot reintroduce the claim.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ApiError, apiFetch } from "../../api/client.js";
import { AuthProvider } from "../../auth/AuthContext.js";
import { JoinRulesPage } from "./JoinRulesPage.js";
import { JOIN_RULES_ENFORCED, pageCopy } from "./enforcement.js";
import { confirmationText } from "./joinRulesModel.js";

vi.mock("../../api/client.js", async orig => ({ ...(await orig<typeof import("../../api/client.js")>()), apiFetch: vi.fn() }));
const api = vi.mocked(apiFetch);
const CLAIM = /will not join|won't join|bot will skip|blocked/i;
let rules: unknown[];
beforeEach(() => {
  rules = [{ id: "allow-asha", effect: "allow", match: { email: "asha@example.com" } }];
  api.mockReset();
  api.mockImplementation((async (path: string, _k: string | null, opts?: { method?: string }) => {
    if (opts?.method === "POST") return { state: { approvedSenders: [], approvedDomains: [], optedOutEventIds: [] } };
    if (path !== "/calendar/join-rules") throw new ApiError(404, "no");
    return { ruleSet: { version: 1, ownDomains: [], rules }, state: { approvedSenders: [], approvedDomains: [], optedOutEventIds: [] } };
  }) as never);
  localStorage.setItem("lkbApiKey", "sample-key");
});
afterEach(() => { cleanup(); localStorage.clear(); });
const text = () => document.body.textContent ?? "";

test("flag is false; with rules present no rendered string makes an enforcement claim, and the 'not enforced' text is there", async () => {
  expect(JOIN_RULES_ENFORCED).toBe(false);
  render(<AuthProvider><JoinRulesPage /></AuthProvider>);
  await screen.findByLabelText("Rule 1 name");
  expect(text()).not.toMatch(CLAIM);
  expect(text()).toContain("not applied yet");
  expect(text()).toContain("It is not enforced yet.");
  expect(screen.getByRole("option", { name: "allow (join with no click, once enforced)" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "deny (do not join, once enforced)" })).toBeInTheDocument();
});

test("the empty-rules state does not say the bot never joins on its own", async () => {
  rules = [];
  render(<AuthProvider><JoinRulesPage /></AuthProvider>);
  await screen.findByText(/There are no rules\./);
  expect(text()).not.toMatch(CLAIM);
  expect(text()).not.toContain("the bot never joins on its own");
  expect(text()).toContain("Once enforcement is switched on, a meeting needs a rule or an approval");
});

test("every confirmation dialog and success notice is free of the claim and says recorded / not enforced", async () => {
  render(<AuthProvider><JoinRulesPage /></AuthProvider>);
  await screen.findByLabelText("Rule 1 name");
  const flows: [string, string, string, string][] = [
    ["Sender to approve", "Approve sender…", "a@example.com", "Approved a@example.com."],
    ["Domain to approve", "Approve domain…", "example.com", "Approved example.com."],
    ["Event id to opt out of", "Opt out of event…", "evt-1", "Opted out of event evt-1."],
  ];
  for (const [label, button, value, notice] of flows) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: button }));
    const dlg = screen.getByRole("alertdialog");
    expect(dlg.textContent).not.toMatch(CLAIM);
    expect(dlg.textContent).toMatch(/not enforced by the bot yet/);
    if (label.startsWith("Domain")) fireEvent.click(within(dlg).getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Confirm (approval|opt-out)/ }));
    const n = await screen.findByText(notice);
    expect(n.parentElement!.textContent).toContain("the bot does not enforce join rules yet");
    expect(text()).not.toMatch(CLAIM);
  }
});

test("confirmationText: unenforced variants are free of the claim; enforced variants keep the original wording", () => {
  for (const kind of ["sender", "domain", "optout"] as const) {
    expect(confirmationText({ kind, value: "v" }, false)).not.toMatch(CLAIM);
    expect(confirmationText({ kind, value: "v" }, false)).toMatch(/not enforced by the bot yet/);
  }
  expect(confirmationText({ kind: "optout", value: "v" }, true)).toBe("Opting out of event v means the bot will not join that meeting, even if a rule or an approval would otherwise allow it.");
  expect(pageCopy(true).subtitle).toBe("Decide which meetings the bot may join without a human click.");
});
