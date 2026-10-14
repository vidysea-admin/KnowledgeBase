import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { TranscriptReview } from "./TranscriptReview.js";
import * as api from "../../api/transcriptReview.js";
import { ApiError } from "../../api/client.js";
afterEach(() => vi.restoreAllMocks());
const snapshot = (sessionId = "s1"): api.TranscriptReviewSnapshot => ({ sessionId, revision: "r1", refresh: "complete", turns: [
  { _id: "t1", text: "One", speakerRef: "spk:0", tStart: 0, tEnd: 10 },
  { _id: "t2", text: "Two", speakerRef: "spk:0", tStart: 10, tEnd: 20 },
  { _id: "t3", text: "Three", speakerRef: "spk:1", tStart: 20, tEnd: 30 },
  { _id: "t4", text: "Four", speakerRef: "spk:0", tStart: 30, tEnd: 40 },
] });
const edit = async () => {
  fireEvent.change(await screen.findByLabelText("Corrected text"), { target: { value: "Corrected" } });
  fireEvent.change(screen.getByLabelText("Review reason"), { target: { value: "Checked recording" } });
};
test("corrections require reason and use loaded revision; pending refresh is not completed", async () => {
  vi.spyOn(api, "getTranscriptReview").mockResolvedValueOnce(snapshot()).mockResolvedValue({ ...snapshot(), revision: "r2", refresh: "pending" });
  const save = vi.spyOn(api, "saveTranscriptReview").mockResolvedValue({ sessionId: "s1", revision: "r2", commit: "committed", refresh: "pending" });
  render(<TranscriptReview apiKey="k" sessionId="s1" />);
  fireEvent.change(await screen.findByLabelText("Corrected text"), { target: { value: "Corrected" } });
  expect(screen.getByRole("button", { name: "Save reviewed changes" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Review reason"), { target: { value: "Checked recording" } });
  fireEvent.click(screen.getByRole("button", { name: "Save reviewed changes" }));
  await waitFor(() => expect(save).toHaveBeenCalledWith("k", "s1", { expectedRevision: "r1", reason: "Checked recording", corrections: [{ turnId: "t1", text: "Corrected" }] }));
  expect((await screen.findByRole("status")).textContent).toContain("Knowledge refresh pending");
  expect(screen.getByRole("status").textContent).not.toContain("refresh complete");
});
test("mapping sends only explicitly selected contiguous block, not repeated labels elsewhere", async () => {
  vi.spyOn(api, "getTranscriptReview").mockResolvedValueOnce(snapshot()).mockResolvedValue({ ...snapshot(), revision: "r2", refresh: "failed" });
  const save = vi.spyOn(api, "saveTranscriptReview").mockResolvedValue({ sessionId: "s1", revision: "r2", commit: "committed", refresh: "failed" });
  render(<TranscriptReview apiKey="k" sessionId="s1" />);
  await screen.findByLabelText("Corrected text");
  fireEvent.change(screen.getByLabelText("Block end"), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText("Speaker reference"), { target: { value: "person:priya" } });
  fireEvent.change(screen.getByLabelText("Speaker name"), { target: { value: "Priya" } });
  fireEvent.change(screen.getByLabelText("Review reason"), { target: { value: "Checked intro" } });
  fireEvent.click(screen.getByRole("button", { name: "Save reviewed changes" }));
  await waitFor(() => expect(save).toHaveBeenCalledWith("k", "s1", { expectedRevision: "r1", reason: "Checked intro", corrections: [],
    mapping: { turnIds: ["t1", "t2"], speakerRef: "person:priya", speakerLabel: "Priya" } }));
  expect((await screen.findByRole("status")).textContent).toContain("Knowledge refresh failed");
});
test("mixed-label mapping blocks saving", async () => {
  vi.spyOn(api, "getTranscriptReview").mockResolvedValue(snapshot());
  const save = vi.spyOn(api, "saveTranscriptReview");
  render(<TranscriptReview apiKey="k" sessionId="s1" />);
  await screen.findByLabelText("Corrected text");
  fireEvent.change(screen.getByLabelText("Block end"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("Speaker reference"), { target: { value: "person:x" } });
  fireEvent.change(screen.getByLabelText("Speaker name"), { target: { value: "X" } });
  fireEvent.change(screen.getByLabelText("Review reason"), { target: { value: "Reason" } });
  expect(screen.getByRole("alert").textContent).toContain("same current speaker label");
  expect(screen.getByRole("button", { name: "Save reviewed changes" })).toBeDisabled(); expect(save).not.toHaveBeenCalled();
});
test("prototype-named turn IDs do not create phantom drafts", async () => {
  const value = snapshot(); value.turns[0]!._id = "__proto__";
  vi.spyOn(api, "getTranscriptReview").mockResolvedValue(value);
  render(<TranscriptReview apiKey="k" sessionId="s1" />);
  expect(await screen.findByLabelText("Corrected text")).toHaveValue("One");
  fireEvent.change(screen.getByLabelText("Review reason"), { target: { value: "Reason" } });
  expect(screen.getByRole("button", { name: "Save reviewed changes" })).toBeDisabled();
});
test("a stale reload after durable commit keeps success truth and refuses new editing", async () => {
  vi.spyOn(api, "getTranscriptReview").mockResolvedValue(snapshot());
  vi.spyOn(api, "saveTranscriptReview").mockResolvedValue({ sessionId: "s1", revision: "r2", commit: "committed", refresh: "pending" });
  render(<TranscriptReview apiKey="k" sessionId="s1" />);
  await edit(); fireEvent.click(screen.getByRole("button", { name: "Save reviewed changes" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Transcript saved. Knowledge refresh pending");
  expect(screen.getByRole("alert").textContent).toContain("did not return the committed revision");
  expect(screen.queryByLabelText("Corrected text")).toBeNull();
});
test("conflict keeps draft, disables retry and reloads an authoritative snapshot", async () => {
  vi.spyOn(api, "getTranscriptReview").mockResolvedValue(snapshot());
  vi.spyOn(api, "saveTranscriptReview").mockRejectedValue(new ApiError(412, "stale"));
  render(<TranscriptReview apiKey="k" sessionId="s1" />);
  await edit(); fireEvent.click(screen.getByRole("button", { name: "Save reviewed changes" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Your draft is retained");
  expect(screen.getByLabelText("Corrected text")).toHaveValue("Corrected");
  expect(screen.getByRole("button", { name: "Save reviewed changes" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Reload transcript" }));
  await waitFor(() => expect(screen.getByLabelText("Corrected text")).toHaveValue("One"));
});
test("key/session switch immediately hides previous data and rejects late save completion", async () => {
  const get = vi.spyOn(api, "getTranscriptReview").mockResolvedValueOnce(snapshot());
  let resolveSave!: (v: api.TranscriptReviewCommit) => void;
  vi.spyOn(api, "saveTranscriptReview").mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));
  const committed = vi.fn();
  const view = render(<TranscriptReview apiKey="a" sessionId="s1" onCommitted={committed} />);
  await edit(); fireEvent.click(screen.getByRole("button", { name: "Save reviewed changes" }));
  get.mockImplementation(() => new Promise(() => {}));
  view.rerender(<TranscriptReview apiKey="b" sessionId="s2" onCommitted={committed} />);
  expect(screen.queryByLabelText("Corrected text")).toBeNull(); expect(document.body.textContent).not.toContain("Current text: One");
  resolveSave({ sessionId: "s1", revision: "r2", commit: "committed", refresh: "complete" });
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  expect(committed).not.toHaveBeenCalled(); expect(screen.queryByRole("status")).toBeNull();
});
test("late load cannot expose earlier identity and markup is rendered as text", async () => {
  let resolveOld!: (v: api.TranscriptReviewSnapshot) => void;
  const get = vi.spyOn(api, "getTranscriptReview").mockImplementationOnce(() => new Promise((r) => { resolveOld = r; }));
  const current = snapshot("s2"); current.turns[0]!.text = "<img src=x onerror=alert(1)>";
  get.mockResolvedValueOnce(current);
  const view = render(<TranscriptReview apiKey="a" sessionId="s1" />);
  view.rerender(<TranscriptReview apiKey="b" sessionId="s2" />);
  expect(await screen.findByLabelText("Corrected text")).toHaveValue("<img src=x onerror=alert(1)>");
  resolveOld(snapshot());
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  expect(view.container.querySelector("img")).toBeNull(); expect(screen.getByLabelText("Corrected text")).not.toHaveValue("One");
});
test("a committed callback that unmounts cannot initiate another reload", async () => {
  const get = vi.spyOn(api, "getTranscriptReview").mockResolvedValue(snapshot());
  const save = vi.spyOn(api, "saveTranscriptReview").mockResolvedValue({ sessionId: "s1", revision: "r2", commit: "committed", refresh: "complete" });
  let dispose = () => {};
  const view = render(<TranscriptReview apiKey="k" sessionId="s1" onCommitted={() => dispose()} />);
  dispose = view.unmount;
  await edit(); fireEvent.click(screen.getByRole("button", { name: "Save reviewed changes" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(view.container.innerHTML).toBe(""));
  expect(get).toHaveBeenCalledTimes(1);
});
