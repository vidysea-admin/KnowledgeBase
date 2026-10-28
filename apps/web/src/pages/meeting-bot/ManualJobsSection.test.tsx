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
  await screen.findByText(`meet — running — ${id}`);
  fireEvent.click(screen.getByRole("button", { name: "Cancel job" }));
  await screen.findByText(/Cancellation was requested/);
  expect(screen.getByText(`meet — cancel-requested — ${id}`)).toBeInTheDocument();
  expect(fetcher.mock.calls[1]![1].headers.authorization).toBe("Bearer private-key");
  expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual({});
  expect(document.body.textContent).not.toContain("private-");
  expect(document.body.textContent).toContain("Meeting admission remains unknown");
});
test("changing owning key suppresses stale prior-tenant list results and refresh uses only replacement key", async () => {
  let resolve!: (value: Response) => void;
  const fetcher = vi.fn().mockReturnValueOnce(new Promise<Response>(r => { resolve = r; })).mockResolvedValue(reply({ jobs: [] }));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<ManualJobsSection apiKey="old-key" refresh={0} />);
  view.rerender(<ManualJobsSection apiKey="new-key" refresh={0} />);
  await screen.findByText("No manual jobs were returned.");
  resolve(reply({ jobs: [job] })); await waitFor(() => expect(screen.queryByText(`meet — running — ${id}`)).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Refresh jobs" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  expect(fetcher.mock.calls[2]![1].headers.authorization).toBe("Bearer new-key");
});
