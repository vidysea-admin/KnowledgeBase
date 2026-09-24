/**
 * apps/web/src/pages/CalendarPage.test.tsx — U-CAL.
 *
 * Fixtures are built from LOCAL wall-clock times via `localIso`, never from a hardcoded `Z`
 * string, so a green run means the same thing in IST and in America/Los_Angeles. The [C9] row
 * checks the rendered grid position, not just the model: an event whose data says 11:00 has to
 * land in the 11:00 row of the DOM.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { vi, describe, test, expect, beforeEach } from "vitest";
import { AuthProvider } from "../auth/AuthContext.js";
import { CalendarPage } from "./CalendarPage.js";
import * as sessionsApi from "../api/sessions.js";
import * as calendarApi from "../api/calendar.js";
import * as candidatesApi from "../api/meeting-candidates.js";
import { ApiError } from "../api/client.js";
import type { SessionSummary, UpcomingMeeting } from "../api/types.js";

/** An ISO string for a LOCAL wall-clock time — keeps every assertion timezone-independent. */
function localIso(y: number, m: number, d: number, h: number, min = 0): string {
  return new Date(y, m - 1, d, h, min, 0, 0).toISOString();
}

const SESSIONS: SessionSummary[] = [
  { _id: "s1", title: "Visa Blueprint", date: "2026-09-25", org: "TOC", status: { transcribe: "done", index: "done" } },
  { _id: "s2", title: "Funding Dreams", date: "2026-09-10", org: "Vidysea", status: { transcribe: "done", index: "done" } },
];

const MEETINGS: UpcomingMeeting[] = [
  { id: "m1", title: "Weekly Sync Up with Umesh", startTime: localIso(2026, 9, 25, 11, 0), endTime: localIso(2026, 9, 25, 11, 30), meetingUrl: "https://meet.google.com/abc", organizer: "umesh@vidysea.com" },
  { id: "m2", title: "Overlapping Call", startTime: localIso(2026, 9, 25, 11, 15), endTime: localIso(2026, 9, 25, 12, 0) },
];

function renderAt(url: string) {
  localStorage.setItem("lkbApiKey", "test-key");
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[url]}>
        <CalendarPage />
      </MemoryRouter>
    </AuthProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(sessionsApi, "listSessions").mockResolvedValue({ sessions: SESSIONS });
  vi.spyOn(calendarApi, "listUpcomingMeetings").mockResolvedValue({ meetings: MEETINGS });
  vi.spyOn(candidatesApi, "listMeetingCandidates").mockResolvedValue({ candidates: [] });
});

describe("[C1] three views, in the URL", () => {
  test("month is the default and renders a real 7-column grid of whole weeks", async () => {
    renderAt("/calendar?date=2026-09-25");
    await waitFor(() => expect(screen.getByTestId("month-grid")).toBeInTheDocument());
    const cells = screen.getAllByTestId("month-cell");
    expect(cells.length % 7).toBe(0);
    expect(cells.length).toBeGreaterThanOrEqual(28);
    expect(screen.getByRole("button", { name: "month" })).toHaveAttribute("aria-pressed", "true");
  });

  test("switching to week renders the hour axis and puts the view in the URL", async () => {
    renderAt("/calendar?date=2026-09-25");
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByTestId("month-grid")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "week" }));
    await waitFor(() => expect(screen.getByTestId("time-grid")).toBeInTheDocument());
    expect(screen.getAllByTestId("day-column")).toHaveLength(7);
    expect(screen.getByRole("button", { name: "week" })).toHaveAttribute("aria-pressed", "true");
  });

  test("a view given in the URL is applied on load, so the view is shareable", async () => {
    renderAt("/calendar?view=day&date=2026-09-25");
    await waitFor(() => expect(screen.getByTestId("time-grid")).toBeInTheDocument());
    expect(screen.getAllByTestId("day-column")).toHaveLength(1);
  });
});

describe("[C9] timezone — an automatic FAIL if a row shifts", () => {
  test("a meeting whose data says 11:00 renders in the 11:00 row", async () => {
    renderAt("/calendar?view=day&date=2026-09-25");
    await waitFor(() => expect(screen.getByTestId("time-grid")).toBeInTheDocument());
    const chip = screen.getByRole("button", { name: /Weekly Sync Up with Umesh/ });
    const positioned = chip.closest('[data-testid="positioned-event"]') as HTMLElement;
    // 11:00 of 24h = 45.8333% down the day column.
    expect(parseFloat(positioned.style.top)).toBeCloseTo((11 / 24) * 100, 3);
    expect(parseFloat(positioned.style.height)).toBeCloseTo((0.5 / 24) * 100, 3);
    expect(chip).toHaveAccessibleName(/11:00/);
  });

  test("a session dated 2026-09-25 appears on the 25th, not the 24th", async () => {
    renderAt("/calendar?view=day&date=2026-09-25");
    await waitFor(() => expect(screen.getByTestId("time-grid")).toBeInTheDocument());
    expect(within(screen.getByTestId("all-day-lane")).getByRole("button", { name: /Visa Blueprint/ })).toBeInTheDocument();

    // ...and is NOT on the 24th.
    renderAt("/calendar?view=day&date=2026-09-24");
    await waitFor(() => expect(screen.getAllByTestId("time-grid").length).toBeGreaterThan(0));
    const grids = screen.getAllByTestId("time-grid");
    expect(within(grids[grids.length - 1]!).queryByRole("button", { name: /Visa Blueprint/ })).toBeNull();
  });

  test("the page states which timezone it is rendering in", async () => {
    renderAt("/calendar?date=2026-09-25");
    await waitFor(() => expect(screen.getByTestId("calendar-timezone")).toHaveTextContent(/All times shown in /));
  });
});

describe("[C2] overlap — two events at the same hour are both visible", () => {
  test("they get side-by-side columns, neither occluding the other", async () => {
    renderAt("/calendar?view=day&date=2026-09-25");
    await waitFor(() => expect(screen.getByTestId("time-grid")).toBeInTheDocument());
    const placed = screen.getAllByTestId("positioned-event");
    expect(placed).toHaveLength(2);
    expect(placed.every((p) => p.getAttribute("data-columns") === "2")).toBe(true);
    expect(placed.map((p) => p.getAttribute("data-column")).sort()).toEqual(["0", "1"]);
    // Different horizontal offsets is what "not stacked so one hides the other" means.
    expect(placed[0]!.style.left).not.toBe(placed[1]!.style.left);
  });
});

describe("[C3] today and navigation", () => {
  test("today is marked in the month grid", async () => {
    renderAt("/calendar");
    await waitFor(() => expect(screen.getByTestId("month-grid")).toBeInTheDocument());
    expect(screen.getAllByTestId("month-cell").filter((c) => c.getAttribute("data-today") === "true")).toHaveLength(1);
  });

  test("next/prev move the range and NEVER drop the active filters", async () => {
    renderAt("/calendar?date=2026-09-25&kind=meeting");
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByTestId("range-label")).toHaveTextContent("September 2026"));
    expect(screen.getByTestId("calendar-filter-count")).toHaveTextContent("1 filter(s) active");

    await user.click(screen.getByRole("button", { name: "Next range" }));
    await waitFor(() => expect(screen.getByTestId("range-label")).toHaveTextContent("October 2026"));
    expect(screen.getByTestId("calendar-filter-count")).toHaveTextContent("1 filter(s) active");

    await user.click(screen.getByRole("button", { name: "Previous range" }));
    await waitFor(() => expect(screen.getByTestId("range-label")).toHaveTextContent("September 2026"));
    expect(screen.getByTestId("calendar-filter-count")).toHaveTextContent("1 filter(s) active");
  });
});

describe("[C4] one timeline, two kinds", () => {
  test("sessions and meetings are both on the grid and are distinguishable", async () => {
    renderAt("/calendar?view=day&date=2026-09-25");
    await waitFor(() => expect(screen.getByTestId("time-grid")).toBeInTheDocument());
    const grid = screen.getByTestId("time-grid");
    expect(grid.querySelectorAll('[data-event-kind="session"]').length).toBeGreaterThan(0);
    expect(grid.querySelectorAll('[data-event-kind="meeting"]').length).toBeGreaterThan(0);
  });
});

describe("[C5] filters", () => {
  test("a kind filter changes the rendered event count and lands in the URL", async () => {
    renderAt("/calendar?view=day&date=2026-09-25");
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByTestId("calendar-counts")).toHaveTextContent("3 event(s) in this range"));
    await user.selectOptions(screen.getByLabelText("Filter by kind"), "meeting");
    await waitFor(() => expect(screen.getByTestId("calendar-counts")).toHaveTextContent("2 event(s) in this range"));
    expect(screen.getByTestId("calendar-filter-count")).toHaveTextContent("1 filter(s) active");
  });

  test("a source filter is offered from the real data only", async () => {
    renderAt("/calendar?date=2026-09-25");
    await waitFor(() => expect(screen.getByLabelText("Filter by org or source")).toBeInTheDocument());
    const options = within(screen.getByLabelText("Filter by org or source")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["all", "TOC", "Vidysea", "umesh@vidysea.com"]);
  });

  test("an impossible combination says 'no events match these filters', never a blank grid", async () => {
    renderAt("/calendar?view=day&date=2026-09-25&kind=session&q=weekly");
    await waitFor(() => expect(screen.getByTestId("calendar-no-match")).toHaveTextContent("No events match these filters."));
    expect(screen.queryByTestId("time-grid")).toBeNull();
  });

  test("clear filters restores everything in one atomic URL update", async () => {
    renderAt("/calendar?view=day&date=2026-09-25&kind=session&source=TOC&q=visa");
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByTestId("calendar-filter-count")).toHaveTextContent("3 filter(s) active"));
    await user.click(screen.getByRole("button", { name: /clear filters/i }));
    await waitFor(() => expect(screen.getByTestId("calendar-filter-count")).toHaveTextContent("0 filter(s) active"));
    expect(screen.getByTestId("calendar-counts")).toHaveTextContent("3 event(s) in this range");
  });
});

describe("[C6] event detail — real fields only", () => {
  test("clicking a meeting shows its real fields and a working Join link", async () => {
    renderAt("/calendar?view=day&date=2026-09-25");
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByTestId("time-grid")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /Weekly Sync Up with Umesh/ }));
    const detail = await screen.findByTestId("event-detail");
    expect(within(detail).getByText("Weekly Sync Up with Umesh")).toBeInTheDocument();
    expect(within(detail).getByTestId("detail-organizer")).toHaveTextContent("umesh@vidysea.com");
    expect(within(detail).getByTestId("detail-join-link")).toHaveAttribute("href", "https://meet.google.com/abc");
  });

  test("a meeting the API gave no organiser for renders NO organiser row — no invented field", async () => {
    renderAt("/calendar?view=day&date=2026-09-25");
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByTestId("time-grid")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /Overlapping Call/ }));
    const detail = await screen.findByTestId("event-detail");
    expect(within(detail).queryByTestId("detail-organizer")).toBeNull();
    expect(within(detail).queryByTestId("detail-join-link")).toBeNull();
    expect(within(detail).getByText(/No link on this event in the source data/)).toBeInTheDocument();
  });

  test("a past session opens its session page", async () => {
    renderAt("/calendar?view=day&date=2026-09-25");
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByTestId("time-grid")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /Visa Blueprint/ }));
    expect(within(await screen.findByTestId("event-detail")).getByTestId("detail-session-link")).toHaveAttribute("href", "/sessions/s1");
  });
});

describe("[C7] honest empty and degraded states", () => {
  test("an empty upcoming lane says WHY, rather than looking like a broken grid", async () => {
    vi.spyOn(calendarApi, "listUpcomingMeetings").mockResolvedValue({ meetings: [] });
    renderAt("/calendar?date=2026-09-25");
    expect(await screen.findByTestId("calendar-no-connection-note")).toHaveTextContent(/calendar connection \(`gws`\) isn/);
  });

  test("a failed calendar fetch degrades this lane only, and says so", async () => {
    vi.spyOn(calendarApi, "listUpcomingMeetings").mockRejectedValue(new Error("gws down"));
    renderAt("/calendar?date=2026-09-25");
    expect(await screen.findByTestId("calendar-degraded-note")).toHaveTextContent(/Past sessions below are unaffected/);
    expect(screen.getByTestId("month-grid")).toBeInTheDocument();
  });
});

describe("[C4]/[C7] an empty grid must never blame the filters", () => {
  // Found live by the CHECKER on 2026-09-24: the page rendered "0 of 0 after filters" and "No
  // events match these filters" for a month that genuinely contains sessions, because the data
  // had not loaded yet. A filter message for a load state is a lie about whose fault it is.
  test("while sessions are still loading, the page says Loading — not 'no events match'", async () => {
    vi.spyOn(sessionsApi, "listSessions").mockReturnValue(new Promise(() => {}));
    renderAt("/calendar?date=2026-09-25&kind=session");
    expect(await screen.findByTestId("calendar-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("calendar-no-match")).toBeNull();
  });

  test("a tenant with genuinely no data says so, and says nothing is being filtered out", async () => {
    vi.spyOn(sessionsApi, "listSessions").mockResolvedValue({ sessions: [] });
    vi.spyOn(calendarApi, "listUpcomingMeetings").mockResolvedValue({ meetings: [] });
    renderAt("/calendar?date=2026-09-25&kind=session");
    expect(await screen.findByTestId("calendar-no-data")).toHaveTextContent(/Nothing is being filtered out/);
    expect(screen.queryByTestId("calendar-no-match")).toBeNull();
  });

  test("a session inside the visible month IS rendered under kind=session — the checker's case", async () => {
    vi.spyOn(sessionsApi, "listSessions").mockResolvedValue({
      sessions: [{ _id: "zoho", title: "Next European Study Destinations", date: "2026-09-24", org: "TOC", status: { transcribe: "done", index: "done" } }],
    });
    renderAt("/calendar?view=month&date=2026-09-25&kind=session");
    await waitFor(() => expect(screen.getByTestId("month-grid")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Next European Study Destinations/ })).toBeInTheDocument();
    expect(screen.getByTestId("calendar-counts")).toHaveTextContent("1 event(s) in this range");
    expect(screen.queryByTestId("calendar-no-match")).toBeNull();
  });

  test("a failed sessions load surfaces the error, not a filter message", async () => {
    vi.spyOn(sessionsApi, "listSessions").mockRejectedValue(new ApiError(401, "invalid api key"));
    renderAt("/calendar?date=2026-09-25&kind=session");
    expect(await screen.findByText("invalid api key")).toBeInTheDocument();
    expect(screen.queryByTestId("calendar-no-match")).toBeNull();
  });
});

describe("[C8] keyboard floor", () => {
  test("an event is reachable and openable without a mouse", async () => {
    renderAt("/calendar?view=day&date=2026-09-25");
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByTestId("time-grid")).toBeInTheDocument());
    const chip = screen.getByRole("button", { name: /Weekly Sync Up with Umesh/ });
    chip.focus();
    expect(document.activeElement).toBe(chip);
    await user.keyboard("{Enter}");
    expect(await screen.findByTestId("event-detail")).toBeInTheDocument();
  });

  test("every event chip carries an accessible name with its kind and time", async () => {
    renderAt("/calendar?view=day&date=2026-09-25");
    await waitFor(() => expect(screen.getByTestId("time-grid")).toBeInTheDocument());
    for (const chip of screen.getByTestId("time-grid").querySelectorAll("[data-event-id]")) {
      expect(chip.getAttribute("aria-label")).toMatch(/^(session|meeting): /);
    }
  });
});

describe("[I5] the working list view is not deleted", () => {
  test("the list view still renders the original Upcoming + Past lists", async () => {
    renderAt("/calendar?view=list");
    const agenda = await screen.findByTestId("agenda-view");
    expect(within(agenda).getByText("Weekly Sync Up with Umesh")).toBeInTheDocument();
    expect(within(agenda).getByText("Visa Blueprint")).toBeInTheDocument();
    expect(within(agenda).getByText("September 2026")).toBeInTheDocument();
    expect(within(agenda).getAllByRole("link", { name: /Join/ })[0]).toHaveAttribute("href", "https://meet.google.com/abc");
  });

  test("the Gmail review queue survives the rewrite and is reachable from every view", async () => {
    renderAt("/calendar?date=2026-09-25");
    expect(await screen.findByRole("button", { name: "Scan Gmail" })).toBeInTheDocument();
  });
});
