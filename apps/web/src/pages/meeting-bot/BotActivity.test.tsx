import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { BotActivity } from "./BotActivity.js";
import type { Loaded } from "./useLoad.js";

afterEach(cleanup);
const state = (data: unknown, over: Partial<Loaded<{ events?: unknown }>> = {}): Loaded<{ events?: unknown }> =>
  ({ data: data as { events?: unknown }, error: null, loading: false, noKey: false, reload: () => undefined, ...over });

describe("BotActivity", () => {
  test("join rules degradation is displayed as an operational alert", () => {
    render(<BotActivity state={state({ events: [{ id: "rules", at: "2026-10-14T12:00:00Z", kind: "rules-degraded",
      title: "Join rules unavailable", detail: "No validated snapshot is in use." }] })} />);
    expect(screen.getByRole("alert").textContent).toContain("Join rules degraded: Join rules unavailable");
    expect(screen.getByRole("alert").textContent).toContain("No validated snapshot is in use.");
  });
  test("renders career, test-data and failure events with keywords, detail and output path as plain text", () => {
    render(<BotActivity state={state({ events: [
      { id: "1", at: "2026-10-15T09:00:00Z", kind: "about-to-join", title: "Career Counselling Masterclass", careerGuidance: true, matchedKeywords: ["career", "counselling"] },
      { id: "2", at: "2026-10-15T09:10:00Z", kind: "capture-failed", title: "Google Cloud OnAir", testData: true, detail: "no recording registered" },
      { id: "3", at: "2026-10-15T11:00:00Z", kind: "capture-done", title: "<b>x</b>", outputPath: "data/toc-migrated/webinar-1" },
    ] })} />);
    expect(screen.getByText(/Will join: Career Counselling Masterclass/)).toBeTruthy();
    expect(screen.getByText(/Career guidance \(priority\)/)).toBeTruthy();
    expect(screen.getByText(/Matched: career, counselling/)).toBeTruthy();
    expect(screen.getByText(/Test data \(staging only\)/)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/Failed: Google Cloud OnAir/);
    expect(screen.getByText(/Output: data\/toc-migrated\/webinar-1/)).toBeTruthy();
    expect(document.querySelector("b")).toBeNull();
  });
  test("empty, loading and error states", () => {
    render(<BotActivity state={state({ events: [] })} />);
    expect(screen.getByText("No bot activity yet.")).toBeTruthy();
    cleanup();
    render(<BotActivity state={state(undefined, { error: new Error("x"), data: undefined })} />);
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
