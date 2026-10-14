import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi, describe, test, expect } from "vitest";
import { AuthProvider } from "../../auth/AuthContext.js";
import { SessionsListPage } from "./SessionsListPage.js";
import * as sessionsApi from "../../api/sessions.js";
import { ApiError } from "../../api/client.js";

function renderPage(enableFilters?: boolean) {
  localStorage.setItem("lkbApiKey", "test-key");
  return render(
    <AuthProvider>
      <MemoryRouter>
        <SessionsListPage enableFilters={enableFilters} />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("SessionsListPage", () => {
  test("renders real sessions with a working link to the detail route", async () => {
    vi.spyOn(sessionsApi, "listSessions").mockResolvedValue({
      sessions: [{ _id: "s1", title: "A Real Session", date: "2026-04-21", org: "TOC", status: { transcribe: "done", index: "done" } }],
    });
    renderPage();
    const link = await screen.findByRole("link", { name: /A Real Session/ });
    expect(link).toHaveAttribute("href", "/sessions/s1");
  });

  test("renders real transcribe/index status badges per session", async () => {
    vi.spyOn(sessionsApi, "listSessions").mockResolvedValue({
      sessions: [{ _id: "s1", title: "A Real Session", date: "2026-04-21", org: "TOC", status: { transcribe: "done", index: "processing" } }],
    });
    renderPage();
    await screen.findByRole("link", { name: /A Real Session/ });
    expect(screen.getByText("transcribe: done")).toBeInTheDocument();
    expect(screen.getByText("index: processing")).toBeInTheDocument();
  });

  test("shows an honest empty state when there are no sessions", async () => {
    vi.spyOn(sessionsApi, "listSessions").mockResolvedValue({ sessions: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText("No sessions found for this tenant.")).toBeInTheDocument());
  });

  test("shows the real error message on a failed fetch, never a silent blank page", async () => {
    vi.spyOn(sessionsApi, "listSessions").mockRejectedValue(new ApiError(403, "missing sessions scope"));
    renderPage();
    await waitFor(() => expect(screen.getByText("missing sessions scope")).toBeInTheDocument());
  });

  const three = [
    { _id: "s1", title: "April One", date: "2026-04-21", org: "TOC", participants: ["Ann"], status: { transcribe: "done", index: "done" } },
    { _id: "s2", title: "May Two", date: "2026-05-02", org: "Acme", participants: ["Bob"], status: { transcribe: "done", index: "processing" } },
    { _id: "s3", title: "May Three", date: "2026-05-09", org: "Acme", status: { transcribe: "failed", index: "queued" } },
  ];

  test("filters are OFF by default: no filter bar, all sessions listed", async () => {
    vi.spyOn(sessionsApi, "listSessions").mockResolvedValue({ sessions: three });
    renderPage();
    await screen.findByRole("link", { name: /April One/ });
    expect(screen.queryByRole("group", { name: "Session filters" })).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  test("with filters on: month, status, participant narrow the list and the processed share follows", async () => {
    vi.spyOn(sessionsApi, "listSessions").mockResolvedValue({ sessions: three });
    renderPage(true);
    await screen.findByRole("link", { name: /April One/ });
    expect(screen.getByTestId("processed-share")).toHaveTextContent("1 of 3 shown sessions fully processed (33%)");
    fireEvent.change(screen.getByLabelText("Month"), { target: { value: "2026-05" } });
    expect(screen.queryByRole("link", { name: /April One/ })).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByTestId("processed-share")).toHaveTextContent("0 of 2 shown sessions fully processed (0%)");
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "failed" } });
    expect(screen.getByRole("link", { name: /May Three/ })).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Participant"), { target: { value: "Ann" } });
    expect(screen.getByText("No sessions match the filters.")).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("group", { name: "Session filters" })).getByRole("button", { name: "Clear filters" }));
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });
});
