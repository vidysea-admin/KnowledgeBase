import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SpeakerSuggestions } from "./SpeakerSuggestions.js";
import * as api from "../../api/speakerSuggestions.js";
import { ApiError } from "../../api/client.js";

const SUG: api.SpeakerSuggestion = {
  id: "tenant-A-s1-spk:1-person:priya-nair", sessionId: "s1", speakerRef: "spk:1", suggestedName: "Priya Nair", status: "suggested",
  quotes: [{ turnId: "t0", quote: "Priya Nair, what do you think about the new rules", kind: "called-on" }],
};
afterEach(() => vi.restoreAllMocks());

describe("SpeakerSuggestions", () => {
  test("shows 'Suggested: <name>' with its quote, an unconfirmed badge, Confirm and Reject - and no final marker", async () => {
    vi.spyOn(api, "listSpeakerSuggestions").mockResolvedValue([SUG]);
    render(<SpeakerSuggestions apiKey="k" sessionId="s1" />);
    const card = await screen.findByTestId("speaker-suggestion");
    expect(card.textContent).toContain("Suggested: Priya Nair");
    expect(card.textContent).toContain("Priya Nair, what do you think about the new rules");
    expect(card.textContent).toContain("called-on");
    expect(card.textContent).toContain("unconfirmed");
    expect(card.style.border).toContain("dashed");
    expect(screen.getByRole("button", { name: "Confirm" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reject" })).toBeTruthy();
    expect(screen.queryByTestId("speaker-confirmed")).toBeNull();
    expect(document.body.textContent).not.toContain("human-confirmed");
  });

  test("Confirm calls the API for this session and id, then the card becomes a human-confirmed final name", async () => {
    vi.spyOn(api, "listSpeakerSuggestions").mockResolvedValue([SUG]);
    const decide = vi.spyOn(api, "decideSpeakerSuggestion").mockResolvedValue("confirmed");
    render(<SpeakerSuggestions apiKey="k" sessionId="s1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(screen.getByTestId("speaker-confirmed").textContent).toContain("Confirmed: Priya Nair"));
    expect(decide).toHaveBeenCalledWith("k", "s1", SUG.id, "confirm");
    expect(screen.getByTestId("speaker-confirmed").textContent).toContain("human-confirmed");
    expect(screen.queryByTestId("speaker-suggestion")).toBeNull();
  });

  test("Reject calls the API and removes the suggestion", async () => {
    vi.spyOn(api, "listSpeakerSuggestions").mockResolvedValue([SUG]);
    const decide = vi.spyOn(api, "decideSpeakerSuggestion").mockResolvedValue("rejected");
    const { container } = render(<SpeakerSuggestions apiKey="k" sessionId="s1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));
    await waitFor(() => expect(container.textContent).not.toContain("Priya Nair"));
    expect(decide).toHaveBeenCalledWith("k", "s1", SUG.id, "reject");
  });

  test("a failed decision keeps the suggestion unconfirmed and says so; a 409 has its own message", async () => {
    vi.spyOn(api, "listSpeakerSuggestions").mockResolvedValue([SUG]);
    const decide = vi.spyOn(api, "decideSpeakerSuggestion").mockRejectedValueOnce(new ApiError(503, "x")).mockRejectedValueOnce(new ApiError(409, "x"));
    render(<SpeakerSuggestions apiKey="k" sessionId="s1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Could not save");
    expect(screen.getByTestId("speaker-suggestion")).toBeTruthy();
    expect(screen.queryByTestId("speaker-confirmed")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("already decided"));
    expect(decide).toHaveBeenCalledTimes(2);
  });

  test("renders nothing when there are no suggestions or the endpoint fails (the session page must not break)", async () => {
    const list = vi.spyOn(api, "listSpeakerSuggestions").mockResolvedValueOnce([]).mockRejectedValueOnce(new ApiError(503, "down"));
    const a = render(<SpeakerSuggestions apiKey="k" sessionId="s1" />);
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    expect(a.container.innerHTML).toBe("");
    a.unmount();
    const b = render(<SpeakerSuggestions apiKey="k" sessionId="s2" />);
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(b.container.innerHTML).toBe("");
  });

  test("a quote is rendered as text, never as HTML", async () => {
    vi.spyOn(api, "listSpeakerSuggestions").mockResolvedValue([{ ...SUG, quotes: [{ turnId: "t0", quote: "<img src=x onerror=alert(1)> Priya Nair", kind: "address" }] }]);
    const { container } = render(<SpeakerSuggestions apiKey="k" sessionId="s1" />);
    await screen.findByTestId("speaker-suggestion");
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});
