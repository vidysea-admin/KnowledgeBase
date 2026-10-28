import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import { AnswerSources } from "./AnswerSources.js";
import { AuthProvider } from "../../auth/AuthContext.js";
import type { AskInternalSource } from "../../api/types.js";
import * as nativeApi from "../../api/nativeEvidence.js";

const passage = { start: 0, end: 5, sha256: "b".repeat(64) };
const doc: nativeApi.NativeSourceLocator = { kind: "document-page", documentId: "doc", sourceId: "stable", documentSourceId: "immutable",
  headRevision: 1, revisionHash: "a".repeat(64), pageNumber: 3, passage };
const message: nativeApi.NativeSourceLocator = { kind: "message", sourceId: "chat", threadId: "thread", messageId: "message", revisionHash: "c".repeat(64), passage };
function show(evidence: AskInternalSource["evidence"], excerpts = true) {
  localStorage.setItem("lkbApiKey", "key");
  return render(<AuthProvider><MemoryRouter><AnswerSources excerpts={excerpts} answer={{ sources: { internal: [{ node_id: "source-node", evidence }], web: [] } }} /></MemoryRouter></AuthProvider>);
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });
test.each([doc, message])("actual policy answer sources resolves $kind only on explicit opening, never via session/audio", async locator => {
  const resolver = vi.spyOn(nativeApi, "resolveNativeEvidence").mockResolvedValue({ sourceLocator: locator, quote: "hello" });
  show({ sessionRef: "fake-session", sourceQuotes: [{ origin: locator.kind, sourceLocator: locator, quote: "UNVERIFIED", turnId: "fake", tStart: 0, tEnd: 5 }] });
  expect(screen.queryByText("UNVERIFIED")).toBeNull(); expect(resolver).not.toHaveBeenCalled(); expect(document.querySelector("a")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Open cited passage" })); expect(await screen.findByText("hello")).toBeInTheDocument();
  expect(resolver).toHaveBeenCalledWith("key", locator); expect(screen.queryByText(/Time unavailable/)).toBeNull(); expect(document.querySelector("audio")).toBeNull();
});
test("malformed native locator never falls back to an unverified excerpt or fake recording", () => {
  show({ sessionRef: "fake", sourceQuotes: [{ origin: "message", sourceLocator: { ...message, revisionHash: "bad" }, quote: "UNVERIFIED", turnId: "fake" }] });
  expect(screen.getByText("This source passage is unavailable.")).toBeInTheDocument(); expect(screen.queryByText("UNVERIFIED")).toBeNull(); expect(document.querySelector("a")).toBeNull();
});
test("legacy transcript and web citation behavior remains available", () => {
  show({ sessionRef: "s/1", sourceQuotes: [{ quote: "Legacy quote", speakerRef: "speaker", tStart: 2, tEnd: 3, origin: "speech", turnId: "t/1" }] });
  expect(screen.getByText("Legacy quote")).toBeInTheDocument(); expect(screen.getByRole("link", { name: "Open cited turn and available recording evidence" })).toHaveAttribute("href", "/sessions/s%2F1#turn-t%2F1");
});
test("excerpts disabled never resolves or renders native quote", () => {
  const resolver = vi.spyOn(nativeApi, "resolveNativeEvidence"); show({ sourceLocator: doc }, false);
  expect(screen.queryByRole("button", { name: "Open cited passage" })).toBeNull(); expect(resolver).not.toHaveBeenCalled();
});
