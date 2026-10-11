/**
 * apps/web/src/pages/calendar/OptOutTruth.test.tsx - the opt-out flow tells the truth about enforcement (cycle 1 of t037-calendar-page-opt-out-with-hint).
 * JOIN_RULES_ENFORCED is false: the scheduler does not apply join rules, so no rendered string may promise the bot will skip a meeting.
 * D-015: ISS-CALOPT-001 / -002 / -003 recorded reproductions (qa/issues.calopt.jsonl) are re-run verbatim below, counted by issue id.
 */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AuthProvider } from "../../auth/AuthContext.js";
import * as sessionsApi from "../../api/sessions.js";
import * as calendarApi from "../../api/calendar.js";
import * as candidatesApi from "../../api/meeting-candidates.js";
import type { UpcomingMeeting } from "../../api/types.js";
import { CalendarPage } from "../CalendarPage.js";
import { JOIN_RULES_ENFORCED, optOutCopy } from "../join-rules/enforcement.js";

const CLAIM = /will not join|won't join|bot will skip|blocked/i;
const at = (h: number) => new Date(2026, 8, 25, h).toISOString();
const state = (ids: string[], meetings?: string[]) => ({ approvedSenders: [], approvedDomains: [], optedOutEventIds: ids, ...(meetings ? { optedOutMeetings: meetings } : {}) });
const view = (s: object) => ({ ruleSet: { version: 1, ownDomains: [], rules: [] }, state: s });
const OLD_CONFIRM = "The bot will not join this meeting, even if a rule or an approval would otherwise allow it.";
const OLD_DONE = "Opted out: the bot will not join this meeting.";

let meetings: UpcomingMeeting[];
let getBody: unknown;
let postBody: unknown;
let bodies: unknown[];
const json = (b: unknown) => Promise.resolve(new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } }));

beforeEach(() => {
  bodies = [];
  getBody = view(state([]));
  postBody = { state: state(["x"]) };
  meetings = [];
  vi.spyOn(sessionsApi, "listSessions").mockResolvedValue({ sessions: [] });
  vi.spyOn(calendarApi, "listUpcomingMeetings").mockImplementation(async () => ({ meetings }));
  vi.spyOn(candidatesApi, "listMeetingCandidates").mockResolvedValue({ candidates: [] });
  vi.stubGlobal("fetch", vi.fn((_u: string, init?: RequestInit) => {
    if ((init?.method ?? "GET") === "POST") { bodies.push(JSON.parse(String(init!.body))); return json(postBody); }
    return json(getBody);
  }));
  localStorage.setItem("lkbApiKey", "test-key");
});
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function open(m: UpcomingMeeting) {
  meetings = [m];
  render(<AuthProvider><MemoryRouter initialEntries={[`/calendar?date=2026-09-25&event=meeting:${m.id}`]}><CalendarPage /></MemoryRouter></AuthProvider>);
  await screen.findByTestId("event-detail");
  await screen.findByRole("button", { name: "Opt out of this meeting" });
}
const mk = (id: string, meetingUrl?: string, title = "Weekly Sync"): UpcomingMeeting => ({ id, title, startTime: at(11), endTime: at(12), ...(meetingUrl ? { meetingUrl } : {}) });
const ask = (u: ReturnType<typeof userEvent.setup>) => u.click(screen.getByRole("button", { name: "Opt out of this meeting" }));
const confirmBtn = () => screen.getByRole("button", { name: "Confirm opt-out" });
const page = () => document.body.textContent ?? "";

describe("the flag is off and the copy says so", () => {
  test("JOIN_RULES_ENFORCED is false while the scheduler does not apply join rules", () => { expect(JOIN_RULES_ENFORCED).toBe(false); });

  test("ISS-CALOPT-001 reproduction: the recorded confirm and success strings are gone; no rendered state matches the claim scan; 'recorded, not enforced' is present", async () => {
    postBody = { state: state(["m1"], ["url:meet:abc-defg-hij"]) };
    const u = userEvent.setup(); await open(mk("m1", "https://meet.google.com/abc-defg-hij"));
    expect(page()).not.toMatch(CLAIM);
    await ask(u);
    const dlg = screen.getByRole("alertdialog");
    expect(dlg.textContent).not.toContain(OLD_CONFIRM);
    expect(dlg.textContent).not.toMatch(CLAIM);
    expect(page()).not.toMatch(CLAIM);
    expect(dlg.textContent).toContain("This records an opt-out for this meeting.");
    expect(dlg.textContent).toMatch(/not enforced by the bot yet/);
    expect(dlg.textContent).toMatch(/may still join until enforcement is switched on/);
    await u.click(confirmBtn());
    const done = await screen.findByTestId("opt-out-done");
    expect(done.textContent).not.toContain(OLD_DONE);
    expect(page()).not.toMatch(CLAIM);
    expect(done.textContent).toBe(optOutCopy(false).done);
    expect(done.textContent).toMatch(/not enforced by the bot yet/);
  });

  test.each([[401, /rejected/], [403, /write scope/], [503, /./], [500, /could not be saved/]])("error state %i never claims the bot will skip", async (status, re) => {
    vi.stubGlobal("fetch", vi.fn((_u: string, init?: RequestInit) => (init?.method ?? "GET") === "POST"
      ? Promise.resolve(new Response(JSON.stringify({ error: "x", message: "m" }), { status, headers: { "content-type": "application/json" } })) : json(getBody)));
    const u = userEvent.setup(); await open(mk("m1", "https://meet.google.com/abc-defg-hij")); await ask(u); await u.click(confirmBtn());
    if (status !== 401) expect((await screen.findByTestId("opt-out-error")).textContent).toMatch(re);
    await waitFor(() => expect(page()).not.toMatch(CLAIM));
  });

  test("a meeting already opted out (loaded from the server) shows the recorded wording, not the claim", async () => {
    getBody = view(state(["m1"]));
    meetings = [mk("m1")];
    render(<AuthProvider><MemoryRouter initialEntries={["/calendar?date=2026-09-25&event=meeting:m1"]}><CalendarPage /></MemoryRouter></AuthProvider>);
    const done = await screen.findByTestId("opt-out-done");
    expect(done.textContent).toBe(optOutCopy(false).done);
    expect(page()).not.toMatch(CLAIM);
  });
});

describe("ISS-CALOPT-002: shared-link warning iff a URL is sent", () => {
  test("recorded reproduction: recurring instance series1_20261012T100000Z with a Meet link warns before the write, and says undo is unavailable", async () => {
    const u = userEvent.setup(); await open(mk("series1_20261012T100000Z", "https://meet.google.com/xyz-wxyz-abc"));
    await ask(u);
    expect(bodies).toHaveLength(0);
    const w = screen.getByTestId("opt-out-shared-link").textContent!;
    expect(w).toMatch(/also apply to other meetings that use the same link \(recurring series, personal rooms\)/);
    expect(screen.getByRole("alertdialog").textContent).toMatch(/Undoing an opt-out is not available in this screen yet/);
    await u.click(confirmBtn());
    await screen.findByTestId("opt-out-done");
    expect(bodies).toEqual([{ eventId: "series1_20261012T100000Z", meetingUrl: "https://meet.google.com/xyz-wxyz-abc" }]);
  });

  test("a meeting with no link sends no URL and shows no shared-link warning", async () => {
    const u = userEvent.setup(); await open(mk("m2")); await ask(u);
    expect(screen.queryByTestId("opt-out-shared-link")).toBeNull();
    await u.click(confirmBtn()); await screen.findByTestId("opt-out-done");
    expect(JSON.stringify(bodies[0])).toBe('{"eventId":"m2"}');
  });
});

describe("ISS-CALOPT-003: what the server stored", () => {
  const REG = "https://zoom.us/webinar/register/WN_abcdef";
  test("recorded reproduction (registration link calReg, response without optedOutMeetings): the unrecognised-link note appears and the URL is not echoed", async () => {
    postBody = { state: state(["calReg"]) };
    const u = userEvent.setup(); await open(mk("calReg", REG)); await ask(u); await u.click(confirmBtn());
    const note = await screen.findByTestId("opt-out-link-note");
    expect(note.textContent).toBe("Recorded for this calendar entry only. The link could not be recognised as a meeting link, so a separate invitation for the same meeting would not be covered.");
    expect(page()).not.toContain("WN_abcdef");
  });

  test("recorded contrast (join link calZoom, optedOutMeetings ['url:zoom:123456789']): no note, and the stored identity is not displayed", async () => {
    postBody = { state: state(["calZoom"], ["url:zoom:123456789"]) };
    const u = userEvent.setup(); await open(mk("calZoom", "https://zoom.us/j/123456789?pwd=abc")); await ask(u); await u.click(confirmBtn());
    await screen.findByTestId("opt-out-done");
    expect(screen.queryByTestId("opt-out-link-note")).toBeNull();
    expect(page()).not.toMatch(/url:zoom|zoom:1234/);
  });

  test("the count compares with what the page's GET already held: unchanged count with entries is 'not new', not 'unrecognised'", async () => {
    getBody = view(state([], ["url:zoom:111"]));
    postBody = { state: state(["c1"], ["url:zoom:111"]) };
    const u = userEvent.setup(); await open(mk("c1", "https://zoom.us/j/111")); await ask(u); await u.click(confirmBtn());
    expect((await screen.findByTestId("opt-out-link-note")).textContent).toMatch(/No new link identity was added/);
  });

  test("a count that grew past existing entries shows no note", async () => {
    getBody = view(state([], ["url:zoom:111"]));
    postBody = { state: state(["c2"], ["url:zoom:111", "url:zoom:222"]) };
    const u = userEvent.setup(); await open(mk("c2", "https://zoom.us/j/222")); await ask(u); await u.click(confirmBtn());
    await screen.findByTestId("opt-out-done");
    expect(screen.queryByTestId("opt-out-link-note")).toBeNull();
  });

  test("when the page's GET failed (previous count unknown) and the response holds entries, no claim is made", async () => {
    vi.stubGlobal("fetch", vi.fn((_u: string, init?: RequestInit) => (init?.method ?? "GET") === "POST"
      ? json({ state: state(["c3"], ["url:zoom:333"]) }) : Promise.resolve(new Response("{}", { status: 500 }))));
    const u = userEvent.setup(); await open(mk("c3", "https://zoom.us/j/333")); await ask(u); await u.click(confirmBtn());
    await screen.findByTestId("opt-out-done");
    expect(screen.queryByTestId("opt-out-link-note")).toBeNull();
  });

  test("a URL-less meeting never gets a link note, even when nothing was stored", async () => {
    postBody = { state: state(["m2"]) };
    const u = userEvent.setup(); await open(mk("m2")); await ask(u); await u.click(confirmBtn());
    await screen.findByTestId("opt-out-done");
    expect(screen.queryByTestId("opt-out-link-note")).toBeNull();
  });

  test.each([
    ["an empty object", {}],
    ["no state", { ok: true }],
    ["state without optedOutEventIds (older server)", { state: { approvedSenders: [] } }],
    ["null", null],
  ])("response lacking the fields (%s): recorded, no extra claim", async (_n, body) => {
    postBody = body;
    const u = userEvent.setup(); await open(mk("c1", REG)); await ask(u); await u.click(confirmBtn());
    await screen.findByTestId("opt-out-done");
    expect(screen.queryByTestId("opt-out-link-note")).toBeNull();
  });
});

describe("dialog content and focus", () => {
  test("the dialog repeats the meeting title as inert text", async () => {
    const hostile = '<img src=x onerror="alert(1)"><script>window.__x=1</script>';
    const u = userEvent.setup(); await open(mk("m1", undefined, hostile)); await ask(u);
    const dlg = screen.getByRole("alertdialog");
    expect(within(dlg).getByTestId("opt-out-title").textContent).toBe(`Meeting: ${hostile}`);
    expect(dlg.querySelector("img, script")).toBeNull();
  });

  test("a plain title is shown in the dialog", async () => {
    const u = userEvent.setup(); await open(mk("m1", undefined, "Board review")); await ask(u);
    expect(screen.getByTestId("opt-out-title").textContent).toBe("Meeting: Board review");
  });

  test("Cancel returns focus to the control; success moves focus to the result", async () => {
    const u = userEvent.setup(); await open(mk("m1"));
    await ask(u); await u.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Opt out of this meeting" })).toHaveFocus());
    await ask(u); await u.click(confirmBtn());
    const done = await screen.findByTestId("opt-out-done");
    await waitFor(() => expect(done).toHaveFocus());
  });
});
