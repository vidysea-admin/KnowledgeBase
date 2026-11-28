import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { SendNowForm } from "./SendNowForm.js";
import { ManualJobsSection } from "./ManualJobsSection.js";

const id = "send-now-20261014100000-abcdef";
const job = { jobId: id, platform: "meet", state: "running", requestedAt: "2026-10-14T10:00:00Z", updatedAt: "2026-10-14T10:00:00Z", joined: "unknown", meetingUrl: "private-passcode", nonce: "private-nonce" };
const reply = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
test("actual mounted form opens persisted jobs and owning-key cancel consumes request intent without claiming shutdown", async () => {
  const fetcher = vi.fn(async (url, init) => String(url).endsWith("/cancel") ? reply({ ...job, state: "cancel-requested" }) : reply({ jobs: [job] }));
  vi.stubGlobal("fetch", fetcher);
  render(<SendNowForm apiKey="private-key" />);
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Manage manual jobs" }));
  await screen.findByText(`meet — running — meeting admission unknown — ${id}`);
  fireEvent.click(screen.getByRole("button", { name: "Cancel job" }));
  await screen.findByText(/Cancellation was requested/);
  expect(screen.getByText(`meet — cancel-requested — meeting admission unknown — ${id}`)).toBeInTheDocument();
  expect(fetcher.mock.calls[1]![1].headers.authorization).toBe("Bearer private-key");
  expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual({});
  expect(document.body.textContent).not.toContain("private-");
  expect(document.body.textContent).toContain("whether the bot got into the meeting");
});
test("changing owning key suppresses stale prior-tenant list results and refresh uses only replacement key", async () => {
  let resolve!: (value: Response) => void;
  const fetcher = vi.fn().mockReturnValueOnce(new Promise<Response>(r => { resolve = r; })).mockResolvedValue(reply({ jobs: [] }));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<ManualJobsSection apiKey="old-key" refresh={0} />);
  view.rerender(<ManualJobsSection apiKey="new-key" refresh={0} />);
  await screen.findByText("No manual jobs were returned.");
  resolve(reply({ jobs: [job] })); await waitFor(() => expect(screen.queryByText(`meet — running — meeting admission unknown — ${id}`)).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Refresh jobs" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  expect(fetcher.mock.calls[2]![1].headers.authorization).toBe("Bearer new-key");
});
test("joined status is shown per job: joined, assumed, no admission recorded", async () => {
  const jobs = [
    { ...job, joined: "yes", joinedAt: "2026-10-14T10:01:00Z" },
    { ...job, jobId: "send-now-20261014100000-bbbbbb", platform: "zoom", joined: "assumed" },
    { ...job, jobId: "send-now-20261014100000-cccccc", state: "failed", joined: "no" },
  ];
  vi.stubGlobal("fetch", vi.fn(async () => reply({ jobs })));
  render(<ManualJobsSection apiKey="k" refresh={0} />);
  await screen.findByText(/meet — running — joined the meeting at .* — send-now-20261014100000-abcdef/);
  expect(screen.getByText(/zoom — running — joined \(assumed, no lobby seen\) — /)).toBeInTheDocument();
  expect(screen.getByText(/meet — failed — no admission recorded — /)).toBeInTheDocument();
});
test("a joined value outside the four known ones is refused", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => reply({ jobs: [{ ...job, joined: "maybe" }] })));
  render(<ManualJobsSection apiKey="k" refresh={0} />);
  await waitFor(() => expect(screen.queryByText(/meet — running/)).toBeNull());
});
