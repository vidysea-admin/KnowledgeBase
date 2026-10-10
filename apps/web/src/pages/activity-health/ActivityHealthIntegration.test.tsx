import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "../../App.js";
import { readActivitySnapshot } from "./activityHealthModel.js";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); window.history.replaceState(null, "", "/"); });
test("actual producer/worker/current production HTTP output -> actual public client -> protected App/navigation -> health DOM", async () => {
  const evidence = JSON.parse(readFileSync(new URL("../../../../../.cache/coordination/t057-d2-runtime-output.json", import.meta.url), "utf8")) as { response: unknown; httpStatus: number; selectedDatabase: string; producerWorkerProof: { firstAttempts: number; reclaimedAttempts: number; staleOwnerFenced: boolean; terminalDeadlineCancelExhaustionFenced: boolean } };
  expect(evidence.httpStatus).toBe(200); expect(evidence.selectedDatabase).toBe("upload_queue_fixture01");
  expect(evidence.producerWorkerProof).toEqual({ firstAttempts: 1, reclaimedAttempts: 2, staleOwnerFenced: true, terminalDeadlineCancelExhaustionFenced: true });
  const snapshot = readActivitySnapshot(evidence.response); expect(snapshot.jobs.some(job => job.automaticRetryCount === 1)).toBe(true);
  expect(snapshot.jobs.some(job => job.errorClass === "deadline-or-attempts-exhausted")).toBe(true);
  localStorage.setItem("lkbApiKey", "owner"); window.history.replaceState(null, "", "/activity-health");
  const fetcher = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) => ({ ok: true, status: 200, json: async () => evidence.response })); vi.stubGlobal("fetch", fetcher); render(<App />);
  await screen.findByRole("heading", { name: "Activity & Knowledge Health" }); const link = screen.getByRole("link", { name: "Activity & Health" }); expect(link).toHaveAttribute("href", "/activity-health"); expect(link).toHaveClass("active");
  await screen.findByText(new RegExp(`^${snapshot.jobs.length} returned upload operations`));
  expect(screen.getByRole("list", { name: "Upload operations" })).toHaveTextContent("Error class: deadline-or-attempts-exhausted");
  expect(screen.getByRole("list", { name: "Upload operations" })).toHaveTextContent("observed automatic retries: 1");
  expect(fetcher.mock.calls[0]?.[0]).toMatch(/\/activity-health\?limit=50$/); expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({ authorization: "Bearer owner" });
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "processing" } }); expect(screen.getByText("No returned operations match this status.")).toBeInTheDocument();
  expect(screen.getByText(`Showing 0 of ${snapshot.jobs.length} returned upload operations.`)).toBeInTheDocument();
  for (const name of ["Knowledge gaps", "Confidence graph", "Knowledge explorer"]) expect(screen.getByRole("link", { name })).toBeInTheDocument();
});
test("actual LoginGate refuses anonymous direct health route without fetch", () => {
  window.history.replaceState(null, "", "/activity-health"); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); render(<App />);
  expect(screen.getByLabelText("API key")).toBeInTheDocument(); expect(screen.queryByRole("heading", { name: "Activity & Knowledge Health" })).not.toBeInTheDocument(); expect(fetcher).not.toHaveBeenCalled();
});
