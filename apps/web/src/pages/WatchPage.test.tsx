/**
 * apps/web/src/pages/WatchPage.test.tsx — U4c (u4c-watch-page). Every interaction is asserted by
 * its STATE CHANGE, not by a control merely existing (plan.md's rule for this unit) — "poll now"
 * tests assert the summary text and row contents that appear afterwards, never just the button.
 *
 * `vi.setSystemTime` pins "now" so every stale/healthy boundary is a real interval comparison
 * (checkIntervalHours vs a real elapsed time), not a hardcoded string match.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { vi, describe, test, expect, beforeEach, afterEach } from "vitest";
import { AuthProvider } from "../auth/AuthContext.js";
import { WatchPage } from "./WatchPage.js";
import * as watchedApi from "../api/watched-sources.js";
import * as candidatesApi from "../api/meeting-candidates.js";
import * as watchStateApi from "../api/watch-state.js";
import { ApiError } from "../api/client.js";
import type { WatchedSource, WatchedSourcesRunSummary } from "../api/watched-sources.js";
import type { MeetingCandidate } from "../api/types.js";
import type { WatchStateResponse } from "../api/watch-state.js";

const NOW = new Date("2026-09-28T12:00:00.000Z");

function isoMinutesAgo(min: number): string {
  return new Date(NOW.getTime() - min * 60_000).toISOString();
}

function renderPage() {
  localStorage.setItem("lkbApiKey", "test-key");
  return render(
    <AuthProvider>
      <MemoryRouter>
        <WatchPage />
      </MemoryRouter>
    </AuthProvider>,
  );
}

const HEALTHY: WatchedSource = {
  _id: "ws-healthy", url: "https://a.example/feed", label: "Official feed",
  reputationTier: "official", checkIntervalHours: 1, active: true,
  lastFetch: { fetchedAt: isoMinutesAgo(30), hash: "abc", diffFrom: null },
};

const STALE: WatchedSource = {
  _id: "ws-stale", url: "https://b.example/feed", label: "Slow portal",
  reputationTier: "community", checkIntervalHours: 1, active: true,
  lastFetch: { fetchedAt: isoMinutesAgo(300), hash: "def", diffFrom: null },
};

const NEVER: WatchedSource = {
  _id: "ws-never", url: "https://c.example/feed",
  reputationTier: "blog", checkIntervalHours: 6, active: true,
};

const CANDIDATES: MeetingCandidate[] = [
  { _id: "mc-1", messageId: "m1", subject: "Weekly Sync", senderEmail: "a@x.com", senderDomain: "x.com", status: "auto_approved", detectedAt: isoMinutesAgo(10) },
  { _id: "mc-2", messageId: "m2", subject: "One-off Call", senderEmail: "b@x.com", senderDomain: "x.com", status: "approved", detectedAt: isoMinutesAgo(5) },
  { _id: "mc-3", messageId: "m3", subject: "Not Yet Decided", senderEmail: "c@x.com", senderDomain: "x.com", status: "pending", detectedAt: isoMinutesAgo(1) },
];

const EMPTY_RUN: WatchedSourcesRunSummary = { checked: 0, changed: 0, skipped: 0, failed: [], remaining: 0 };

const EMPTY_WATCH_STATE: WatchStateResponse = { state: [], heartbeats: [] };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.spyOn(candidatesApi, "listMeetingCandidates").mockResolvedValue({ candidates: CANDIDATES });
  // U4d: default every test to the empty, non-erroring shape so the pre-existing R4-R8 suites
  // above (none of which know about this lane) don't each have to mock it -- a real network call
  // to a fixed default here would be the wrong failure mode for tests unrelated to this lane.
  vi.spyOn(watchStateApi, "getWatchState").mockResolvedValue(EMPTY_WATCH_STATE);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("[R4] is the watching alive", () => {
  test("a healthy source shows an absolute AND relative last-poll time, plus a plain-language sentence", async () => {
    vi.spyOn(watchedApi, "listWatchedSources").mockResolvedValue({ sources: [HEALTHY] });
    renderPage();
    const row = await screen.findByTestId("watch-row");
    expect(row).toHaveAttribute("data-status", "healthy");
    expect(row).toHaveTextContent(new Date(HEALTHY.lastFetch!.fetchedAt).toLocaleString());
    expect(row).toHaveTextContent("30m ago");
    expect(row.querySelector('[data-testid="watch-row-plain-language"]')).toHaveTextContent(/no action needed/i);
  });

  test("a source past its own interval renders as visibly wrong in its own right, not just an old date", async () => {
    vi.spyOn(watchedApi, "listWatchedSources").mockResolvedValue({ sources: [STALE] });
    renderPage();
    const row = await screen.findByTestId("watch-row");
    expect(row).toHaveAttribute("data-status", "stale");
    expect(row.querySelector(".badge-warn")).toHaveTextContent("stale");
    expect(row.querySelector('[data-testid="watch-row-plain-language"]')).toHaveTextContent(/overdue/i);
  });

  test("[negative] a source with no successful poll ever renders honestly, without a crash or an invented timestamp", async () => {
    vi.spyOn(watchedApi, "listWatchedSources").mockResolvedValue({ sources: [NEVER] });
    renderPage();
    const row = await screen.findByTestId("watch-row");
    expect(row).toHaveAttribute("data-status", "never");
    expect(row).toHaveTextContent("Never checked successfully");
    expect(row.querySelector('[data-testid="watch-row-plain-language"]')).toHaveTextContent(/never completed a successful check/i);
  });
});

describe("[R6] poll now — asserted by the state change it produces", () => {
  test("clicking Poll now disables the button, then reflects the REAL summary and re-fetches the list", async () => {
    const list = vi.spyOn(watchedApi, "listWatchedSources").mockResolvedValue({ sources: [HEALTHY] });
    let resolveRun!: (v: WatchedSourcesRunSummary) => void;
    const run = vi.spyOn(watchedApi, "runWatchedSources").mockReturnValue(new Promise((res) => { resolveRun = res; }));
    renderPage();
    await screen.findByTestId("watch-row");
    expect(screen.queryByTestId("poll-now-summary")).toBeNull();

    const user = userEvent.setup();
    const button = screen.getByTestId("poll-now-button");
    await user.click(button);
    expect(button).toBeDisabled(); // state change #1: disabled while the request is in flight

    resolveRun({ checked: 2, changed: 1, skipped: 0, failed: [], remaining: 0 });
    await waitFor(() => expect(screen.getByTestId("poll-now-summary")).toHaveTextContent("2 checked, 1 changed, 0 skipped, 0 failed, 0 left for next run"));
    expect(button).not.toBeDisabled(); // state change #2: re-enabled once the real result is in
    expect(run).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(2); // initial load + post-poll refresh
  });

  test("a source that failed in the run just triggered shows its real failureReason, appearing only after the click", async () => {
    vi.spyOn(watchedApi, "listWatchedSources").mockResolvedValue({ sources: [HEALTHY] });
    vi.spyOn(watchedApi, "runWatchedSources").mockResolvedValue({
      checked: 0, changed: 0, skipped: 0, remaining: 0,
      failed: [{ id: HEALTHY._id, url: HEALTHY.url, reason: "401: token expired" }],
    });
    renderPage();
    const row = await screen.findByTestId("watch-row");
    expect(row.querySelector('[data-testid="watch-row-failure-reason"]')).toBeNull();

    await userEvent.setup().click(screen.getByTestId("poll-now-button"));
    await waitFor(() => expect(row).toHaveTextContent("401: token expired"));
    expect(row).toHaveAttribute("data-status", "failed");
  });

  test("[negative] poll now failing surfaces the error and RE-ENABLES the button", async () => {
    vi.spyOn(watchedApi, "listWatchedSources").mockResolvedValue({ sources: [HEALTHY] });
    let rejectRun!: (err: unknown) => void;
    vi.spyOn(watchedApi, "runWatchedSources").mockReturnValue(new Promise((_res, rej) => { rejectRun = rej; }));
    renderPage();
    await screen.findByTestId("watch-row");

    const user = userEvent.setup();
    const button = screen.getByTestId("poll-now-button");
    await user.click(button);
    expect(button).toBeDisabled(); // state change #1: disabled while the request is in flight

    rejectRun(new ApiError(500, "watched-sources run crashed"));
    await waitFor(() => expect(screen.getByTestId("poll-now-error")).toHaveTextContent("watched-sources run crashed"));
    expect(button).not.toBeDisabled(); // state change #2: re-enabled, never left stuck
  });
});

describe("[R5] next up — read-only, real candidates only", () => {
  test("only approved / auto_approved candidates are listed, each with its real status as the reason", async () => {
    vi.spyOn(watchedApi, "listWatchedSources").mockResolvedValue({ sources: [] });
    renderPage();
    const rows = await screen.findAllByTestId("watch-next-up-row");
    expect(rows).toHaveLength(2);
    expect(screen.getByText("Weekly Sync")).toBeInTheDocument();
    expect(screen.getByText("One-off Call")).toBeInTheDocument();
    expect(screen.queryByText("Not Yet Decided")).toBeNull(); // pending is not "next up"
    expect(screen.getAllByTestId("watch-next-up-reason")[0]).toHaveTextContent(/auto-approved after 3 prior approvals/i);
  });

  test("there is no cancel or force control anywhere on the page (visible-only, per D-046)", async () => {
    vi.spyOn(watchedApi, "listWatchedSources").mockResolvedValue({ sources: [HEALTHY] });
    renderPage();
    await screen.findByTestId("watch-row");
    await screen.findAllByTestId("watch-next-up-row");
    expect(screen.queryByRole("button", { name: /cancel/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /force/i })).toBeNull();
  });

  test("[negative-adjacent] a degraded candidates lane does not blank the watched-sources lane above it", async () => {
    vi.spyOn(candidatesApi, "listMeetingCandidates").mockRejectedValue(new ApiError(503, "gmail down"));
    vi.spyOn(watchedApi, "listWatchedSources").mockResolvedValue({ sources: [HEALTHY] });
    renderPage();
    await screen.findByTestId("watch-row");
    expect(await screen.findByTestId("watch-next-up-degraded")).toHaveTextContent("gmail down");
  });
});

describe("[R7] plain language on every state", () => {
  test("the unreachable state and the zero-configured state each carry their own explanatory sentence", async () => {
    const list = vi.spyOn(watchedApi, "listWatchedSources");

    list.mockRejectedValueOnce(new ApiError(0, "failed to connect to http://api"));
    const { unmount } = renderPage();
    expect(await screen.findByTestId("watch-unreachable")).toHaveTextContent(/NOT the same as/i);
    unmount();

    list.mockResolvedValueOnce({ sources: [] });
    renderPage();
    expect(await screen.findByTestId("watch-none-configured")).toHaveTextContent(/different from every source being/i);
  });
});

describe("[negative] API unreachable never renders an empty healthy-looking state", () => {
  test("an unreachable API shows the unreachable message, never the zero-configured or a row", async () => {
    vi.spyOn(watchedApi, "listWatchedSources").mockRejectedValue(new ApiError(0, "failed to connect to http://api (ECONNREFUSED)"));
    renderPage();
    expect(await screen.findByTestId("watch-unreachable")).toBeInTheDocument();
    expect(screen.queryByTestId("watch-none-configured")).toBeNull();
    expect(screen.queryByTestId("watch-row")).toBeNull();
  });
});

describe("[negative] zero watched sources is distinguishable from all healthy", () => {
  test("zero sources renders its own message, not an empty row list that looks green", async () => {
    vi.spyOn(watchedApi, "listWatchedSources").mockResolvedValue({ sources: [] });
    renderPage();
    expect(await screen.findByTestId("watch-none-configured")).toBeInTheDocument();
    expect(screen.queryByTestId("watch-row")).toBeNull();
    expect(screen.queryByText(/all healthy/i)).toBeNull();
  });
});

describe("[U4d, D-047/ISS-358] watcher liveness — the collection R1's alert actually fires on", () => {
  test("a fresh heartbeat renders alive, a stale one renders silent, and a never-run one renders as never having run", async () => {
    vi.spyOn(watchedApi, "listWatchedSources").mockResolvedValue({ sources: [] });
    vi.spyOn(watchStateApi, "getWatchState").mockResolvedValue({
      state: [],
      heartbeats: [
        { sourceType: "drive", lastHeartbeatAt: isoMinutesAgo(10), stale: false },
        { sourceType: "gmail", lastHeartbeatAt: isoMinutesAgo(180), stale: true },
        { sourceType: "calendar", lastHeartbeatAt: null, stale: true },
      ],
    });
    renderPage();
    const rows = await screen.findAllByTestId("watch-heartbeat-row");
    expect(rows).toHaveLength(3);

    const drive = rows.find((r) => r.textContent?.includes("drive"))!;
    expect(drive).toHaveAttribute("data-status", "healthy");
    expect(drive.querySelector(".badge-good")).toHaveTextContent("alive");

    const gmail = rows.find((r) => r.textContent?.includes("gmail"))!;
    expect(gmail).toHaveAttribute("data-status", "stale");
    expect(gmail.querySelector(".badge-bad")).toHaveTextContent("silent");
    expect(gmail.querySelector('[data-testid="watch-heartbeat-plain-language"]')).toHaveTextContent(/stopped polling/i);

    const calendar = rows.find((r) => r.textContent?.includes("calendar"))!;
    expect(calendar).toHaveAttribute("data-status", "stale");
    expect(calendar).toHaveTextContent("Has never completed a single polling run");
  });

  test("a recent watch_state poll failure shows its real failureReason, distinct from the watched-sources lane above", async () => {
    vi.spyOn(watchedApi, "listWatchedSources").mockResolvedValue({ sources: [] });
    vi.spyOn(watchStateApi, "getWatchState").mockResolvedValue({
      state: [{ sourceType: "drive", sourceId: "gdrive-file-1", status: "failed", seenAt: isoMinutesAgo(5), failedAt: isoMinutesAgo(5), failureReason: "401: token expired" }],
      heartbeats: [{ sourceType: "drive", lastHeartbeatAt: isoMinutesAgo(1), stale: false }],
    });
    renderPage();
    const row = await screen.findByTestId("watch-state-failure-row");
    expect(row).toHaveTextContent("gdrive-file-1");
    expect(row.querySelector('[data-testid="watch-state-failure-reason"]')).toHaveTextContent("401: token expired");
    expect(screen.queryByTestId("watch-state-no-failures")).toBeNull();
  });

  test("no recent failures renders its own message, not a blank section", async () => {
    vi.spyOn(watchedApi, "listWatchedSources").mockResolvedValue({ sources: [] });
    renderPage();
    expect(await screen.findByTestId("watch-state-no-failures")).toBeInTheDocument();
  });

  test("[negative] the watch-state API being unreachable does not blank the watched-sources lane above it", async () => {
    vi.spyOn(watchedApi, "listWatchedSources").mockResolvedValue({ sources: [HEALTHY] });
    vi.spyOn(watchStateApi, "getWatchState").mockRejectedValue(new ApiError(0, "failed to connect"));
    renderPage();
    await screen.findByTestId("watch-row");
    expect(await screen.findByTestId("watch-state-unreachable")).toHaveTextContent(/NOT the same as/i);
    expect(screen.queryByTestId("watch-heartbeat-row")).toBeNull();
  });

  test("[negative] a deployment with the read not wired (501) renders the server's own message, not a crash", async () => {
    vi.spyOn(watchedApi, "listWatchedSources").mockResolvedValue({ sources: [] });
    vi.spyOn(watchStateApi, "getWatchState").mockRejectedValue(new ApiError(501, "watch-state read is not wired for this deployment"));
    renderPage();
    expect(await screen.findByTestId("watch-state-unreachable")).toHaveTextContent("watch-state read is not wired for this deployment");
  });
});

describe("[R8] tenancy — every read is scoped by the apiKey alone", () => {
  test("listWatchedSources and runWatchedSources are called with exactly the apiKey, never a tenant override", async () => {
    const list = vi.spyOn(watchedApi, "listWatchedSources").mockResolvedValue({ sources: [HEALTHY] });
    const run = vi.spyOn(watchedApi, "runWatchedSources").mockResolvedValue(EMPTY_RUN);
    renderPage();
    await screen.findByTestId("watch-row");
    await userEvent.setup().click(screen.getByTestId("poll-now-button"));
    await waitFor(() => expect(run).toHaveBeenCalled());

    for (const call of list.mock.calls) expect(call).toEqual(["test-key"]);
    for (const call of run.mock.calls) expect(call).toEqual(["test-key"]);
  });

  test("the page renders no tenant-selection input of any kind", async () => {
    vi.spyOn(watchedApi, "listWatchedSources").mockResolvedValue({ sources: [HEALTHY] });
    renderPage();
    await screen.findByTestId("watch-row");
    expect(screen.queryByRole("textbox", { name: /tenant/i })).toBeNull();
    expect(screen.queryByRole("combobox", { name: /tenant/i })).toBeNull();
  });
});
