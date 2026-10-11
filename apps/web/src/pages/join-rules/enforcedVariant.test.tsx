/**
 * apps/web/src/pages/join-rules/enforcedVariant.test.tsx - with JOIN_RULES_ENFORCED set to true the enforced wording appears on both pages
 * (the switch is one line in enforcement.ts, not a rewrite). The flag is mocked here; the real constant stays false.
 */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AuthProvider } from "../../auth/AuthContext.js";
import * as sessionsApi from "../../api/sessions.js";
import * as calendarApi from "../../api/calendar.js";
import * as candidatesApi from "../../api/meeting-candidates.js";
import { CalendarPage } from "../CalendarPage.js";
import { JoinRulesPage } from "./JoinRulesPage.js";

vi.mock("./enforcement.js", async orig => ({ ...(await orig<typeof import("./enforcement.js")>()), JOIN_RULES_ENFORCED: true }));
const json = (b: unknown) => Promise.resolve(new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } }));
const VIEW = { ruleSet: { version: 1, ownDomains: [], rules: [] }, state: { approvedSenders: [], approvedDomains: [], optedOutEventIds: [] } };
beforeEach(() => {
  vi.spyOn(sessionsApi, "listSessions").mockResolvedValue({ sessions: [] });
  vi.spyOn(calendarApi, "listUpcomingMeetings").mockResolvedValue({ meetings: [{ id: "m1", title: "T", startTime: new Date(2026, 8, 25, 11).toISOString(), endTime: new Date(2026, 8, 25, 12).toISOString(), meetingUrl: "https://meet.google.com/abc" }] });
  vi.spyOn(candidatesApi, "listMeetingCandidates").mockResolvedValue({ candidates: [] });
  vi.stubGlobal("fetch", vi.fn((_u: string, init?: RequestInit) => json((init?.method ?? "GET") === "POST" ? { state: { ...VIEW.state, optedOutEventIds: ["m1"], optedOutMeetings: ["url:meet:abc"] } } : VIEW)));
  localStorage.setItem("lkbApiKey", "k");
});
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

test("Calendar opt-out under the enforced flag: confirm and success use the enforced wording", async () => {
  const u = userEvent.setup();
  render(<AuthProvider><MemoryRouter initialEntries={["/calendar?date=2026-09-25&event=meeting:m1"]}><CalendarPage /></MemoryRouter></AuthProvider>);
  await u.click(await screen.findByRole("button", { name: "Opt out of this meeting" }));
  const dlg = screen.getByRole("alertdialog");
  expect(dlg.textContent).toContain("The bot will not join this meeting, even if a rule or an approval would otherwise allow it.");
  expect(dlg.textContent).toContain("also applies to other meetings that use the same link");
  expect(dlg.textContent).not.toMatch(/not enforced/);
  await u.click(screen.getByRole("button", { name: "Confirm opt-out" }));
  expect((await screen.findByTestId("opt-out-done")).textContent).toBe("Opted out: the bot will not join this meeting.");
});

test("join-rules page under the enforced flag: original page wording", async () => {
  render(<AuthProvider><JoinRulesPage /></AuthProvider>);
  await screen.findByText(/There are no rules\./);
  expect(screen.getByText("Decide which meetings the bot may join without a human click.")).toBeInTheDocument();
  expect(screen.getByText("There are no rules. Without a rule or an approval, the bot never joins on its own.")).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/not enforced|not applied yet/);
});
