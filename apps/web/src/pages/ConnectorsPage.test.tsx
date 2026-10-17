import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, afterEach, test, expect, vi } from "vitest";
import { AuthProvider, useAuth } from "../auth/AuthContext.js";
import { ApiError } from "../api/client.js";
import * as api from "../api/connector-workflow.js";
import { ConnectorsPage } from "./ConnectorsPage.js";

const EMPTY: api.ConnectorOverview = { capabilities: [], gaps: [], gapsTruncated: false, watchedConfigured: true };
const JOB: api.ConnectorJob = { jobId: "a".repeat(64), state: "queued", revision: 1, createdAt: "2026-10-14T00:00:00.000Z", updatedAt: "2026-10-14T00:00:00.000Z" };
function TenantSwitch() { const auth = useAuth(); return <><button onClick={() => auth.setApiKey("b")}>Switch tenant</button><button onClick={() => auth.setApiKey("a")}>Reuse login</button></>; }
function page(initialEntries?: string[]) { return render(<AuthProvider><MemoryRouter initialEntries={initialEntries}><TenantSwitch /><ConnectorsPage /></MemoryRouter></AuthProvider>); }
beforeEach(() => { localStorage.setItem("lkbApiKey", "a"); });
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

test("saved job link survives reload and requires an explicit checked receipt before showing consumption", async () => {
  vi.spyOn(api, "loadConnectorOverview").mockResolvedValue({ ...EMPTY, intakeMode: "durable-jobs", watchedConfigured: false });
  const check = vi.spyOn(api, "checkConnectorJob").mockResolvedValue({ job: { ...JOB, state: "succeeded", result: { sessionId: "reopened-session", sourceId: "source-a" } } });
  page([`/connectors?job=${JOB.jobId}`]);
  expect(await screen.findByLabelText("Saved source job ID")).toHaveValue(JOB.jobId);
  expect(check).not.toHaveBeenCalled(); expect(screen.queryByRole("link", { name: "View consumed session" })).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole("button", { name: "Resume source job" }));
  expect(await screen.findByRole("link", { name: "View consumed session" })).toHaveAttribute("href", "/sessions/reopened-session");
  expect(check).toHaveBeenCalledWith("a", JOB.jobId, undefined);
});

test("queued public intake shows progress and only a checked consumer receipt becomes a session link", async () => {
  vi.spyOn(api, "loadConnectorOverview").mockResolvedValue({ ...EMPTY, intakeMode: "durable-jobs", watchedConfigured: false });
  const intake = vi.spyOn(api, "intakeConnectorUrl").mockResolvedValue({ job: JOB });
  const check = vi.spyOn(api, "checkConnectorJob").mockResolvedValueOnce({ job: { ...JOB, state: "running", revision: 2 } })
    .mockResolvedValue({ job: { ...JOB, state: "succeeded", revision: 3, result: { sessionId: "indexed-session", sourceId: "recording-source" } } });
  page(); const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Public or on-demand URL"), "https://zoom.us/rec/share/AbCdEfGh12345678");
  await user.click(screen.getByRole("button", { name: "Ingest and index" }));
  expect(await screen.findByText("Source job: queued")).toBeInTheDocument();
  expect(intake).toHaveBeenCalledWith("a", "https://zoom.us/rec/share/AbCdEfGh12345678", expect.any(String));
  expect(screen.queryByRole("link", { name: "View consumed session" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Verify due watched sources" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Check source job" }));
  expect(await screen.findByText("Source job: running")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Check source job" })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: "Check source job" }));
  expect(await screen.findByRole("link", { name: "View consumed session" })).toHaveAttribute("href", "/sessions/indexed-session");
  expect(check).toHaveBeenCalledWith("a", JOB.jobId, undefined);
});

test("recording job uncertainty preserves open request and does not offer a consumed session", async () => {
  const gap: api.RecordingRequest = { _id: "gap-job", kind: "recording-pending", description: "Awaiting queued recording", status: "open" };
  vi.spyOn(api, "loadConnectorOverview").mockResolvedValue({ ...EMPTY, gaps: [gap], intakeMode: "durable-jobs", watchedConfigured: false });
  vi.spyOn(api, "receiveRecordingUrl").mockResolvedValue({ job: JOB });
  const check = vi.spyOn(api, "checkConnectorJob").mockResolvedValue({ job: { ...JOB, state: "uncertain", reason: "indexing-incomplete" }, gapId: "failure-gap" });
  page(); const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Recording URL"), "https://zoom.us/rec/share/AbCdEfGh12345678");
  await user.click(screen.getByRole("button", { name: "Ingest and receive recording" }));
  await screen.findByText("Source job: queued");
  await waitFor(() => expect(screen.getByRole("button", { name: "Check source job" })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: "Check source job" }));
  expect(await screen.findByText(/Action required: indexing-incomplete/)).toBeInTheDocument();
  expect(screen.getByText("Awaiting queued recording").parentElement).toHaveTextContent("open");
  expect(check).toHaveBeenCalledWith("a", JOB.jobId, "gap-job");
  expect(screen.queryByRole("link", { name: "View consumed session" })).not.toBeInTheDocument();
});

test("late prior-login job completion cannot show a consumed link in the next login", async () => {
  let finish!: (v: api.ConnectorJobResponse) => void;
  vi.spyOn(api, "loadConnectorOverview").mockResolvedValue(EMPTY);
  vi.spyOn(api, "intakeConnectorUrl").mockResolvedValue({ job: JOB });
  vi.spyOn(api, "checkConnectorJob").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  page(); const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Public or on-demand URL"), "https://zoom.us/rec/share/AbCdEfGh12345678");
  await user.click(screen.getByRole("button", { name: "Ingest and index" }));
  await screen.findByText("Source job: queued");
  await waitFor(() => expect(screen.getByRole("button", { name: "Check source job" })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: "Check source job" }));
  await user.click(screen.getByRole("button", { name: "Reuse login" }));
  finish({ job: { ...JOB, state: "succeeded", result: { sessionId: "previous-login-session", sourceId: "previous-recording" } } });
  await waitFor(() => expect(screen.queryByRole("link", { name: "View consumed session" })).not.toBeInTheDocument());
});

test("unconfigured deployment reports error without a healthy empty inventory", async () => {
  vi.spyOn(api, "loadConnectorOverview").mockRejectedValue(new ApiError(503, "connector database unconfigured"));
  page();
  expect(await screen.findByRole("alert")).toHaveTextContent("connector database unconfigured");
  expect(screen.queryByText("No recording requests or connector gaps are recorded.")).not.toBeInTheDocument();
});

test("opening a recording request relists the durable owner and SLA response", async () => {
  const gap: api.RecordingRequest = { _id: "gap-a", kind: "recording-pending", description: "Visa session missing", requestedFrom: "org:toc", status: "open", sla: { dueAt: "2099-10-17T00:00:00.000Z" } };
  vi.spyOn(api, "loadConnectorOverview").mockResolvedValueOnce(EMPTY).mockResolvedValue({ ...EMPTY, gaps: [gap] });
  const create = vi.spyOn(api, "openRecordingRequest").mockResolvedValue({ gap });
  page();
  await screen.findByRole("heading", { name: "Missing recording requests" });
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Session or missing recording"), "Visa session missing");
  await user.type(screen.getByLabelText("Owner reference"), "org:toc");
  await user.click(screen.getByRole("button", { name: "Track recording request" }));
  expect(await screen.findByText("Visa session missing")).toBeInTheDocument();
  expect(create).toHaveBeenCalledWith("a", expect.objectContaining({ description: "Visa session missing", requestedFrom: "org:toc", slaDays: 3, requestId: expect.any(String) }));
  expect(screen.getByText(/Owner: org:toc/)).toHaveTextContent("2099-10-17");
  expect(screen.getByRole("button", { name: "Expire overdue request" })).toBeDisabled();
});

test("receipt conflict preserves open request and watched failure renders action required", async () => {
  const gap: api.RecordingRequest = { _id: "gap-a", kind: "recording-pending", description: "Awaiting recording", status: "open" };
  vi.spyOn(api, "loadConnectorOverview").mockResolvedValue({ ...EMPTY, gaps: [gap] });
  vi.spyOn(api, "updateRecordingRequest").mockRejectedValue(new ApiError(409, "recording not consumed"));
  vi.spyOn(api, "verifyConnectorWatched").mockResolvedValue({ outcomes: [{ id: "watch-a", status: "failed", code: "watched_verification_failed", gapId: "failure-gap" }], remaining: 2 });
  page();
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Ingested recording source ID"), "recording-a");
  await user.click(screen.getByRole("button", { name: "Confirm consumed recording" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("recording not consumed");
  expect(screen.getByText(/Awaiting recording/).parentElement).toHaveTextContent("open");
  await user.click(screen.getByRole("button", { name: "Verify due watched sources" }));
  expect(await screen.findByRole("status")).toHaveTextContent("2 source(s) remain untouched.");
  expect(screen.getByRole("status")).toHaveTextContent("watch-a: failed — action required");
});

test("late prior tenant overview cannot overwrite current tenant inventory", async () => {
  let finish!: (v: api.ConnectorOverview) => void;
  const stale = new Promise<api.ConnectorOverview>((resolve) => { finish = resolve; });
  vi.spyOn(api, "loadConnectorOverview").mockImplementation((key) => key === "a" ? stale : Promise.resolve(EMPTY));
  page();
  await userEvent.setup().click(screen.getByRole("button", { name: "Switch tenant" }));
  await screen.findByRole("heading", { name: "Missing recording requests" });
  finish({ ...EMPTY, gaps: [{ _id: "tenant-a-private", description: "Private tenant A request", status: "open", kind: "recording-pending" }] });
  await waitFor(() => expect(screen.queryByText("Private tenant A request")).not.toBeInTheDocument());
});

test("late overview cannot cross a new login that reuses the same key", async () => {
  let finish!: (v: api.ConnectorOverview) => void;
  const stale = new Promise<api.ConnectorOverview>((resolve) => { finish = resolve; });
  vi.spyOn(api, "loadConnectorOverview").mockImplementationOnce(() => stale).mockResolvedValue(EMPTY);
  page();
  await userEvent.setup().click(screen.getByRole("button", { name: "Reuse login" }));
  await screen.findByRole("heading", { name: "Missing recording requests" });
  finish({ ...EMPTY, gaps: [{ _id: "old-login", description: "Old login request", status: "open", kind: "recording-pending" }] });
  await waitFor(() => expect(screen.queryByText("Old login request")).not.toBeInTheDocument());
});
