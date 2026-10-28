import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test } from "vitest";
import { AgendaView } from "./AgendaView.js";
import { EventDetail } from "./EventDetail.js";
import type { CalendarEvent } from "./calendar-model.js";

const HOSTILE = [
  "javascript:alert(document.domain)",
  " javascript:alert(1)",
  "\tjavascript:alert(1)",
  "JaVaScRiPt:alert(1)",
  "java\nscript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "vbscript:msgbox(1)",
  "//evil.example/x",
  "not a url",
];

function event(meetingUrl: string): CalendarEvent {
  return { id: "m1", kind: "meeting", title: "Sync", start: new Date(2026, 9, 25, 11), end: new Date(2026, 9, 25, 11, 30), allDay: false, meetingUrl };
}

function detail(meetingUrl: string) {
  return render(<MemoryRouter><EventDetail event={event(meetingUrl)} onClose={() => {}} /></MemoryRouter>);
}

function agenda(meetingUrl: string) {
  const meetings = [{ id: "m1", title: "Sync", startTime: "2026-10-25T11:00:00.000Z", endTime: "2026-10-25T11:30:00.000Z", meetingUrl }];
  return render(<MemoryRouter><AgendaView sessions={[]} sessionsError={null} meetings={meetings} meetingsError={null} /></MemoryRouter>);
}

describe("calendar join links render only http(s) as links (ISS-WEBAUTH-001)", () => {
  test("EventDetail: https meeting URL is a link", () => {
    detail("https://meet.google.com/abc-defg-hij");
    expect(screen.getByTestId("detail-join-link")).toHaveAttribute("href", "https://meet.google.com/abc-defg-hij");
    expect(screen.queryByTestId("detail-join-text")).toBeNull();
  });

  test("AgendaView: https meeting URL is a link", () => {
    agenda("https://meet.google.com/abc-defg-hij");
    expect(screen.getByRole("link", { name: /Join/ })).toHaveAttribute("href", "https://meet.google.com/abc-defg-hij");
  });

  test.each(HOSTILE.map((h) => [h]))("EventDetail renders %j as text, not a link", (url) => {
    const { container } = detail(url);
    expect(screen.queryByTestId("detail-join-link")).toBeNull();
    expect(container.querySelector("a[href]")).toBeNull();
    expect(screen.getByTestId("detail-join-text")).toBeInTheDocument();
  });

  test.each(HOSTILE.map((h) => [h]))("AgendaView renders %j as text, not a link", (url) => {
    const { container } = agenda(url);
    expect(container.querySelector("a[href]")).toBeNull();
    expect(screen.getByTestId("agenda-join-text")).toBeInTheDocument();
  });
});
