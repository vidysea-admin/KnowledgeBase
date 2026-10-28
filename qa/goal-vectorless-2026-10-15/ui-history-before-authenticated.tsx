import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ReviewHistory } from "./ReviewHistory.js";
import * as api from "../../api/transcriptReview.js";
afterEach(() => vi.restoreAllMocks());
const row = { revision: "r1", parentRevision: "base-1", actorRef: "key:t", reviewedAt: "2026-10-14T10:00:00Z", reason: "Checked <b>recording</b>",
  changes: [{ turnId: "t1", before: { text: "Original", speakerRef: "spk:0" }, after: { text: "Corrected", speakerRef: "person:reviewed" } }] };
test("history is read with current identity and renders reasons/changes as text", async () => {
  const get = vi.spyOn(api, "getTranscriptReviewHistory").mockResolvedValue([row]);
  const view = render(<ReviewHistory apiKey="k" sessionId="s1" revision="r1" refresh="complete" disabled={false} onRefreshed={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Show review history" }));
  expect(await screen.findByText("Reason: Checked <b>recording</b>")).toBeInTheDocument();
  expect(view.container.querySelector("b")).toBeNull(); expect(get).toHaveBeenCalledWith("k", "s1");
});
test("failed refresh exposes retry; successful refresh invokes canonical reload", async () => {
  const refresh = vi.spyOn(api, "refreshTranscriptReview").mockResolvedValue("complete"), reload = vi.fn();
  render(<ReviewHistory apiKey="k" sessionId="s1" revision="r1" refresh="failed" disabled={false} onRefreshed={reload} />);
  fireEvent.click(screen.getByRole("button", { name: "Retry knowledge refresh" }));
  expect((await screen.findByRole("status")).textContent).toContain("Knowledge refresh complete");
  await waitFor(() => expect(reload).toHaveBeenCalledTimes(1)); expect(refresh).toHaveBeenCalledWith("k", "s1", "r1");
});
test("late history and refresh cannot disclose old identity or trigger reload after unmount", async () => {
  let release!: (rows: api.TranscriptReviewRevision[]) => void;
  vi.spyOn(api, "getTranscriptReviewHistory").mockImplementation(() => new Promise((r) => { release = r; }));
  const reload = vi.fn(), view = render(<ReviewHistory apiKey="a" sessionId="s1" revision="r1" refresh="pending" disabled={false} onRefreshed={reload} />);
  fireEvent.click(screen.getByRole("button", { name: "Show review history" }));
  view.rerender(<ReviewHistory apiKey="b" sessionId="s2" revision="r2" refresh="pending" disabled={false} onRefreshed={reload} />);
  release([row]); await waitFor(() => expect(screen.queryByText("Reason: Checked <b>recording</b>")).toBeNull());
  let done!: (state: api.TranscriptRefresh) => void;
  vi.spyOn(api, "refreshTranscriptReview").mockImplementation(() => new Promise((r) => { done = r; }));
  fireEvent.click(screen.getByRole("button", { name: "Refresh knowledge" })); view.unmount(); done("complete");
  await Promise.resolve(); expect(reload).not.toHaveBeenCalled();
});
