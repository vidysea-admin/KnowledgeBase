/**
 * T-046 web slice, SOURCE SCOPE ONLY (D-024): jsdom with a stubbed global fetch, no live browser.
 * Each section's states, independence of sections, request counts, row cap, hostile data, truthful wording.
 */
import { render, screen, cleanup, within, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, test, expect, vi } from "vitest";
import { MeetingBotPage } from "../MeetingBotPage.js";
import { JOIN_RULES_ENFORCED } from "../join-rules/enforcement.js";

const auth = vi.hoisted(() => ({ key: "test-key" as string | null }));
vi.mock("../../auth/AuthContext.js", () => ({ useAuth: () => ({ apiKey: auth.key }) }));

type Handler = () => Response | Promise<Response>;
let routes: Record<string, Handler>;
let calls: string[];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const HOUR = 3600_000;
const future = (h: number) => new Date(Date.now() + h * HOUR).toISOString();

beforeEach(() => {
  auth.key = "test-key"; calls = [];
  routes = {
    "/calendar/upcoming": () => json({ meetings: [] }),
    "/webinar-operations": () => json({ operations: [], omitted: 0 }),
    "/sessions": () => json({ sessions: [] }),
    "/bot-events?limit=20": () => json({ events: [] }),
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, ""); calls.push(path);
    const h = routes[path]; if (!h) throw new Error(`unexpected ${path}`);
    return h();
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const show = () => render(<MemoryRouter><MeetingBotPage /></MemoryRouter>);
const section = (name: RegExp | string) => screen.getByRole("heading", { level: 2, name }).closest("section")!;
const count = (p: string) => calls.filter(c => c === p).length;
const meeting = (over: Record<string, unknown> = {}) => ({ id: "e1", title: "Board sync", startTime: future(2), endTime: future(3), meetingUrl: "https://meet.google.com/abc-defg-hij", ...over });
const session = (i: number, over: Record<string, unknown> = {}) => ({ _id: `s${i}`, title: `Session ${i}`, date: `2026-09-${String(10 + (i % 18)).padStart(2, "0")}`, status: { transcribe: "done", index: "done" }, ...over });

/** All rendered text plus every attribute value an assistive technology or hover could expose. */
function everything(root: HTMLElement): string {
  const attrs = [...root.querySelectorAll("*")].flatMap(el => [...el.attributes].map(a => `${a.name}=${a.value}`));
  return `${root.textContent}\n${attrs.join("\n")}`;
}

describe("sections and request counts", () => {
  test("one request per endpoint per load; upcoming, live, history and past render from their own endpoints", async () => {
    routes["/calendar/upcoming"] = () => json({ meetings: [meeting(), meeting({ id: "e2", title: "No link", meetingUrl: undefined })] });
    routes["/webinar-operations"] = () => json({ omitted: 0, operations: [
      { id: "live1", title: "Live webinar", status: "recording", attempts: 1 }, { id: "done1", title: "Finished webinar", status: "ready", attempts: 1 }] });
    routes["/sessions"] = () => json({ sessions: [session(1, { title: "Past one" })] });
    show();
    await screen.findByText("Past one");
    expect(within(section("Upcoming meetings on the calendar")).getByText("Board sync")).toBeInTheDocument();
    expect(within(section("Upcoming meetings on the calendar")).getByText(/Platform: Google Meet · Join link: known/)).toBeInTheDocument();
    expect(within(section("Upcoming meetings on the calendar")).getByText(/Join link: not known/)).toBeInTheDocument();
    expect(within(section("Live now")).getByText("Live webinar")).toBeInTheDocument();
    expect(within(section("Live now")).queryByText("Finished webinar")).toBeNull();
    expect(within(section("Webinar operations")).getByText("Finished webinar")).toBeInTheDocument();
    expect(within(section("Past recordings")).getByRole("link", { name: /Open session and transcript: Past one/ })).toHaveAttribute("href", "/sessions/s1");
    expect(count("/calendar/upcoming")).toBe(1); expect(count("/webinar-operations")).toBe(1); expect(count("/sessions")).toBe(1);
    expect(calls).toHaveLength(4); // + /bot-events (autojoin Bot activity section)
  });

  test("no API key means no request at all", () => {
    auth.key = null; show();
    expect(calls).toEqual([]);
    expect(screen.getAllByText(/Enter an API key/).length).toBeGreaterThan(0);
  });

  test("meetings that already ended are not listed as upcoming; unparseable start sorts last with a placeholder", async () => {
    routes["/calendar/upcoming"] = () => json({ meetings: [
      meeting({ id: "p", title: "Already over", startTime: future(-5), endTime: future(-4) }),
      meeting({ id: "bad", title: "Bad time", startTime: "garbage", endTime: "garbage" }),
      meeting({ id: "late", title: "Later", startTime: future(30), endTime: future(31) }),
      meeting({ id: "soon", title: "Sooner", startTime: future(1), endTime: future(2) })] });
    show(); await screen.findByText("Sooner");
    const titles = within(section("Upcoming meetings on the calendar")).getAllByRole("heading", { level: 3 }).map(h => h.textContent);
    expect(titles).toEqual(["Sooner", "Later", "Bad time"]);
    expect(within(section("Upcoming meetings on the calendar")).getByText(/Starts: time unknown/)).toBeInTheDocument();
  });

  test("past recordings: size is unknown (never 0), status is shown, newest first, no retention or purge text", async () => {
    routes["/sessions"] = () => json({ sessions: [session(1, { title: "Older", date: "2026-01-02", status: { transcribe: "processing", index: "failed" } }),
      session(2, { title: "Newer", date: "2026-05-02" }), session(3, { title: "Dateless", date: "nonsense" })] });
    show(); await screen.findByText("Newer");
    const past = section("Past recordings");
    expect(within(past).getAllByRole("heading", { level: 3 }).map(h => h.textContent)).toEqual(["Newer", "Older", "Dateless"]);
    expect(within(past).getAllByText(/Video size: unknown/)).toHaveLength(3);
    expect(past.textContent).not.toMatch(/Video size: 0|0 B|0 bytes/);
    expect(within(past).getByText("Transcript: processing · Index: failed")).toBeInTheDocument();
    expect(within(past).getByText(/Date: time unknown/)).toBeInTheDocument();
    expect(past.textContent).not.toMatch(/purge|delete[ds]? on|expires|retained until/i);
  });
});

describe("states are independent", () => {
  test("loading, empty per section", async () => {
    show();
    expect(screen.getByText(/Loading upcoming meetings/)).toBeInTheDocument();
    expect(await screen.findByText("No upcoming meetings on the calendar.")).toBeInTheDocument();
    expect(await screen.findByText(/No past recordings or sessions found/)).toBeInTheDocument();
    expect(screen.getByText("Nothing is recording or processing right now.")).toBeInTheDocument();
    expect(screen.getByText(/^No webinar operations recorded for this tenant yet/)).toBeInTheDocument();
  });

  test("a 403 on one section names its scope and leaves the others rendered", async () => {
    routes["/calendar/upcoming"] = () => json({ error: "forbidden", message: "needs scope" }, 403);
    routes["/sessions"] = () => json({ sessions: [session(1, { title: "Still here" })] });
    show(); await screen.findByText("Still here");
    expect(await within(section("Upcoming meetings on the calendar")).findByRole("alert")).toHaveTextContent('lacks the "calendar" scope');
    expect(screen.getByText("Nothing is recording or processing right now.")).toBeInTheDocument();
  });

  test("a 5xx on sessions: manual retry, one fetch per click even if clicked twice while in flight", async () => {
    let attempt = 0, release!: () => void;
    routes["/sessions"] = () => { attempt++; if (attempt === 1) return json({ error: "x", message: "private detail" }, 503);
      return new Promise<Response>(r => { release = () => r(json({ sessions: [session(1, { title: "Recovered" })] })); }); };
    routes["/calendar/upcoming"] = () => json({ meetings: [meeting({ title: "Calendar ok" })] });
    show();
    const alert = await within(section("Past recordings")).findByRole("alert");
    expect(alert).toHaveTextContent("Past recordings unavailable."); expect(alert.textContent).not.toMatch(/private detail/);
    expect(screen.getByText("Calendar ok")).toBeInTheDocument();
    const retry = within(alert).getByRole("button", { name: /Retry past recordings/ });
    fireEvent.click(retry); fireEvent.click(retry);
    await waitFor(() => expect(count("/sessions")).toBe(2));
    release(); await screen.findByText("Recovered");
    expect(count("/sessions")).toBe(2);
    expect(count("/calendar/upcoming")).toBe(1);
  });

  test("network failure on operations leaves calendar and sessions untouched", async () => {
    routes["/webinar-operations"] = () => { throw new TypeError("Failed to fetch"); };
    routes["/calendar/upcoming"] = () => json({ meetings: [meeting({ title: "Calendar ok" })] });
    routes["/sessions"] = () => json({ sessions: [session(1, { title: "Sessions ok" })] });
    show(); await screen.findByText("Sessions ok");
    expect(screen.getByText("Calendar ok")).toBeInTheDocument();
    expect(await within(section("Live now")).findByRole("alert")).toHaveTextContent("Webinar status unavailable.");
  });

  test("a wrong-shaped payload is an error state, not a crash or a fake empty list", async () => {
    routes["/calendar/upcoming"] = () => json({ meetings: "nope" });
    routes["/sessions"] = () => json(null);
    show();
    expect(await within(section("Upcoming meetings on the calendar")).findByRole("alert")).toHaveTextContent("unavailable");
    expect(await within(section("Past recordings")).findByRole("alert")).toHaveTextContent("unavailable");
    expect(screen.queryByText("No upcoming meetings on the calendar.")).toBeNull();
  });
});

describe("row cap", () => {
  test("each list renders at most 25 rows and says 'Showing N of M'", async () => {
    routes["/calendar/upcoming"] = () => json({ meetings: Array.from({ length: 60 }, (_, i) => meeting({ id: `m${i}`, title: `Meet ${i}`, startTime: future(1 + i), endTime: future(2 + i) })) });
    routes["/sessions"] = () => json({ sessions: Array.from({ length: 40 }, (_, i) => session(i)) });
    routes["/webinar-operations"] = () => json({ omitted: 0, operations: Array.from({ length: 70 }, (_, i) => ({ id: `o${i}`, title: `Op ${i}`, status: i < 30 ? "recording" : "queued", attempts: 0 })) });
    show(); await screen.findByText("Meet 0");
    await waitFor(() => expect(within(section("Live now")).getAllByRole("heading", { level: 3 })).toHaveLength(25));
    expect(within(section("Upcoming meetings on the calendar")).getAllByRole("heading", { level: 3 })).toHaveLength(25);
    expect(screen.getByText("Showing 25 of 60 upcoming meetings.")).toBeInTheDocument();
    expect(within(section("Past recordings")).getAllByRole("heading", { level: 3 })).toHaveLength(25);
    expect(screen.getByText("Showing the 25 most recent of 40 past recordings.")).toBeInTheDocument();
    expect(within(section("Live now")).getByText("Showing 25 of 30 operations.")).toBeInTheDocument();
    expect(within(section("Webinar operations")).getAllByRole("heading", { level: 3 })).toHaveLength(25);
    expect(within(section("Webinar operations")).getByText("Showing 25 of 40 operations.")).toBeInTheDocument();
  });
});

describe("hostile data is inert", () => {
  const evil = "<script>window.__pwned=1</script><img src=x onerror=alert(1)>";
  test("titles, urls, ids, reasons and types render as bounded text; links only for validated ids", async () => {
    routes["/calendar/upcoming"] = () => json({ meetings: [
      meeting({ title: evil, meetingUrl: "javascript:alert(1)" }),
      meeting({ id: "__proto__", title: "‮gpj.exe " + "A".repeat(5000), meetingUrl: "https://zoom.us/j/1" }),
      meeting({ title: 42, startTime: null, endTime: null, meetingUrl: { href: "x" } }), null, "str", 7, [] ] });
    routes["/webinar-operations"] = () => json({ omitted: "many", discovery: { calendar: null, gmail: { status: 1 } }, operations: [
      { id: "__proto__", title: evil, status: "ready", attempts: "NaN", reason: "<b>raw</b>" },
      { id: "../etc", title: null, status: "ready", attempts: 1, reason: "__proto__" },
      { id: "ok-1", title: "Fine", status: "ready", attempts: 1, reason: "rule-denied", startTime: { x: 1 }, updatedAt: "bad" },
      { id: "q", title: "Weird", status: "<script>", attempts: 1 }, null, 5 ] });
    routes["/sessions"] = () => json({ sessions: [
      { _id: "__proto__", title: evil, date: "x", status: { transcribe: "<i>done</i>", index: null } },
      { _id: "a/b", title: "Slash id", date: "2026-01-01", status: "oops" },
      { _id: "javascript:alert(1)", title: "Js id", date: "2026-01-01" },
      { _id: "good", title: "R".repeat(5000) }, null, "s" ] });
    const { container } = show(); await screen.findByText("Slash id");
    await screen.findByText("Fine");
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    const hrefs = [...container.querySelectorAll("a")].map(a => a.getAttribute("href"));
    expect(hrefs.sort()).toEqual(["/sessions/good", "/sessions/ok-1"]);
    const all = everything(container);
    expect(all).not.toMatch(/javascript:/i);
    expect(all).not.toMatch(/[‪-‮⁦-⁩]/);
    expect(all).not.toMatch(/<b>raw<\/b>|<i>done<\/i>/);
    expect(screen.queryByText(/zoom\.us\/j\/1/)).toBeNull();
    expect(Math.max(...[...container.querySelectorAll("h3")].map(h => h.textContent!.length))).toBeLessThanOrEqual(161);
    expect(container.textContent).toContain("Reason: unrecognised reason");
    expect(container.textContent).toContain("Reason: join rule recorded");
    expect(container.textContent).toContain("unrecognised status");
  });
});

describe("skip reasons come from data through the vocabulary", () => {
  test("known reasons get neutral labels; unknown ones a neutral label, never the raw text", async () => {
    routes["/webinar-operations"] = () => json({ omitted: 0, operations: [
      { id: "a", title: "A", status: "failed", attempts: 1, reason: "needs-registration" },
      { id: "b", title: "B", status: "failed", attempts: 1, reason: "secret-internal-code-77" }] });
    show(); await screen.findByText("Reason: needs registration");
    expect(screen.getByText("Reason: unrecognised reason")).toBeInTheDocument();
    expect(screen.queryByText(/secret-internal-code-77/)).toBeNull();
  });
});

describe("truthful wording", () => {
  test("while enforcement is off, no text or attribute promises a join or claims rules are applied", async () => {
    expect(JOIN_RULES_ENFORCED).toBe(false); // flipping it needs this test and the page wording reviewed together
    routes["/calendar/upcoming"] = () => json({ meetings: [meeting({ title: "Opted-out looking meeting" })] });
    routes["/webinar-operations"] = () => json({ omitted: 0, operations: [
      { id: "a", title: "A", status: "failed", attempts: 1, reason: "opted-out" }, { id: "b", title: "B", status: "failed", attempts: 1, reason: "rule-denied" }] });
    routes["/sessions"] = () => json({ sessions: [session(1)] });
    const { container } = show(); await screen.findByText("Session 1"); await screen.findByText("Opted-out looking meeting");
    const all = everything(container);
    expect(all).not.toMatch(/\b(will|shall|going to|would|is going to)\b[^.\n]{0,25}\b(join|record|attend|capture)/i);
    expect(all).not.toMatch(/\bwill not\b|\bwon'?t\b|\bnever joins?\b/i);
    expect(all).not.toMatch(/enforced|\bapplied\b|automatically joins?|guaranteed/i);
    expect(all).toMatch(/Appearing here is not a decision to record/);
  });
});
