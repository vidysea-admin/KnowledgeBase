import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, test, expect, vi } from "vitest";
import { SendNowForm, untilHint } from "./SendNowForm.js";
import { MeetingBotPage } from "../MeetingBotPage.js";
import * as sessions from "../../api/sessions.js";
import * as calendar from "../../api/calendar.js";

const KEY = "lkb_secret_key_value_123";
vi.mock("../../auth/AuthContext.js", () => ({ useAuth: () => ({ apiKey: "lkb_secret_key_value_123" }) }));
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function fill(url = "https://meet.google.com/abc-defg-hij", until = "23:59") {
  fireEvent.change(screen.getByLabelText("Meeting URL"), { target: { value: url } });
  fireEvent.change(screen.getByLabelText("Record until"), { target: { value: until } });
}
const submit = () => fireEvent.click(screen.getByRole("button", { name: "Send bot now" }));

describe("SendNowForm", () => {
  test("202: shows launching with the job id, request is exact, auth header only", async () => {
    fetchMock.mockResolvedValue(json(202, { jobId: "job-42", status: "launching", meetingKey: "k", platform: "meet" }));
    render(<SendNowForm apiKey={KEY} />); fill("  https://meet.google.com/abc-defg-hij ", " 23:59 "); submit();
    expect(await screen.findByRole("status")).toHaveTextContent("Launching (job id job-42)");
    expect(screen.getByRole("status")).toHaveTextContent("has not joined yet");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = fetchMock.mock.calls[0]!;
    expect(String(path)).toMatch(/\/calendar\/send-now$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ meetingUrl: "https://meet.google.com/abc-defg-hij", until: "23:59" });
    expect(init.headers.authorization).toBe(`Bearer ${KEY}`);
  });

  test("double click sends one request", async () => {
    let release!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>(r => { release = r; }));
    render(<SendNowForm apiKey={KEY} />); fill();
    const btn = screen.getByRole("button", { name: "Send bot now" });
    fireEvent.click(btn); fireEvent.click(btn); fireEvent.submit(btn.closest("form")!);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Sending..." })).toBeDisabled();
    release(json(202, { jobId: "j1", status: "launching" }));
    await screen.findByRole("status");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("400 shows the server reason and no success", async () => {
    fetchMock.mockResolvedValue(json(400, { error: "send_now_refused", reason: "bad-host", message: "link host is not allowed" }));
    render(<SendNowForm apiKey={KEY} />); fill("https://evil.example/x"); submit();
    const a = await screen.findByRole("alert");
    expect(a).toHaveTextContent("link host is not allowed"); expect(a).toHaveTextContent("No bot was sent");
    expect(screen.queryByRole("status")).toBeNull();
  });

  test("403 explains the missing scope, disables the form, does not sign out", async () => {
    const onInvalid = vi.fn(); window.addEventListener("lkb:auth-invalidated", onInvalid);
    fetchMock.mockResolvedValue(json(403, { error: "forbidden", message: "missing scope" }));
    render(<SendNowForm apiKey={KEY} />); fill(); submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Your key lacks the send-now scope");
    expect(screen.getByLabelText("Meeting URL")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send bot now" })).toBeDisabled();
    expect(onInvalid).not.toHaveBeenCalled();
    window.removeEventListener("lkb:auth-invalidated", onInvalid);
  });

  test("403 keeps the rest of the meeting-bot page working", async () => {
    vi.spyOn(calendar, "listUpcomingMeetings").mockResolvedValue({ meetings: [] });
    vi.spyOn(sessions, "listSessions").mockResolvedValue({ sessions: [] });
    vi.spyOn(sessions, "listWebinarOperations").mockResolvedValue({ omitted: 0, operations: [] });
    fetchMock.mockResolvedValue(json(403, { error: "forbidden" }));
    render(<MemoryRouter><MeetingBotPage /></MemoryRouter>);
    fill(); submit();
    expect(await screen.findByText(/lacks the send-now scope/)).toBeInTheDocument();
    expect(await screen.findByText("No upcoming meetings on the calendar.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Meeting bot" })).toBeInTheDocument();
  });

  test.each([
    [409, "Already recording"], [502, "launcher failed to start"], [503, "unavailable on this server"],
  ])("%i is shown as an error, never as success", async (status, text) => {
    fetchMock.mockResolvedValue(json(status, { error: "x", message: "m" }));
    render(<SendNowForm apiKey={KEY} />); fill(); submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "Send bot now" })).not.toBeDisabled();
  });

  test("network failure and a 202 without a job id are not success", async () => {
    fetchMock.mockRejectedValueOnce(new Error("boom"));
    render(<SendNowForm apiKey={KEY} />); fill(); submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the API");
    fetchMock.mockResolvedValueOnce(json(202, { status: "launching" })); submit();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("without a job id"));
    expect(screen.queryByRole("status")).toBeNull();
  });

  test("empty fields send nothing; the key and the URL never appear in the DOM", async () => {
    fetchMock.mockResolvedValue(json(202, { jobId: "j9", status: "launching" }));
    const { container } = render(<SendNowForm apiKey={KEY} />);
    expect(screen.getByRole("button", { name: "Send bot now" })).toBeDisabled();
    fireEvent.submit(container.querySelector("form")!);
    expect(fetchMock).not.toHaveBeenCalled();
    fill("https://meet.google.com/abc-defg-hij?pwd=SECRETPWD"); submit(); await screen.findByRole("status");
    expect(container.innerHTML).not.toContain(KEY);
    expect(container.textContent).not.toContain("SECRETPWD");
  });

  test("no key: nothing is sent", () => {
    render(<SendNowForm apiKey={null} />);
    expect(screen.getByRole("button", { name: "Send bot now" })).toBeDisabled();
  });

  test("real job id triggers scoped status GET with truthful running label", async () => {
    const jobId = "send-now-20261014100000-abcdef";
    fetchMock.mockResolvedValueOnce(json(202, { jobId, status: "launching" }))
      .mockResolvedValueOnce(json(200, { jobId, status: "running", joined: "unknown" }));
    render(<SendNowForm apiKey={KEY} />); fill(); submit();
    expect(await screen.findByText(/recorder process is alive/)).toHaveTextContent("Meeting admission is unknown");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![0]).toContain(`/calendar/send-now/${jobId}`);
    expect(fetchMock.mock.calls[1]![1].headers.authorization).toBe(`Bearer ${KEY}`);
  });

  test("replacing key ignores late POST result and never polls old job with new key", async () => {
    let release!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>(r => { release = r; }));
    const h = render(<SendNowForm apiKey={KEY} />); fill(); submit();
    h.rerender(<SendNowForm apiKey="replacement" />);
    release(json(202, { jobId: "send-now-20261014100000-abcdef", status: "launching" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Send bot now" })).not.toBeDisabled());
    expect(screen.queryByRole("status")).toBeNull(); expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("replacing key after launch clears old job without issuing a GET under replacement key", async () => {
    const jobId = "send-now-20261014100000-abcdef";
    fetchMock.mockResolvedValueOnce(json(202, { jobId, status: "launching" }))
      .mockResolvedValueOnce(json(200, { jobId, status: "running", joined: "unknown" }));
    const h = render(<SendNowForm apiKey={KEY} />); fill(); submit();
    await screen.findByText(/recorder process is alive/); h.rerender(<SendNowForm apiKey="replacement" />);
    expect(screen.queryByRole("status")).toBeNull(); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("untilHint (advisory only)", () => {
  const now = new Date(2026, 9, 12, 10, 0, 0).getTime();
  test.each([
    ["", null], ["18:00", null], ["2026-10-13T08:00:00+05:30", null],
    ["25:00", "24-hour"], ["09:00", "already passed"], ["noon", "HH:MM"], ["2026-10-12T18:00:00", "HH:MM"],
    ["2026-10-15T18:00:00Z", "24 hours"], ["2020-01-01T00:00:00Z", "in the past"],
  ])("%s", (v, expected) => {
    const h = untilHint(v, now);
    if (expected === null) expect(h).toBeNull(); else expect(h).toContain(expected);
  });
});
