/**
 * apps/web/src/pages/calendar/OptOutControl.test.tsx - the Calendar page's opt-out action (T-037 W7 gate (b), web side).
 * Fetch is stubbed globally for the join-rules routes only; the page's other API modules are spied like CalendarPage.test.tsx.
 * D-015: the recorded reproductions of ISS-WEBHINTS-001 / ISS-T037OPT-002 / ISS-T037OPT-004 are re-run below.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AuthProvider } from "../../auth/AuthContext.js";
import * as sessionsApi from "../../api/sessions.js";
import * as calendarApi from "../../api/calendar.js";
import * as candidatesApi from "../../api/meeting-candidates.js";
import type { UpcomingMeeting } from "../../api/types.js";
import { CalendarPage } from "../CalendarPage.js";

const at = (h: number, m = 0) => new Date(2026, 8, 25, h, m).toISOString();
const VIEW = (optedOutEventIds: string[]) => ({
  ruleSet: { version: 1, ownDomains: [], rules: [] },
  state: { approvedSenders: [], approvedDomains: [], optedOutEventIds },
});
const MEETINGS: UpcomingMeeting[] = [
  { id: "m1", title: "Weekly Sync", startTime: at(11), endTime: at(11, 30), meetingUrl: "https://meet.google.com/abc" },
  { id: "m2", title: "No Link Call", startTime: at(13), endTime: at(14) },
];

interface Sent { method: string; path: string; body: unknown; headers: Record<string, string> }
let sent: Sent[];
let postReply: () => Promise<Response>;
let getReply: () => Promise<Response>;
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } }));
const posts = () => sent.filter((s) => s.method === "POST");

beforeEach(() => {
  sent = [];
  getReply = () => json(200, VIEW([]));
  postReply = () => json(200, { state: VIEW(["m1"]).state });
  vi.spyOn(sessionsApi, "listSessions").mockResolvedValue({ sessions: [] });
  vi.spyOn(calendarApi, "listUpcomingMeetings").mockResolvedValue({ meetings: MEETINGS });
  vi.spyOn(candidatesApi, "listMeetingCandidates").mockResolvedValue({ candidates: [] });
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    sent.push({ method, path: String(url).replace(/^https?:\/\/[^/]+/, ""), body: init?.body === undefined ? undefined : JSON.parse(String(init.body)), headers: (init?.headers ?? {}) as Record<string, string> });
    return method === "POST" ? postReply() : getReply();
  }));
  localStorage.setItem("lkbApiKey", "test-key");
});
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function open(eventId = "meeting:m1") {
  render(<AuthProvider><MemoryRouter initialEntries={[`/calendar?date=2026-09-25&event=${eventId}`]}><CalendarPage /></MemoryRouter></AuthProvider>);
  await screen.findByTestId("event-detail");
}
const ask = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: "Opt out of this meeting" }));
const confirmBtn = () => screen.getByRole("button", { name: "Confirm opt-out" });

describe("what the request carries", () => {
  test("a meeting with a URL sends exactly { eventId, meetingUrl } to the opt-outs route with the key", async () => {
    const user = userEvent.setup(); await open(); await ask(user); await user.click(confirmBtn());
    await screen.findByTestId("opt-out-done");
    expect(posts()).toHaveLength(1);
    expect(posts()[0]!.path).toBe("/calendar/join-rules/opt-outs");
    expect(posts()[0]!.body).toEqual({ eventId: "m1", meetingUrl: "https://meet.google.com/abc" });
    expect(Object.keys(posts()[0]!.body as object).sort()).toEqual(["eventId", "meetingUrl"]);
    expect(posts()[0]!.headers.authorization).toBe("Bearer test-key");
  });

  test("a meeting without a URL sends exactly { eventId }: no empty or undefined keys", async () => {
    const user = userEvent.setup(); await open("meeting:m2"); await ask(user); await user.click(confirmBtn());
    await screen.findByTestId("opt-out-done");
    expect(JSON.stringify(posts()[0]!.body)).toBe('{"eventId":"m2"}');
  });

  test("the record id is the raw meeting id, not the page's meeting: prefixed id", async () => {
    const user = userEvent.setup(); await open(); await ask(user); await user.click(confirmBtn());
    await screen.findByTestId("opt-out-done");
    expect((posts()[0]!.body as { eventId: string }).eventId).toBe("m1");
  });

  test("the URL is sent verbatim in the body only: never in any request URL, never logged, no sessionKey", async () => {
    const log = vi.spyOn(console, "log"), warn = vi.spyOn(console, "warn"), err = vi.spyOn(console, "error");
    const user = userEvent.setup(); await open(); await ask(user); await user.click(confirmBtn());
    await screen.findByTestId("opt-out-done");
    expect(sent.every((s) => !s.path.includes("meet.google.com") && !s.path.includes("?"))).toBe(true);
    expect(posts()[0]!.body).not.toHaveProperty("sessionKey");
    for (const spy of [log, warn, err]) expect(JSON.stringify(spy.mock.calls)).not.toContain("meet.google.com");
  });

  test.each(["https://zoom.us/j/123456789", "https://meet.google.com/abc-defg-hij", "https://teams.microsoft.com/l/meetup-join/19%3ameeting_x/0", "https://example.zoom.us/j/987654321?pwd=AbC"])(
    "recorded reproduction (ISS-WEBHINTS-001 / ISS-T037OPT-002 / ISS-T037OPT-004): the opt-out from the web now carries the meeting hint %s", async (url) => {
      vi.spyOn(calendarApi, "listUpcomingMeetings").mockResolvedValue({ meetings: [{ id: "calX", title: "T", startTime: at(11), endTime: at(12), meetingUrl: url }] });
      const user = userEvent.setup(); await open("meeting:calX"); await ask(user); await user.click(confirmBtn());
      await screen.findByTestId("opt-out-done");
      expect(posts()[0]!.body).toEqual({ eventId: "calX", meetingUrl: url });
    });
});

describe("confirmation and in-flight", () => {
  test("nothing is sent until confirmed; cancel sends nothing; the confirm text says undo is not available", async () => {
    const user = userEvent.setup(); await open(); await ask(user);
    expect(posts()).toHaveLength(0);
    expect(screen.getByRole("alertdialog").textContent).toMatch(/Undoing an opt-out is not available/);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(posts()).toHaveLength(0);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByTestId("opt-out-done")).toBeNull();
  });

  test("a double click on confirm sends one request and the buttons are disabled while in flight", async () => {
    let release!: () => void;
    postReply = () => new Promise<Response>((res) => { release = () => res(new Response(JSON.stringify({ state: VIEW(["m1"]).state }), { status: 200 })); });
    const user = userEvent.setup(); await open(); await ask(user);
    await user.dblClick(confirmBtn());
    expect(posts()).toHaveLength(1);
    expect(confirmBtn()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    release();
    await screen.findByTestId("opt-out-done");
    expect(posts()).toHaveLength(1);
  });

  test("no request is made without an API key (no control is offered)", async () => {
    localStorage.clear();
    render(<AuthProvider><MemoryRouter initialEntries={["/calendar?date=2026-09-25&event=meeting:m1"]}><CalendarPage /></MemoryRouter></AuthProvider>);
    await screen.findByTestId("event-detail");
    expect(screen.queryByTestId("opt-out-control")).toBeNull();
    expect(sent).toHaveLength(0);
  });

  test("sessions have no opt-out control", async () => {
    vi.spyOn(sessionsApi, "listSessions").mockResolvedValue({ sessions: [{ _id: "s1", title: "Visa", date: "2026-09-25", org: "TOC", status: { transcribe: "done", index: "done" } }] });
    await open("session:s1");
    expect(screen.queryByTestId("opt-out-control")).toBeNull();
  });
});

describe("outcome states", () => {
  const fail = (status: number, body: unknown, headers?: Record<string, string>) => { postReply = () => json(status, body, headers); };
  async function run() { const user = userEvent.setup(); await open(); await ask(user); await user.click(confirmBtn()); return screen.findByTestId("opt-out-error"); }

  test("success shows the meeting as opted out and offers no undo", async () => {
    const user = userEvent.setup(); await open(); await ask(user); await user.click(confirmBtn());
    expect((await screen.findByTestId("opt-out-done")).textContent).toMatch(/Opt-out recorded/);
    expect(screen.queryByRole("button", { name: /opt out|undo|remove/i })).toBeNull();
  });

  test("403: says plainly that the key lacks the join-rules write scope", async () => {
    fail(403, { error: "forbidden", message: "insufficient scope" });
    const el = await run();
    expect(el.textContent).toMatch(/lacks the join-rules write scope/);
    expect(screen.queryByTestId("opt-out-done")).toBeNull();
  });

  test("503 + join_rules_busy: busy, try again; the action is offered again, no auto-retry", async () => {
    fail(503, { error: "join_rules_busy" }, { "retry-after": "2" });
    const el = await run();
    expect(el.textContent).toMatch(/busy, try again/);
    await new Promise((r) => setTimeout(r, 50));
    expect(posts()).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Opt out of this meeting" })).toBeEnabled();
  });

  test("other 503: unavailable, not busy", async () => {
    fail(503, { error: "join_rules_unavailable" });
    const el = await run();
    expect(el.textContent).toMatch(/not available on this server/);
    expect(el.textContent).not.toMatch(/busy/);
  });

  test("400: invalid", async () => { fail(400, { error: "bad_request", message: "eventId is not valid" }); expect((await run()).textContent).toMatch(/rejected this opt-out as invalid/); });
  test("401: the shared client signs the key out; nothing is marked opted out and the action is gone", async () => {
    fail(401, { error: "unauthorized" });
    const user = userEvent.setup(); await open(); await ask(user); await user.click(confirmBtn());
    await waitFor(() => expect(screen.queryByTestId("opt-out-control")).toBeNull());
    expect(screen.queryByTestId("opt-out-done")).toBeNull();
    expect(posts()).toHaveLength(1);
  });
  test("500: generic failure, nothing marked opted out", async () => {
    fail(500, {});
    expect((await run()).textContent).toMatch(/could not be saved/);
    expect(screen.queryByTestId("opt-out-done")).toBeNull();
  });
});

describe("opted-out state on load (one GET /calendar/join-rules per page load)", () => {
  test("a meeting already in optedOutEventIds is shown as opted out and offers no action", async () => {
    getReply = () => json(200, VIEW(["m1"]));
    await open();
    await screen.findByTestId("opt-out-done");
    expect(screen.queryByRole("button", { name: "Opt out of this meeting" })).toBeNull();
  });

  test("exactly one GET to the join-rules route per page load", async () => {
    await open();
    await waitFor(() => expect(sent.filter((s) => s.method === "GET")).toHaveLength(1));
    expect(sent[0]!.path).toBe("/calendar/join-rules");
    cleanup();
    sent.length = 0;
    await open("meeting:m2");
    await waitFor(() => expect(sent.filter((s) => s.method === "GET")).toHaveLength(1));
  });

  test("a failed read leaves the state unknown: the action is still offered and the page is not broken", async () => {
    getReply = () => json(403, { error: "forbidden" });
    await open();
    expect(screen.getByRole("button", { name: "Opt out of this meeting" })).toBeEnabled();
  });
});
