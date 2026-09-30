import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, test, expect, vi } from "vitest";
import { MeetingBotPage } from "./MeetingBotPage.js";
import * as sessions from "../api/sessions.js";
vi.mock("../auth/AuthContext.js", () => ({ useAuth: () => ({ apiKey: "test-key" }) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const display = () => render(<MemoryRouter><MeetingBotPage /></MemoryRouter>);
describe("MeetingBotPage operational status", () => {
  test("shows real queued/failed/processing/ready/action-required states and retries", async () => {
    vi.spyOn(sessions, "listWebinarOperations").mockResolvedValue({ omitted: 0, operations: [
      { id: "queued", title: "Upcoming webinar", status: "queued", attempts: 1 },
      { id: "failed", title: "Capture failed", status: "failed", attempts: 2, reason: "processing-failed" },
      { id: "processing", title: "Processing webinar", status: "processing", attempts: 1 },
      { id: "ready", title: "Ready webinar", status: "ready", attempts: 1 },
      { id: "barrier", title: "Registration barrier", status: "action_required", attempts: 0, reason: "needs-registration" },
    ] });
    display();
    await screen.findByText("Registration barrier");
    expect(screen.getByText("Attempts: 2", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Reason: needs registration")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open recording and knowledge" })).toHaveAttribute("href", "/sessions/ready");
    expect(sessions.listWebinarOperations).toHaveBeenCalledWith("test-key");
    expect(screen.getByText(/requires independent capture and restart proof/)).toBeInTheDocument();
  });
  test("reports honest empty state without claiming a successful live capture", async () => {
    vi.spyOn(sessions, "listWebinarOperations").mockResolvedValue({ omitted: 0, operations: [] });
    display();
    await screen.findByText(/^No webinar operations recorded for this tenant yet/);
    expect(screen.getByRole("alert")).toHaveTextContent("discovery is unverified");
    expect(screen.queryByText("Live since 2026-09-24")).toBeNull();
  });
  test("failed status load stays visible instead of healthy empty", async () => {
    vi.spyOn(sessions, "listWebinarOperations").mockRejectedValue(new Error("private provider details"));
    display();
    expect(await screen.findByRole("alert")).toHaveTextContent("Webinar status unavailable");
    expect(screen.queryByText("No webinar operations recorded for this tenant yet.")).toBeNull();
    expect(screen.queryByText(/private provider/)).toBeNull();
  });
  test("discloses bounded history omissions", async () => {
    vi.spyOn(sessions, "listWebinarOperations").mockResolvedValue({ omitted: 3, operations: [] });
    display(); await screen.findByText(/3 older operations remain/);
  });
  test.each(["failed", "stale"])("shows %s discovery even with no operations", async (state) => {
    const checkedAt = new Date(Date.now() - (state === "stale" ? 16 * 60000 : 0)).toISOString();
    vi.spyOn(sessions, "listWebinarOperations").mockResolvedValue({omitted:0,operations:[],discovery:{
      calendar:{status:state === "failed" ? "failed" : "healthy",checkedAt,lastSuccessAt:checkedAt},
      gmail:{status:"healthy",checkedAt:new Date().toISOString(),lastSuccessAt:new Date().toISOString()},
    }});
    display();
    expect(await screen.findByRole("alert")).toHaveTextContent(state === "failed" ? "Calendar discovery: unavailable" : "no fresh check within 15 minutes");
    expect(screen.getByText(/Gmail discovery: healthy/)).toBeInTheDocument();
  });
  test("current successful discovery is healthy without an outage alert", async () => {
    const checkedAt = new Date().toISOString();
    vi.spyOn(sessions, "listWebinarOperations").mockResolvedValue({omitted:0,operations:[],discovery:{
      calendar:{status:"healthy",checkedAt,lastSuccessAt:checkedAt},gmail:{status:"healthy",checkedAt,lastSuccessAt:checkedAt},
    }});
    display(); await screen.findByText(/Calendar discovery: healthy/);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
