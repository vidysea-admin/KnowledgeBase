import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "../../App.js";
import { AuthProvider } from "../../auth/AuthContext.js";
import { NotificationsPage } from "./NotificationsPage.js";
import { loadNotifications } from "./notificationsClient.js";

const fetchMock = vi.fn();
const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body, headers: new Headers() });
const item = (id: string, over: Record<string, unknown> = {}) => ({ id, source: "upload-queue", severity: "error", title: "Upload transcription job failed",
  detail: "Failure class: timeout-or-failure; attempts 2 of 2", occurredAt: "2026-10-12T08:30:00.000Z", ...over });
const body = { notifications: [item("upload-queue:a"), item("watcher:w1", { source: "watcher", title: "Source watcher run reported failures", detail: null, occurredAt: "2026-10-12T07:00:00.000Z" })],
  limit: 50, truncated: false, sources: { uploadQueue: "ok", providerJobs: "ok", watcher: "ok" } };

function route(res: unknown) {
  fetchMock.mockImplementation(async () => res instanceof Error ? Promise.reject(res) : typeof res === "number" ? ok({ message: "x" }, res) : ok(res));
}
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); localStorage.setItem("lkbApiKey", "sample-key"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); window.history.replaceState(null, "", "/"); });
const mount = () => render(<AuthProvider><NotificationsPage /></AuthProvider>);

test("lists notifications with unread count, GET only with the bearer key and a bounded limit", async () => {
  route(body); mount();
  await screen.findByText("Upload transcription job failed");
  expect(screen.getByText("Source watcher run reported failures")).toBeInTheDocument();
  expect(screen.getByText("2 unread of 2")).toBeInTheDocument();
  expect(screen.getByText("Failure class: timeout-or-failure; attempts 2 of 2")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(new URL(url, "http://x").pathname).toBe("/notifications"); expect(new URL(url, "http://x").search).toBe("?limit=50");
  expect(init.headers.authorization).toBe("Bearer sample-key"); expect(init.method ?? "GET").toBe("GET");
});

test("mark as read is client-side only: persisted in localStorage, no extra request, survives a remount", async () => {
  route(body); mount();
  await screen.findByText("2 unread of 2");
  fireEvent.click(screen.getAllByRole("button", { name: "Mark as read" })[0]!);
  await screen.findByText("1 unread of 2");
  expect(JSON.parse(localStorage.getItem("lkbNotificationsRead")!)).toEqual(["upload-queue:a"]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  cleanup(); mount(); await screen.findByText("1 unread of 2");
  fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
  await screen.findByText("0 unread of 2"); expect(screen.queryByRole("button", { name: /Mark/ })).toBeNull();
});

test("blocked storage does not break the page", async () => {
  route(body);
  const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation((k: string) => { if (k === "lkbNotificationsRead") throw new Error("blocked"); return k === "lkbApiKey" ? "sample-key" : null; });
  const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  mount(); await screen.findByText("2 unread of 2");
  fireEvent.click(screen.getByRole("button", { name: "Mark all as read" })); await screen.findByText("0 unread of 2");
  get.mockRestore(); set.mockRestore();
});

test("empty tenant: honest empty note, no NaN", async () => {
  route({ ...body, notifications: [] }); mount();
  await screen.findByText("No failures in the recent window.");
  expect(document.body.textContent).not.toMatch(/NaN|Infinity|undefined/); expect(screen.queryByRole("alert")).toBeNull();
});

test("a degraded source is flagged and an empty list does not claim all-clear", async () => {
  route({ ...body, notifications: [], sources: { uploadQueue: "ok", providerJobs: "unavailable", watcher: "ok" } }); mount();
  await screen.findByText("Provider jobs unavailable: its failures are not shown below.");
  expect(screen.getByText("No failures found in the sources that could be read.")).toBeInTheDocument();
  expect(screen.queryByText("No failures in the recent window.")).toBeNull();
});

test("401, 403, 503, network and malformed bodies show an honest error, never an empty list", async () => {
  for (const [res, text] of [[403, "Notifications unavailable: this API key is not permitted to read them."], [503, "Notifications unavailable: the service could not read them right now."],
    [new Error("net"), "Notifications unavailable: unable to load them."], [{ notifications: "bad" }, "Notifications unavailable: the service could not read them right now."]] as const) {
    route(res); mount(); await screen.findByText(text);
    expect(screen.getByRole("alert")).toBeInTheDocument(); expect(screen.queryByText(/No failures/)).toBeNull(); cleanup();
  }
});

test("no key: sign-in note and no request; refresh refetches", async () => {
  localStorage.clear(); route(body); mount();
  expect(screen.getByText("Sign in with an API key to view notifications.")).toBeInTheDocument(); expect(fetchMock).not.toHaveBeenCalled();
  cleanup(); localStorage.setItem("lkbApiKey", "k"); mount(); await screen.findByText("2 unread of 2");
  fireEvent.click(screen.getByRole("button", { name: "Refresh" })); await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
});

test("hostile text is inert and the strict reader refuses wrong shapes", async () => {
  route({ ...body, notifications: [item("x", { title: "<img src=x onerror=alert(1)>" })] }); mount();
  await screen.findByText("<img src=x onerror=alert(1)>"); expect(document.querySelector("img")).toBeNull();
  for (const bad of [{ ...body, limit: 10 }, { ...body, sources: { uploadQueue: "ok" } }, { ...body, notifications: [item("a", { severity: "info" })] },
    { ...body, notifications: [item("a"), item("a")] }, { ...body, notifications: [item("a", { occurredAt: "nope" })] }, { ...body, notifications: [item("a", { source: "other" })] }]) {
    route(bad); await expect(loadNotifications("k", 50)).rejects.toMatchObject({ status: 503 });
  }
  route(body); await expect(loadNotifications("k", 50)).resolves.toMatchObject({ limit: 50 });
  await expect(loadNotifications("k", 101)).rejects.toMatchObject({ status: 400 });
});

test("route /notifications is mounted once and linked from the sidebar", async () => {
  route(body); window.history.replaceState(null, "", "/notifications"); render(<App />);
  await screen.findByRole("heading", { name: "Notifications" });
  expect(screen.getAllByRole("link", { name: "Notifications" })).toHaveLength(1);
});
