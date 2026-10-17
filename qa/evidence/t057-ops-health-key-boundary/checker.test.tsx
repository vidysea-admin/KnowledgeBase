import { act, cleanup, fireEvent, render, screen } from "../../../apps/web/node_modules/@testing-library/react/dist/index.js";
import { afterEach, expect, test, vi } from "../../../apps/web/node_modules/vitest/dist/index.js";
import { useLayoutEffect } from "../../../apps/web/node_modules/react/index.js";
import { AuthProvider, useAuth } from "../../../apps/web/src/auth/AuthContext.js";
import { OpsHealthPage } from "../../../apps/web/src/pages/ops-health/OpsHealthPage.js";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
function Controls({ commits }: { commits?: string[] }) {
  const { apiKey, clearApiKey, setApiKey } = useAuth();
  useLayoutEffect(() => { commits?.push(document.body.textContent ?? ""); });
  return <><button onClick={clearApiKey}>Logout</button><button onClick={() => setApiKey("same-key")}>Login</button><button onClick={() => { clearApiKey(); setApiKey("same-key"); }}>Batched restart</button><output data-testid="session">{apiKey ?? "anonymous"}</output></>;
}
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, headers: new Headers(), json: async () => body });
const empty: Record<string, unknown> = {
  "/activity-health": { jobs: [], limit: 50, truncated: false, observedAt: "2026-10-14T08:00:00.000Z" },
  "/jobs": { jobs: [], limit: 50, truncated: false },
  "/watch-runs": { runs: [], limit: 50, truncated: false, summary: { runs: 0, runsWithFailures: 0, totalDriveFailed: 0, totalErrors: 0, lastFailureAt: null } },
};
test("a previous same-key session's late 401 cannot clear a restored session", async () => {
  localStorage.setItem("lkbApiKey", "same-key");
  const pending: Array<{ path: string; resolve: (v: ReturnType<typeof response>) => void }> = [];
  let calls = 0;
  const fetchMock = vi.fn((url: string) => {
    const path = new URL(url, "http://x").pathname;
    if (++calls <= 3) return new Promise(resolve => pending.push({ path, resolve }));
    return Promise.resolve(response(empty[path]));
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<AuthProvider><OpsHealthPage /><Controls /></AuthProvider>);
  expect(pending).toHaveLength(3);
  fireEvent.click(screen.getByRole("button", { name: "Logout" }));
  expect(screen.getByTestId("session")).toHaveTextContent("anonymous");
  fireEvent.click(screen.getByRole("button", { name: "Login" }));
  await screen.findByText("No upload jobs recorded yet.");
  await screen.findByText("No provider jobs recorded yet.");
  await screen.findByText("No watcher runs recorded yet.");
  await act(async () => {
    for (const old of pending) old.resolve(response({}, 401));
  });
  expect(localStorage.getItem("lkbApiKey")).toBe("same-key");
  expect(screen.getByTestId("session")).toHaveTextContent("same-key");
  expect(screen.getByText("No upload jobs recorded yet.")).toBeInTheDocument();
});

test("a batched logout and same-key login discards prior panels before passive effects", async () => {
  localStorage.setItem("lkbApiKey", "same-key");
  const fetchMock = vi.fn((url: string) => Promise.resolve(response(empty[new URL(url, "http://x").pathname])));
  vi.stubGlobal("fetch", fetchMock);
  const commits: string[] = [];
  render(<AuthProvider><OpsHealthPage /><Controls commits={commits} /></AuthProvider>);
  await screen.findByText("No upload jobs recorded yet.");
  await screen.findByText("No provider jobs recorded yet.");
  await screen.findByText("No watcher runs recorded yet.");
  fetchMock.mockImplementation(() => new Promise(() => {}));
  const before = commits.length;
  fireEvent.click(screen.getByRole("button", { name: "Batched restart" }));
  expect(commits.length).toBeGreaterThan(before);
  expect(commits[before]).not.toMatch(/No (upload|provider) jobs recorded yet|No watcher runs recorded yet/);
  expect(screen.getAllByRole("status")).toHaveLength(3);
  expect(screen.getByTestId("session")).toHaveTextContent("same-key");
});
