import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SourcesPage } from "./SourcesPage.js";
import * as sourcesApi from "../api/sources.js";
import { ApiError } from "../api/client.js";
import type { Source } from "../api/types.js";

const auth = vi.hoisted(() => ({ apiKey: "test-key" as string | null }));
vi.mock("../auth/AuthContext.js", () => ({ useAuth: () => auth }));

const records: Source[] = [
  { _id: "z", kind: "recording", captureMode: "provided", path: "/raw/TOC/August.mp4", createdAt: "2026-08-01T00:00:00Z" },
  { _id: "b", kind: "url", captureMode: "public", url: "https://example.test/September", createdAt: "2026-09-01T00:00:00Z" },
  { _id: "a", kind: "document", captureMode: "provided", url: "https://example.test/notes", path: "/docs/Hidden-Path.pdf", createdAt: "2026-09-01T02:00:00+02:00" },
  { _id: "c", kind: "recording", captureMode: "silent-full", createdAt: "unknown" },
  { _id: "d", kind: "url", captureMode: "public", url: "javascript:alert(1)", createdAt: "invalid" },
];

function rowTitles(): string[] {
  return [...document.querySelectorAll(".row-title")].map((node) => node.textContent ?? "");
}

beforeEach(() => { auth.apiKey = "test-key"; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Sources explorer", () => {
  test("sorts instants newest-first with deterministic ID ties and invalid dates last without mutating data", async () => {
    const original = records.map((source) => source._id);
    vi.spyOn(sourcesApi, "listSources").mockResolvedValue({ sources: records });
    render(<SourcesPage />);
    await screen.findByText("Showing 5 of 5 sources · Newest first");
    expect(rowTitles()).toEqual(["document · provided", "url · public", "recording · provided", "recording · silent-full", "url · public"]);
    expect(records.map((source) => source._id)).toEqual(original);
    expect(screen.getByText(/\(no location recorded\)/)).toBeInTheDocument();
    expect(screen.getByText(/javascript:alert\(1\)/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(sourcesApi.listSources).toHaveBeenCalledWith("test-key");
  });

  test("searches both location fields and kind case-insensitively with surrounding whitespace ignored", async () => {
    vi.spyOn(sourcesApi, "listSources").mockResolvedValue({ sources: records });
    render(<SourcesPage />);
    await screen.findByRole("searchbox", { name: "Search sources" });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "  SEPTEMBER  " } });
    expect(rowTitles()).toEqual(["url · public"]);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "hidden-path" } });
    expect(rowTitles()).toEqual(["document · provided"]);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "RECORDING" } });
    expect(rowTitles()).toEqual(["recording · provided", "recording · silent-full"]);
    expect(screen.getByRole("status")).toHaveTextContent("Showing 2 of 5 sources");
    expect(sourcesApi.listSources).toHaveBeenCalledTimes(1);
  });

  test("combines exact kind and capture filters, distinguishes no match, and clears all controls", async () => {
    vi.spyOn(sourcesApi, "listSources").mockResolvedValue({ sources: records });
    render(<SourcesPage />);
    await screen.findByRole("combobox", { name: "Kind" });
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "recording" } });
    fireEvent.change(screen.getByLabelText("Capture mode"), { target: { value: "provided" } });
    expect(rowTitles()).toEqual(["recording · provided"]);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "not-present" } });
    expect(screen.getByText("No sources match these filters.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Showing 0 of 5 sources");
    expect(screen.queryByText("No sources recorded for this tenant yet.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.getByLabelText("Kind")).toHaveValue("");
    expect(screen.getByLabelText("Capture mode")).toHaveValue("");
    expect(rowTitles()).toHaveLength(5);
  });

  test("retains honest loading and empty-tenant states", async () => {
    let resolve!: (value: { sources: Source[] }) => void;
    vi.spyOn(sourcesApi, "listSources").mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<SourcesPage />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    await act(async () => { resolve({ sources: [] }); });
    expect(screen.getByText("No sources recorded for this tenant yet.")).toBeInTheDocument();
    expect(screen.queryByText("No sources match these filters.")).not.toBeInTheDocument();
  });

  test.each([new ApiError(403, "missing sources scope"), new Error("private detail")])("shows a failed request without an empty-data claim (%s)", async (error) => {
    vi.spyOn(sourcesApi, "listSources").mockRejectedValue(error);
    render(<SourcesPage />);
    await screen.findByText(error instanceof ApiError ? "missing sources scope" : "failed to load sources");
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByText("No sources recorded for this tenant yet.")).not.toBeInTheDocument();
  });

  test("clears previous results on key change and ignores a cancelled response", async () => {
    let resolveOld!: (value: { sources: Source[] }) => void;
    const list = vi.spyOn(sourcesApi, "listSources")
      .mockResolvedValueOnce({ sources: records })
      .mockReturnValueOnce(new Promise((done) => { resolveOld = done; }))
      .mockResolvedValueOnce({ sources: [] });
    const view = render(<SourcesPage />);
    await screen.findByText("Showing 5 of 5 sources · Newest first");
    auth.apiKey = "second-key";
    view.rerender(<SourcesPage />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(rowTitles()).toHaveLength(0);
    auth.apiKey = "third-key";
    view.rerender(<SourcesPage />);
    await screen.findByText("No sources recorded for this tenant yet.");
    await act(async () => { resolveOld({ sources: records }); });
    expect(rowTitles()).toHaveLength(0);
    expect(list).toHaveBeenNthCalledWith(3, "third-key");
  });

  test("clears a previous error when a new key succeeds", async () => {
    vi.spyOn(sourcesApi, "listSources")
      .mockRejectedValueOnce(new ApiError(403, "previous error"))
      .mockResolvedValueOnce({ sources: records });
    const view = render(<SourcesPage />);
    await screen.findByText("previous error");
    auth.apiKey = "new-key";
    view.rerender(<SourcesPage />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Showing 5 of 5 sources"));
    expect(screen.queryByText("previous error")).not.toBeInTheDocument();
  });
});
