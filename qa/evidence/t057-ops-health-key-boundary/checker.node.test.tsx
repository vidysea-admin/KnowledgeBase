import assert from "node:assert/strict";
import { test, afterEach, after } from "node:test";
import { installDom, React } from "../../../.cache/coordination/safe-test-runtime/react-harness.mjs";
const h = installDom();
const { AuthProvider, useAuth } = await import("../../../apps/web/src/auth/AuthContext.js");
const { OpsHealthPage } = await import("../../../apps/web/src/pages/ops-health/OpsHealthPage.js");
const originalFetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch")!;
let mounted: ReturnType<typeof h.render> | undefined;
afterEach(() => { mounted?.unmount(); mounted = undefined; h.cleanupTesting(); h.window.localStorage.clear(); Object.defineProperty(globalThis, "fetch", originalFetchDescriptor); });
after(() => h.cleanup());
function Controls({ commits }: { commits?: string[] }) {
  const { apiKey, clearApiKey, setApiKey } = useAuth();
  React.useLayoutEffect(() => { commits?.push(h.document.body.textContent ?? ""); });
  return <><button onClick={clearApiKey}>Logout</button><button onClick={() => setApiKey("same-key")}>Login</button><button onClick={() => { clearApiKey(); setApiKey("same-key"); }}>Batched restart</button><output data-testid="session">{apiKey ?? "anonymous"}</output></>;
}
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, headers: new Headers(), json: async () => body });
const empty: Record<string, unknown> = {
  "/activity-health": { jobs: [], limit: 50, truncated: false, observedAt: "2026-10-14T08:00:00.000Z" },
  "/jobs": { jobs: [], limit: 50, truncated: false },
  "/watch-runs": { runs: [], limit: 50, truncated: false, summary: { runs: 0, runsWithFailures: 0, totalDriveFailed: 0, totalErrors: 0, lastFailureAt: null } },
};
test("old same-key session 401 cannot clear restored page/auth/storage", async () => {
  h.window.localStorage.setItem("lkbApiKey", "same-key");
  const pending: Array<{ path: string; resolve: (v: ReturnType<typeof response>) => void }> = [];
  let calls = 0;
  globalThis.fetch = ((url: string) => {
    const path = new URL(url, "http://x").pathname;
    if (++calls <= 3) return new Promise(resolve => pending.push({ path, resolve }));
    return Promise.resolve(response(empty[path]));
  }) as typeof fetch;
  mounted = h.render(<AuthProvider><OpsHealthPage /><Controls /></AuthProvider>);
  assert.equal(pending.length, 3);
  h.fireEvent.click(h.screen.getByRole("button", { name: "Logout" }));
  assert.equal(h.screen.getByTestId("session").textContent, "anonymous");
  h.fireEvent.click(h.screen.getByRole("button", { name: "Login" }));
  await h.screen.findByText("No upload jobs recorded yet.");
  await h.screen.findByText("No provider jobs recorded yet.");
  await h.screen.findByText("No watcher runs recorded yet.");
  await h.act(async () => { for (const old of pending) old.resolve(response({}, 401)); });
  assert.equal(h.window.localStorage.getItem("lkbApiKey"), "same-key");
  assert.equal(h.screen.getByTestId("session").textContent, "same-key");
  assert.ok(h.screen.getByText("No upload jobs recorded yet."));
});
test("batched logout/same-key login discards snapshots before passive effects", async () => {
  h.window.localStorage.setItem("lkbApiKey", "same-key");
  globalThis.fetch = ((url: string) => Promise.resolve(response(empty[new URL(url, "http://x").pathname]))) as typeof fetch;
  const commits: string[] = [];
  mounted = h.render(<AuthProvider><OpsHealthPage /><Controls commits={commits} /></AuthProvider>);
  await h.screen.findByText("No upload jobs recorded yet.");
  await h.screen.findByText("No provider jobs recorded yet.");
  await h.screen.findByText("No watcher runs recorded yet.");
  globalThis.fetch = (() => new Promise(() => {})) as typeof fetch;
  const before = commits.length;
  h.fireEvent.click(h.screen.getByRole("button", { name: "Batched restart" }));
  assert.ok(commits.length > before);
  assert.doesNotMatch(commits[before], /No (upload|provider) jobs recorded yet|No watcher runs recorded yet/);
  for (const name of ["Upload queue", "Provider jobs", "Watcher runs"]) {
    assert.equal(h.within(h.screen.getByRole("region", { name })).getAllByRole("status").length, 1);
  }
  assert.equal(h.screen.getByTestId("session").textContent, "same-key");
});
