import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { RetentionSection, loadRetentionStatus, type RetentionView } from "./RetentionSection.js";
import type { Loaded } from "./useLoad.js";
import { ApiError } from "../../api/client.js";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const summary = { mode: "dry-run" as const, ok: true, exitCode: 0, finishedAt: "2026-10-14T11:01:00.000Z",
  candidates: 2, deleted: 0, bytes: 0, vetoed: 1, failed: 0, clipsRetained: null };
const state = (data?: RetentionView, extra: Partial<Loaded<RetentionView>> = {}): Loaded<RetentionView> =>
  ({ data, error: null, loading: false, noKey: false, reload: vi.fn(), ...extra });
test("never-run and dry-run communicate actual state without deletion promises", () => {
  render(<RetentionSection state={state({ status: "never-run" })} />);
  expect(screen.getByText("No retention run has been recorded for this tenant.")).toBeTruthy();
  cleanup(); render(<RetentionSection state={state({ status: "available", summary })} />);
  expect(screen.getByText("Last dry run")).toBeTruthy();
  expect(screen.getByText("Candidates assessed: 2")).toBeTruthy();
  expect(screen.getByText("This was a dry run. No recordings were deleted.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /delete|purge|execute/i })).toBeNull();
});
test("execute and failed/incomplete results remain distinct", () => {
  render(<RetentionSection state={state({ status: "available", summary: { ...summary, mode: "execute", deleted: 1, bytes: 40, clipsRetained: 3 } })} />);
  expect(screen.getByText("Last execution")).toBeTruthy(); expect(screen.getByText(/Deleted: 1 recordings/)).toBeTruthy();
  expect(screen.getByText("Evidence clips retained: 3")).toBeTruthy();
  cleanup(); render(<RetentionSection state={state({ status: "available", summary: { ...summary, ok: false, exitCode: 3, candidates: null } })} />);
  expect(screen.getByRole("alert").textContent).toContain("run failed (code 3)");
  expect(screen.getByText("Candidates assessed: unknown")).toBeTruthy();
});
test("loading/auth/error/retry and stale data are visible", () => {
  render(<RetentionSection state={state(undefined, { noKey: true })} />);
  expect(screen.getByText("Enter an API key to load retention status.")).toBeTruthy();
  cleanup(); render(<RetentionSection state={state(undefined, { loading: true })} />);
  expect(screen.getByText("Loading retention status…")).toBeTruthy();
  cleanup(); const reload = vi.fn();
  render(<RetentionSection state={state({ status: "available", summary }, { error: new ApiError(503, "unavailable"), reload })} />);
  expect(screen.getByRole("alert").textContent).toContain("stale");
  fireEvent.click(screen.getByRole("button", { name: "Retry retention status" })); expect(reload).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Last dry run")).toBeTruthy();
});
test("actual API client consumes status endpoint with bearer auth and unchanged compact result", async () => {
  const payload = { status: "available", summary };
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetcher);
  expect(await loadRetentionStatus("private-key")).toEqual(payload);
  expect(fetcher.mock.calls[0]?.[0]).toMatch(/\/retention\/status$/);
  expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("authorization")).toBe("Bearer private-key");
});
