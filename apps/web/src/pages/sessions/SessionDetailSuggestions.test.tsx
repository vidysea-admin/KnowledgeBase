import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AuthProvider } from "../../auth/AuthContext.js";
import { SessionDetailPage } from "./SessionDetailPage.js";
import * as sessionsApi from "../../api/sessions.js";
import * as suggestionsApi from "../../api/speakerSuggestions.js";

afterEach(() => vi.restoreAllMocks());

describe("SessionDetailPage speaker suggestions", () => {
  test("the session view shows a pending suggestion apart from the transcript's own speaker labels", async () => {
    localStorage.setItem("lkbApiKey", "test-key");
    vi.spyOn(sessionsApi, "getSession").mockResolvedValue({
      session: { _id: "s1", title: "Panel", date: "2026-10-01", status: { transcribe: "done", index: "done" } },
      page: null, claims: [], turns: [{ _id: "t1", speakerRef: "spk:1", tStart: 0, tEnd: 4, text: "I think the rules are slow." }],
    });
    const list = vi.spyOn(suggestionsApi, "listSpeakerSuggestions").mockResolvedValue([{
      id: "i1", sessionId: "s1", speakerRef: "spk:1", suggestedName: "Priya Nair", status: "suggested",
      quotes: [{ turnId: "t0", quote: "Priya Nair, what do you think about the rules", kind: "called-on" }],
    }]);
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/sessions/s1"]}>
          <Routes><Route path="/sessions/:id" element={<SessionDetailPage />} /></Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
    const card = await screen.findByTestId("speaker-suggestion");
    expect(card.textContent).toContain("Suggested: Priya Nair");
    expect(list).toHaveBeenCalledWith("test-key", "s1");
    // the transcript still shows the diarized label, not the suggested name
    const turn = document.getElementById("turn-t1")!;
    expect(turn.textContent).toContain("spk:1");
    expect(turn.textContent).not.toContain("Priya Nair");
  });
});
