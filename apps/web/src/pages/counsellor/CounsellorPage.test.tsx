import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AuthProvider, useAuth } from "../../auth/AuthContext.js";
import * as askApi from "../../api/ask.js";
import { ApiError } from "../../api/client.js";
import type { AskResponse } from "../../api/types.js";
import { CounsellorPage } from "./CounsellorPage.js";
vi.mock("./Avatar.js", () => ({ Avatar: ({ state }: { state: string }) => <div data-testid="avatar">{state}</div> }));
const adapter = vi.hoisted(() => ({ listen: vi.fn(), speak: vi.fn(), stop: vi.fn(), notify: null as ((state: any, detail?: string) => void) | null }));
vi.mock("./voice.js", () => ({ BrowserVoice: class { listen = adapter.listen; speak = adapter.speak; stop = adapter.stop; constructor(notify: any) { adapter.notify = notify; } } }));
function response(extra: Partial<AskResponse> = {}): AskResponse {
  return { answer: "Consider the source visa requirements.", verdict: "correct", reason: "source covers it", scored: [], web_used: false, insufficient_coverage: false,
    sources: { internal: [{ node_id: "visa", evidence: { sessionRef: "session/one", sourceQuotes: [{ id: "q1", turnId: "t/1", speakerRef: "spk:2", tStart: 12, tEnd: 19, quote: "Check eligibility first.", origin: "speech" }] } }], web: [] }, auditLog: [], ...extra };
}
function AccountControls() { const auth = useAuth(); return <><button onClick={() => auth.setApiKey("next")}>Change account</button><button onClick={() => auth.setApiKey("test")}>Same key login</button><button onClick={auth.clearApiKey}>Logout</button></>; }
function mount() { localStorage.setItem("lkbApiKey", "test"); return render(<AuthProvider><MemoryRouter><AccountControls /><CounsellorPage /></MemoryRouter></AuthProvider>); }
function submit(value = "  visa question  ") { fireEvent.change(screen.getByLabelText("Your question"), { target: { value } }); fireEvent.click(screen.getByRole("button", { name: "Ask counsellor" })); }
describe("counsellor authenticated consumer", () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); adapter.listen.mockReset(); adapter.speak.mockReset(); adapter.stop.mockReset(); });
  test("typed question uses existing authenticated ask and preserves separated source provenance", async () => {
    const spy = vi.spyOn(askApi, "ask").mockResolvedValue(response({ sources: { internal: response().sources.internal, web: [{ title: "Safe", url: "https://example.com" }, { title: "Unsafe", url: "javascript:alert(1)" }] } }));
    mount(); submit(); await screen.findByText("Consider the source visa requirements.");
    expect(spy).toHaveBeenCalledWith("test", "visa question"); expect(screen.getByRole("heading", { name: "Internal sources (1)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Web sources (2)" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "spk:2 · 12–19s" })).toHaveAttribute("href", "/sessions/session%2Fone#turn-t%2F1");
    expect(screen.getByText("Check eligibility first.")).toBeInTheDocument(); expect(screen.queryByRole("link", { name: "Unsafe" })).toBeNull();
  });
  test("voice conversation submits recognized transcript and reads qualified answer automatically", async () => {
    const spy = vi.spyOn(askApi, "ask").mockResolvedValue(response({ insufficient_coverage: true, auditLog: [{ step: "web_fallback_unavailable" }] }));
    mount(); fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Ask by voice" }));
    act(() => adapter.listen.mock.calls[0]![0]("spoken visa question"));
    await waitFor(() => expect(adapter.speak).toHaveBeenCalled()); expect(spy).toHaveBeenCalledWith("test", "spoken visa question");
    expect(adapter.speak.mock.calls[0]![0]).toContain("Internal knowledge was insufficient and the web fallback is unavailable.");
    expect(screen.getByLabelText("Your question")).toHaveValue("spoken visa question");
  });
  test("conversation completes two spoken turns after one explicit start and never listens during readback", async () => {
    const spy = vi.spyOn(askApi, "ask").mockResolvedValue(response());
    mount(); fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Ask by voice" }));
    act(() => adapter.listen.mock.calls[0]![0]("first spoken question"));
    await waitFor(() => expect(adapter.speak).toHaveBeenCalledTimes(1));
    act(() => adapter.notify!("idle")); expect(adapter.listen).toHaveBeenCalledTimes(1);
    const firstEnd = adapter.speak.mock.calls[0]![2];
    act(() => firstEnd()); expect(adapter.listen).toHaveBeenCalledTimes(2);
    act(() => { firstEnd(); adapter.listen.mock.calls[1]![0]("second spoken question"); });
    await waitFor(() => expect(adapter.speak).toHaveBeenCalledTimes(2));
    expect(adapter.listen).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls).toEqual([["test", "first spoken question"], ["test", "second spoken question"]]);
    act(() => adapter.speak.mock.calls[1]![2]()); expect(adapter.listen).toHaveBeenCalledTimes(3);
  });
  test.each(["stop", "mode off", "language", "account", "logout", "same key", "unmount"])("%s retires a captured readback completion", async (action) => {
    const spy = vi.spyOn(askApi, "ask").mockResolvedValue(response()); const view = mount();
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Ask by voice" }));
    const transcript = adapter.listen.mock.calls[0]![0]; act(() => transcript("first question"));
    await waitFor(() => expect(adapter.speak).toHaveBeenCalledTimes(1)); const end = adapter.speak.mock.calls[0]![2];
    if (action === "stop") fireEvent.click(screen.getByRole("button", { name: "Stop voice and cancel answer" }));
    if (action === "mode off") fireEvent.click(screen.getByRole("checkbox"));
    if (action === "language") fireEvent.change(screen.getByLabelText("Voice language"), { target: { value: "hi-IN" } });
    if (action === "account") fireEvent.click(screen.getByRole("button", { name: "Change account" }));
    if (action === "logout") fireEvent.click(screen.getByRole("button", { name: "Logout" }));
    if (action === "same key") fireEvent.click(screen.getByRole("button", { name: "Same key login" }));
    if (action === "unmount") view.unmount();
    act(() => { end(); transcript("stale question"); });
    expect(adapter.listen).toHaveBeenCalledTimes(1); expect(spy).toHaveBeenCalledTimes(1);
  });
  test("old completion cannot restart a newly started conversation", async () => {
    vi.spyOn(askApi, "ask").mockResolvedValue(response()); mount();
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Ask by voice" }));
    act(() => adapter.listen.mock.calls[0]![0]("first question"));
    await waitFor(() => expect(adapter.speak).toHaveBeenCalledTimes(1)); const oldEnd = adapter.speak.mock.calls[0]![2];
    fireEvent.click(screen.getByRole("button", { name: "Stop voice and cancel answer" }));
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Ask by voice" }));
    act(() => oldEnd()); expect(adapter.listen).toHaveBeenCalledTimes(2);
  });
  test.each(["recognition denied", "recognition unavailable", "synthesis failed", "voice unavailable"])("%s ends enabled conversation without rearming", async (failure) => {
    vi.spyOn(askApi, "ask").mockResolvedValue(response()); mount();
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Ask by voice" }));
    if (failure.startsWith("recognition")) {
      act(() => adapter.notify!("error", failure));
    } else {
      act(() => adapter.listen.mock.calls[0]![0]("question"));
      await waitFor(() => expect(adapter.speak).toHaveBeenCalledTimes(1));
      act(() => { adapter.notify!("error", failure); adapter.speak.mock.calls[0]![2](); });
    }
    expect(screen.getByRole("checkbox")).not.toBeChecked(); expect(adapter.listen).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent(failure);
  });
  test("API failure ends conversation rather than listening or reading a previous answer", async () => {
    vi.spyOn(askApi, "ask").mockRejectedValue(new ApiError(503, "unavailable")); mount();
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Ask by voice" }));
    act(() => adapter.listen.mock.calls[0]![0]("question")); await screen.findByRole("alert");
    expect(screen.getByRole("checkbox")).not.toBeChecked(); expect(adapter.listen).toHaveBeenCalledTimes(1); expect(adapter.speak).not.toHaveBeenCalled();
  });
  test("dictation is editable and blank input cannot call ask", () => {
    const spy = vi.spyOn(askApi, "ask").mockResolvedValue(response()); mount(); submit("   "); expect(spy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Dictate question" })); act(() => adapter.listen.mock.calls[0]![0]("dictated question"));
    expect(screen.getByLabelText("Your question")).toHaveValue("dictated question"); expect(spy).not.toHaveBeenCalled();
  });
  test("avatar follows adapter events and pending API state; stale notify cannot restart it", async () => {
    let resolve!: (value: AskResponse) => void; vi.spyOn(askApi, "ask").mockImplementation(() => new Promise((done) => { resolve = done; }));
    mount(); act(() => adapter.notify!("listening")); expect(screen.getByTestId("avatar")).toHaveTextContent("listening");
    act(() => adapter.notify!("speaking")); expect(screen.getByTestId("avatar")).toHaveTextContent("speaking");
    act(() => adapter.notify!("error", "voice failed")); expect(screen.getByRole("alert")).toHaveTextContent("voice failed");
    submit(); expect(screen.getByTestId("avatar")).toHaveTextContent("thinking");
    const oldNotify = adapter.notify!; fireEvent.click(screen.getByRole("button", { name: "Change account" }));
    await act(async () => { resolve(response()); oldNotify("speaking"); }); expect(screen.getByTestId("avatar")).toHaveTextContent("idle");
  });
  test("failed next query clears old answer and does not speak it", async () => {
    vi.spyOn(askApi, "ask").mockResolvedValueOnce(response()).mockRejectedValueOnce(new ApiError(429, "rate limited")); mount(); submit();
    await screen.findByText("Consider the source visa requirements."); submit("new question"); await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent("rate limited"); expect(screen.queryByText("Consider the source visa requirements.")).toBeNull(); expect(adapter.speak).not.toHaveBeenCalled();
  });
  test.each(["Change account", "Same key login", "Logout"])("%s retires delayed answer and captured recognition callback", async (action) => {
    let resolve!: (value: AskResponse) => void; const spy = vi.spyOn(askApi, "ask").mockImplementation(() => new Promise((done) => { resolve = done; }));
    mount(); fireEvent.click(screen.getByRole("button", { name: "Dictate question" })); const oldTranscript = adapter.listen.mock.calls[0]![0]; submit();
    fireEvent.click(screen.getByRole("button", { name: action })); await act(async () => { resolve(response()); oldTranscript("old private question"); });
    expect(screen.queryByText("Consider the source visa requirements.")).toBeNull(); expect(screen.getByLabelText("Your question")).toHaveValue("");
    expect(spy).toHaveBeenCalledTimes(1); expect(adapter.speak).not.toHaveBeenCalled(); expect(adapter.stop).toHaveBeenCalled();
  });
  test("cancel and unmount retire pending API and microphone callbacks", async () => {
    let resolve!: (value: AskResponse) => void; const spy = vi.spyOn(askApi, "ask").mockImplementation(() => new Promise((done) => { resolve = done; }));
    const view = mount(); fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Ask by voice" }));
    const oldTranscript = adapter.listen.mock.calls[0]![0]; submit(); fireEvent.click(screen.getByRole("button", { name: "Stop voice and cancel answer" }));
    await act(async () => { resolve(response()); oldTranscript("stale"); }); expect(screen.queryByText("Consider the source visa requirements.")).toBeNull();
    view.unmount(); oldTranscript("unmounted"); expect(spy).toHaveBeenCalledTimes(1); expect(adapter.speak).not.toHaveBeenCalled();
  });
});
